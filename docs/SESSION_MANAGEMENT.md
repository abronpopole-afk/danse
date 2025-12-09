
# Gestion des Sessions - Documentation Technique

## Vue d'ensemble

Le système de gestion des sessions du GTO Poker Bot assure une gestion robuste et fiable des sessions de jeu avec :
- Arrêt sécurisé garantissant la fermeture propre
- Nettoyage automatique des sessions obsolètes
- Détection automatique des tables GGClub
- Gestion des erreurs et recovery

## Architecture

### Cycle de vie d'une session

```
┌─────────────────┐
│   Démarrage     │
│   Session       │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│  Chargement config   │
│  plateforme (DB)     │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Initialisation      │
│  PlatformManager     │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Démarrage polling   │
│  Détection tables    │
└────────┬─────────────┘
         │
         ▼
┌─────────────┐
│   Jeu en    │
│   cours     │
└──────┬──────┘
       │
       ▼
┌──────────────────┐     ┌──────────────┐
│ Arrêt normal     │ ou  │ Arrêt forcé  │
│ 1. Stop Platform │     │              │
│ 2. Stop Tables   │     │              │
└──────┬───────────┘     └──────┬───────┘
       │                        │
       └──────────┬─────────────┘
                  │
                  ▼
       ┌────────────────────────┐
       │  Session stopped       │
       │  Statistiques sauvées  │
       │  Platform déconnecté   │
       └────────────────────────┘
```

### Endpoints API

#### POST /api/session/start

Démarre une nouvelle session de jeu avec détection automatique des tables.

**Comportement** :
1. Vérifie qu'aucune session active n'existe
2. Crée une nouvelle session en base de données
3. Initialise les statistiques
4. Configure le TableManager avec l'ID de session
5. **Charge la configuration de plateforme depuis la base de données**
6. **Initialise le PlatformManager avec les credentials sauvegardés**
7. **Démarre automatiquement le polling de détection des tables**
8. Retourne l'ID de session

**Nouvelle logique d'initialisation** :
```javascript
// Récupère la config plateforme sauvegardée
const platformConfig = await storage.getPlatformConfig();
if (platformConfig && platformConfig.platformName) {
  const platformManager = getPlatformManager();
  
  // Configure avec les paramètres sauvegardés
  const pmConfig: PlatformManagerConfig = {
    platformName: platformConfig.platformName,
    credentials: {
      username: platformConfig.username || "",
      password: settings.password || "",
    },
    autoReconnect: settings.autoReconnect ?? true,
    scanIntervalMs: settings.scanIntervalMs ?? 500,
    enableAutoAction: settings.enableAutoAction ?? true,
  };

  // Initialise et démarre la détection
  await platformManager.initialize(pmConfig);
}
```

