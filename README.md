# 🎰 GTO Poker Bot - Système Complet

Bot de poker multi-comptes avec intelligence artificielle GTO, vision par ordinateur, et anti-détection avancée.

## ✨ Fonctionnalités Principales

### 🤖 Intelligence & Décisions
- **GTO Engine** : Décisions basées sur Game Theory Optimal
- **GTO Avancé** : Calculs postflop avec Monte Carlo
  - Simulation 10,000+ scénarios en 100-200ms
  - Construction de ranges multi-street (flop/turn/river)
  - Equity calculation avec card removal effects
  - Range narrowing basé sur actions adversaires
  - Nash Equilibrium solver pour situations complexes
- **GTO Cache** : Cache LRU 10k entrées, TTL 60min (économie 200-400ms/query)
- **Range Auto-Update** : Mise à jour hebdomadaire automatique des ranges
- **Player Profile** : Simulation dynamique d'émotions (tilt, fatigue, circadien)
- **Opponent Profiling** : Adaptation automatique aux adversaires

### 👁️ Vision & Détection
- **ONNX OCR Engine** : Modèle ONNX Runtime ultra-rapide (10x Tesseract, 2x ML)
  - Inférence optimisée CPU/GPU
  - Vocabulaire poker-spécifique
  - CTC Decoding pour séquences
  - Post-processing intelligent
- **Poker OCR Engine** : CNN pure JavaScript pour reconnaissance optimisée (95% précision)
  - Neural Network custom (Conv, MaxPool, Dense layers)
  - Card Classifier (rangs + couleurs) avec CNN
  - Digit Classifier (montants pot/stack/bet)
  - Training Pipeline avec augmentation de données
  - Data Collector avec collecte automatique
- **Template Matching OpenCV** : Détection par correspondance de motifs
  - Algorithmes TM_CCOEFF_NORMED, TM_SQDIFF_NORMED
  - Détection boutons, icônes, éléments UI
  - Précision 98%+ sur éléments fixes
  - Fallback robuste si OCR échoue
- **Multi-Frame Validation** : 2-3 frames consensus pour 99% fiabilité
- **Fallback hiérarchisé** : ONNX → ML OCR → Tesseract → Template Matching
- **Pot Detector** : Détection par histogramme couleur + validation heuristique
- **OCR Error Correction** : Système de correction automatique
- **Vision Error Logger** : Tracking détaillé des erreurs avec screenshots
- **DXGI Desktop Duplication** : Capture ultra-rapide Windows (6x plus rapide)
  - Latence 20-30ms (vs 150-200ms screenshot-desktop)
  - Zero tearing, synchronisé avec le moniteur
  - Fallback automatique si non disponible
- **Debug Visualizer** : Affichage temps réel des régions détectées
  - Overlay cartes, pot, stacks, boutons
  - Mode debug visuel avec canvas HTML5
  - Export PNG des détections pour analyse

### 🎭 Anti-Détection
- **Human Behavior Dataset** : 500+ joueurs réels pour apprentissage style humain
  - Distributions timings réelles par street
  - Sizing distributions authentiques (cbet, valuebet, bluff)
  - Error patterns observés (2.5% mistakes, 0.8% fold nuts)
  - Emotional patterns (tilt recovery, fatigue impact)
- **Auto-Ajustements** : Anti-Pattern Detector corrige automatiquement
  - Variance timings adaptative
  - Délais ajustés si patterns suspects
  - Error rate auto-augmenté si trop précis
- **Erreurs Humaines Simulées** : 0.1-1% misclicks, folds incorrects, sizing imparfait
- **Chat Simulator** : Messages contextuels 1-2% des mains
- **Timing Humanisé** : Délais Gaussiens + Bézier mouse movements
- **Pattern Breaking** : Variation constante pour éviter détection
- **Safe Mode** : Ajustement automatique si suspicion élevée

### 🔧 Architecture

Le bot utilise une architecture modulaire avec séparation des responsabilités :

