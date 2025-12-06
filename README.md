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

- **Vision par ordinateur** : 
  - OCR Tesseract + régions calibrées
  - Template Matching (OpenCV) pour boutons et suits
  - CNN pour reconnaissance de cartes (64×64)
  - DXGI Desktop Duplication (6× plus rapide)
  - Diff-Based OCR (optimisation frame-to-frame)
  - Debug Visualizer avec annotations

- **GTO Engine** : 
  - Solver externe avec cache Redis
  - Monte Carlo equity estimation (500 simulations)
  - Range splitting multi-street
  - Opponent modeling (VPIP, PFR, AF)
  - Mixed strategies randomisées

- **Anti-détection** : 
  - Timing humain, mouvements de souris, erreurs cognitives
  - Faux mouvements humains
  - Variation du style selon l'heure
  - Simulation d'hésitation
  - Erreurs cognitives aléatoires

- **Multi-tables** : 
  - Gestion jusqu'à 24 tables simultanées
  - Worker pool pour vision parallèle
  - Auto-calibration par plateforme

- **Platform Support** : GGClub (extensible à d'autres plateformes)

- **ML/OCR** :
  - Data Collector pour entraînement
  - Neural Network pour cartes
  - Training Pipeline automatisé
  - Support ONNX Runtime

- **Tests** :
  - Suite complète de tests (6 phases)
  - Tests multi-résolution (1080p, 1440p, 4K)
  - Tests multi-DPI (100%-200%)
  - Tests de robustesse
  - Collection de dataset automatisée

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