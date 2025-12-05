
# 🎮 Multi-Comptes GGClub - Guide Complet

Ce guide explique comment gérer plusieurs comptes GGClub simultanément avec le bot de poker.

## 📋 Vue d'ensemble

Le système permet de :
- Gérer plusieurs comptes GGClub en parallèle
- Isoler les configurations par compte (humanizer, GTO, profil joueur)
- Surveiller les statistiques par compte
- Task Scheduler optimisé pour multi-comptes

---

## 🏗️ Architecture Multi-Comptes

### Schéma de Base de Données

Chaque configuration stocke un `account_id` optionnel :

```sql
-- platform_config : un par compte
CREATE TABLE platform_config (
  id SERIAL PRIMARY KEY,
  account_id TEXT,  -- Identifiant unique du compte
  platform_name TEXT,
  username TEXT,
  password TEXT,  -- Chiffré AES-256-GCM
  enabled BOOLEAN DEFAULT false,
  ...
);

-- Configurations partagées ou par compte
CREATE TABLE humanizer_config (
  id SERIAL PRIMARY KEY,
  account_id TEXT,  -- NULL = global, sinon spécifique
  ...
);

CREATE TABLE gto_config (
  id SERIAL PRIMARY KEY,
  account_id TEXT,
  ...
);

CREATE TABLE player_profile_state (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'default',
  personality TEXT,
  tilt_level INTEGER,
  fatigue_level INTEGER,
  ...
);
```

### Isolation des Comptes

Chaque compte possède :
1. **PlatformManager indépendant** : Gère ses propres tables
2. **Task Scheduler partagé** : Optimise l'exécution globale avec priorités
3. **Profil joueur isolé** : État émotionnel indépendant
4. **Statistiques séparées** : Tracking par compte

---

## 🚀 Configuration Multi-Comptes

### Étape 1 : Créer les Comptes

1. Ouvrir le dashboard
2. Aller dans **Settings > Platform**
3. Cliquer sur **Ajouter un Compte**
4. Remplir :
   - **Account ID** : `compte1` (identifiant unique)
   - **Platform** : `ggclub`
   - **Username** : Votre username GGClub
   - **Password** : Votre mot de passe (chiffré automatiquement)
   - **Auto Reconnect** : Activé
   - **Enable Auto Action** : Activé

5. Répéter pour chaque compte (`compte2`, `compte3`, etc.)

### Étape 2 : Configurer les Profils Joueur

Chaque compte peut avoir son propre profil :

```bash
# Via API
curl -X POST http://localhost:5000/api/player-profile/personality \
  -H "Content-Type: application/json" \
  -d '{
    "personality": "aggressive",
    "accountId": "compte1"
  }'
```

Ou via le dashboard :
1. Sélectionner le compte dans le dropdown
2. Aller dans **Settings > Player Profile**
3. Choisir la personnalité (balanced, aggressive, passive, etc.)

### Étape 3 : Lancer les Connexions

Pour chaque compte :

```bash
# Connecter le compte 1
curl -X POST http://localhost:5000/api/platform/connect \
  -H "Content-Type: application/json" \
  -d '{
    "platformName": "ggclub",
    "username": "user1",
    "password": "pass1",
    "accountId": "compte1",
    "autoReconnect": true,
    "enableAutoAction": true
  }'

# Connecter le compte 2
curl -X POST http://localhost:5000/api/platform/connect \
  -H "Content-Type: application/json" \
  -d '{
    "platformName": "ggclub",
    "username": "user2",
    "password": "pass2",
    "accountId": "compte2",
    "autoReconnect": true,
    "enableAutoAction": true
  }'
```

Ou via le dashboard :
1. Aller dans **Platform > Accounts**
2. Cliquer sur **Connect** pour chaque compte

---

## ⚙️ Fonctionnalités Avancées

### Task Scheduler Multi-Comptes

Le Task Scheduler gère tous les comptes avec des priorités :

**Tâches Partagées** :
- **Scan Windows** (priorité normale, 5s) : Détecte toutes les fenêtres
- **Health Check** (priorité background, 30s) : Surveille toutes les tables

**Tâches par Compte** :
- **Game State Poll** (priorité haute, 200ms) : Par compte, avec throttling 6 tables max
- **Action Processing** (priorité critique, 50ms) : Par compte, traité en premier

Exemple de stats :
```bash
curl http://localhost:5000/api/platform/scheduler-stats
```

