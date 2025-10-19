const axios = require('axios');

const TUNE_API_KEY = '17975415225d6f5c3b5ef35459714d15ffb4f624211018480d9f75b78982d671';
const TUNE_NETWORK_ID = 'ils';

async function testAllSubs() {
  console.log('🧪 Test TUNE - Tous les sub (info1, info2, info3, info4, info5)\n');
  
  const subsToTest = [
    { name: 'Sub2 (affiliate_info2)', field: 'Stat.affiliate_info2' },
    { name: 'Sub3 (affiliate_info3)', field: 'Stat.affiliate_info3' },
    { name: 'Sub4 (affiliate_info4)', field: 'Stat.affiliate_info4' },
    { name: 'Sub5 (affiliate_info5)', field: 'Stat.affiliate_info5' },
  ];
  
  for (const sub of subsToTest) {
    console.log(`\n📋 Test: ${sub.name}`);
    
    try {
      const response = await axios.get(`https://${TUNE_NETWORK_ID}.api.hasoffers.com/Apiv3/json`, {
        params: {
          Target: 'Affiliate_Report',
          Method: 'getStats',
          api_key: TUNE_API_KEY,
          start_date: '2025-10-10',
          end_date: '2025-10-11',
          fields: [sub.field, 'Stat.conversions', 'Stat.payout'],
          group: [sub.field],
          limit: 20
        }
      });
      
      if (response.data.response.status === 1) {
        const data = response.data.response.data?.data || [];
        console.log(`   ✅ SUCCÈS ! ${data.length} valeurs trouvées`);
        
        if (data.length > 0) {
          console.log('   📊 Données:');
          data.slice(0, 10).forEach((item, i) => {
            const subValue = item.Stat?.[sub.field.split('.')[1]] || 'N/A';
            const convs = item.Stat?.conversions || 0;
            const payout = item.Stat?.payout || 0;
            console.log(`      ${i+1}. "${subValue}": ${convs} convs, $${parseFloat(payout).toFixed(2)}`);
          });
          
          // Total
          const totalConvs = data.reduce((sum, item) => sum + parseInt(item.Stat?.conversions || 0), 0);
          const totalPayout = data.reduce((sum, item) => sum + parseFloat(item.Stat?.payout || 0), 0);
          console.log(`   🎯 Total: ${totalConvs} conversions, $${totalPayout.toFixed(2)}`);
        }
      } else {
        const error = response.data.response.errors[0]?.publicMessage || 'Erreur inconnue';
        console.log(`   ❌ ${error.substring(0, 100)}`);
      }
      
    } catch (err) {
      console.log(`   ❌ Exception: ${err.message}`);
    }
  }
  
  // Test COMBO : sub2 + sub3 ensemble
  console.log('\n\n📋 BONUS: Test avec sub2 ET sub3 ensemble');
  try {
    const response = await axios.get(`https://${TUNE_NETWORK_ID}.api.hasoffers.com/Apiv3/json`, {
      params: {
        Target: 'Affiliate_Report',
        Method: 'getStats',
        api_key: TUNE_API_KEY,
        start_date: '2025-10-10',
        end_date: '2025-10-11',
        fields: ['Stat.affiliate_info2', 'Stat.affiliate_info3', 'Stat.conversions', 'Stat.payout'],
        group: ['Stat.affiliate_info2', 'Stat.affiliate_info3'],
        limit: 20
      }
    });
    
    if (response.data.response.status === 1) {
      const data = response.data.response.data?.data || [];
      console.log(`   ✅ SUCCÈS ! ${data.length} combinaisons trouvées`);
      
      if (data.length > 0) {
        console.log('   📊 Données:');
        data.slice(0, 10).forEach((item, i) => {
          const sub2 = item.Stat?.affiliate_info2 || 'N/A';
          const sub3 = item.Stat?.affiliate_info3 || 'N/A';
          const convs = item.Stat?.conversions || 0;
          const payout = item.Stat?.payout || 0;
          console.log(`      ${i+1}. Sub2="${sub2}", Sub3="${sub3}": ${convs} convs, $${parseFloat(payout).toFixed(2)}`);
        });
      }
    } else {
      console.log(`   ❌ ${response.data.response.errorMessage}`);
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`);
  }
}

testAllSubs();


