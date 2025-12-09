
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
┌─────────────┐
│   Démarrage │
│   Session   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Détection      │
│  Tables GGClub  │
└──────┬──────────┘
       │
       ▼
┌─────────────┐
│   Jeu en    │
│   cours     │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ Arrêt normal│ ou  │ Arrêt forcé  │
└──────┬──────┘     └──────┬───────┘
       │                   │
       └─────────┬─────────┘
                 │
                 ▼
       ┌──────────────────┐
       │  Session stopped │
       │  Statistiques    │
       │  sauvegardées    │
       └──────────────────┘
```

### Endpoints API

#### POST /api/session/start

Démarre une nouvelle session de jeu.

**Comportement** :
1. Vérifie qu'aucune session active n'existe
2. Crée une nouvelle session en base de données
3. Initialise les statistiques
4. Configure le TableManager
5. Retourne l'ID de session

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

Arrête proprement la session en cours.

**Comportement (try/finally)** :
```javascript
try {
  await tableManager.stopAll();
  stats = tableManager.getStats();
} catch (err) {
  // Erreur loggée mais ne bloque pas la fermeture
} finally {
  // TOUJOURS exécuté
  await storage.updateBotSession(session.id, {
    status: "stopped",
    stoppedAt: new Date(),
    totalProfit: stats.totalProfit,
    handsPlayed: stats.totalHandsPlayed,
  });
}
```

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

**Diagnostic** :
1. Vérifier que GGClub est ouvert
2. Consulter les logs : `logs/bot-YYYY-MM-DD.log`
3. Chercher `node-window-manager` dans les logs
4. Vérifier les fenêtres listées dans les logs

**Solutions** :
1. Réinstaller `node-window-manager` : `npm install node-window-manager --build-from-source`
2. Vérifier la version de Windows (10/11 requis)
3. Exécuter en mode administrateur si problème de permissions

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