### Couche Vision
- **OCR Pipeline**: ONNX (10x plus rapide) → ML → Tesseract fallback
- **Multi-Frame Validator**: Validation sur 2-10 frames pour fiabilité
- **Auto-Calibration**: Détection de drift avec anchor points (4 zones fixes)
- **Diff Detector**: Optimisation 24 tables (recalcul uniquement régions modifiées)

### Couche Décision
- **GTO Engine**: Cache chiffré + exploitation opponent profiler
- **Imperfect GTO**: Déviations volontaires (erreurs pot odds, underbet/overbet)
- **Cognitive Error Engine**: Simule erreurs humaines basées sur psychologie
- **Anti-Pattern Detector**: Surveille 7 métriques vs baseline humain

### Couche Humanisation
- **Human Behavior Dataset**: 500+ joueurs réels (timings, sizings, erreurs)
- **Dynamic Profile**: Tilt/fatigue corrélés aux wins/losses
- **Mouse Trajectories**: Loi de Fitts + tremblements 80-120Hz
- **Intentional Errors**: Brain farts (0.1%), folds marginaux (0.5%)

### Platform Adapters
- **GGClub**: Détection multi-méthodes (color → template → shape)
- **State Manager**: Gestion tables et sessions avec cache

### 🔧 Architecture Initiale (gardée pour référence)
- **Event Bus Redis** : Système distribué pour 200+ tables simultanées
- **Worker Threads** : Vision, GTO, Humanizer en threads séparés (non-bloquant)
- **Task Scheduler** : Priority-based event loop avec throttling
- **Multi-Account Manager** : Gestion isolée de plusieurs comptes

### 🔒 Sécurité
- **Chiffrement AES-256-GCM** : Mots de passe, ranges, cache
- **Log Sanitizer** : Masquage automatique des données sensibles
- **WebSocket Auth** : Token obligatoire pour connexions
- **Database Encryption** : Stockage chiffré en PostgreSQL

### 🧪 Tests & Debug
- **Tests Automatisés** : Captures, multi-tables, E2E
- **Replay Viewer** : Analyse frame-by-frame des sessions
- **Vision Metrics** : Monitoring temps réel OCR/ML performance
- **Debug Dashboard** : Interface complète pour diagnostics

## 🎯 Fonctionnalités

### ✅ Actuellement Implémenté

#### 🎯 Vision & OCR (Pipeline Complet)
- **OCR Pipeline** ([`server/bot/ocr-pipeline/`](server/bot/ocr-pipeline/))
  - ONNX OCR Engine ultra-rapide (10x Tesseract) - [`ml-ocr/onnx-ocr-engine.ts`](server/bot/ml-ocr/onnx-ocr-engine.ts)
  - Poker OCR Engine (ML + CNN) - [`ml-ocr/poker-ocr-engine.ts`](server/bot/ml-ocr/poker-ocr-engine.ts)
  - Tesseract fallback - [`ocr-pipeline/adapters/tesseract-adapter.ts`](server/bot/ocr-pipeline/adapters/tesseract-adapter.ts)
  - Template Matching OpenCV - [`template-matching.ts`](server/bot/template-matching.ts)
  - HSV Color Detection pour cartes - [`image-processing.ts`](server/bot/image-processing.ts)
  - Multi-Frame Validator (100% consensus) - [`multi-frame-validator.ts`](server/bot/multi-frame-validator.ts)
  - Fallback Manager hiérarchique - [`ocr-pipeline/fallback-manager.ts`](server/bot/ocr-pipeline/fallback-manager.ts)

- **Capture d'écran**
  - DXGI Desktop Duplication (6× plus rapide, Windows) - [`dxgi-capture.ts`](server/bot/dxgi-capture.ts) + [`native/dxgi-capture.cpp`](native/dxgi-capture.cpp)
  - Diff Detector (optimisation -70% CPU) - [`diff-detector.ts`](server/bot/diff-detector.ts)
  - Frame Buffer circulaire - [`ocr-pipeline/frames/frame-buffer.ts`](server/bot/ocr-pipeline/frames/frame-buffer.ts)

