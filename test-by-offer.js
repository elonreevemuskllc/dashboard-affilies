const axios = require('axios');

const TUNE_API_KEY = '17975415225d6f5c3b5ef35459714d15ffb4f624211018480d9f75b78982d671';
const TUNE_NETWORK_ID = 'ils';

async function testByOffer() {
  console.log('🧪 Test TUNE - Grouper par Offer au lieu de sub1\n');
  
  try {
    console.log('📊 Récupération des conversions par Offer...');
    const response = await axios.get(`https://${TUNE_NETWORK_ID}.api.hasoffers.com/Apiv3/json`, {
      params: {
        Target: 'Affiliate_Report',
        Method: 'getStats',
        api_key: TUNE_API_KEY,
        start_date: '2025-10-10',
        end_date: '2025-10-11',
        fields: ['Offer.id', 'Offer.name', 'Stat.conversions', 'Stat.payout'],
        group: ['Offer.id'],
        limit: 50
      }
    });
    
    if (response.data.response.status === 1) {
      const data = response.data.response.data?.data || [];
      console.log(`✅ ${data.length} offres avec conversions trouvées\n`);
      
      if (data.length > 0) {
        console.log('📋 Liste des offres:');
        data.forEach((item, i) => {
          const offerId = item.Offer?.id || 'N/A';
          const offerName = item.Offer?.name || 'N/A';
          const convs = item.Stat?.conversions || 0;
          const payout = item.Stat?.payout || 0;
          
          // Couper le nom si trop long
          const shortName = offerName.length > 60 ? offerName.substring(0, 60) + '...' : offerName;
          
          console.log(`   ${i+1}. ID ${offerId}: "${shortName}"`);
          console.log(`      → ${convs} conversions, $${parseFloat(payout).toFixed(2)}`);
        });
        
        // Total
        const totalConvs = data.reduce((sum, item) => sum + parseInt(item.Stat?.conversions || 0), 0);
        const totalPayout = data.reduce((sum, item) => sum + parseFloat(item.Stat?.payout || 0), 0);
        console.log(`\n🎯 TOTAL: ${totalConvs} conversions, $${totalPayout.toFixed(2)}`);
        
        console.log('\n💡 SOLUTION POSSIBLE:');
        console.log('   Si chaque affilié a sa propre offre, on peut mapper:');
        console.log('   Offer ID → Sub1 (affilié)');
      }
    } else {
      console.log('❌ Erreur:', response.data.response.errorMessage);
    }
    
  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
}

testByOffer();


