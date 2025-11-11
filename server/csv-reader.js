const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');
const settings = require('./settings');
const tuneAPI = require('./tune-api');

// Chemins vers les fichiers CSV - UNIQUEMENT agg_by_sub1.csv est nécessaire
const DATA_DIR = path.join(__dirname, '..', 'data');
const AGG_BY_SUB1_PATH = path.join(DATA_DIR, 'agg_by_sub1.csv');

// Liste des affiliés à masquer du dashboard
const HIDDEN_AFFILIATES = [];

// Configuration API Everflow
const EVERFLOW_API_KEY = process.env.EVERFLOW_API_KEY || 'Gil8vPvQ6GRq3skkYX2cA';
const EVERFLOW_API_URL = 'https://api.eflow.team/v1';

// Cache DÉSACTIVÉ pour éviter les incohérences de données
let apiCache = {
  data: null,
  timestamp: 0,
  ttl: 0 // Cache désactivé
};

// Stockage temporaire des conversions brutes par période
let latestConversions = {};

// Cache pour les périodes (pour éviter les appels multiples) - maintenant par clé unique
let cacheStore = {};

// Stockage des promesses en cours pour éviter les appels simultanés
let pendingRequests = {};

// Fonction pour calculer les dates selon la période
function getDateRange(period = 'today') {
  // Gérer les dates personnalisées (format: custom:2025-10-01:2025-10-18)
  if (period.startsWith('custom:')) {
    const parts = period.split(':');
    if (parts.length === 3) {
      const dateFrom = parts[1];
      const dateTo = parts[2];
      
      const from = `${dateFrom} 02:00:00`;
      const to = `${dateTo} 23:59:59`;
      
      console.log(`📅 [CUSTOM] Dates personnalisées: ${from} → ${to}`);
      return { from, to };
    }
  }
  
  const now = new Date();
  let startDate, endDate;
  
  // Déterminer si on est avant 2h du matin (décalage de journée)
  const effectiveToday = new Date(now);
  if (now.getHours() < 2) {
    effectiveToday.setDate(effectiveToday.getDate() - 1);
  }
  
  switch(period) {
    case 'yesterday':
      // Hier : la veille de "aujourd'hui"
      startDate = new Date(effectiveToday);
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(effectiveToday);
      break;
      
    case 'week':
      // Cette semaine : lundi 02:00 jusqu'à maintenant
      startDate = new Date(effectiveToday);
      const dayOfWeek = startDate.getDay();
      const daysToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
      startDate.setDate(startDate.getDate() - daysToMonday);
      endDate = new Date(effectiveToday);
      endDate.setDate(endDate.getDate() + 1);
      break;
      
    case 'month':
      // Ce mois-ci : 1er du mois 02:00 jusqu'à maintenant
      startDate = new Date(effectiveToday.getFullYear(), effectiveToday.getMonth(), 1);
      endDate = new Date(effectiveToday);
      endDate.setDate(endDate.getDate() + 1);
      console.log(`📅 [MONTH] Aujourd'hui: ${effectiveToday.toISOString()}`);
      console.log(`📅 [MONTH] Premier du mois calculé: ${startDate.toISOString()}`);
      console.log(`📅 [MONTH] Date de fin calculée: ${endDate.toISOString()}`);
      break;
      
    case 'today':
    default:
      // Aujourd'hui (par défaut)
      startDate = new Date(effectiveToday);
      endDate = new Date(effectiveToday);
      endDate.setDate(endDate.getDate() + 1);
      break;
  }
  
  const from = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')} 02:00:00`;
  const to = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')} 01:59:59`;
  
  console.log(`📅 [${period.toUpperCase()}] Période calculée: ${from} → ${to}`);
  
  return { from, to };
}

// Fonction pour récupérer les conversions depuis l'API et les agréger par sub1
async function fetchConversionsFromAPI(period = 'today', sub1Filter = null) {
  const callId = Math.random().toString(36).substring(7);
  // Créer une clé de cache INCLUANT le sub1Filter pour éviter le mélange des caches
  const sub1Key = sub1Filter ? (Array.isArray(sub1Filter) ? sub1Filter.join(',') : sub1Filter) : 'ALL';
  const cacheKey = `${period}:${sub1Key}`;
  
  console.log(`\n🔵 [${callId}] ===== DÉBUT fetchConversionsFromAPI =====`);
  console.log(`🔵 [${callId}] Period: ${period}, Sub1Filter: ${sub1Filter || 'NONE (GLOBAL)'}`);
  console.log(`🔵 [${callId}] CacheKey: ${cacheKey}`);
  
  try {
    const now = Date.now();
    const cacheDuration = 30000; // 30 secondes de cache
    
    const cache = cacheStore[cacheKey];
    console.log(`🔵 [${callId}] Vérification cache pour clé: ${cacheKey}`);
    
    // Vérifier le cache
    if (cache && cache.data && cache.timestamp && (now - cache.timestamp) < cacheDuration) {
      const age = Math.round((now - cache.timestamp)/1000);
      console.log(`✅ [${callId}] CACHE HIT (${age}s) - ${cache.data.length} sub1`);
      console.log(`🔵 [${callId}] ===== FIN (CACHE) =====\n`);
      return cache.data;
    }
    
    console.log(`🔵 [${callId}] Cache MISS ou expiré`);
    
    // Si une requête est déjà en cours, attendre
    if (pendingRequests[cacheKey]) {
      console.log(`⏳ [${callId}] Attente requête en cours...`);
      const result = await pendingRequests[cacheKey];
      console.log(`⏳ [${callId}] Requête terminée: ${result.length} sub1`);
      console.log(`🔵 [${callId}] ===== FIN (WAIT) =====\n`);
      return result;
    }
    
    // Nouvelle requête AVEC le filtre sub1
    console.log(`🔄 [${callId}] NOUVELLE REQUÊTE Everflow (filtre=${sub1Filter ? 'OUI' : 'NON'})...`);
    pendingRequests[cacheKey] = fetchEverflowConversions(period, sub1Filter);
    
    try {
      const everflowData = await pendingRequests[cacheKey];
      console.log(`🔄 [${callId}] Everflow retourné: ${everflowData.length} sub1`);
      
      // Mettre en cache
      cacheStore[cacheKey] = {
        data: everflowData,
        timestamp: now
      };
      
      console.log(`📊 [${callId}] Cache mis à jour (30s) - timestamp=${now}`);
      console.log(`🔵 [${callId}] ===== FIN (NEW DATA) =====\n`);
      
      return everflowData;
    } finally {
      delete pendingRequests[cacheKey];
      console.log(`🧹 [${callId}] Promesse nettoyée`);
    }
  } catch (error) {
    console.error(`❌ [${callId}] Erreur:`, error.message);
    delete pendingRequests[cacheKey];
    console.log(`🔵 [${callId}] ===== FIN (ERROR) =====\n`);
    return [];
  }
}

