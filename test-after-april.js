const axios = require('axios');

const TUNE_API_KEY = '17975415225d6f5c3b5ef35459714d15ffb4f624211018480d9f75b78982d671';
const TUNE_NETWORK_ID = 'ils';

async function testAfterApril() {
  console.log('🧪 Test TUNE avec dates APRÈS 2024-04-10\n');
  
  const periods = [
    { name: 'Mai 2024', start: '2024-05-01', end: '2024-05-31' },
    { name: 'Juin 2024', start: '2024-06-01', end: '2024-06-30' },
    { name: 'Juillet 2024', start: '2024-07-01', end: '2024-07-31' },
    { name: 'Août 2024', start: '2024-08-01', end: '2024-08-31' },
    { name: 'Septembre 2024', start: '2024-09-01', end: '2024-09-30' },
    { name: 'Octobre 2024 (1-9)', start: '2024-10-01', end: '2024-10-09' },
  ];
  
  for (const period of periods) {
    console.log(`\n📅 ${period.name} (${period.start} → ${period.end})`);
    
    try {
      const response = await axios.get(`https://${TUNE_NETWORK_ID}.api.hasoffers.com/Apiv3/json`, {
        params: {
          Target: 'Affiliate_Report',
          Method: 'getStats',
          api_key: TUNE_API_KEY,
          start_date: period.start,
          end_date: period.end,
          fields: ['Stat.affiliate_info1', 'Stat.conversions', 'Stat.payout'],
          group: ['Stat.affiliate_info1'],
          limit: 10
        }
      });
      
      if (response.data.response.status === 1) {
        const data = response.data.response.data?.data || [];
        console.log(`   ✅ SUCCÈS ! ${data.length} sub1 trouvés`);
        
        if (data.length > 0) {
          const totalConvs = data.reduce((sum, item) => sum + parseInt(item.Stat?.conversions || 0), 0);
          const totalPayout = data.reduce((sum, item) => sum + parseFloat(item.Stat?.payout || 0), 0);
          console.log(`   📊 Total: ${totalConvs} conversions, $${totalPayout.toFixed(2)}`);
          
          // Afficher les 3 premiers sub1
          data.slice(0, 3).forEach(item => {
            const sub1 = item.Stat?.affiliate_info1 || 'N/A';
            console.log(`      - "${sub1}": ${item.Stat?.conversions} convs`);
          });
        }
      } else {
        const error = response.data.response.errors[0]?.publicMessage || 'Erreur';
        console.log(`   ❌ ${error.substring(0, 80)}`);
      }
      
    } catch (err) {
      console.log(`   ❌ Exception: ${err.message}`);
    }
  }
}

testAfterApril();