Réponse :
```json
{
  "system": {
    "totalTasks": 8,
    "enabledTasks": 8,
    "runningTasks": 2,
    "avgExecutionTime": 45,
    "totalExecutions": 1523,
    "totalErrors": 0
  },
  "tasks": [
    {
      "id": "window_scan",
      "name": "Scan Table Windows",
      "priority": "normal",
      "enabled": true,
      "runCount": 120,
      "avgExecutionTime": 25,
      "nextRunIn": 3200
    },
    {
      "id": "game_state_poll_compte1",
      "name": "Poll Game States (compte1)",
      "priority": "high",
      "enabled": true,
      "runCount": 750,
      "avgExecutionTime": 50,
      "nextRunIn": 100
    }
  ]
}
```

### Throttling et Optimisation

Le système limite automatiquement :
- **Max 6 tables traitées simultanément** par polling cycle
- **Batching** : Traite par groupes de 6 avec délai 50ms entre batchs
- **Priorités** : Actions critiques passent avant scan windows
- **CPU-friendly** : Event loop 5ms évite les spikes

### Profil Joueur par Compte

Chaque compte maintient son propre état émotionnel :

**Compte 1** (compte1):
- Personnalité : `aggressive`
- Tilt : 20%
- Fatigue : 35%
- Sessions : 45 mains, +$120

**Compte 2** (compte2):
- Personnalité : `balanced`
- Tilt : 5%
- Fatigue : 60%
- Sessions : 78 mains, -$50

Les états sont **persistants** en base de données.

### Configurations Indépendantes

Chaque compte peut avoir :

**Humanizer** :
```bash
# Global (tous les comptes)
PATCH /api/humanizer
{
  "minActionDelay": 500,
  "maxActionDelay": 2000
}

# Spécifique au compte1
PATCH /api/humanizer?accountId=compte1
{
  "minActionDelay": 300,  # Plus rapide
  "maxActionDelay": 1500
}
```

**GTO Engine** :
```bash
# compte1 : mode API
PATCH /api/gto-config?accountId=compte1
{
  "apiKey": "sk-xxx",
  "fallbackToSimulation": false
}

# compte2 : mode simulation
PATCH /api/gto-config?accountId=compte2
{
  "fallbackToSimulation": true
}
```

---

## 📊 Surveillance Multi-Comptes

### Dashboard

Le dashboard affiche :
- **Account Selector** : Dropdown pour basculer entre comptes
- **Stats par Compte** : Profit, mains, winrate
- **Tables Actives** : Par compte avec code couleur
- **Profil Joueur** : État émotionnel par compte
- **Scheduler** : Stats globales du Task Scheduler

### API Monitoring

```bash
# Liste des comptes connectés
GET /api/platform/accounts

# Stats d'un compte spécifique
GET /api/stats?accountId=compte1

# État du profil d'un compte
GET /api/player-profile?accountId=compte1

# Stats du scheduler (global)
GET /api/platform/scheduler-stats
```

### WebSocket Events

Le serveur émet des événements par compte :

```javascript
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  switch (msg.type) {
    case 'platform_action_executed':
      console.log(`Action sur ${msg.payload.accountId}: ${msg.payload.action}`);
      break;
    
    case 'player_profile_updated':
      console.log(`Profil ${msg.payload.accountId} mis à jour`);
      break;
  }
});
```

---

## 🛠️ Gestion des Erreurs

### Isolation des Erreurs

Si un compte rencontre une erreur :
- **Les autres comptes continuent** : Isolation complète
- **Auto-disable** : Le compte problématique se met en pause après 10 erreurs
- **Health Check** : Tentative de reconnexion automatique
- **Task Scheduler** : Désactive les tâches en erreur, les autres continuent

Exemple :
```
compte1 : Running ✅ (4 tables)
compte2 : Error ❌ (auto-disabled)
compte3 : Running ✅ (2 tables)
```

### Logs par Compte

Les logs incluent l'`account_id` :

```json
{
  "logType": "info",
  "message": "Action exécutée: call",
  "metadata": {
    "accountId": "compte1",
    "tableId": "xyz",
    "action": "call"
  }
}
```

Filtrer par compte :
```bash
curl http://localhost:5000/api/logs?accountId=compte1
```

---

## 🎯 Bonnes Pratiques

### 1. Limiter le Nombre de Comptes

Recommandations :
- **2-3 comptes** : Optimal pour CPU et RAM
- **4-6 comptes** : Possible avec machine puissante (16GB RAM, 8 cores)
- **6+ comptes** : Risque de ralentissements