- **Calibration & Normalisation**
  - Auto-Calibration avec drift detection - [`auto-calibration.ts`](server/bot/auto-calibration.ts)
  - Region Manager avec templates - [`ocr-pipeline/regions/region-manager.ts`](server/bot/ocr-pipeline/regions/region-manager.ts)
  - Frame Normalizer (preprocessing) - [`ocr-pipeline/normalization/frame-normalizer.ts`](server/bot/ocr-pipeline/normalization/frame-normalizer.ts)

#### 🧠 GTO & Décisions
- **GTO Engine Avancé** ([`gto-advanced.ts`](server/bot/gto-advanced.ts))
  - Monte Carlo 10,000+ simulations (100-200ms)
  - Range construction multi-street
  - Nash Equilibrium solver
  - Equity calculation avec card removal

- **GTO Engine Standard** ([`gto-engine.ts`](server/bot/gto-engine.ts))
  - GTO Cache chiffré (LRU 10k, TTL 60min) - [`gto-cache.ts`](server/bot/gto-cache.ts)
  - Opponent Profiler adaptatif - [`opponent-profiler.ts`](server/bot/opponent-profiler.ts)
  - Range Auto-Update hebdomadaire - [`range-updater.ts`](server/bot/range-updater.ts)
  - Mixed strategies GTO

#### 🎭 Anti-Détection (Human Behavior)
- **Human Behavior Dataset** ([`human-behavior-dataset.ts`](server/bot/human-behavior-dataset.ts))
  - 500+ joueurs réels analysés
  - Timings authentiques par street
  - Sizing distributions réelles
  - Error patterns observés (2.5% mistakes)

- **Player Profile Dynamique** ([`player-profile.ts`](server/bot/player-profile.ts))
  - Tilt/Fatigue/Focus simulation
  - Rythme circadien
  - Transitions automatiques de personnalité
  - Persistance DB ([`schema.ts`](shared/schema.ts) - `player_profile_state`)

- **Humanizer** ([`humanizer.ts`](server/bot/humanizer.ts))
  - Timing Gaussien avec variance
  - Mouvements Bézier + tremblements (80-120Hz)
  - Loi de Fitts pour trajectoires
  - Erreurs intentionnelles (0.1-1%)

- **Cognitive Errors** ([`cognitive-errors.ts`](server/bot/cognitive-errors.ts))
  - Misclicks simulés (0.1%)
  - Fold de mains fortes (0.5%)
  - Sizing imparfait volontaire
  - Erreurs pot odds

- **Anti-Pattern Detector** ([`anti-pattern-detector.ts`](server/bot/anti-pattern-detector.ts))
  - 7 métriques vs baseline humain
  - Auto-ajustements si patterns suspects
  - Self-Detection inversée - [`self-detection.ts`](server/bot/self-detection.ts)

- **Autres Simulations**
  - Chat Simulator - [`chat-simulator.ts`](server/bot/chat-simulator.ts)
  - Safe Mode auto - [`safe-mode.ts`](server/bot/safe-mode.ts)

#### 🏗️ Architecture & Performance
- **Event Bus Redis** ([`event-bus.ts`](server/bot/event-bus.ts))
  - Système distribué 200+ tables
  - Redis Streams avec persistence
  - Event replay automatique

- **Worker Threads** ([`server/bot/workers/`](server/bot/workers/))
  - Vision Worker Pool (4 workers) - [`vision-worker-thread.ts`](server/bot/workers/vision-worker-thread.ts)
  - GTO Worker Thread - [`gto-worker-thread.ts`](server/bot/workers/gto-worker-thread.ts)
  - Humanizer Worker Thread - [`humanizer-worker-thread.ts`](server/bot/workers/humanizer-worker-thread.ts)
  - Worker Manager - [`worker-manager.ts`](server/bot/workers/worker-manager.ts)

- **Task Scheduler** ([`task-scheduler.ts`](server/bot/task-scheduler.ts))
  - Priority-based event loop
  - Throttling 6 tables max
  - Health check automatique

- **Native Module Loader** ([`native-loader.ts`](server/bot/native-loader.ts))
  - Chargement dynamique des modules natifs
  - Support Electron (empaquetage asar)
  - Fallback automatique si modules indisponibles
  - Compatible Windows/Linux/macOS

