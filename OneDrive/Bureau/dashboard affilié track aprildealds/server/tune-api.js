const axios = require('axios');

// Configuration TUNE/HasOffers
const TUNE_API_KEY = process.env.TUNE_API_KEY || '17975415225d6f5c3b5ef35459714d15ffb4f624211018480d9f75b78982d671';
const TUNE_NETWORK_ID = process.env.TUNE_NETWORK_ID || 'ils';
const TUNE_API_URL = `https://${TUNE_NETWORK_ID}.api.hasoffers.com/Apiv3/json`;

// Configuration axios pour TUNE
const tuneClient = axios.create({
  baseURL: TUNE_API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  params: {
    api_key: TUNE_API_KEY
  }
});

// Wrapper pour les appels API TUNE
const tuneAPI = {
  // Récupérer les conversions depuis TUNE (utilise getStats pour agrégation optimisée)
  async getConversions(period = 'today') {
    try {
      console.log(`🔄 Appel API TUNE [${period}]`);
      
      // Calculer les dates selon la période
      const { from, to } = this.getDateRange(period);
      console.log(`📅 Dates: ${from.split(' ')[0]} → ${to.split(' ')[0]}`);
      
      // Essayer d'abord avec groupe par affiliate_info1
      const response = await tuneClient.get('', {
        params: {
          Target: 'Affiliate_Report',
          Method: 'getStats',
          start_date: from.split(' ')[0], // Format YYYY-MM-DD
          end_date: to.split(' ')[0],
          fields: ['Stat.affiliate_info1', 'Stat.conversions', 'Stat.payout'],
          group: ['Stat.affiliate_info1'] // Grouper par sub1
        }
      });

      console.log(`🔍 Response status: ${response.status}`);
      
      if (response.data.response.status !== 1) {
        console.log(`⚠️  TUNE API avec sub1 échoué, fallback sur stats globales`);
        console.log(`   Erreur:`, response.data.response.errors[0]?.publicMessage);
        
        // FALLBACK: Récupérer les stats globales sans sub1
        const globalResponse = await tuneClient.get('', {
          params: {
            Target: 'Affiliate_Report',
            Method: 'getStats',
            start_date: from.split(' ')[0],
            end_date: to.split(' ')[0],
            fields: ['Stat.conversions', 'Stat.payout']
          }
        });
        
        if (globalResponse.data.response.status === 1) {
          const globalData = globalResponse.data.response.data?.data?.[0] || {};
          const convs = parseInt(globalData.Stat?.conversions) || 0;
          const payout = parseFloat(globalData.Stat?.payout) || 0;
          
          console.log(`✅ TUNE stats globales: ${convs} conversions, $${payout}`);
          
          // Retourner avec un sub1 par défaut "tune"
          if (convs > 0) {
            return [{
              sub1: 'tune',
              convs: convs,
              revenue: Math.round(payout * 100) / 100
            }];
          }
        }
        
        return [];
      }

      const data = response.data.response.data?.data || [];
      console.log(`✅ ${data.length} lignes TUNE récupérées`);

      // Transformer les stats TUNE en format compatible avec le reste du code
      const result = data.map(stat => {
        const sub1 = stat.Stat?.affiliate_info1 || 'tune';
        const convs = parseInt(stat.Stat?.conversions) || 0;
        const payout = parseFloat(stat.Stat?.payout) || 0;
        
        return {
          sub1: sub1,
          convs: convs,
          revenue: Math.round(payout * 100) / 100
        };
      }).filter(item => item.convs > 0); // Filtrer les lignes sans conversions

      console.log(`📊 TUNE agrégé par sub1:`, result);

      return result;
    } catch (error) {
      console.error('❌ Erreur API TUNE:', error.response?.data || error.message);
      return [];
    }
  },

  // Récupérer les stats du dashboard depuis TUNE
  async getDashboardStats(period = 'today') {
    try {
      const { from, to } = this.getDateRange(period);
      
      const response = await tuneClient.get('', {
        params: {
          Target: 'Affiliate_Report',
          Method: 'getStats',
          start_date: from.split(' ')[0],
          end_date: to.split(' ')[0],
          fields: ['Stat.clicks', 'Stat.conversions', 'Stat.revenue', 'Stat.payout'],
          group: 'day'
        }
      });

      const stats = response.data.response.data || [];
      
      // Agréger les stats
      const totals = stats.reduce((acc, stat) => ({
        clicks: acc.clicks + (parseInt(stat.clicks) || 0),
        conversions: acc.conversions + (parseInt(stat.conversions) || 0),
        revenue: acc.revenue + (parseFloat(stat.revenue) || 0),
        payout: acc.payout + (parseFloat(stat.payout) || 0)
      }), { clicks: 0, conversions: 0, revenue: 0, payout: 0 });

      console.log(`✅ Stats TUNE récupérées:`, totals);
      return totals;
    } catch (error) {
      console.error('❌ Erreur stats TUNE:', error.response?.data || error.message);
      return { clicks: 0, conversions: 0, revenue: 0, payout: 0 };
    }
  },

  // Fonction pour calculer les dates selon la période (corrigée pour TUNE)
  getDateRange(period = 'today') {
    // Utiliser la date actuelle
    const now = new Date();
    let startDate, endDate;
    
    const effectiveToday = new Date(now);
    
    // Déterminer si on est avant 2h du matin (décalage de journée)
    if (now.getHours() < 2) {
      effectiveToday.setDate(effectiveToday.getDate() - 1);
    }
    
    switch(period) {
      case 'yesterday':
        startDate = new Date(effectiveToday);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(effectiveToday);
        break;
        
      case 'week':
        startDate = new Date(effectiveToday);
        const dayOfWeek = startDate.getDay();
        const daysToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        startDate.setDate(startDate.getDate() - daysToMonday);
        endDate = new Date(effectiveToday);
        endDate.setDate(endDate.getDate() + 1);
        break;
        
      case 'month':
        startDate = new Date(effectiveToday.getFullYear(), effectiveToday.getMonth(), 1);
        endDate = new Date(effectiveToday);
        endDate.setDate(endDate.getDate() + 1);
        console.log(`📅 [TUNE-API MONTH] Date de début: ${startDate.toISOString()}, Date de fin: ${endDate.toISOString()}`);
        break;
        
      case 'today':
      default:
        startDate = new Date(effectiveToday);
        endDate = new Date(effectiveToday);
        endDate.setDate(endDate.getDate() + 1);
        break;
    }
    
    const from = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')} 02:00:00`;
    const to = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')} 01:59:59`;
    
    console.log(`📅 [TUNE-API ${period.toUpperCase()}] Période calculée: ${from} → ${to}`);
    
    return { from, to };
  }
};

module.exports = tuneAPI;
