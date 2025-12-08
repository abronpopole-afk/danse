
# 📝 Système de Logs - Windows

## Vue d'ensemble

Le GTO Poker Bot dispose d'un système de logs complet et structuré pour Windows, permettant un débogage efficace et un suivi détaillé de toutes les opérations du bot.

## 📍 Emplacement des logs

Les fichiers de logs sont stockés dans le répertoire `logs/` à la racine du projet :

```
logs/
├── bot-2024-01-08.log         # Logs généraux du bot (par date)
└── session-2024-01-08.log     # Logs de session spécifiques
```

## 🔧 Architecture du système de logs

### Fichier principal : `server/logger.ts`

Le système de logs est centralisé dans un module unique qui gère :
- Création automatique du dossier `logs/` si inexistant
- Séparation des logs par date
- Écriture simultanée dans la console et les fichiers
- Support de plusieurs niveaux de logs

### Niveaux de logs disponibles

| Niveau | Usage | Fichier | Console |
|--------|-------|---------|---------|
| `info` | Informations générales | ✅ | ✅ |
| `warning` | Avertissements | ✅ | ✅ |
| `error` | Erreurs critiques | ✅ | ✅ |
| `debug` | Débogage technique | ✅ | ✅ |
| `session` | Événements de session | ✅✅ (2 fichiers) | ✅ |

## 📖 Utilisation

### Import du logger

```typescript
import { logger } from "./logger";
// ou depuis un sous-dossier
import { logger } from "../logger";
// ou depuis bot/platforms
import { logger } from "../../logger";
```

### Exemples d'utilisation

```typescript
// Information simple
logger.info("PlatformManager", "Bot démarré avec succès");

// Avec données structurées
logger.info("GGClubAdapter", "Table détectée", {
  windowHandle: 12345,
  tableName: "NL100 - Table 1"
});

// Avertissement
logger.warning("OCREngine", "Confiance OCR faible", {
  confidence: 0.65,
  threshold: 0.80
});

// Erreur
logger.error("DatabaseConnection", "Échec de connexion", {
  error: error.message,
  retryCount: 3
});

// Debug (détails techniques)
logger.debug("ImageProcessor", "Image prétraitée", {
  width: 1920,
  height: 1080,
  format: "RGB"
});

// Session (événements importants de session)
logger.session("GameSession", "Main jouée", {
  hand: "AsKs",
  position: "BTN",
  action: "raise",
  amount: 300
});
```

## 📊 Format des logs

Chaque ligne de log suit ce format :

```
[timestamp] [NIVEAU] [composant] message | DATA: {...}
```

Exemple :
```
[2024-01-08T14:23:45.678Z] [INFO] [PlatformManager] Bot démarré avec succès
[2024-01-08T14:23:46.123Z] [DEBUG] [OCREngine] Détection cartes | DATA: {"cards":["As","Kh"],"confidence":0.95}
[2024-01-08T14:23:47.456Z] [ERROR] [GGClubAdapter] Échec capture écran | DATA: {"windowHandle":12345,"error":"Window not found"}
```

## 🔍 Consultation des logs

### Via code

```typescript
// Récupérer les 100 dernières lignes du log principal
const recentLogs = logger.getRecentLogs(100);

// Récupérer tous les logs de session
const sessionLogs = logger.getSessionLogs();
```

### Via fichiers

Les fichiers logs peuvent être consultés directement :
- Ouvrir avec n'importe quel éditeur de texte
- Utiliser `tail -f logs/bot-2024-01-08.log` (avec Git Bash)
- Utiliser PowerShell : `Get-Content logs/bot-2024-01-08.log -Tail 50 -Wait`

## 📁 Organisation par composants

### Composants principaux qui utilisent les logs

| Composant | Description | Exemples de logs |
|-----------|-------------|------------------|
| `PlatformManager` | Gestion des plateformes | Connexion/déconnexion, détection tables |
| `GGClubAdapter` | Adaptation GGClub | Capture écran, détection boutons |
| `OCREngine` | Reconnaissance texte | Détection cartes, confiance OCR |
| `GTOEngine` | Calculs GTO | Décisions, ranges, équité |
| `Humanizer` | Anti-détection | Timing, patterns de clic |
| `AutoCalibration` | Calibration auto | Détection régions, validation |
| `VisionWorker` | Worker vision | Traitement images, performance |
| `DatabaseManager` | Base de données | Requêtes, erreurs, migrations |

## 🚨 Logs d'erreur

Les erreurs sont loguées avec détails complets :

```typescript
try {
  // Code qui peut échouer
  await platform.connect();
} catch (error) {
  logger.error("PlatformManager", "Échec connexion plateforme", {
    platform: "ggclub",
    error: error.message,
    stack: error.stack
  });
}
```

