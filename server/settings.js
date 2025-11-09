const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

// Lire les paramètres
function getSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      // Créer le fichier avec des valeurs par défaut
      const defaultSettings = { 
        payout_per_lead: 4.70, 
        payout_by_sub1: {},
        currency: 'USD',
        usd_to_eur_rate: 1,
        manager_margin_per_lead: 25.30,
        sub_affiliate_rules: []
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    // Assurer les valeurs par défaut
    if (!parsed.currency) parsed.currency = 'USD';
    if (!parsed.usd_to_eur_rate) parsed.usd_to_eur_rate = 1;
    if (!parsed.payout_per_lead) parsed.payout_per_lead = 4.70;
    if (!parsed.manager_margin_per_lead) parsed.manager_margin_per_lead = 25.30;
    return parsed;
  } catch (error) {
    console.error('Erreur lecture settings:', error.message);
    return { 
      payout_per_lead: 4.70, 
      payout_by_sub1: {},
      currency: 'USD',
      usd_to_eur_rate: 1,
      manager_margin_per_lead: 25.30,
      sub_affiliate_rules: []
    };
  }
}

// Obtenir le payout pour un sub1 spécifique (personnalisable avec défaut $4.70)
function getPayoutForSub1(sub1) {
  const settings = getSettings();
  // Si un payout spécifique existe pour ce sub1, l'utiliser, sinon utiliser le payout par défaut
  return settings.payout_by_sub1[sub1] || settings.payout_per_lead || 4.70;
}

// Obtenir le payout affiché (personnalisable avec défaut $4.70)
function getDisplayPayoutForSub1(sub1) {
  const settings = getSettings();
  // Si un payout spécifique existe pour ce sub1, l'utiliser, sinon utiliser le payout par défaut
  return settings.payout_by_sub1[sub1] || settings.payout_per_lead || 4.70;
}

// Obtenir le payout par défaut affiché (TOUJOURS $4.70 - FIXE)
function getDisplayPayoutPerLead() {
  return 4.70; // TOUJOURS $4.70 - NON MODIFIABLE
}

// Mettre à jour les paramètres
function updateSettings(newSettings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...newSettings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    return { success: true, settings: updated };
  } catch (error) {
    console.error('Erreur mise à jour settings:', error.message);
    return { success: false, error: error.message };
  }
}

// Obtenir la marge du manager par lead (TOUJOURS $25.30 - FIXE)
function getManagerMargin() {
  return 25.30; // TOUJOURS $25.30 - NON MODIFIABLE
}

// Obtenir le multiplicateur de comptage de leads pour un sub1 spécifique
function getLeadCountMultiplier(sub1) {
  const settings = getSettings();
  const leadCountRules = settings.lead_count_rules || [];
  
  // Chercher une règle pour ce sub1
  const rule = leadCountRules.find(r => r.sub1 === sub1);
  
  // Si une règle existe, retourner le multiplicateur, sinon 1 (pas de modification)
  return rule ? rule.multiplier : 1;
}

// Obtenir le bonus de leads fixe pour un sub1 spécifique
function getLeadCountBonus(sub1) {
  const settings = getSettings();
  const leadCountRules = settings.lead_count_rules || [];
  
  // Chercher une règle pour ce sub1
  const rule = leadCountRules.find(r => r.sub1 === sub1);
  
  // Si une règle existe avec un bonus, le retourner, sinon 0
  return rule && rule.bonus_leads ? rule.bonus_leads : 0;
}

module.exports = {
  getSettings,
  updateSettings,
  getPayoutForSub1,
  getDisplayPayoutForSub1,
  getDisplayPayoutPerLead,
  getManagerMargin,
  getLeadCountMultiplier,
  getLeadCountBonus
};



