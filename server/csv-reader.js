const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');
const settings = require('./settings');

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

// Fonction pour calculer les dates selon la période
function getDateRange(period = 'today') {
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
  
  return { from, to };
}

// Fonction pour récupérer les conversions depuis l'API et les agréger par sub1
async function fetchConversionsFromAPI(period = 'today') {
  // Cache désactivé pour éviter les problèmes de données incohérentes
  // const cacheKey = `cache_${period}`;
  // const cacheTime = Date.now();
  // if (apiCache[cacheKey] && (cacheTime - apiCache[cacheKey].timestamp) < apiCache.ttl) {
  //   return apiCache[cacheKey].data;
  // }

  try {
    const { from, to } = getDateRange(period);

    console.log(`🔄 Appel API Everflow [${period}]: ${from} → ${to}`);

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

    console.log(`✅ ${allConversions.length} conversions récupérées`);

    // Agréger par sub1
    const aggregated = {};
    allConversions.forEach(conv => {
      const sub1 = conv.sub1 || 'unknown';
      
      if (!aggregated[sub1]) {
        aggregated[sub1] = { sub1, convs: 0 };
      }
      
      aggregated[sub1].convs++;
    });

    // Convertir en tableau avec payout affiché par sub1 (toujours $4 par défaut)
    const result = Object.values(aggregated).map(item => {
      const payoutPerLead = settings.getDisplayPayoutForSub1(item.sub1);
      return {
        sub1: item.sub1,
        convs: item.convs,
        revenue: Math.round(item.convs * payoutPerLead * 100) / 100
      };
    });

    // Stocker les conversions brutes pour la fonction getConversions
    latestConversions[period] = allConversions;

    return result;
  } catch (error) {
    console.error('❌ Erreur API Everflow:', error.message);
    // Fallback sur le CSV si l'API échoue
    return readCSV(AGG_BY_SUB1_PATH) || [];
  }
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
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
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
    
    // Agréger les données de tous les sub1
    let totalConversions = 0;
    let totalRevenue = 0;
    
    sub1Array.forEach(sub1 => {
      const affiliateData = aggBySub1.find(row => row.sub1 === sub1);
      if (affiliateData) {
        const conversions = parseInt(affiliateData.convs) || 0;
        const payoutPerLead = settings.getPayoutForSub1(sub1);
        totalConversions += conversions;
        totalRevenue += conversions * payoutPerLead;
      }
    });

    const estimatedClicks = Math.round(totalConversions / 0.077);
    const bonus = Math.floor(totalConversions / 10) * 10;
    
    // Calcul du profit manager (marge × conversions + bonus)
    const managerMargin = settings.getManagerMargin();
    const managerProfit = (totalConversions * managerMargin) + bonus;

    return {
      clicks: estimatedClicks,
      conversions: totalConversions,
      revenue: totalRevenue,
      bonus: bonus,
      managerProfit: managerProfit
    };
  },

  // Obtenir les stats pour un sous-manager
  async getSubManagerStats(sub1Input, period = 'today') {
    const aggBySub1 = await fetchConversionsFromAPI(period);
    
    if (!aggBySub1 || aggBySub1.length === 0) {
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
    
    let totalConversions = 0;
    let totalRevenue = 0;
    let subManagerCommission = 0;
    
    sub1Array.forEach(sub1 => {
      const affiliateData = aggBySub1.find(row => row.sub1 === sub1);
      if (affiliateData) {
        const conversions = parseInt(affiliateData.convs) || 0;
        const payoutPerLead = settings.getPayoutForSub1(sub1);
        totalConversions += conversions;
        totalRevenue += conversions * payoutPerLead;
        
        // Calculer la commission du sous-manager (2€ par lead par défaut)
        const commissionPerLead = 2.00; // À récupérer depuis la DB utilisateur
        subManagerCommission += conversions * commissionPerLead;
      }
    });

    const estimatedClicks = Math.round(totalConversions / 0.077);
    const bonus = Math.floor(totalConversions / 10) * 10;
    
    // Profit net pour le sous-manager = revenus + bonus + commission (ce qu'il gagne en tant que superviseur)
    const netProfit = totalRevenue + bonus + subManagerCommission;

    return {
      clicks: estimatedClicks,
      conversions: totalConversions,
      revenue: totalRevenue,
      bonus: bonus,
      subManagerCommission: subManagerCommission,
      netProfit: netProfit
    };
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