### 2. Varier les Profils

Pour éviter la détection :
- **Compte 1** : `aggressive` + fatigue faible
- **Compte 2** : `balanced` + fatigue normale
- **Compte 3** : `passive` + fatigue élevée

### 3. Différencier les Horaires

Ne pas jouer tous les comptes simultanément 24/7 :
- **Compte 1** : 9h-12h, 14h-18h
- **Compte 2** : 12h-15h, 20h-23h
- **Compte 3** : 14h-17h, 18h-21h

### 4. Surveiller le Scheduler

Vérifier régulièrement :
```bash
# Stats toutes les 30s
watch -n 30 'curl -s http://localhost:5000/api/platform/scheduler-stats | jq .system'
```

Si `avgExecutionTime` > `intervalMs * 0.8` → Réduire le nombre de tables.

### 5. Utiliser le Throttling

Le système limite automatiquement à 6 tables simultanées en polling, mais vous pouvez ajuster :

```typescript
// Dans platform-manager.ts (si besoin de customiser)
const batchSize = 4; // Réduire si CPU overload
```

---

## 🐛 Dépannage Multi-Comptes

### Problème : Un compte ne se connecte pas

**Solution** :
```bash
# Vérifier le statut
GET /api/platform/status?accountId=compte1

# Forcer la déconnexion
POST /api/platform/disconnect?accountId=compte1

# Reconnecter
POST /api/platform/connect
{
  "accountId": "compte1",
  ...
}
```

### Problème : Ralentissements avec 3+ comptes

**Solution** :
1. Réduire le nombre de tables par compte
2. Augmenter `scanIntervalMs` (200ms → 300ms)
3. Vérifier les stats du scheduler :
```bash
curl http://localhost:5000/api/platform/scheduler-stats
```
4. Désactiver les tâches non critiques si nécessaire

### Problème : Profils joueur se mélangent

**Vérification** :
```sql
SELECT account_id, personality, tilt_level, fatigue_level
FROM player_profile_state;
```

Si plusieurs comptes ont le même `account_id`, corriger :
```sql
UPDATE player_profile_state
SET account_id = 'compte2'
WHERE id = 2;
```

### Problème : Task Scheduler en erreur

**Logs** :
```bash
# Vérifier les tâches en erreur
curl http://localhost:5000/api/platform/scheduler-stats | jq '.tasks[] | select(.errorCount > 0)'
```

**Résolution** :
- Si `errorCount > 10` → Tâche auto-disabled
- Corriger la cause (ex: table fermée)
- Réactiver : `enableTask(taskId)`

---

## 📈 Scaling et Performance

### Métriques Clés

Pour 3 comptes avec 6 tables chacun (18 tables total) :

| Métrique | Valeur |
|----------|--------|
| CPU Usage | ~40-60% (4 cores) |
| RAM Usage | ~2-3 GB |
| Scheduler Tasks | ~12 tâches |
| Avg Execution Time | 40-60ms |
| Poll Interval | 200ms |
| Tables par Batch | 6 |

### Optimisations

1. **Batch Polling** : Traite 6 tables à la fois au lieu de 18 simultanément
2. **Event Loop** : 5ms ticks évite les spikes CPU
3. **Priority Queue** : Actions critiques passent avant scan
4. **Throttling** : Limite la concurrence
5. **Health Check** : Seulement toutes les 30s au lieu de constant

---

## ✅ Checklist Multi-Comptes

Avant de lancer plusieurs comptes :

- [ ] PostgreSQL optimisé (max_connections >= 20)
- [ ] Machine avec 8GB+ RAM et 4+ cores
- [ ] Profils joueur différents par compte
- [ ] Horaires de jeu variés
- [ ] Monitoring scheduler activé
- [ ] Logs filtrable par `account_id`
- [ ] Chaque compte a son propre username/password
- [ ] Task Scheduler configuré (default OK)
- [ ] Throttling activé (6 tables max par batch)
- [ ] Anti-détection configuré par compte

---

## 🎓 Résumé

Le système multi-comptes avec Task Scheduler offre :

✅ **Isolation** : Chaque compte indépendant avec profil propre
✅ **Performance** : Task Scheduler optimise CPU et scaling
✅ **Fiabilité** : Auto-recovery et error isolation
✅ **Monitoring** : Stats temps réel par compte et global
✅ **Scaling** : Jusqu'à 6 comptes sur machine standard

**Utilisation recommandée** : 2-3 comptes avec profils variés pour un équilibre optimal performance/sécurité.