**Réponse** :
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "status": "running",
    "startedAt": "2025-12-09T12:00:00Z"
  }
}
```

#### POST /api/session/stop

Arrête proprement la session en cours avec fermeture ordonnée.

**Comportement (try/finally)** :
```javascript
try {
  // 1. Arrêter le PlatformManager EN PREMIER
  const platformManager = getPlatformManager();
  await platformManager.stop();
  logger.session("SessionManager", "🔌 PlatformManager arrêté");

  // 2. Ensuite arrêter toutes les tables
  await tableManager.stopAll();
  stats = tableManager.getStats();
} catch (err) {
  stopError = err;
  logger.error("SessionManager", "Erreur arrêt tables", { error: String(err) });
} finally {
  // TOUJOURS exécuté - même en cas d'erreur
  await storage.updateBotSession(session.id, {
    status: "stopped",
    stoppedAt: new Date(),
    totalProfit: stats.totalProfit,
    handsPlayed: stats.totalHandsPlayed,
  });
}
```

**Ordre critique** :
1. **PlatformManager.stop()** : Arrête le polling et déconnecte la plateforme
2. **TableManager.stopAll()** : Ferme toutes les sessions de tables
3. **Base de données** : Sauvegarde l'état final (toujours exécuté)

#### POST /api/session/force-stop

Force l'arrêt d'une session bloquée.

**Comportement** :
1. Tente d'arrêter toutes les tables (ignore les erreurs)
2. Marque la session comme "stopped" en base
3. Broadcast événement de fermeture forcée

**Utilisation** :
- Session qui ne répond plus
- Timeout lors de l'arrêt normal
- Processus bloqué

#### POST /api/session/cleanup-stale

Nettoie les sessions obsolètes.

**Critères** :
- Session en "running" depuis plus de 24 heures
- Pas de date de début (`startedAt` null)

**Nettoyage automatique** :
- Exécuté au démarrage du serveur
- Empêche l'accumulation de sessions fantômes

## Détection des tables GGClub

### Algorithme de détection

```typescript
async scanForGGClubWindows(): Promise<GGClubWindowInfo[]> {
  const windows = windowManager.getWindows();
  const results: GGClubWindowInfo[] = [];

  for (const win of windows) {
    const title = win.getTitle().toLowerCase();
    
    // Patterns de détection (case-insensitive)
    const isGGPokerWindow = 
      title.includes("ggclub") || 
      title.includes("ggpoker") || 
      title.includes("nl") ||
      title.includes("plo") ||
      title.match(/table\s*\d+/i) ||
      title.includes("holdem");

    if (isGGPokerWindow) {
      const bounds = win.getBounds();
      
      // Filtrer fenêtres minimisées
      if (bounds.width > 0 && bounds.height > 0) {
        results.push({
          handle: win.id,
          title,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
      }
    }
  }

  return results;
}
```

### Logs de débogage

```
[GGClubAdapter] 📋 Liste complète des fenêtres ouvertes
[GGClubAdapter] ✅ Table GGClub détectée: "NL500 Table #123"
[GGClubAdapter] ⏭️ Fenêtre ignorée (minimisée): "GGClub Lobby"
[GGClubAdapter] ✅ 3 table(s) détectée(s)
```

## Gestion des erreurs

### Scénarios de recovery

1. **Erreur lors de l'arrêt des tables** :
   - Statistiques partielles sauvegardées
   - Session marquée "stopped" quand même
   - Erreur loggée pour investigation

2. **Crash du serveur** :
   - Sessions obsolètes nettoyées au redémarrage
   - État restauré depuis la base de données
   - Tables reconnectées si possible

3. **Fenêtre GGClub fermée** :
   - Table automatiquement retirée
   - Session continue avec les tables restantes
   - Événement `table_closed` émis

## Interface utilisateur

### Boutons de contrôle

```tsx
{session ? (
  <>
    <Button variant="destructive" onClick={handleStopSession}>
      <Square className="w-4 h-4 mr-2" />
      STOP URGENCE
    </Button>
    <Button variant="outline" onClick={handleForceStop}>
      <AlertTriangle className="w-4 h-4 mr-2" />
      FORCER
    </Button>
  </>
) : (
  <Button onClick={handleStartSession}>
    <Play className="w-4 h-4 mr-2" />
    DÉMARRER SESSION
  </Button>
)}
```

### Feedback utilisateur

- Toast de confirmation pour chaque action
- Mise à jour temps réel de l'état via WebSocket
- Indicateurs visuels (statut session, tables actives)

## Bonnes pratiques

### Pour les développeurs

1. **Toujours utiliser try/finally** pour les opérations de fermeture
2. **Logger les erreurs** mais ne jamais les ignorer silencieusement
3. **Émettre des événements** pour la synchronisation UI
4. **Valider l'état** avant chaque opération critique

### Pour les utilisateurs

1. **Utiliser "STOP URGENCE"** pour un arrêt normal
2. **Utiliser "FORCER"** uniquement si la session ne répond plus
3. **Consulter les logs** en cas de problème
4. **Redémarrer le serveur** nettoie automatiquement les sessions obsolètes

## Maintenance

### Nettoyage de la base de données

```sql
-- Sessions obsolètes (>24h)
UPDATE bot_sessions 
SET status = 'stopped', stopped_at = NOW()
WHERE status = 'running' 
  AND started_at < NOW() - INTERVAL '24 hours';

-- Statistiques des sessions
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (stopped_at - started_at))) / 3600 as avg_duration_hours
FROM bot_sessions
GROUP BY status;
```

### Monitoring

Points à surveiller :
- Sessions en "running" depuis >1 heure
- Tables détectées vs tables actives
- Erreurs dans les logs lors des arrêts
- Temps de réponse des opérations

## Configuration requise

### Avant de démarrer une session

Pour que la détection automatique des tables fonctionne, vous devez :

1. **Configurer la plateforme dans les Paramètres** :
   - Aller dans l'onglet "Paramètres"
   - Section "Configuration Plateforme"
   - Sélectionner votre plateforme (ex: GGPoker)
   - Entrer vos identifiants
   - Sauvegarder la configuration

2. **La configuration est automatiquement chargée au démarrage** :
   - Au clic sur "DÉMARRER SESSION"
   - Le système charge `platformConfig` depuis la base de données
   - Initialise le `PlatformManager` avec vos credentials
   - Lance le polling de détection des fenêtres

3. **Vérifier que GGClub/GGPoker est ouvert** :
   - Les fenêtres de table doivent être visibles (non minimisées)
   - Le polling démarre automatiquement toutes les 5 secondes
   - Les tables détectées apparaissent dans le dashboard

### Flux complet

```
┌────────────────────┐
│  Paramètres        │
│  Sauvegarder config│
│  plateforme        │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Démarrer Session  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────────────┐
│  Auto-chargement config    │
│  depuis DB                 │
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────────────┐
│  Initialisation Platform   │
│  Manager avec credentials  │
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────────────┐
│  Polling actif             │
│  Détection tables toutes   │
│  les 5 secondes            │
└────────────────────────────┘
```

## Dépannage

### Session bloquée en "running"

**Symptômes** :
- Impossible de démarrer une nouvelle session
- Dashboard affiche une session fantôme

**Solutions** :
1. Bouton "FORCER" dans le dashboard
2. API : `POST /api/session/force-stop`
3. SQL direct : `UPDATE bot_sessions SET status='stopped' WHERE id='...'`
4. Redémarrer le serveur (nettoyage auto)

### Tables non détectées

**Symptômes** :
- Aucune table n'apparaît après détection
- Logs vides pour `[GGClubAdapter]`
- Dashboard affiche "0 tables actives"

**Diagnostic** :
1. **Vérifier la configuration plateforme** :
   ```
   GET /api/platform-config
   ```
   - Doit retourner `platformName`, `username`, etc.
   - Si vide, allez dans Paramètres → Configuration Plateforme

2. **Vérifier l'état du PlatformManager** :
   ```
   GET /api/platform/status
   ```
   - `status` doit être "running"
   - `connectionStatus` doit être "connected"
   - Si "idle" ou "disconnected", la session n'a pas initialisé le PM

3. **Consulter les logs de session** :
   ```bash
   logs/session-YYYY-MM-DD.log
   ```
   - Chercher "🔌 Initialisation PlatformManager"
   - Chercher "✅ CONNECTÉ à ggpoker"
   - Chercher "🔍 Scan des fenêtres de poker"

4. **Vérifier que GGClub est ouvert** :
   - Fenêtres visibles (non minimisées)
   - Titre contient "GGClub", "NL", "Table", etc.

**Solutions** :

1. **Configuration manquante** :
   - Aller dans Paramètres
   - Configurer la plateforme
   - Sauvegarder
   - Redémarrer la session

2. **PlatformManager non initialisé** :
   - Vérifier les logs au moment du démarrage
   - Chercher des erreurs d'initialisation
   - Vérifier que `platformConfig.enabled = true`

3. **Problème technique** :
   - Réinstaller `node-window-manager` : `npm install node-window-manager --build-from-source`
   - Vérifier version Windows (10/11 requis)
   - Exécuter en mode administrateur si nécessaire

4. **Forcer la reconnexion** :
   ```
   POST /api/platform/disconnect
   POST /api/platform/connect
   ```

## Logs de démarrage attendus

Lors du démarrage d'une session, vous devriez voir cette séquence dans les logs :

```
[SessionManager] 🚀 Démarrage session demandé
[SessionManager] ✅ Session créée | sessionId: uuid-...
[SessionManager] 🔌 Initialisation PlatformManager | platform: ggpoker
[PlatformManager] Tentative de connexion | platform: ggpoker, username: xxx
[PlatformManager] Adaptateur créé | platform: ggpoker
[PlatformManager] Tentative de connexion à la plateforme...
[PlatformManager] ✅ CONNECTÉ à ggpoker | username: xxx
[PlatformManager] 🔍 Scan des fenêtres de poker...
[GGClubAdapter] 📋 Liste complète des fenêtres ouvertes
[GGClubAdapter] ✅ Table GGClub détectée: "NL500 Table #123"
[GGClubAdapter] ✅ 3 table(s) détectée(s)
```

Si vous ne voyez pas cette séquence :
- Vérifier que `platformConfig` existe en base
- Vérifier les logs d'erreur juste après "Démarrage session demandé"
- Consulter la section Dépannage ci-dessus

## Tests

### Test de la gestion de session

```bash
# 1. Démarrer
curl -X POST http://localhost:5000/api/session/start

# 2. Arrêt normal
curl -X POST http://localhost:5000/api/session/stop

# 3. Arrêt forcé
curl -X POST http://localhost:5000/api/session/force-stop

# 4. Nettoyage
curl -X POST http://localhost:5000/api/session/cleanup-stale
```

### Test de détection des tables

```typescript
// Dans le code de test
const adapter = new GGClubAdapter();
await adapter.connect({...});
const tables = await adapter.detectTableWindows();
console.log(`${tables.length} tables détectées`);
```
