# 🔐 Stockage Sécurisé des Mots de Passe

## ✅ Implémentation Complète

Le système supporte maintenant le **stockage sécurisé des mots de passe** avec chiffrement AES-256-GCM.

---

## 🔒 Sécurité

### Chiffrement

- **Algorithme** : AES-256-GCM (Advanced Encryption Standard)
- **Taille de clé** : 256 bits (32 bytes)
- **Mode** : GCM (Galois/Counter Mode) avec authentification
- **IV (Initialization Vector)** : Aléatoire, unique par chiffrement
- **Salt** : Aléatoire, unique par chiffrement
- **Tag d'authentification** : Vérifie l'intégrité des données

### Clé de Chiffrement

La clé de chiffrement est dérivée de la variable d'environnement `ENCRYPTION_KEY` :

- **Recommandé** : Générer une clé sécurisée de 64 caractères hexadécimaux
- **Fallback** : Si non définie, utilise une clé par défaut (moins sécurisé)

---

## 📋 Configuration

### Étape 1 : Générer une clé de chiffrement

```bash
npm run generate:key
```

Cela affichera quelque chose comme :
```
ENCRYPTION_KEY=a1b2c3d4e5f6... (64 caractères hex)
```

### Étape 2 : Ajouter la clé dans .env

```env
# Ajouter cette ligne dans .env
ENCRYPTION_KEY=votre_cle_generee_ici
```

⚠️ **IMPORTANT** :
- Ne jamais commiter cette clé dans Git
- Garder cette clé secrète
- Si vous perdez la clé, les mots de passe stockés ne pourront plus être déchiffrés

### Étape 3 : Exécuter la migration

```bash
npm run db:migrate:password
```

Cela ajoutera les colonnes `password_encrypted` et `remember_password` à la table `platform_config`.

---

## 🎮 Utilisation

### Via l'Interface Web

1. **Ajouter un compte avec mot de passe sauvegardé**
   - Aller sur Settings > Plateforme
   - Cliquer sur "Ajouter un compte"
   - Remplir les informations
   - ✅ Cocher "Se souvenir du mot de passe (chiffré)"
   - Cliquer sur "Ajouter et connecter"

2. **Reconnexion automatique**
   - Si "Se souvenir du mot de passe" est activé
   - Cliquer sur "Reconnecter" (pas besoin de ressaisir le mot de passe)
   - Le mot de passe sera automatiquement déchiffré et utilisé

3. **Désactiver le stockage**
   - Lors de la connexion, décocher "Se souvenir du mot de passe"
   - Le mot de passe stocké sera supprimé de la base de données

### Via l'API REST

#### Connexion avec stockage du mot de passe

```bash
curl -X POST http://localhost:5000/api/platform/connect \
  -H "Content-Type: application/json" \
  -d '{
    "platformName": "ggclub",
    "username": "mon_compte",
    "accountId": "compte1",
    "password": "mon_mot_de_passe",
    "rememberPassword": true
  }'
```

#### Reconnexion automatique (sans mot de passe)

```bash
curl -X POST http://localhost:5000/api/platform/connect \
  -H "Content-Type: application/json" \
  -d '{
    "platformName": "ggclub",
    "username": "mon_compte",
    "accountId": "compte1"
  }'
```

Le système utilisera automatiquement le mot de passe stocké si `rememberPassword` est activé.

---

## 🔧 Architecture Technique

### Format de Stockage

Le mot de passe chiffré est stocké au format :
```
salt:iv:tag:encrypted
```

- **salt** : 64 bytes (hex) - Aléatoire, unique
- **iv** : 16 bytes (hex) - Initialization Vector
- **tag** : 16 bytes (hex) - Tag d'authentification GCM
- **encrypted** : Données chiffrées (hex)

### Flux de Chiffrement

```
Mot de passe en clair
    ↓
[Chiffrement AES-256-GCM]
    ↓
Format: salt:iv:tag:encrypted
    ↓
Stockage dans password_encrypted
```

### Flux de Déchiffrement

```
password_encrypted (salt:iv:tag:encrypted)
    ↓
[Extraction salt, iv, tag]
    ↓
[Déchiffrement AES-256-GCM]
    ↓
Mot de passe en clair
    ↓
Utilisation pour la connexion
```

---

## ⚠️ Sécurité et Bonnes Pratiques

### ✅ Recommandations

1. **Clé de chiffrement**
   - Utiliser une clé unique et aléatoire
   - Ne jamais la partager
   - La sauvegarder de manière sécurisée
   - Utiliser un gestionnaire de mots de passe

2. **Fichier .env**
   - Ne jamais commiter `.env` dans Git
   - Restreindre les permissions du fichier
   - Utiliser des variables d'environnement en production

3. **Base de données**
   - Restreindre l'accès à la base de données
   - Utiliser des connexions SSL/TLS
   - Faire des backups réguliers

### ⚠️ Limitations

1. **Perte de la clé**
   - Si `ENCRYPTION_KEY` est perdue, les mots de passe stockés ne peuvent plus être déchiffrés
   - Solution : Supprimer les comptes et les recréer

2. **Accès à la base de données**
   - Si quelqu'un a accès à la BDD, il peut voir les mots de passe chiffrés
   - Sans la clé, ils ne peuvent pas les déchiffrer
   - Mais il est recommandé de limiter l'accès

3. **Mémoire**
   - Les mots de passe sont déchiffrés en mémoire pendant la connexion
   - Ils ne sont jamais stockés en clair sur le disque

---

## 🐛 Dépannage

### Erreur : "Impossible de déchiffrer le mot de passe stocké"

**Causes possibles** :
1. La clé `ENCRYPTION_KEY` a changé
2. Le format du mot de passe chiffré est invalide
3. La clé n'est pas définie dans `.env`

**Solution** :
1. Vérifier que `ENCRYPTION_KEY` dans `.env` est correcte
2. Si la clé a changé, supprimer les comptes et les recréer
3. Ou désactiver "Se souvenir du mot de passe" et ressaisir

### Erreur : "ENCRYPTION_KEY non défini"

**Solution** :
```bash
# Générer une nouvelle clé
npm run generate:key

# Ajouter dans .env
ENCRYPTION_KEY=la_cle_generee
```

---

## 📊 Vérification

### Vérifier que le stockage fonctionne

```sql
-- Voir les comptes avec mot de passe stocké
SELECT 
  account_id,
  username,
  platform_name,
  CASE 
    WHEN settings->>'rememberPassword' = 'true' THEN '✅ Activé'
    ELSE '❌ Désactivé'
  END as remember_password_status,
  connection_status,
  created_at
FROM platform_config;
```

### Vérifier le format du mot de passe chiffré

```sql
-- Voir le format (ne pas afficher le contenu complet pour sécurité)
SELECT 
  username,
  LEFT(password_encrypted, 20) || '...' as encrypted_preview,
  LENGTH(password_encrypted) as length
FROM platform_config
WHERE password_encrypted IS NOT NULL;
```

---

## ✅ Checklist

- [ ] Clé de chiffrement générée (`npm run generate:key`)
- [ ] `ENCRYPTION_KEY` ajoutée dans `.env`
- [ ] Migration exécutée (`npm run db:migrate:password`)
- [ ] Test d'ajout de compte avec "Se souvenir du mot de passe"
- [ ] Test de reconnexion automatique
- [ ] Vérification que le mot de passe n'est pas en clair dans la BDD

---

## 🎉 Félicitations !

Votre système stocke maintenant les mots de passe de manière sécurisée ! Les comptes peuvent se reconnecter automatiquement sans ressaisir le mot de passe.

**Sécurité renforcée ! 🔒**
