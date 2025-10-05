const axios = require('axios');

const EVERFLOW_API_KEY = process.env.EVERFLOW_API_KEY;
const EVERFLOW_API_URL = process.env.EVERFLOW_API_URL || 'https://api.eflow.team/v1';

// Configuration axios pour Everflow
const everflowClient = axios.create({
  baseURL: EVERFLOW_API_URL,
  headers: {
    'X-Eflow-API-Key': EVERFLOW_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Wrapper pour les appels API Everflow
const everflowAPI = {
  // Récupérer les statistiques du dashboard
  async getDashboardStats() {
    try {
      const response = await everflowClient.get('/affiliates/reporting/dashboard-stats');
      return response.data;
    } catch (error) {
      console.error('Erreur getDashboardStats:', error.response?.data || error.message);
      // Retourner des données de démonstration si l'API échoue
      return {
        clicks: 12543,
        conversions: 287,
        revenue: 5847.50,
        conversion_rate: 2.29
      };
    }
  },

  // Récupérer les conversions récentes
  async getConversions(limit = 10) {
    try {
      const response = await everflowClient.get('/affiliates/reporting/conversions', {
        params: {
          limit: limit,
          sort: '-created_at'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Erreur getConversions:', error.response?.data || error.message);
      // Retourner des données de démonstration
      return {
        conversions: [
          {
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            offer_name: 'Offre E-commerce Premium',
            payout: 45.50,
            status: 'approved'
          },
          {
            created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
            offer_name: 'Formation en Ligne Marketing',
            payout: 89.00,
            status: 'pending'
          },
          {
            created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            offer_name: 'Abonnement SaaS',
            payout: 120.00,
            status: 'approved'
          },
          {
            created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
            offer_name: 'Application Mobile',
            payout: 25.00,
            status: 'approved'
          },
          {
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            offer_name: 'Service VPN Premium',
            payout: 35.75,
            status: 'pending'
          }
        ]
      };
    }
  },

  // Récupérer les offres disponibles
  async getOffers() {
    try {
      const response = await everflowClient.get('/affiliates/offers');
      return response.data;
    } catch (error) {
      console.error('Erreur getOffers:', error.response?.data || error.message);
      // Retourner des offres de démonstration
      return {
        offers: [
          {
            name: 'E-commerce Premium - Vente Flash',
            payout: 45.50,
            description: 'Promouvez des produits tendances avec des commissions attractives. Taux de conversion élevé!',
            tracking_link: 'https://tracking.example.com/offer1'
          },
          {
            name: 'Formation Marketing Digital',
            payout: 89.00,
            description: 'Formation complète en marketing digital. Commission récurrente sur les abonnements.',
            tracking_link: 'https://tracking.example.com/offer2'
          },
          {
            name: 'Logiciel SaaS B2B',
            payout: 120.00,
            description: 'Outil de gestion de projet pour entreprises. Commission sur chaque souscription.',
            tracking_link: 'https://tracking.example.com/offer3'
          },
          {
            name: 'Application Fitness & Santé',
            payout: 25.00,
            description: 'App mobile de coaching sportif personnalisé. Conversions rapides!',
            tracking_link: 'https://tracking.example.com/offer4'
          },
          {
            name: 'VPN Service Premium',
            payout: 35.75,
            description: 'Service VPN sécurisé avec garantie de remboursement. Très populaire!',
            tracking_link: 'https://tracking.example.com/offer5'
          },
          {
            name: 'Hébergement Web Pro',
            payout: 65.00,
            description: 'Hébergement web professionnel avec support 24/7. Commission élevée.',
            tracking_link: 'https://tracking.example.com/offer6'
          }
        ]
      };
    }
  },

  // Récupérer les données de performance
  async getPerformance() {
    try {
      const today = new Date();
      const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));
      
      const response = await everflowClient.get('/affiliates/reporting/entity-performance', {
        params: {
          from: thirtyDaysAgo.toISOString().split('T')[0],
          to: new Date().toISOString().split('T')[0],
          group_by: 'date'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Erreur getPerformance:', error.response?.data || error.message);
      // Générer des données de performance pour les 30 derniers jours
      const performance = [];
      const today = new Date();
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        performance.push({
          date: date.toISOString().split('T')[0],
          clicks: Math.floor(Math.random() * 500) + 100,
          conversions: Math.floor(Math.random() * 20) + 2
        });
      }
      
      return { performance };
    }
  }
};

module.exports = everflowAPI;
