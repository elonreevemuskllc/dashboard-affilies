require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const csvDataAPI = require('./csv-reader');
const auth = require('./auth');
const settingsManager = require('./settings');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration des sessions
app.use(session({
  secret: 'dashboard-everflow-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 24 heures
  }
}));

app.use(express.static(path.join(__dirname, '..')));

// Middleware pour vérifier l'authentification
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Non authentifié' });
  }
}

// Middleware pour vérifier admin
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Accès interdit' });
  }
}

// Route login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// Route admin page
app.get('/admin', (req, res) => {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Route principale - Servir le HTML (protégé)
app.get('/', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Routes d'authentification
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  
  const user = auth.authenticateUser(email, password);
  
  if (!user) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  
  req.session.user = user;
  res.json({ success: true, user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Non authentifié' });
  }
});

// Routes admin
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = auth.listUsers();
  res.json(users);
});

app.get('/api/admin/sub1-list', requireAdmin, async (req, res) => {
  // Utiliser 'month' au lieu de 'today' pour afficher tous les sub1 du mois
  const sub1List = await csvDataAPI.getSub1List('month');
  res.json(sub1List);
});

// Route pour vider le cache (admin seulement)
app.post('/api/admin/clear-cache', requireAdmin, (req, res) => {
  csvDataAPI.clearCache();
  res.json({ success: true, message: 'Cache vidé' });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const settings = settingsManager.getSettings();
  res.json(settings);
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { payout_per_lead, payout_by_sub1, manager_margin_per_lead } = req.body;
  const updates = {};
  
  if (payout_per_lead !== undefined) {
    updates.payout_per_lead = parseFloat(payout_per_lead);
  }
  
  if (payout_by_sub1 !== undefined) {
    updates.payout_by_sub1 = payout_by_sub1;
  }
  
  if (manager_margin_per_lead !== undefined) {
    updates.manager_margin_per_lead = parseFloat(manager_margin_per_lead);
  }
  
  const result = settingsManager.updateSettings(updates);
  res.json(result);
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { email, password, sub1, name, role } = req.body;
  const result = auth.createUser(email, password, sub1, name, role);
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  res.json(result);
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const success = auth.deleteUser(userId);
  
  if (!success) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }
  
  res.json({ success: true });
});

// Route pour ajouter un sub1 à un utilisateur existant
app.post('/api/admin/users/:id/sub1', requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { sub1 } = req.body;
    
    if (!sub1) {
      return res.status(400).json({ error: 'Sub1 requis' });
    }
    
    auth.addSub1ToUser(userId, sub1);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur ajout sub1:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Route pour supprimer un sub1 d'un utilisateur existant
app.delete('/api/admin/users/:id/sub1/:sub1', requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const sub1ToRemove = req.params.sub1;
    
    if (!sub1ToRemove) {
      return res.status(400).json({ error: 'Sub1 requis' });
    }
    
    auth.removeSub1FromUser(userId, sub1ToRemove);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression sub1:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Route pour récupérer les leads par sub1 pour les managers
app.get('/api/sub1-leads', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const period = req.query.period || 'today';
    
    console.log('🔍 API sub1-leads appelée:', { 
      userId: user?.id, 
      userRole: user?.role, 
      userSub1: user?.sub1, 
      period 
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }
    
    if (user.role !== 'manager') {
      console.log('❌ Accès refusé - rôle:', user.role);
      return res.status(403).json({ error: 'Accès réservé aux managers' });
    }
    
    const sub1Leads = await csvDataAPI.getSub1LeadsForManager(user.sub1, period);
    console.log('✅ sub1-leads récupérés:', sub1Leads);
    res.json({ sub1Leads });
  } catch (error) {
    console.error('❌ Erreur sub1-leads:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des leads par sub1' });
  }
});

// Route pour récupérer l'EPC global pour les managers
app.get('/api/manager-epc', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const period = req.query.period || 'today';
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }
    
    if (user.role !== 'manager') {
      return res.status(403).json({ error: 'Accès réservé aux managers' });
    }
    
    const epcData = await csvDataAPI.getManagerGlobalEPC(user.sub1, period);
    res.json(epcData);
  } catch (error) {
    console.error('❌ Erreur EPC manager:', error.message);
    res.status(500).json({ error: 'Erreur lors du calcul de l\'EPC' });
  }
});