// Fonction pour récupérer les conversions depuis Everflow uniquement
async function fetchEverflowConversions(period = 'today', sub1Filter = null) {
  try {
    const { from, to } = getDateRange(period);

    console.log(`🔄 Appel API Everflow [${period}]: ${from} → ${to}`);
    console.log(`📅 [DEBUG EVERFLOW] Period: ${period}`);
    console.log(`📅 [DEBUG EVERFLOW] Date FROM: ${from}`);
    console.log(`📅 [DEBUG EVERFLOW] Date TO: ${to}`);
    console.log(`📅 [DEBUG EVERFLOW] Sub1Filter: ${sub1Filter || 'AUCUN (TOUS)'}`);

    // Récupérer les conversions
    // Pour les périodes custom, on récupère 1 seule page (max 5000) car la pagination Everflow est cassée
    const isCustomPeriod = period.startsWith('custom:');
    const requestBody = {
      from: from,
      to: to,
      timezone_id: 67,
      show_conversions: true,
      show_events: false,
      page: 1,
      limit: isCustomPeriod ? 5000 : 500  // Max pour custom, pagination normale pour le reste
    };
    
    console.log(`🔍 [EVERFLOW REQUEST]:`, JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(
      `${EVERFLOW_API_URL}/affiliates/reporting/conversions`,
      requestBody,
      {
        headers: {
          'X-Eflow-API-Key': EVERFLOW_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    let allConversions = response.data.conversions || [];
    console.log(`✅ ${allConversions.length} conversions Everflow récupérées`);
    
    // Si pas custom ET qu'il y a 500 conversions, il y en a peut-être plus (pagination)
    if (!isCustomPeriod && allConversions.length === 500) {
      console.log(`⚠️ 500 conversions = max par page. Il y en a peut-être plus, mais on limite à 500 pour éviter les doublons Everflow.`);
    }

    console.log(`✅ ${allConversions.length} conversions Everflow récupérées`);

    // FILTRAGE côté serveur si sub1Filter fourni (Everflow ignore le filtre API)
    if (sub1Filter) {
      const sub1Array = Array.isArray(sub1Filter) ? sub1Filter : [sub1Filter];
      const beforeFilter = allConversions.length;
      allConversions = allConversions.filter(conv => sub1Array.includes(conv.sub1));
      console.log(`🔍 FILTRAGE SERVEUR: ${beforeFilter} → ${allConversions.length} conversions (sub1=${sub1Array.join(',')})`);
    }

    // Agréger par sub1 avec gestion des phases de règles
    const aggregated = {};
    const settingsData = settings.getSettings();
    const leadCountRules = settingsData.lead_count_rules || [];
    
    allConversions.forEach(conv => {
      const sub1 = conv.sub1 || 'unknown';
      
      if (!aggregated[sub1]) {
        aggregated[sub1] = { 
          sub1, 
          phases: {},  // Stockage par phase
          noRule: 0,   // Conversions avant toute règle
          totalConvs: 0
        };
      }
      
      // Vérifier si ce sub1 a des règles avec phases
      const rule = leadCountRules.find(r => r.sub1 === sub1);
      
      if (rule && rule.phases) {
        // Conversion avec système de phases
        const conversionDate = new Date(conv.conversion_unix_timestamp * 1000);
        
        // Trouver dans quelle phase tombe cette conversion
        let phaseFound = false;
        rule.phases.forEach((phase, index) => {
          const fromDate = new Date(phase.from_date + ' 00:00:00');
          const toDate = phase.to_date ? new Date(phase.to_date + ' 23:59:59') : new Date('2099-12-31');
          
          if (conversionDate >= fromDate && conversionDate <= toDate) {
            if (!aggregated[sub1].phases[index]) {
              aggregated[sub1].phases[index] = {
                count: 0,
                multiplier: phase.multiplier,
                bonus: phase.manual_bonus_leads || 0
              };
            }
            aggregated[sub1].phases[index].count++;
            phaseFound = true;
          }
        });
        
        if (!phaseFound) {
          // Conversion avant toutes les phases
          aggregated[sub1].noRule++;
        }
      } else {
        // Pas de règle : compte tout normalement
        aggregated[sub1].noRule++;
      }
      
      aggregated[sub1].totalConvs++;
    });

    // Calculer le total de leads avec phases
    Object.keys(aggregated).forEach(sub1 => {
      const rule = leadCountRules.find(r => r.sub1 === sub1);
      
      if (rule && rule.phases) {
        // Système avec phases : calculer pour chaque phase
        let totalLeads = aggregated[sub1].noRule || 0; // Leads avant toute règle comptent normalement
        let bonusTotal = 0;
        
        const { from, to } = getDateRange(period);
        const periodStartDate = new Date(from);
        const periodEndDate = new Date(to);
        
        // Parcourir toutes les phases de la règle pour vérifier les bonus actifs
        rule.phases.forEach((phaseConfig, phaseIndex) => {
          const phaseFromDate = new Date(phaseConfig.from_date + ' 00:00:00');
          const phaseToDate = phaseConfig.to_date ? new Date(phaseConfig.to_date + ' 23:59:59') : new Date('2099-12-31');
          
          // Vérifier si cette phase est active pendant la période demandée
          if (phaseFromDate <= periodEndDate && phaseToDate >= periodStartDate) {
            const phaseData = aggregated[sub1].phases[phaseIndex];
            
            if (phaseData) {
              // Phase avec conversions réelles
              const leadsMultiplied = Math.round(phaseData.count * phaseData.multiplier);
              totalLeads += leadsMultiplied;
              
              // Ajouter le bonus de la phase
              if (phaseData.bonus > 0) {
                bonusTotal += phaseData.bonus;
                console.log(`✅ Phase ${phaseIndex + 1} pour ${sub1}: ${phaseData.count} leads × ${phaseData.multiplier} = ${leadsMultiplied} leads + ${phaseData.bonus} bonus`);
              } else {
                console.log(`📊 Phase ${phaseIndex + 1} pour ${sub1}: ${phaseData.count} leads × ${phaseData.multiplier} = ${leadsMultiplied} leads`);
              }
            } else {
              // Phase active mais sans conversions réelles - vérifier si elle a un bonus manuel
              const manualBonus = phaseConfig.manual_bonus_leads || 0;
              if (manualBonus > 0) {
                bonusTotal += manualBonus;
                console.log(`✨ Phase ${phaseIndex + 1} pour ${sub1}: 0 leads réels + ${manualBonus} bonus manuels`);
              }
            }
          }
        });
        
        aggregated[sub1].convs = totalLeads + bonusTotal;
        console.log(`🎯 TOTAL ${sub1}: ${aggregated[sub1].noRule || 0} (avant règles) + ${totalLeads - (aggregated[sub1].noRule || 0)} (avec shaves) + ${bonusTotal} (bonus) = ${aggregated[sub1].convs} leads`);
      } else {
        // Pas de règle : compte tout normalement
        aggregated[sub1].convs = aggregated[sub1].totalConvs || 0;
      }
    });

    // ✨ AJOUT : Gérer les sub1 qui ont des bonus manuels mais AUCUNE conversion réelle
    // Cela permet d'afficher les sub1 qui ont seulement des leads bonus
    leadCountRules.forEach(rule => {
      if (rule.phases && !aggregated[rule.sub1]) {
        // Ce sub1 a des règles mais n'apparaît pas dans les données (0 conversions réelles)
        // Vérifier s'il y a des bonus manuels dans les phases actives pour cette période
        const { from, to } = getDateRange(period);
        const periodStartDate = new Date(from);
        const periodEndDate = new Date(to);
        
        let totalBonus = 0;
        
        rule.phases.forEach((phase, index) => {
          const phaseFromDate = new Date(phase.from_date + ' 00:00:00');
          const phaseToDate = phase.to_date ? new Date(phase.to_date + ' 23:59:59') : new Date('2099-12-31');
          const manualBonus = phase.manual_bonus_leads || 0;
          
          // Vérifier si la phase est active pendant cette période
          if (phaseFromDate <= periodEndDate && phaseToDate >= periodStartDate && manualBonus > 0) {
            totalBonus += manualBonus;
            console.log(`✨ [BONUS ONLY] ${rule.sub1} - Phase ${index + 1}: +${manualBonus} leads bonus (aucune conversion réelle)`);
          }
        });
        
        if (totalBonus > 0) {
          // Créer une entrée avec seulement les bonus
          aggregated[rule.sub1] = {
            sub1: rule.sub1,
            phases: {},
            noRule: 0,
            totalConvs: 0,
            convs: totalBonus
          };
          console.log(`🎯 [BONUS ONLY] ${rule.sub1}: ${totalBonus} leads (100% bonus, 0 conversions réelles)`);
        }
      }
    });

    console.log(`📊 Agréger par sub1:`, aggregated);
    console.log(`🎯 Som dans les données:`, aggregated['som']);

    // Convertir en tableau avec payout affiché par sub1 (toujours $4 par défaut)
    const result = Object.values(aggregated).map(item => {
      const payoutPerLead = settings.getDisplayPayoutForSub1(item.sub1);
      return {
        sub1: item.sub1,
        convs: item.convs,
        revenue: Math.round(item.convs * payoutPerLead * 100) / 100
      };
    });

    console.log(`✅ Résultat final:`, result);

    // Stocker les conversions brutes pour la fonction getConversions
    latestConversions[period] = allConversions;

    return result;
  } catch (error) {
    console.error('❌ Erreur API Everflow:', error.message);
    // Fallback sur le CSV si l'API échoue
    return readCSV(AGG_BY_SUB1_PATH) || [];
  }
}

// Fonction pour fusionner les données des deux plateformes
function mergePlatformData(everflowData, tuneData) {
  const merged = {};
  
  // Ajouter les données Everflow
  everflowData.forEach(item => {
    merged[item.sub1] = {
      sub1: item.sub1,
      convs: item.convs,
      revenue: item.revenue
    };
  });
  
  // Ajouter/fusionner les données TUNE
  tuneData.forEach(item => {
    if (merged[item.sub1]) {
      // Fusionner si le sub1 existe déjà
      merged[item.sub1].convs += item.convs;
      merged[item.sub1].revenue += item.revenue;
    } else {
      // Ajouter nouveau sub1
      merged[item.sub1] = {
        sub1: item.sub1,
        convs: item.convs,
        revenue: item.revenue
      };
    }
  });
  
  return Object.values(merged);
}

// Fonction helper pour lire un CSV
function readCSV(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Fichier non trouvé: ${filePath}`);
      return null;
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true, // Gérer UTF-8 BOM
      cast: (value, context) => {
        // Convertir les nombres (gérer le format français avec virgule)
        if (context.column === 'revenue' || context.column === 'convs') {
          const normalized = String(value).replace(',', '.');
          return parseFloat(normalized) || 0;
        }
        return value;
      }
    });
    return records;
  } catch (error) {
    console.error(`Erreur lecture CSV ${filePath}:`, error.message);
    return null;
  }
}

// API pour accéder aux données
const csvDataAPI = {
  // Récupérer les statistiques du dashboard depuis l'API Everflow
  async getDashboardStats(period = 'today') {
    try {
      // Obtenir les dates pour la période demandée
      const { from, to } = getDateRange(period);
      
      // Appel API Everflow pour les stats en temps réel avec les bonnes dates
      const response = await axios.post(
        `${EVERFLOW_API_URL}/affiliates/dashboard/summary`,
        { 
          timezone_id: 67,
          from: from,
          to: to
        },
        {
          headers: {
            'X-Eflow-API-Key': EVERFLOW_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data;
      
      // Récupérer les stats des affiliés masqués depuis l'API
      const aggBySub1 = await fetchConversionsFromAPI(period);
      let hiddenConversions = 0;
      
      if (aggBySub1 && aggBySub1.length > 0) {
        const hiddenRows = aggBySub1.filter(row => HIDDEN_AFFILIATES.includes(row.sub1));
        hiddenConversions = hiddenRows.reduce((sum, row) => sum + (parseFloat(row.convs) || 0), 0);
      }
      
      // Utiliser les données de reporting/conversions qui sont plus précises
      const totalConversionsFromAPI = aggBySub1.reduce((sum, row) => sum + (parseFloat(row.convs) || 0), 0);
      const totalConversions = totalConversionsFromAPI - hiddenConversions;
      
      // Estimer les clicks en proportion
      const totalClicks = (data.click.today || 0);
      
      // Calculer le revenu total avec les payouts affichés par sub1 (toujours $4 par défaut)
      const filtered = aggBySub1.filter(row => !HIDDEN_AFFILIATES.includes(row.sub1));
      const totalRevenue = filtered.reduce((sum, row) => {
        const convs = parseFloat(row.convs) || 0;
        const payout = settings.getDisplayPayoutForSub1(row.sub1);
        return sum + (convs * payout);
      }, 0);
      
      // Estimer les clicks en proportion des conversions cachées
      const clickRatio = totalConversions / (totalConversionsFromAPI || 1);
      const estimatedClicks = Math.round(totalClicks * clickRatio);
      
      // Calculer le bonus : 10€ par tranche de 10 conversions
      const bonus = Math.floor(totalConversions / 10) * 10;
      
      return {
        clicks: estimatedClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        bonus: bonus,
        // Bonus : données supplémentaires
        yesterday: {
          clicks: data.click.yesterday || 0,
          conversions: data.conversion.yesterday || 0,
          revenue: data.revenue.yesterday || 0
        }
      };
    } catch (error) {
      console.error('Erreur API Everflow summary:', error.message);
      // Fallback : calculer depuis l'API de conversions
      const aggBySub1 = await fetchConversionsFromAPI(period);
      
      if (!aggBySub1 || aggBySub1.length === 0) {
        return {
          clicks: 0,
          conversions: 0,
          revenue: 0,
          bonus: 0
        };
      }

      const filtered = aggBySub1.filter(row => !HIDDEN_AFFILIATES.includes(row.sub1));
      const totalConversions = filtered.reduce((sum, row) => sum + (parseFloat(row.convs) || 0), 0);
      
      // Calculer le revenu total avec les payouts affichés par sub1 (toujours $4 par défaut)
      const totalRevenue = filtered.reduce((sum, row) => {
        const convs = parseFloat(row.convs) || 0;
        const payout = settings.getDisplayPayoutForSub1(row.sub1);
        return sum + (convs * payout);
      }, 0);
      
      const estimatedClicks = Math.round(totalConversions / 0.077);
      const bonus = Math.floor(totalConversions / 10) * 10;

      return {
        clicks: estimatedClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        bonus: bonus
      };
    }
  },

  // Récupérer les conversions récentes (vraies données de l'API)
  async getConversions(user, limit = 10, period = 'today') {
    // Déclencher le fetch pour s'assurer que les données sont en cache
    await fetchConversionsFromAPI(period);
    
    // Récupérer les conversions depuis le stockage temporaire
    const rawConversions = latestConversions[period] || [];
    
    if (rawConversions.length === 0) {
      return { conversions: [] };
    }

    // Filtrer selon l'utilisateur
    let filtered = rawConversions;
    if (user && user.role !== 'admin') {
      // Affilié/Manager : voir seulement ses sub1
      const sub1Array = Array.isArray(user.sub1) ? user.sub1 : [user.sub1];
      filtered = rawConversions.filter(conv => sub1Array.includes(conv.sub1));
    } else {
      // Admin : filtrer les masqués
      filtered = rawConversions.filter(conv => !HIDDEN_AFFILIATES.includes(conv.sub1));
    }

    // Récupérer les règles de shave/multiplicateurs
    const settingsData = settings.getSettings();
    const leadCountRules = settingsData.lead_count_rules || [];

    // 🔧 NOUVELLE LOGIQUE : Transformer TOUTES les conversions d'abord, puis appliquer le filtrage par phase
    const conversionsWithPhaseInfo = filtered.map(conv => {
      const sub1 = conv.sub1 || 'unknown';
      const payoutPerLead = settings.getPayoutForSub1(sub1);
      const timestamp = conv.conversion_unix_timestamp;
      const date = timestamp ? new Date(timestamp * 1000) : new Date();
      
      // Vérifier si ce sub1 a des règles avec phases (shave)
      const rule = leadCountRules.find(r => r.sub1 === sub1);
      let shouldCount = true;
      let multiplier = 1.0;
      let phaseIndex = -1;
      
      if (rule && rule.phases) {
        const conversionDate = new Date(timestamp * 1000);
        
        // Trouver dans quelle phase tombe cette conversion
        for (let i = 0; i < rule.phases.length; i++) {
          const phase = rule.phases[i];
          const fromDate = new Date(phase.from_date + ' 00:00:00');
          const toDate = phase.to_date ? new Date(phase.to_date + ' 23:59:59') : new Date('2099-12-31');
          
          if (conversionDate >= fromDate && conversionDate <= toDate) {
            multiplier = phase.multiplier;
            phaseIndex = i;
            break;
          }
        }
      }
      
      return {
        created_at: date.toISOString(),
        payout: payoutPerLead,
        status: 'approved',
        sub1: sub1,
        multiplier: multiplier,
        phaseIndex: phaseIndex,
        timestamp: timestamp
      };
    });

    // Trier par date décroissante
    const sortedConversions = conversionsWithPhaseInfo.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 🔧 NOUVELLE LOGIQUE : Appliquer le filtrage par phase de manière cohérente avec fetchEverflowConversions
    // On regroupe par sub1 et par phase, puis on applique le multiplier sur chaque groupe
    const conversionsByPhase = {};
    sortedConversions.forEach(conv => {
      const key = `${conv.sub1}:${conv.phaseIndex}`;
      if (!conversionsByPhase[key]) {
        conversionsByPhase[key] = {
          sub1: conv.sub1,
          phaseIndex: conv.phaseIndex,
          multiplier: conv.multiplier,
          conversions: []
        };
      }
      conversionsByPhase[key].conversions.push(conv);
    });

    // Pour chaque groupe (sub1 + phase), appliquer le multiplier
    const finalConversions = [];
    Object.values(conversionsByPhase).forEach(group => {
      const multiplier = group.multiplier;
      const convs = group.conversions;
      
      // Calculer combien de conversions on doit afficher pour ce groupe
      const countToShow = Math.round(convs.length * multiplier);
      
      // Garder les N premières conversions (déjà triées par date)
      const selectedConvs = convs.slice(0, countToShow);
      
      // Ajouter un indicateur visuel si shave actif
      if (multiplier < 1.0) {
        selectedConvs.forEach(conv => {
          conv.shaveInfo = `${Math.round((1 - multiplier) * 100)}% shave actif`;
        });
      }
      
      finalConversions.push(...selectedConvs);
    });

    // Re-trier toutes les conversions par date et limiter
    const result = finalConversions
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    console.log(`📊 [CONVERSIONS RÉCENTES] ${result.length} conversions affichées (sur ${filtered.length} brutes)`);

    return { 
      conversions: result
    };
  },

  // Récupérer les données par affilié
  async getAffiliatesData(period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      return { affiliates: [] };
    }

    // Filtrer les affiliés masqués
    const filtered = aggBySub1.filter(row => !HIDDEN_AFFILIATES.includes(row.sub1));

    const affiliates = filtered
      .sort((a, b) => parseFloat(b.revenue) - parseFloat(a.revenue))
      .map(aff => ({
        sub1: aff.sub1,
        conversions: parseInt(aff.convs) || 0,
        revenue: parseFloat(aff.revenue) || 0
      }));

    return { affiliates };
  },

  // Récupérer le classement des affiliés par nombre de leads (avec masquage)
  async getAffiliatesLeaderboard(period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    if (!aggBySub1 || aggBySub1.length === 0) {
      return { leaderboard: [] };
    }

    // Filtrer les affiliés masqués
    const filtered = aggBySub1.filter(row => !HIDDEN_AFFILIATES.includes(row.sub1));

    // Trier par leads bruts d'abord
    const sorted = filtered
      .map(row => ({
        sub1: row.sub1,
        rawLeads: parseInt(row.convs) || 0
      }))
      .sort((a, b) => b.rawLeads - a.rawLeads);

    // Appliquer les multiplicateurs selon le rang
    const withMultipliers = sorted.map((item, index) => {
      let multiplier = 1;
      if (index === 0) {
        multiplier = 3.5; // 1er place
      } else if (index === 1) {
        multiplier = 1.7; // 2e place
      }
      
      return {
        sub1: item.sub1,
        leads: Math.round(item.rawLeads * multiplier)
      };
    });

    // Masquer les noms: masque complet
    const maskName = () => '***';

    const leaderboard = withMultipliers.map((item, index) => ({
      rank: index + 1,
      nameMasked: maskName(item.sub1),
      leads: item.leads
    }));

    return { leaderboard };
  },

  // Récupérer les offres (générer depuis l'API - chaque affilié = une offre)
  async getOffers(user, period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      return { offers: [] };
    }

    // Filtrer selon l'utilisateur
    let filtered = aggBySub1;
    if (user && user.role !== 'admin') {
      // Affilié : voir seulement son sub1
      filtered = aggBySub1.filter(row => row.sub1 === user.sub1);
    } else {
      // Admin : filtrer les masqués
      filtered = aggBySub1.filter(row => !HIDDEN_AFFILIATES.includes(row.sub1));
    }

    // Chaque affilié représente une offre
    const offers = filtered.map(aff => {
      const convs = parseInt(aff.convs) || 0;
      const revenue = parseFloat(aff.revenue) || 0;
      const avgPayout = convs > 0 ? revenue / convs : 0;
      
      return {
        name: `Offre ${aff.sub1}`,
        payout: avgPayout.toFixed(2),
        description: `${convs} conversions • Revenu total: ${revenue.toFixed(2)} €`,
        tracking_link: `https://tracking.example.com/${aff.sub1}`,
        conversions: convs,
        total_revenue: revenue
      };
    });

    // Trier par revenu total
    offers.sort((a, b) => b.total_revenue - a.total_revenue);

    return { offers };
  },

  // Récupérer les données de performance (distribution simulée sur 30 jours)
  async getPerformance(user, period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      return { performance: [] };
    }

    // Filtrer selon l'utilisateur
    let filtered = aggBySub1;
    if (user && user.role !== 'admin') {
      // Affilié : voir seulement son sub1
      filtered = aggBySub1.filter(row => row.sub1 === user.sub1);
    } else {
      // Admin : filtrer les masqués
      filtered = aggBySub1.filter(row => !HIDDEN_AFFILIATES.includes(row.sub1));
    }

    // Calculer le total de conversions
    const totalConvs = filtered.reduce((sum, aff) => sum + (parseInt(aff.convs) || 0), 0);
    
    // Générer une distribution sur les 30 derniers jours
    const performance = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Distribution aléatoire mais réaliste basée sur le total
      const dailyConvs = Math.max(0, Math.floor((totalConvs / 30) * (0.5 + Math.random())));
      
      performance.push({
        date: date.toISOString().split('T')[0],
        conversions: dailyConvs,
        clicks: dailyConvs * 40 // Estimation: 1 conv = ~40 clicks
      });
    }
    
    return { performance };
  },

  // Obtenir la liste de tous les sub1 disponibles
  async getSub1List(period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      return [];
    }

    // Filtrer les affiliés masqués
    const filtered = aggBySub1.filter(row => !HIDDEN_AFFILIATES.includes(row.sub1));
    
    // Retourner la liste des sub1 avec leurs infos
    return filtered.map(row => ({
      sub1: row.sub1,
      conversions: parseInt(row.convs) || 0,
      revenue: parseFloat(row.revenue) || 0
    })).sort((a, b) => b.revenue - a.revenue);
  },


  // Vider le cache (utile pour forcer un rafraîchissement)
  clearCache() {
    apiCache = {
      data: null,
      timestamp: 0,
      ttl: 30000
    };
    console.log('🗑️ Cache vidé');
  },

  // Obtenir les stats pour un affilié spécifique
  async getAffiliateStats(sub1Input, period = 'today') {
    console.log(`🔒 [SECURITY] getAffiliateStats appelé pour sub1: ${JSON.stringify(sub1Input)}, period: ${period}`);
    
    // Gérer sub1 comme string ou array
    const sub1Array = Array.isArray(sub1Input) ? sub1Input : [sub1Input];
    console.log(`🔒 [SECURITY] Sub1Array à traiter: ${JSON.stringify(sub1Array)}`);
    
    // 🎁 Vérifier s'il y a des règles de sub-affiliés pour cet affilié
    const subAffiliateRules = settings.getSettings().sub_affiliate_rules || [];
    const sourceSub1ToFetch = [];
    
    sub1Array.forEach(sub1 => {
      const applicableRules = subAffiliateRules.filter(rule => rule.targetSub1 === sub1);
      applicableRules.forEach(rule => {
        if (!sourceSub1ToFetch.includes(rule.sourceSub1)) {
          sourceSub1ToFetch.push(rule.sourceSub1);
        }
      });
    });
    
    // Combiner sub1Array + sourceSub1ToFetch pour récupérer toutes les données nécessaires
    const allSub1ToFetch = [...sub1Array, ...sourceSub1ToFetch];
    console.log(`🔒 [SECURITY] Sub1 à récupérer (avec sources bonus): ${JSON.stringify(allSub1ToFetch)}`);
    
    // FILTRER DIRECTEMENT PAR SUB1 dans l'API (inclut les sources pour les bonus)
    const aggBySub1 = await fetchConversionsFromAPI(period, allSub1ToFetch);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      console.log(`🔒 [SECURITY] Aucune donnée trouvée pour ${sub1Input}`);
      return {
        clicks: 0,
        conversions: 0,
        revenue: 0,
        bonus: 0,
        managerProfit: 0
      };
    }
    
    // Agréger les données de tous les sub1
    let totalConversions = 0;
    let totalRevenue = 0;
    
    sub1Array.forEach(sub1 => {
      const affiliateData = aggBySub1.find(row => row.sub1 === sub1);
      if (affiliateData) {
        const conversions = parseInt(affiliateData.convs) || 0;
        const payoutPerLead = settings.getPayoutForSub1(sub1);
        console.log(`🔒 [SECURITY] ${sub1} - Conversions: ${conversions}, Payout: $${payoutPerLead}`);
        totalConversions += conversions;
        totalRevenue += conversions * payoutPerLead;
      } else {
        console.log(`🔒 [SECURITY] ${sub1} - Aucune donnée trouvée`);
      }
    });

    // ✨ NOUVEAU : Ajouter les bonus de sub_affiliate_rules
    let subAffiliateBonus = 0;
    
    sub1Array.forEach(sub1 => {
      const applicableRules = subAffiliateRules.filter(rule => rule.targetSub1 === sub1);
      
      if (applicableRules.length > 0) {
        console.log(`🎁 [BONUS] Règles de sub-affiliés trouvées pour ${sub1}:`, applicableRules);
        
        applicableRules.forEach(rule => {
          // Récupérer les conversions du source (filtrées par l'API)
          const sourceData = aggBySub1.find(row => row.sub1 === rule.sourceSub1);
          
          if (sourceData) {
            const sourceConversions = parseInt(sourceData.convs) || 0;
            const bonusAmount = parseFloat(rule.bonusAmount) || 0;
            const calculatedBonus = sourceConversions * bonusAmount;
            
            console.log(`🎁 [BONUS] ${sub1} reçoit bonus de "${rule.sourceSub1}": ${sourceConversions} convs × $${bonusAmount} = $${calculatedBonus}`);
            
            subAffiliateBonus += calculatedBonus;
            totalRevenue += calculatedBonus;
          } else {
            console.log(`🎁 [BONUS] Aucune donnée trouvée pour le source "${rule.sourceSub1}"`);
          }
        });
      }
    });

    // Calculer les clics estimés
    let estimatedClicks = Math.round(totalConversions / 0.077);
    
    // ✨ BONUS MANUELS DE CLICS : Ajouter uniquement les clics manuels (les leads sont déjà dans fetchEverflowConversions)
    const settingsData = settings.getSettings();
    const leadCountRules = settingsData.lead_count_rules || [];
    const todayDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    sub1Array.forEach(sub1 => {
      const rule = leadCountRules.find(r => r.sub1 === sub1);
      
      if (rule && rule.phases && period === 'today') {
        console.log(`📋 [MANUAL BONUS] Vérification des bonus manuels pour ${sub1} (date: ${todayDate})`);
        
        // Trouver la phase active aujourd'hui
        for (const phase of rule.phases) {
          const fromDate = phase.from_date; // Format: YYYY-MM-DD
          const toDate = phase.to_date || '2099-12-31';
          
          if (todayDate >= fromDate && todayDate <= toDate) {
            // Phase active trouvée
            const manualClicks = phase.manual_bonus_clicks || 0;
            
            // NOTE: Les manual_bonus_leads sont déjà ajoutés dans fetchEverflowConversions
            // On ajoute UNIQUEMENT les clics manuels ici
            
            if (manualClicks > 0) {
              console.log(`✨ [MANUAL BONUS] +${manualClicks} clics manuels pour ${sub1}`);
              estimatedClicks += manualClicks;
            }
            
            break; // Une seule phase active à la fois
          }
        }
      }
    });
    
    const bonus = Math.floor(totalConversions / 10) * 10;
    
    // Calcul du profit manager (marge × conversions + bonus)
    const managerMargin = settings.getManagerMargin();
    const managerProfit = (totalConversions * managerMargin) + bonus;

    const result = {
      clicks: estimatedClicks,
      conversions: totalConversions,
      revenue: totalRevenue,
      bonus: bonus,
      managerProfit: managerProfit
    };
    
    console.log(`🔒 [SECURITY] Résultat pour ${JSON.stringify(sub1Array)}: ${JSON.stringify(result)}`);
    
    return result;
  },

  // Obtenir les stats pour un sous-manager
  async getSubManagerStats(sub1Input, period = 'today') {
    console.log(`🔒 [SECURITY] getSubManagerStats appelé pour sub1: ${JSON.stringify(sub1Input)}, period: ${period}`);
    
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      console.log(`🔒 [SECURITY] Aucune donnée trouvée pour SubManager ${sub1Input}`);
      return {
        clicks: 0,
        conversions: 0,
        revenue: 0,
        bonus: 0,
        subManagerCommission: 0,
        netProfit: 0
      };
    }

    // Gérer sub1 comme string ou array
    const sub1Array = Array.isArray(sub1Input) ? sub1Input : [sub1Input];
    console.log(`🔒 [SECURITY] SubManager Sub1Array à traiter: ${JSON.stringify(sub1Array)}`);
    
    let totalConversions = 0;
    let totalRevenue = 0;
    let subManagerCommission = 0;
    
    sub1Array.forEach(sub1 => {
      const affiliateData = aggBySub1.find(row => row.sub1 === sub1);
      if (affiliateData) {
        const conversions = parseInt(affiliateData.convs) || 0;
        const payoutPerLead = settings.getPayoutForSub1(sub1);
        console.log(`🔒 [SECURITY] SubManager ${sub1} - Conversions: ${conversions}, Payout: $${payoutPerLead}`);
        totalConversions += conversions;
        totalRevenue += conversions * payoutPerLead;
        
        // Calculer la commission du sous-manager (2€ par lead par défaut)
        const commissionPerLead = 2.00; // À récupérer depuis la DB utilisateur
        // subManagerCommission += conversions * commissionPerLead; // DÉSACTIVÉ - pas de commission sur ses propres leads
      } else {
        console.log(`🔒 [SECURITY] SubManager ${sub1} - Aucune donnée trouvée`);
      }
    });

    const estimatedClicks = Math.round(totalConversions / 0.077);
    const bonus = Math.floor(totalConversions / 10) * 10;
    
    // Profit net pour le sous-manager = revenus + bonus + commission (ce qu'il gagne en tant que superviseur)
    const netProfit = totalRevenue + bonus + subManagerCommission;

    const result = {
      clicks: estimatedClicks,
      conversions: totalConversions,
      revenue: totalRevenue,
      bonus: bonus,
      subManagerCommission: subManagerCommission,
      netProfit: netProfit
    };
    
    console.log(`🔒 [SECURITY] Résultat SubManager pour ${JSON.stringify(sub1Array)}: ${JSON.stringify(result)}`);
    
    return result;
  },

  // Récupérer les leads par sub1 pour un manager
  async getSub1LeadsForManager(sub1Array, period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      return [];
    }

    console.log(`🔍 DEBUG - Toutes les données récupérées pour ${period}:`, aggBySub1);

    // Gérer sub1 comme string ou array
    const sub1List = Array.isArray(sub1Array) ? sub1Array : [sub1Array];
    
    // Calculer le bonus total de Losh (2€ par lead de som)
    const somData = aggBySub1.find(row => row.sub1 === 'som');
    const somLeads = somData ? (parseInt(somData.convs) || 0) : 0;
    const totalLoshBonus = somLeads * 2.00;
    
    // Récupérer les données pour chaque sub1 assigné au manager
    const sub1Leads = sub1List.map(sub1 => {
      const affiliateData = aggBySub1.find(row => row.sub1 === sub1);
      
      console.log(`🔍 DEBUG - Données pour sub1 "${sub1}":`, affiliateData);
      
      const leads = affiliateData ? (parseInt(affiliateData.convs) || 0) : 0;
      
      // Calculer les gains affilié (vrais revenus de l'API Everflow)
      const gainsAffiliate = affiliateData ? (parseFloat(affiliateData.revenue) || 0) : 0;
      
      // Calculer le bonus (10$ pour chaque tranche de 10 leads)
      const bonus = Math.floor(leads / 10) * 10;
      
      // Calculer le CA total (leads × 30$)
      const caTotal = leads * 30;
      
      // Bonus pour Losh : 2€ par lead de som (seulement pour som)
      let loshBonus = 0;
      if (sub1 === 'som') {
        loshBonus = leads * 2.00;
      }
      
           // Calculer les bonus selon les règles de sous-affiliés
           let subAffiliateBonus = 0;
           const settingsManager = require('./settings');
           const settings = settingsManager.getSettings();
           const subAffiliateRules = settings.sub_affiliate_rules || [];
           
           // Trouver les règles où ce sub1 est la source
           const applicableRules = subAffiliateRules.filter(rule => rule.sourceSub1 === sub1);
           
           if (applicableRules.length > 0) {
             // Pour l'affichage, on montre le total des bonus générés par ce sub1
             subAffiliateBonus = applicableRules.reduce((total, rule) => total + (leads * rule.bonusAmount), 0);
           }
           
           // Calculer le net (CA total - gains affilié - bonus = profit manager)
           const net = caTotal - gainsAffiliate - bonus;
      
      // Calculer l'EPC pour ce sub1 (profit manager / clics estimés)
      const estimatedClicks = Math.round(leads / 0.077);
      const epc = estimatedClicks > 0 ? net / estimatedClicks : 0;
      
      console.log(`🔍 DEBUG - Calculs pour "${sub1}": leads=${leads}, gains=${gainsAffiliate}, bonus=${bonus}, net=${net}, epc=${epc}`);
      
      return {
        sub1: sub1,
        leads: leads,
        costAffiliate: gainsAffiliate,
        bonus: bonus,
        bonusAmount: subAffiliateBonus,
        net: net,
        epc: Math.round(epc * 100) / 100 // Arrondir à 2 décimales
      };
    });
    
    // Trier par nombre de leads décroissant
    return sub1Leads.sort((a, b) => b.leads - a.leads);
  },

  // Obtenir le bonus total de Losh
  async getLoshBonus(period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      return { loshBonus: 0, somLeads: 0 };
    }

    const somData = aggBySub1.find(row => row.sub1 === 'som');
    const somLeads = somData ? (parseInt(somData.convs) || 0) : 0;
    const loshBonus = somLeads * 2.00;

    return {
      loshBonus: loshBonus,
      somLeads: somLeads
    };
  },

  // Calculer l'EPC global pour un manager (profit manager / clics total)
  async getManagerGlobalEPC(sub1Array, period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
      return {
        epc: 0,
        totalProfit: 0,
        totalClicks: 0
      };
    }

    // Gérer sub1 comme string ou array
    const sub1List = Array.isArray(sub1Array) ? sub1Array : [sub1Array];
    
    let totalConversions = 0;
    let totalProfit = 0;
    
    // Agréger les données de tous les sub1 du manager
    sub1List.forEach(sub1 => {
      const affiliateData = aggBySub1.find(row => row.sub1 === sub1);
      if (affiliateData) {
        const conversions = parseInt(affiliateData.convs) || 0;
        totalConversions += conversions;
        
        // Calculer le profit manager pour ce sub1
        // Profit = (conversions × marge manager) + bonus
        const managerMargin = settings.getManagerMargin(); // $25.30
        const bonus = Math.floor(conversions / 10) * 10; // $10 par tranche de 10
        const sub1Profit = (conversions * managerMargin) + bonus;
        
        totalProfit += sub1Profit;
      }
    });

    // Estimer les clics total (ratio conversions/clics ≈ 0.077)
    const totalClicks = Math.round(totalConversions / 0.077);
    
    // Calculer l'EPC (profit manager / clics)
    const epc = totalClicks > 0 ? totalProfit / totalClicks : 0;

    return {
      epc: Math.round(epc * 100) / 100, // Arrondir à 2 décimales
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalClicks: totalClicks,
      totalConversions: totalConversions
    };
  }
};

module.exports = csvDataAPI;