## 📈 Logs de performance

Pour mesurer les performances :

```typescript
const startTime = Date.now();
// ... opération ...
const duration = Date.now() - startTime;

logger.debug("OCREngine", "Traitement image terminé", {
  duration: `${duration}ms`,
  imageSize: screenshot.data.length
});
```

## 🔄 Rotation des logs

Les logs sont automatiquement séparés par date :
- Un nouveau fichier est créé chaque jour
- Format : `bot-YYYY-MM-DD.log`
- Les anciens logs sont conservés (à nettoyer manuellement si nécessaire)

## 🛠️ Configuration

### Modifier le répertoire de logs

Dans `server/logger.ts`, ligne 4 :

```typescript
const LOGS_DIR = path.join(process.cwd(), "logs");
// Changer en :
const LOGS_DIR = "C:\\MonDossierLogs";
```

### Désactiver les logs console (production)

Modifier la méthode `writeLog()` :

```typescript
private writeLog(entry: LogEntry, toSessionFile = false): void {
  const logLine = `[${entry.timestamp}] ...`;
  
  // Commenter pour désactiver console
  // console.log(logLine.trim());
  
  fs.appendFileSync(this.logFile, logLine);
  // ...
}
```

## 📊 Analyse des logs

### Compter les erreurs

```powershell
# PowerShell
(Get-Content logs/bot-2024-01-08.log | Select-String "\[ERROR\]").Count
```

```bash
# Git Bash
grep -c "\[ERROR\]" logs/bot-2024-01-08.log
```

### Filtrer par composant

```powershell
# PowerShell - Voir seulement les logs OCREngine
Get-Content logs/bot-2024-01-08.log | Select-String "OCREngine"
```

```bash
# Git Bash
grep "OCREngine" logs/bot-2024-01-08.log
```

### Extraire les données JSON

```powershell
# PowerShell - Extraire les données structurées
Get-Content logs/bot-2024-01-08.log | Select-String "DATA:" | ForEach-Object {
  $_.ToString() -replace '.*DATA: ', ''
}
```

## 🐛 Débogage avec les logs

### Problème de connexion plateforme

```bash
# Chercher les logs de connexion
grep "PlatformManager.*connect" logs/bot-2024-01-08.log
```

### Problème de détection OCR

```bash
# Chercher les erreurs OCR avec faible confiance
grep "OCREngine.*confidence" logs/bot-2024-01-08.log | grep "0\.[0-6]"
```

### Tracer une session complète

```bash
# Voir tous les événements de session
cat logs/session-2024-01-08.log
```

## 📝 Bonnes pratiques

1. **Toujours inclure le contexte** : Ajouter des données pertinentes dans l'objet `data`
2. **Utiliser le bon niveau** : `info` pour les événements normaux, `error` pour les problèmes
3. **Nommer les composants** : Utiliser des noms cohérents et descriptifs
4. **Logger les performances** : Mesurer les opérations critiques
5. **Logger les décisions** : Tracer les décisions GTO et actions du bot

## 🔐 Sécurité

⚠️ **Attention** : Ne jamais logger :
- Mots de passe en clair
- Tokens d'authentification
- Informations sensibles des joueurs

Utiliser le `LogSanitizer` si nécessaire pour nettoyer les données sensibles.

## 📚 Exemples complets

### Session de jeu complète

```typescript
// Début de session
logger.session("GameSession", "Session démarrée", {
  platform: "ggclub",
  stakes: "NL100",
  tableCount: 3
});

// Main jouée
logger.session("GameSession", "Main jouée", {
  hand: "AsKs",
  position: "BTN",
  preflop_action: "raise 3bb",
  flop: "Ah9s2c",
  flop_action: "cbet 75%",
  result: "won",
  profit: 150
});

// Fin de session
logger.session("GameSession", "Session terminée", {
  duration: "2h 15m",
  handsPlayed: 234,
  profit: 450,
  winrate: "5.2bb/100"
});
```

### Erreur avec récupération

```typescript
logger.warning("OCREngine", "Première tentative OCR échouée, retry...", {
  attempt: 1,
  maxRetries: 3
});

// ... retry ...

logger.info("OCREngine", "OCR réussi au 2ème essai", {
  attempt: 2,
  confidence: 0.92
});
```

## 🎯 Intégration avec le dashboard

Les logs peuvent être affichés en temps réel dans le dashboard web via WebSocket.

Voir `server/routes.ts` pour l'implémentation de l'endpoint `/api/logs`.

---

**Dernière mise à jour** : Janvier 2024
