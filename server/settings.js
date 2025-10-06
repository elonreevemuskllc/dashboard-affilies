const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

// Lire les paramètres
function getSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      // Créer le fichier avec des valeurs par défaut
      const defaultSettings = { 
        payout_per_lead: 4, 
        payout_by_sub1: {},
        currency: 'EUR',
        usd_to_eur_rate: 0.92,
        manager_margin_per_lead: 1
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    // Assurer les valeurs par défaut
    if (!parsed.currency) parsed.currency = 'EUR';
    if (!parsed.usd_to_eur_rate) parsed.usd_to_eur_rate = 0.92;
    if (!parsed.manager_margin_per_lead) parsed.manager_margin_per_lead = 1;
    return parsed;
  } catch (error) {
    console.error('Erreur lecture settings:', error.message);
    return { 
      payout_per_lead: 4, 
      payout_by_sub1: {},
      currency: 'EUR',
      usd_to_eur_rate: 0.92,
      manager_margin_per_lead: 1
    };
  }
}

// Obtenir le payout pour un sub1 spécifique (toujours $4.70 fixe)
function getPayoutForSub1(sub1) {
  // Toujours retourner $4.70 - valeur fixe
  return 4.70;
}

// Obtenir le payout affiché (toujours $4.70 fixe)
function getDisplayPayoutForSub1(sub1) {
  // Toujours retourner $4.70 - valeur fixe
  return 4.70;
}

// Obtenir le payout par défaut affiché (toujours $4.70)
function getDisplayPayoutPerLead() {
  return 4.70; // Toujours $4.70 - valeur fixe
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

// Obtenir la marge du manager par lead (toujours $25.30 fixe)
function getManagerMargin() {
  // Toujours retourner $25.30 - valeur fixe
  return 25.30;
}

module.exports = {
  getSettings,
  updateSettings,
  getPayoutForSub1,
  getDisplayPayoutForSub1,
  getDisplayPayoutPerLead,
  getManagerMargin
};