#### 🎮 Multi-Comptes & Plateformes
- **Platform Manager** ([`platform-manager.ts`](server/bot/platform-manager.ts))
  - Gestion multi-comptes isolés
  - Auto-reconnect
  - State synchronisation

- **Platform Adapters** ([`server/bot/platforms/`](server/bot/platforms/))
  - GGClub Adapter - [`ggclub.ts`](server/bot/platforms/ggclub.ts)
  - Table Manager - [`table-manager.ts`](server/bot/table-manager.ts)

#### 🔒 Sécurité
- **Chiffrement** ([`crypto.ts`](server/bot/crypto.ts) + [`db-encryption.ts`](server/bot/db-encryption.ts))
  - AES-256-GCM pour mots de passe
  - DB encryption pour ranges/cache
  - Log Sanitizer - [`log-sanitizer.ts`](server/bot/log-sanitizer.ts)

#### 🧪 ML & Training
- **Poker OCR ML** ([`server/bot/ml-ocr/`](server/bot/ml-ocr/))
  - Card Classifier CNN - [`card-classifier-ml.ts`](server/bot/ml-ocr/card-classifier-ml.ts)
  - Neural Network custom - [`neural-network.ts`](server/bot/ml-ocr/neural-network.ts)
  - Training Pipeline - [`training-pipeline.ts`](server/bot/ml-ocr/training-pipeline.ts)
  - Data Collector auto - [`data-collector.ts`](server/bot/ml-ocr/data-collector.ts)

#### 📊 Debug & Tests
- **Vision Debugging**
  - Debug Visualizer - [`debug-visualizer.ts`](server/bot/debug-visualizer.ts)
  - Vision Error Logger - [`vision-error-logger.ts`](server/bot/vision-error-logger.ts)
  - Replay Viewer - [`replay-viewer.ts`](server/bot/replay-viewer.ts)

- **Tests Automatisés** ([`server/bot/tests/`](server/bot/tests/))
  - Suite de tests complète (voir `README_TESTS.md`)
  - Sécurité : Chiffrement des mots de passe, mode sans échec (voir `SECURITY.md`)
  - Logs Windows : Système de logs structuré et détaillé (voir `docs/LOGGING_WINDOWS.md`)

#### 📱 Frontend (Dashboard)
- **Pages** ([`client/src/pages/`](client/src/pages/))
  - Dashboard principal - [`dashboard.tsx`](client/src/pages/dashboard.tsx)
  - Settings complets - [`settings.tsx`](client/src/pages/settings.tsx)
  - Debug tools - [`debug.tsx`](client/src/pages/debug.tsx)
  - Remote control - [`remote.tsx`](client/src/pages/remote.tsx)

- **Composants Poker** ([`client/src/components/poker/`](client/src/components/poker/))
  - Action Log - [`action-log.tsx`](client/src/components/poker/action-log.tsx)
  - Stack Visualizer - [`stack-visualizer.tsx`](client/src/components/poker/stack-visualizer.tsx)
  - Tilt Monitor - [`tilt-monitor.tsx`](client/src/components/poker/tilt-monitor.tsx)
  - Table Visualizer - [`table-visualizer.tsx`](client/src/components/poker/table-visualizer.tsx)

- **Composants Settings** ([`client/src/components/settings/`](client/src/components/settings/))
  - Humanizer Panel - [`humanizer-panel.tsx`](client/src/components/settings/humanizer-panel.tsx)
  - Profile Panel - [`profile-panel.tsx`](client/src/components/settings/profile-panel.tsx)

- **API Client** ([`client/src/lib/api.ts`](client/src/lib/api.ts))
  - WebSocket connection
  - REST API wrapper
  - Player Profile API

## 📋 Prérequis

### ⚠️ Compatibilité Plateforme

