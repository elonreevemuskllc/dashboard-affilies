# 🔑 Comment Modifier les Mots de Passe

## 📝 Modification Directe dans users.json

Tu peux maintenant modifier directement les mots de passe dans le fichier `data/users.json` :

### 1. **Ouvre le fichier** `data/users.json`

### 2. **Modifie le champ `password`** de l'utilisateur souhaité :

```json
{
  "id": 5,
  "email": "johnpalmer1270@gmail.com",
  "password": "TON_NOUVEAU_MOT_DE_PASSE",  ← Change ça
  "sub1": ["elon", "losh"],
  "role": "manager",
  "name": "elon"
}
```

### 3. **Sauvegarde le fichier**

### 4. **Essaie de te connecter** - ça marche immédiatement !

## 🔍 Logs de Connexion

Quand tu essaies de te connecter, tu verras dans le terminal :
- ✅ `Connexion réussie: elon (manager)` si ça marche
- 🔍 `Tentative de connexion échouée: mot de passe incorrect` si ça ne marche pas

## 👥 Tes Comptes Actuels

| Email | Mot de passe actuel | Rôle |
|-------|-------------------|------|
| `johnpalmer1270@gmail.com` | `elon123` | Manager |
| `admin@dashboard.com` | `admin123` | Admin |
| `moddingcharo123@gmail.com` | `losh123` | Affilié |
| `saw398493843@yopmail.com` | `sw123` | Affilié |
| `ila.email.pro@gmail.com` | `lico123` | Manager |

## ⚠️ Important

- **Sauvegarde toujours** le fichier après modification
- **Pas besoin de redémarrer** le serveur
- **Les changements sont immédiats**

## 🚀 Utilisation

1. **Modifie** le mot de passe dans `users.json`
2. **Sauvegarde** le fichier  
3. **Connecte-toi** avec le nouveau mot de passe
4. **C'est tout !** 🎉
