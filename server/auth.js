const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// Lire les utilisateurs
function getUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data).users;
  } catch (error) {
    console.error('Erreur lecture users.json:', error.message);
    
    // Si le fichier n'existe pas, créer un admin par défaut
    if (error.code === 'ENOENT') {
      console.log('🔧 Création d\'un utilisateur admin par défaut...');
      const defaultUsers = {
        users: [
          {
            id: 1,
            email: "admin@dashboard.com",
            password: "admin123",
            sub1: "admin",
            role: "admin",
            name: "admin"
          }
        ]
      };
      
      try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), 'utf-8');
        console.log('✅ Utilisateur admin créé par défaut');
        return defaultUsers.users;
      } catch (writeError) {
        console.error('Erreur création admin par défaut:', writeError.message);
        return [];
      }
    }
    
    return [];
  }
}

// Sauvegarder les utilisateurs
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Erreur sauvegarde users.json:', error.message);
    return false;
  }
}

// Authentifier un utilisateur (email + mot de passe)
function authenticateUser(email, password) {
  // Recharger les utilisateurs à chaque tentative de connexion
  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    console.log(`🔍 Tentative de connexion échouée: email "${email}" non trouvé`);
    return null;
  }
  
  // Vérifier le mot de passe
  if (user.password !== password) {
    console.log(`🔍 Tentative de connexion échouée: mot de passe incorrect pour "${email}"`);
    return null;
  }
  
  console.log(`✅ Connexion réussie: ${user.name} (${user.role})`);
  
  // Ne pas retourner le mot de passe
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Créer un nouvel utilisateur
function createUser(email, password, sub1, name, role = 'affiliate') {
  const users = getUsers();
  
  // Vérifier si l'email existe déjà
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { error: 'Email déjà utilisé' };
  }
  
  // sub1 peut être un string ou un array
  const sub1Array = Array.isArray(sub1) ? sub1 : [sub1];
  
  // Créer le nouvel utilisateur (mot de passe en clair)
  const newUser = {
    id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
    email,
    password: password, // Stockage en clair
    sub1: sub1Array,
    role: role,
    name
  };
  
  users.push(newUser);
  saveUsers(users);
  
  const { password: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}

// Supprimer un utilisateur
function deleteUser(userId) {
  const users = getUsers();
  const filteredUsers = users.filter(u => u.id !== userId);
  
  if (filteredUsers.length === users.length) {
    return false;
  }
  
  saveUsers(filteredUsers);
  return true;
}

// Ajouter un sub1 à un utilisateur existant
function addSub1ToUser(userId, newSub1) {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    throw new Error('Utilisateur non trouvé');
  }
  
  const user = users[userIndex];
  
  // Vérifier si le sub1 n'existe pas déjà
  if (user.sub1.includes(newSub1)) {
    throw new Error('Ce sub1 est déjà assigné à cet utilisateur');
  }
  
  // Ajouter le nouveau sub1
  user.sub1.push(newSub1);
  
  // Sauvegarder
  const success = saveUsers(users);
  if (!success) {
    throw new Error('Erreur lors de la sauvegarde');
  }
  
  return true;
}

// Lister tous les utilisateurs (sans mots de passe)
function listUsers() {
  const users = getUsers();
  return users.map(({ password, ...user }) => user);
}

module.exports = {
  authenticateUser,
  createUser,
  deleteUser,
  addSub1ToUser,
  listUsers
};