**Windows 10/11** (Recommandé pour capture d'écran) :
- Tous les modules natifs fonctionnels
- DXGI Desktop Duplication (6× plus rapide)
- Contrôle souris/clavier automatique

**Linux/Replit** (Backend API uniquement) :
- ✅ Serveur web + Dashboard
- ✅ GTO Engine + ML OCR
- ❌ Pas de capture d'écran automatique
- ❌ Pas de contrôle souris/clavier

### Configuration Minimale
- **Node.js** 20.x+
- **PostgreSQL** 14+
- **Redis** 6+ (optionnel, requis pour multi-tables avancé)
- **RAM** : 8GB min (16GB recommandé)
- **CPU** : 4 cores min

## 🚀 Installation Rapide

### Sur Replit (Backend API)
```bash
# Les dépendances sont installées automatiquement
# Configurer les variables d'environnement dans Secrets :
# - DATABASE_URL
# - REDIS_URL (optionnel)
# - ENCRYPTION_KEY
# - DB_ENCRYPTION_KEY

# Vérifier compatibilité
npm run check:platform

# Démarrer
npm run dev
```

### Sur Windows Local (Capture + Contrôle)

#### Installation Automatique (RECOMMANDÉE)

```powershell
# 1. Télécharger le projet depuis Replit (ZIP)
# 2. Extraire dans C:\Users\VotreNom\poker-bot
# 3. Exécuter en PowerShell Administrateur :
Set-ExecutionPolicy Bypass -Scope Process -Force
.\script\setup.ps1

# OU double-cliquez sur script\SETUP.bat (en admin)
```

Le script `setup.ps1` installe automatiquement :
- Node.js 20 LTS, Python 3.11, Git
- Visual Studio 2022 Build Tools
- PostgreSQL 16
- Tous les modules natifs (robotjs, sharp, etc.)
- Compile le module DXGI (capture ultra-rapide)

**Options disponibles :**
```powershell
.\setup.ps1 -SkipPostgres      # Si PostgreSQL déjà installé
.\setup.ps1 -SkipDXGI          # Ne pas compiler DXGI
.\setup.ps1 -LaunchBot         # Démarrer après installation
```

#### Installation Manuelle

```bash
# Cloner le projet
git clone <repo-url>
cd poker-bot

# Installer dépendances (inclut modules natifs)
npm install

# Configurer .env
cp .env.example .env
# Éditer .env avec vos clés

# Initialiser DB
npm run db:push
psql -U poker_bot -d poker_bot -f script/migrate-player-profile.sql

# Compiler DXGI (optionnel, Windows uniquement)
cd native
node-gyp configure
node-gyp build
cd ..

# Démarrer
npm run dev
```

### 📊 Scripts Disponibles

**Collecte de Dataset** :
```bash
# Windows
script/collect-dataset.bat

# Linux/Mac
node --loader tsx script/collect-dataset.ts 300
```

**Tests Complets** :
```bash
# Windows
script/run-comprehensive-tests.bat

# API
curl -X POST http://localhost:5000/api/tests/comprehensive
```

**Inspection DB** :
```bash
script/inspect-db.bat
```

Voir [DEPLOIEMENT_LOCAL.md](rag://rag_source_3) pour guide complet.

## 📚 Documentation

- [DEPLOIEMENT_LOCAL.md](./DEPLOIEMENT_LOCAL.md) - Guide de déploiement local
- [SECURITY.md](./SECURITY.md) - Sécurité et chiffrement
- [PASSWORD_STORAGE.md](./PASSWORD_STORAGE.md) - Stockage sécurisé des mots de passe
- [MULTI_ACCOUNTS.md](./MULTI_ACCOUNTS.md) - Gestion multi-comptes
- [README_TESTS.md](./README_TESTS.md) - Guide de tests et collecte de dataset
- [DXGI_SETUP.md](./DXGI_SETUP.md) - Configuration DXGI Desktop Duplication

## 🏗️ Architecture Avancée

### Vision Pipeline
```
DXGI Capture → Diff Detector → Template Matching → OCR Pool → CNN Classifier
     ↓              ↓                  ↓                ↓            ↓
  6× faster    -70% CPU        Buttons/Suits      Multi-thread   98% accuracy
```

### GTO Engine
```
Game State → Range Splitter → Monte Carlo (500 sims) → Opponent Model → Mixed Strategy
                                     ↓
                            30-50ms per decision
```

### Worker Architecture
```
Main Thread
    ├── Vision Worker Pool (4 workers)
    ├── GTO Worker Thread
    ├── Humanizer Worker Thread
    └── Event Bus (Redis Streams)
```

## 🎮 Utilisation

1. **Démarrer le serveur** : `npm run dev`
2. **Accéder au dashboard** : http://localhost:5000
3. **Configurer un compte** : Settings > Platform > Add Account
4. **Connecter GGClub** : Platform > Connect
5. **Lancer session** : Dashboard > Start Session

## 🔑 Variables d'Environnement

```env
# Database
DATABASE_URL=postgresql://poker_bot:password@localhost:5432/poker_bot

# Redis (Event Bus)
REDIS_URL=redis://localhost:6379

# Sécurité
ENCRYPTION_KEY=<hex-32-bytes>        # Mots de passe
DB_ENCRYPTION_KEY=<hex-32-bytes>     # Ranges/Cache
WS_AUTH_TOKEN=<secure-token>         # WebSocket

# GTO (optionnel)
GTO_WIZARD_API_KEY=<api-key>
```

Générer clés : `npm run generate:key`

## 🧪 Tests

```bash
# Test capture GGClub (benchmark vision)
curl -X POST http://localhost:5000/api/tests/capture-benchmark

# Test multi-tables (6 tables)
curl -X POST http://localhost:5000/api/tests/multi-table

# Test E2E complet
curl -X POST http://localhost:5000/api/tests/e2e

# Stress test (6, 12, 24 tables)
curl -X POST http://localhost:5000/api/tests/stress
```

### WebSocket Events

- `table_event` : Événements de table
- `platform_status_change` : Changement de statut
- `auto_play_changed` : Auto-play activé/désactivé
- `device_connected` : Nouveau device connecté

### API Endpoints - Tests & Dataset

**Collecte de Dataset** :
```bash
POST /api/dataset/collect
GET  /api/dataset/stats
```

**Tests Complets** :
```bash
POST /api/tests/comprehensive
POST /api/tests/capture-benchmark
POST /api/tests/multi-table
POST /api/tests/stress
POST /api/tests/e2e
```

**Vision Debugging** :
```bash
GET  /api/vision/errors
GET  /api/vision/errors/critical
GET  /api/vision/metrics
GET  /api/vision/report
POST /api/vision/export
POST /api/vision/clear
```

**Worker Stats** :
```bash
GET /api/workers/stats
```

## 📊 Monitoring

```bash
# Stats globales
curl http://localhost:5000/api/stats

# Vision errors
curl http://localhost:5000/api/vision/metrics

# ML OCR stats
curl http://localhost:5000/api/ml-ocr/stats

# GTO Cache
curl http://localhost:5000/api/gto-config

# Workers
curl http://localhost:5000/api/workers/stats

# Event Bus
curl http://localhost:5000/api/event-bus/stats

# RangeUpdater
curl http://localhost:5000/api/ranges/status
```

## 🛡️ Anti-Détection

Le système simule un comportement humain complet :
- ✅ Timing non-robotique (Gaussian + variance)
- ✅ Mouvements de souris Bézier avec micro-tremblements (80-120 Hz)
- ✅ Erreurs intentionnelles (0.1-1%)
- ✅ Sizing imparfait volontaire (±5-15%)
- ✅ Simulation chat/notes (1-2% des mains)
- ✅ Tilt/fatigue/rythme circadien
- ✅ Pattern breaking constant
- ✅ Erreurs cognitives (mauvaises lectures pot, approximations ranges)
- ✅ Clics hésitants (move → stop → restart)
- ✅ Dégradation décisions selon état émotionnel
- ✅ Auto-détection inversée (analyse patterns suspects)

**Safe Mode** : Pause automatique si suspicion >70%

## ⚠️ Avertissement

**Usage éducatif uniquement**. L'utilisation de bots est interdite sur la plupart des plateformes de poker. Utilisation à vos risques et périls.

## 📝 Licence

Propriétaire - Usage éducatif uniquement

## 🆘 Support

- **Issues GitHub** : Pour bugs/features
- **Documentation** : Voir dossier `/docs`
- **Logs** : Toujours consulter les logs en premier

---

**Built with** : React, TypeScript, Express, PostgreSQL, Redis, TensorFlow.js, Tesseract.js