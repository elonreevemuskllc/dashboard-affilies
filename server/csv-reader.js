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

// Cache pour les périodes custom (pour éviter les appels multiples)
let customPeriodCache = {
  data: null,
  period: null,
  timestamp: null
};

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
async function fetchConversionsFromAPI(period = 'today') {
  try {
    // Pour les périodes custom, utiliser le cache pour éviter les appels multiples
    if (period.startsWith('custom:')) {
      const now = Date.now();
      // Si on a déjà les données pour cette période et que c'est récent (< 5 secondes)
      if (customPeriodCache.period === period && 
          customPeriodCache.data && 
          customPeriodCache.timestamp && 
          (now - customPeriodCache.timestamp) < 5000) {
        console.log(`✅ Utilisation du cache pour ${period}`);
        return customPeriodCache.data;
      }
      
      console.log(`🔄 Premier appel pour ${period} - Récupération depuis Everflow...`);
      const everflowData = await fetchEverflowConversions(period);
      
      // Mettre en cache
      customPeriodCache = {
        data: everflowData,
        period: period,
        timestamp: now
      };
      
      console.log(`📊 Everflow: ${everflowData.length} sub1 (mis en cache)`);
      console.log(`✅ TUNE désactivé - Utilisation Everflow seul`);
      
      return everflowData;
    }
    
    // Pour les autres périodes, comportement normal
    console.log('🔄 Récupération des données depuis Everflow uniquement...');
    const everflowData = await fetchEverflowConversions(period);

    console.log(`📊 Everflow: ${everflowData.length} sub1`);
    console.log(`✅ TUNE désactivé - Utilisation Everflow seul`);
    
    return everflowData;
  } catch (error) {
    console.error('❌ Erreur récupération Everflow:', error.message);
    return [];
  }
}

// Fonction pour récupérer les conversions depuis Everflow uniquement
async function fetchEverflowConversions(period = 'today') {
  try {
    const { from, to } = getDateRange(period);

    console.log(`🔄 Appel API Everflow [${period}]: ${from} → ${to}`);
    console.log(`📅 [DEBUG EVERFLOW] Period: ${period}`);
    console.log(`📅 [DEBUG EVERFLOW] Date FROM: ${from}`);
    console.log(`📅 [DEBUG EVERFLOW] Date TO: ${to}`);

    // Récupérer toutes les conversions (avec pagination)
    let allConversions = [];
    let page = 1;
    const limit = 500;

    while (true) {
      const response = await axios.post(
        `${EVERFLOW_API_URL}/affiliates/reporting/conversions`,
        {
          from: from,
          to: to,
          timezone_id: 67,
          show_conversions: true,
          show_events: false,
          page: page,
          limit: limit
        },
        {
          headers: {
            'X-Eflow-API-Key': EVERFLOW_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const conversions = response.data.conversions || [];
      if (conversions.length === 0) break;
      
      allConversions = allConversions.concat(conversions);
      
      if (conversions.length < limit) break;
      page++;
      if (page > 20) break; // Garde-fou
    }

    console.log(`✅ ${allConversions.length} conversions Everflow récupérées`);

    // Agréger par sub1 avec gestion des dates de règles
    const aggregated = {};
    const settingsData = settings.getSettings();
    const leadCountRules = settingsData.lead_count_rules || [];
    
    allConversions.forEach(conv => {
      const sub1 = conv.sub1 || 'unknown';
      
      if (!aggregated[sub1]) {
        aggregated[sub1] = { 
          sub1, 
          convsBeforeRule: 0, 
          convsAfterRule: 0,
          totalConvs: 0
        };
      }
      
      // Vérifier si ce sub1 a une règle avec date de début
      const rule = leadCountRules.find(r => r.sub1 === sub1 && r.apply_from_date);
      
      if (rule) {
        // Convertir la date de la conversion (timestamp unix)
        const conversionDate = new Date(conv.conversion_unix_timestamp * 1000);
        const ruleStartDate = new Date(rule.apply_from_date + ' 00:00:00');
        
        if (conversionDate < ruleStartDate) {
          // Conversion AVANT la date de règle : compte normalement
          aggregated[sub1].convsBeforeRule++;
        } else {
          // Conversion APRÈS la date de règle : sera multipliée
          aggregated[sub1].convsAfterRule++;
        }
      } else {
        // Pas de règle avec date : compte tout dans "after" pour appliquer multiplicateur global
        aggregated[sub1].convsAfterRule++;
      }
      
      aggregated[sub1].totalConvs++;
    });

    // Appliquer les règles de comptage de leads avec dates
    Object.keys(aggregated).forEach(sub1 => {
      const multiplier = settings.getLeadCountMultiplier(sub1);
      const rule = leadCountRules.find(r => r.sub1 === sub1);
      
      if (rule && rule.apply_from_date) {
        // Règle avec date : leads avant + (leads après × multiplier)
        const beforeCount = aggregated[sub1].convsBeforeRule;
        const afterCount = aggregated[sub1].convsAfterRule;
        const afterMultiplied = Math.round(afterCount * multiplier);
        aggregated[sub1].convs = beforeCount + afterMultiplied;
        
        console.log(`🎯 Règle avec date pour ${sub1}: ${beforeCount} leads (avant ${rule.apply_from_date}) + ${afterCount} leads × ${multiplier} (après) = ${aggregated[sub1].convs} leads`);
      } else if (multiplier !== 1) {
        // Règle sans date : applique à tout
        const totalConvs = aggregated[sub1].totalConvs;
        aggregated[sub1].convs = Math.round(totalConvs * multiplier);
        console.log(`🎯 Règle globale pour ${sub1}: ${totalConvs} leads × ${multiplier} = ${aggregated[sub1].convs} leads`);
      } else {
        // Pas de règle : compte tout normalement
        aggregated[sub1].convs = aggregated[sub1].totalConvs;
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

    // Transformer les conversions avec les vraies données
    const conversions = filtered.map(conv => {
      const sub1 = conv.sub1 || 'unknown';
      const payoutPerLead = settings.getPayoutForSub1(sub1);
      const timestamp = conv.conversion_unix_timestamp;
      const date = timestamp ? new Date(timestamp * 1000) : new Date();
      
      return {
        created_at: date.toISOString(),
        payout: payoutPerLead,
        status: 'approved',
        sub1: sub1
      };
    });

    // Trier par date décroissante et limiter
    return { 
      conversions: conversions
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit)
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
    
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
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

    // Gérer sub1 comme string ou array
    const sub1Array = Array.isArray(sub1Input) ? sub1Input : [sub1Input];
    console.log(`🔒 [SECURITY] Sub1Array à traiter: ${JSON.stringify(sub1Array)}`);
    
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

    const estimatedClicks = Math.round(totalConversions / 0.077);
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
