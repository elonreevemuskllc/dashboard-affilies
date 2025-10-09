const axios = require('axios');

// Configuration TUNE/HasOffers
const TUNE_API_KEY = process.env.TUNE_API_KEY || '17975415225d6f5c3b5ef35459714d15ffb4f624211018480d9f75b78982d671';
const TUNE_NETWORK_ID = process.env.TUNE_NETWORK_ID || 'ils';
const TUNE_API_URL = 'https://api.hasoffers.com/v3';

// Configuration axios pour TUNE
const tuneClient = axios.create({
  baseURL: TUNE_API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  params: {
    api_key: TUNE_API_KEY,
    network_id: TUNE_NETWORK_ID
  }
});

// Wrapper pour les appels API TUNE
const tuneAPI = {
  // Récupérer les conversions depuis TUNE
  async getConversions(period = 'today') {
    try {
      console.log(`🔄 Appel API TUNE [${period}]`);
      
      // Calculer les dates selon la période
      const { from, to } = this.getDateRange(period);
      console.log(`📅 Dates: ${from.split(' ')[0]} → ${to.split(' ')[0]}`);
      
      const response = await tuneClient.get('/Affiliate_Report.json', {
        params: {
          Method: 'getConversions',
          start_date: from.split(' ')[0], // Format YYYY-MM-DD
          end_date: to.split(' ')[0],
          fields: ['Stat.conversion_id', 'Stat.datetime', 'Stat.offer_id', 'Stat.goal_id', 'Stat.conversion_payout', 'Stat.currency', 'Stat.affiliate_info1', 'Stat.affiliate_info2', 'Stat.affiliate_info3', 'Stat.affiliate_info4', 'Stat.affiliate_info5'],
          limit: 1000
        }
      });

      console.log(`🔍 Response status: ${response.status}`);
      console.log(`🔍 Response data:`, JSON.stringify(response.data, null, 2));

      const conversions = response.data.response.data || [];
      console.log(`✅ ${conversions.length} conversions TUNE récupérées`);

      // Agréger par sub1 (utiliser affiliate_info1 comme sub1)
      const aggregated = {};
      conversions.forEach(conv => {
        const sub1 = conv.affiliate_info1 || 'unknown';
        
        if (!aggregated[sub1]) {
          aggregated[sub1] = { sub1, convs: 0, revenue: 0 };
        }
        
        aggregated[sub1].convs++;
        aggregated[sub1].revenue += parseFloat(conv.conversion_payout || 0);
      });

      console.log(`📊 TUNE agréger par sub1:`, aggregated);

      // Convertir en tableau
      const result = Object.values(aggregated).map(item => ({
        sub1: item.sub1,
        convs: item.convs,
        revenue: Math.round(item.revenue * 100) / 100
      }));

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
      
      const response = await tuneClient.get('/Affiliate_Report.json', {
        params: {
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

  // Fonction pour calculer les dates selon la période (identique à csv-reader.js)
  getDateRange(period = 'today') {
    const now = new Date();
    let startDate, endDate;
    
    // Déterminer si on est avant 2h du matin (décalage de journée)
    const effectiveToday = new Date(now);
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
    
    return { from, to };
  }
};

module.exports = tuneAPI;
