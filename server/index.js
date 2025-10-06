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
  const sub1List = await csvDataAPI.getSub1List();
  res.json(sub1List);
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

// Routes API - Stats depuis Everflow API, détails depuis CSV (protégé)
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const period = req.query.period || 'today';
    let stats;
    
    if (user.role === 'admin') {
      // Admin: stats globales moins les masqués
      stats = await csvDataAPI.getDashboardStats(period);
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
});