// Route pour le bonus de Losh
app.get('/api/losh-bonus', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const bonusData = await csvDataAPI.getLoshBonus(period);
    res.json(bonusData);
  } catch (error) {
    console.error('❌ Erreur bonus Losh:', error.message);
    res.status(500).json({ error: 'Erreur lors du calcul du bonus Losh' });
  }
});

// Route pour récupérer les bonus reçus par un utilisateur (Commission Helper)
app.get('/api/user-bonuses', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const period = req.query.period || 'today';
    
    // Récupérer les sub1 de l'utilisateur
    const userSub1s = Array.isArray(user.sub1) ? user.sub1 : [user.sub1];
    
    console.log(`🔍 DEBUG - User: ${user.name}, Sub1s: ${userSub1s.join(', ')}, Role: ${user.role}`);
    console.log(`🔍 DEBUG - Period: ${period}`);
    
    // Récupérer les règles de sous-affiliés
    const settings = settingsManager.getSettings();
    const subAffiliateRules = settings.sub_affiliate_rules || [];
    
    console.log(`🔍 DEBUG - Sub affiliate rules:`, subAffiliateRules);
    
    // Trouver les règles où cet utilisateur est le superviseur (target)
    const applicableRules = subAffiliateRules.filter(rule => 
      userSub1s.includes(rule.targetSub1)
    );
    
    console.log(`🔍 DEBUG - Applicable rules for ${userSub1s.join(', ')}:`, applicableRules);
    
    if (applicableRules.length === 0) {
      return res.json({ bonuses: [], totalBonus: 0 });
    }
    
    // Pour chaque règle, calculer le bonus basé sur les leads de la source
    const bonusDetails = await Promise.all(applicableRules.map(async (rule) => {
      try {
        // UTILISER LA MÊME LOGIQUE QUE POUR SOm !
        // Au lieu de fetchConversionsFromAPI(), utiliser getAffiliateStats()
        const sourceStats = await csvDataAPI.getAffiliateStats(rule.sourceSub1, period);
        console.log(`🔍 DEBUG - Stats for ${rule.sourceSub1}:`, sourceStats);
        console.log(`🔍 DEBUG - Rule bonusAmount:`, rule.bonusAmount);
        
        const leads = sourceStats.conversions || 0;
        const bonus = leads * rule.bonusAmount;
        
        console.log(`🔍 DEBUG - Bonus calculation: ${leads} leads × $${rule.bonusAmount} = $${bonus}`);
        
        return {
          sourceSub1: rule.sourceSub1,
          targetSub1: rule.targetSub1,
          bonusAmount: rule.bonusAmount,
          leads: leads,
          totalBonus: bonus
        };
      } catch (error) {
        console.error(`❌ Error calculating bonus for ${rule.sourceSub1}:`, error);
        return {
          sourceSub1: rule.sourceSub1,
          targetSub1: rule.targetSub1,
          bonusAmount: rule.bonusAmount,
          leads: 0,
          totalBonus: 0
        };
      }
    }));
    
    const totalBonus = bonusDetails.reduce((sum, bonus) => sum + bonus.totalBonus, 0);
    
    console.log(`🔍 DEBUG - Bonus details:`, bonusDetails);
    console.log(`🔍 DEBUG - Total bonus calculated:`, totalBonus);
    
    res.json({ 
      bonuses: bonusDetails, 
      totalBonus: totalBonus,
      period: period
    });
  } catch (error) {
    console.error('❌ Erreur bonus utilisateur:', error.message);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Erreur lors du calcul des bonus',
      details: error.message,
      user: user ? `${user.name} (${user.role})` : 'unknown'
    });
  }
});

// Routes pour les sous-affiliés
app.get('/api/admin/sub-affiliate-rules', requireAdmin, async (req, res) => {
  try {
    const settings = settingsManager.getSettings();
    const subAffiliateRules = settings.sub_affiliate_rules || [];
    res.json(subAffiliateRules);
  } catch (error) {
    console.error('❌ Erreur récupération règles sous-affiliés:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des règles' });
  }
});

