# 📁 STRUCTURE SIMPLIFIÉE DU PROJET

## 🎯 LES 3 FICHIERS ESSENTIELS À CONNAÎTRE

### 1️⃣ **data/users.json** → 👥 BASE DE DONNÉES DES UTILISATEURS
```
C:\Users\Elon\Desktop\dashboard\data\users.json
```
**C'est là que TOUS les utilisateurs sont stockés** (admin + affiliés)

### 2️⃣ **data/agg_by_sub1.csv** → 📊 STATS DES AFFILIÉS
```
C:\Users\Elon\Desktop\dashboard\data\agg_by_sub1.csv
```
**C'est là que les stats de chaque affilié sont stockées** (généré par report_today.ps1)

### 3️⃣ **report_today.ps1** → 🔄 SCRIPT DE MISE À JOUR
```
C:\Users\Elon\Desktop\dashboard\report_today.ps1
```
**Lancez ce script pour récupérer les dernières données Everflow**

---

## 📂 STRUCTURE COMPLÈTE

```
dashboard/
│
├── 🌐 PAGES WEB (ce que vous voyez dans le navigateur)
│   ├── login.html          → Page de connexion
│   ├── admin.html          → Panel admin (créer des comptes)
│   ├── index.html          → Dashboard principal
│   ├── style.css           → Design/couleurs
│   └── app.js              → Logique du dashboard
│
├── 💾 DATA (vos données)
│   └── data/
│       ├── users.json              ← 👥 TOUS VOS UTILISATEURS ICI !
│       ├── agg_by_sub1.csv         ← 📊 STATS PAR AFFILIÉ ICI !
│       ├── agg_by_sub1_today.csv   ← Backup du jour
│       ├── agg_by_sub1_sub2_today.csv ← Stats détaillées
│       └── conversions_today.csv   ← Détail des conversions
│
├── 🖥️ SERVER (backend - ne pas toucher)
│   └── server/
│       ├── index.js        → Routes et authentification
│       ├── auth.js         → Système de login
│       ├── csv-reader.js   → Lecture des CSV
│       └── everflow.js     → Connexion API Everflow
│
├── 🔧 SCRIPTS
│   └── report_today.ps1    ← LANCEZ ÇA POUR METTRE À JOUR !
│
└── 📦 CONFIG
    ├── package.json        → Dépendances npm
    └── .gitignore          → Fichiers ignorés
```

---

## 🔥 ACTIONS COURANTES

### 📝 Voir la liste des utilisateurs
```
Ouvrez : data\users.json
```

### 📊 Voir les stats des affiliés
```
Ouvrez : data\agg_by_sub1.csv
```

### ➕ Créer un compte affilié
```
1. Allez sur http://localhost:3000/login
2. Connectez-vous avec admin@dashboard.com / admin123
3. Créez le compte dans le panel admin
```

### 🔄 Mettre à jour les données
```powershell
.\report_today.ps1
```

### ✏️ Modifier un utilisateur manuellement
```
1. Ouvrez : data\users.json
2. Modifiez l'email, le nom, ou le sub1
3. Sauvegardez
4. Ça marche immédiatement !
```

### 🎨 Changer les couleurs
```
Ouvrez : style.css (ligne 2-10)
```

---

## 💡 FICHIERS PAR IMPORTANCE

### ⭐⭐⭐ CRITIQUE
- `data/users.json` → Vos utilisateurs
- `data/agg_by_sub1.csv` → Stats des affiliés
- `report_today.ps1` → Script de mise à jour

### ⭐⭐ IMPORTANT
- `server/` → Backend (ne touchez pas sauf si vous savez)
- `index.html` → Dashboard
- `admin.html` → Panel admin
- `package.json` → Configuration npm

### ⭐ UTILE
- `style.css` → Pour changer les couleurs
- `README.md` → Documentation complète
- `.gitignore` → Git

### ❌ NE PAS TOUCHER
- `node_modules/` → Librairies npm
- `package-lock.json` → Verrous npm

---

## 🎯 EN RÉSUMÉ

**Vous voulez :**

✅ **Voir les utilisateurs** → `data\users.json`  
✅ **Voir les stats** → `data\agg_by_sub1.csv`  
✅ **Mettre à jour** → Lancez `report_today.ps1`  
✅ **Créer un compte** → Admin panel sur http://localhost:3000/admin  
✅ **Changer les couleurs** → Éditez `style.css`

**Vous ne devez jamais toucher :**
- Le dossier `server/`
- Le dossier `node_modules/`

---

**C'est tout ! Simple et clair ! 🚀**
