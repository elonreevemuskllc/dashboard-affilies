# 📊 Dashboard Affiliés Everflow

Dashboard simple et sécurisé pour que vos affiliés consultent leurs statistiques en temps réel.

## 🚀 Démarrage Rapide

### 1. Installer les dépendances
```bash
npm install
```

### 2. Lancer le serveur
```bash
npm run dev
```

### 3. Se connecter
Ouvrez http://localhost:3000/login

**Identifiants admin :**
- Email : `admin@dashboard.com`
- Mot de passe : `admin123`

## 📁 Structure du Projet

```
dashboard/
│
├── 📄 FICHIERS FRONTEND
│   ├── index.html          ← Page principale du dashboard
│   ├── login.html          ← Page de connexion
│   ├── admin.html          ← Panel d'administration
│   ├── style.css           ← Styles CSS
│   └── app.js              ← Logique JavaScript du dashboard
│
├── 🖥️ SERVER (Backend)
│   └── server/
│       ├── index.js        ← Serveur Express (routes)
│       ├── auth.js         ← Système d'authentification
│       └── csv-reader.js   ← Lecture des données CSV
│
├── 💾 DATA (Base de données)
│   └── data/
│       ├── users.json      ← 👥 TOUS LES UTILISATEURS (vous + affiliés)
│       ├── agg_by_sub1.csv ← 📊 Stats par affilié (généré par script)
│       └── *.csv           ← Autres fichiers de données
│
├── 🔧 SCRIPTS
│   └── report_today.ps1    ← Script pour récupérer les données Everflow
│
└── 📦 CONFIGURATION
    ├── package.json        ← Dépendances npm
    └── .gitignore          ← Fichiers à ignorer
```

## 💾 BASE DE DONNÉES (JSON)

### 📍 Où sont stockés les utilisateurs ?

**Fichier : `data/users.json`**

```json
{
  "users": [
    {
      "id": 1,
      "email": "admin@dashboard.com",
      "password": "$2b$10$...",
      "sub1": "admin",
      "role": "admin",
      "name": "Administrateur"
    }
  ]
}
```

### Structure d'un utilisateur :
- **id** : ID unique
- **email** : Email de connexion
- **password** : Mot de passe hashé (bcrypt)
- **sub1** : Tracking code Everflow
- **role** : `admin` ou `affiliate`
- **name** : Nom affiché

## 🔐 Système d'Authentification

### Connexion Admin
1. Allez sur http://localhost:3000/login
2. Email : `admin@dashboard.com`
3. Mot de passe : `admin123`
4. Vous êtes redirigé vers le panel admin

### Créer un compte affilié
1. Connectez-vous en admin
2. Allez sur http://localhost:3000/admin
3. Remplissez le formulaire :
   - **Nom** : Nom de l'affilié
   - **Email** : Son email
   - **Mot de passe** : Son mot de passe
   - **Sub1** : Sélectionnez dans la liste (ex: `elon`, `losh`)
4. Cliquez sur "Créer le compte"

### Connexion Affilié
- L'affilié se connecte sur http://localhost:3000/login
- Il voit **SEULEMENT** ses propres stats (filtré par sub1)

## 📊 Mise à Jour des Données

### Récupérer les données depuis Everflow

Lancez ce script PowerShell pour mettre à jour les stats :

```powershell
.\report_today.ps1
```

**Ce script fait quoi ?**
1. Se connecte à l'API Everflow
2. Récupère les conversions d'aujourd'hui
3. Génère les fichiers CSV dans `data/`
4. Le dashboard se met à jour automatiquement

**Fréquence recommandée :**
- Manuellement quand vous voulez
- OU automatisez avec une tâche Windows (toutes les heures)

## 🎯 Fonctionnalités

### Pour les ADMIN
- ✅ Voir toutes les stats (sauf affiliés masqués : fian, lico, llico)
- ✅ Créer/supprimer des comptes affiliés
- ✅ Accès au panel d'administration
- ✅ Stats en temps réel depuis l'API Everflow

### Pour les AFFILIÉS
- ✅ Voir SEULEMENT leurs stats (filtré par sub1)
- ✅ Statistiques : clicks, conversions, revenus
- ✅ Graphique de performance (30 jours)
- ✅ Liste des conversions récentes
- ✅ Actualisation automatique (1 minute)

## 🔧 Configuration

### Affiliés masqués du dashboard

Pour masquer certains affiliés, éditez `server/csv-reader.js` ligne 11 :

```javascript
const HIDDEN_AFFILIATES = ['fian', 'lico', 'llico'];
```

### Changer la fréquence d'actualisation

Par défaut : toutes les 1 minute

Pour changer, éditez `app.js` ligne 310 :

```javascript
setInterval(refreshAllData, 1 * 60 * 1000); // 1 minute
```

### API Key Everflow

Stockée dans `.env` (créé automatiquement) :

```
EVERFLOW_API_KEY=Gil8vPvQ6GRq3skkYX2cA
```

## 🛠️ Commandes Utiles

```bash
# Démarrer le serveur
npm run dev

# Installer les dépendances
npm install

# Récupérer les données Everflow
.\report_today.ps1

# Générer un hash de mot de passe
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('MOT_DE_PASSE', 10).then(hash => console.log(hash));"
```

## 🔒 Sécurité

- ✅ Mots de passe hashés avec bcrypt
- ✅ Sessions sécurisées (24h)
- ✅ Pages protégées par authentification
- ✅ Rôles admin/affiliate
- ✅ Filtrage automatique des données par utilisateur

## ❓ FAQ

### Où sont les utilisateurs ?
→ Dans `data/users.json`

### Où sont les stats des affiliés ?
→ Dans `data/agg_by_sub1.csv` (généré par `report_today.ps1`)

### Comment ajouter un affilié ?
→ Connectez-vous en admin → Panel admin → Créer un compte

### Comment mettre à jour les données ?
→ Lancez `.\report_today.ps1`

### Où changer l'API Key ?
→ Dans le fichier `.env` (ou `server/csv-reader.js` ligne 14)

### Comment changer le mot de passe admin ?
→ Modifiez `data/users.json` ou créez un nouveau compte admin

## 🎨 Personnalisation

Les couleurs sont dans `style.css` (variables CSS) :

```css
:root {
    --primary-color: #6366f1;
    --secondary-color: #8b5cf6;
    --success-color: #10b981;
    ...
}
```

## 📱 Responsive

Le dashboard est entièrement responsive et fonctionne sur :
- 💻 Desktop
- 📱 Mobile
- 📱 Tablette

---

**Dashboard prêt à l'emploi ! 🚀**

Pour toute question, consultez les fichiers dans le projet.
Test deploy 2025-11-09