app.post('/api/admin/sub-affiliate-rules', requireAdmin, async (req, res) => {
  try {
    const { sourceSub1, targetSub1, bonusAmount } = req.body;
    
    if (!sourceSub1 || !targetSub1 || !bonusAmount) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    if (sourceSub1 === targetSub1) {
      return res.status(400).json({ error: 'Un Sub1 ne peut pas se superviser lui-même' });
    }
    
    const settings = settingsManager.getSettings();
    const subAffiliateRules = settings.sub_affiliate_rules || [];
    
    // Vérifier si la règle existe déjà
    const existingRule = subAffiliateRules.find(rule => 
      rule.sourceSub1 === sourceSub1 && rule.targetSub1 === targetSub1
    );
    
    if (existingRule) {
      existingRule.bonusAmount = bonusAmount;
    } else {
      subAffiliateRules.push({ sourceSub1, targetSub1, bonusAmount });
    }
    
    const result = settingsManager.updateSettings({ sub_affiliate_rules: subAffiliateRules });
    
    if (result.success) {
      res.json({ success: true, message: 'Règle de sous-affilié ajoutée' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ Erreur ajout règle sous-affilié:', error.message);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de la règle' });
  }
});

app.delete('/api/admin/sub-affiliate-rules/:sourceSub1/:targetSub1', requireAdmin, async (req, res) => {
  try {
    const { sourceSub1, targetSub1 } = req.params;
    
    const settings = settingsManager.getSettings();
    const subAffiliateRules = settings.sub_affiliate_rules || [];
    
    const filteredRules = subAffiliateRules.filter(rule => 
      !(rule.sourceSub1 === sourceSub1 && rule.targetSub1 === targetSub1)
    );
    
    const result = settingsManager.updateSettings({ sub_affiliate_rules: filteredRules });
    
    if (result.success) {
      res.json({ success: true, message: 'Règle de sous-affilié supprimée' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ Erreur suppression règle sous-affilié:', error.message);
    res.status(500).json({ error: 'Erreur lors de la suppression de la règle' });
  }
});

// Routes API - Stats depuis Everflow API, détails depuis CSV (protégé)
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    console.log(`🔄 API /api/stats appelée - Version Commission Helper Fix - ${new Date().toISOString()}`);
    const user = req.session.user;
    const period = req.query.period || 'today';
    let stats;
    
    if (user.role === 'admin') {
      // Admin: stats globales moins les masqués
      stats = await csvDataAPI.getDashboardStats(period);
    } else if (user.role === 'submanager') {
      // Sous-manager: stats avec commission
      console.log('🔍 DEBUG - Appel getSubManagerStats pour:', user.sub1, period);
      console.log('🔍 DEBUG - User object:', user);
      try {
        stats = await csvDataAPI.getSubManagerStats(user.sub1, period);
        console.log('🔍 DEBUG - getSubManagerStats result:', stats);
      } catch (error) {
        console.error('❌ Erreur getSubManagerStats:', error);
        console.error('❌ Stack trace:', error.stack);
        // Fallback sur getAffiliateStats
        stats = await csvDataAPI.getAffiliateStats(user.sub1, period);
        console.log('🔍 DEBUG - Fallback getAffiliateStats result:', stats);
      }
    } else {
      // Affilié: stats uniquement pour son sub1
      stats = await csvDataAPI.getAffiliateStats(user.sub1, period);
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Erreur stats:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

app.get('/api/conversions', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const period = req.query.period || 'today';
    const conversions = await csvDataAPI.getConversions(user, 10, period);
    res.json(conversions);
  } catch (error) {
    console.error('Erreur conversions:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des conversions' });
  }
});

app.get('/api/offers', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const period = req.query.period || 'today';
    const offers = await csvDataAPI.getOffers(user, period);
    res.json(offers);
  } catch (error) {
    console.error('Erreur offers:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des offres' });
  }
});

// Classement des affiliés par leads (protégé)
app.get('/api/leaderboard', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const leaderboard = await csvDataAPI.getAffiliatesLeaderboard(period);
    res.json(leaderboard);
  } catch (error) {
    console.error('Erreur leaderboard:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération du classement' });
  }
});

app.get('/api/performance', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const period = req.query.period || 'today';
    const performance = await csvDataAPI.getPerformance(user, period);
    res.json(performance);
  } catch (error) {
    console.error('Erreur performance:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération de la performance' });
  }
});

// Nouvelle route: données des affiliés (admin seulement)
app.get('/api/affiliates', requireAdmin, async (req, res) => {
  try {
    const affiliates = await csvDataAPI.getAffiliatesData();
    res.json(affiliates);
  } catch (error) {
    console.error('Erreur affiliates:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des affiliés' });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📊 Dashboard accessible à l'adresse ci-dessus`);
  console.log(`🔄 VERSION: Commission Helper fix - ${new Date().toISOString()}`);
});
