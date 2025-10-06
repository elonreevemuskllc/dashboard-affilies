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

// Obtenir le payout pour un sub1 spécifique (vrai coût)
function getPayoutForSub1(sub1) {
  const settings = getSettings();
  // Si un payout spécifique existe pour ce sub1, l'utiliser, sinon utiliser le payout par défaut
  return settings.payout_by_sub1[sub1] || settings.payout_per_lead || 4;
}

// Obtenir le payout affiché (toujours $4 pour masquer le vrai coût)
function getDisplayPayoutForSub1(sub1) {
  const settings = getSettings();
  // Toujours retourner $4 pour l'affichage, sauf si un payout spécifique est défini pour ce sub1
  if (settings.payout_by_sub1[sub1] && settings.payout_by_sub1[sub1] !== 4) {
    // Si un payout spécifique est défini et différent de 4, l'utiliser
    return settings.payout_by_sub1[sub1];
  }
  // Sinon, toujours retourner $4 par défaut
  return 4;
}

// Obtenir le payout par défaut affiché (toujours $4)
function getDisplayPayoutPerLead() {
  return 4; // Toujours $4 pour l'affichage
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

// Obtenir la marge du manager par lead
function getManagerMargin() {
  const settings = getSettings();
  return settings.manager_margin_per_lead || 1;
}

module.exports = {
  getSettings,
  updateSettings,
  getPayoutForSub1,
  getDisplayPayoutForSub1,
  getDisplayPayoutPerLead,
  getManagerMargin
};

