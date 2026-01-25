# Architecture Technique du Bot GTO Poker

## 🏗️ Vue d'Ensemble

Le bot est construit avec une architecture modulaire et scalable permettant de gérer jusqu'à 24 tables simultanément avec des performances optimales.

## 📊 Pipeline de Vision

Voir le pipeline complet dans [`server/bot/ocr-pipeline/`](server/bot/ocr-pipeline/)

### 1. Capture d'Écran

**DXGI Desktop Duplication** (Recommandé) :
- Capture GPU directe via DirectX
- 6× plus rapide que screenshot-desktop
- 0 tearing, support multi-monitors
- **Implémentation** : 
  - [`native/dxgi-capture.cpp`](native/dxgi-capture.cpp) - Module natif C++
  - [`server/bot/dxgi-capture.ts`](server/bot/dxgi-capture.ts) - Wrapper TypeScript

**Fallback Screenshot-Desktop** :
- Solution de secours si DXGI indisponible
- Compatible tous systèmes

### 2. Détection de Changements

**Diff Detector** ([`server/bot/diff-detector.ts`](server/bot/diff-detector.ts)) :
- Compare frame actuelle avec frame précédente
- Skip OCR si aucun changement détecté
- Optimisation : -70% CPU

**Frame Buffer** ([`ocr-pipeline/frames/frame-buffer.ts`](server/bot/ocr-pipeline/frames/frame-buffer.ts)) :
- Buffer circulaire pour historique
- Keyframe detection
- Diff calculation optimisé

### 3. Template Matching

**OpenCV Templates** ([`server/bot/template-matching.ts`](server/bot/template-matching.ts)) :
- Détection boutons (CALL, RAISE, FOLD)
- Détection suits (♠ ♥ ♦ ♣)
- Précision : ~100% sur éléments statiques

### 4. OCR Pipeline Hiérarchique

**PaddleOCR Service** ([`server/ocr_service/main.py`](server/ocr_service/main.py)) :
- Service Python (FastAPI) pour l'inférence PaddleOCR v5
- Précision SOTA pour le texte incurvé ou flou
- Communication via HTTP/JSON (Port 8000)
- **Priorité 1** dans le fallback via `PaddleOCRAdapter`

**Poker OCR Engine ML** ([`ml-ocr/poker-ocr-engine.ts`](server/bot/ml-ocr/poker-ocr-engine.ts)) :
- CNN custom JavaScript
- Card Classifier ML ([`ml-ocr/card-classifier-ml.ts`](server/bot/ml-ocr/card-classifier-ml.ts))
- **Priorité 2** dans fallback

**Tesseract OCR** ([`ocr-pipeline/adapters/tesseract-adapter.ts`](server/bot/ocr-pipeline/adapters/tesseract-adapter.ts)) :
- OCR Pool multi-thread ([`ocr-pool.ts`](server/bot/ocr-pool.ts))
- Pool de 4 workers Tesseract
- Cache LRU pour résultats ([`ocr-cache.ts`](server/bot/ocr-cache.ts))
- **Priorité 3** dans fallback

**Fallback Manager** ([`ocr-pipeline/fallback-manager.ts`](server/bot/ocr-pipeline/fallback-manager.ts)) :
- Gestion hiérarchique PaddleOCR → Tesseract
- Retry logic avec délais
- Timeout par opération
- Statistiques par adapter

### 5. Validation & Correction

**Multi-Frame Validator** ([`multi-frame-validator.ts`](server/bot/multi-frame-validator.ts)) :
- Consensus 100% sur 2-3 frames
- Boost confiance +20% si validé
- Élimine faux positifs animations

**OCR Error Correction** ([`ocr-error-correction.ts`](server/bot/ocr-error-correction.ts)) :
- Patterns communs (o→0, l→1)
- Validation contexte poker
- Post-processing intelligent

### 6. Debug Visualizer

**Debug Overlay** (`server/bot/debug-visualizer.ts`) :
- Surligne toutes régions détectées
- Affiche confiance par élément
- Sauvegarde frames annotées
- Essentiel pour debugging

## 🎮 GTO Engine

### Architecture

```
Game State
    ↓
Range Splitter → Catégorise la main
    ↓
Monte Carlo Simulator → 500 simulations (30-50ms)
    ↓
Opponent Modeler → Ajuste selon profil adverse
    ↓
Mixed Strategy Generator → Randomisation GTO
    ↓
Action + Sizing
```

### Composants

**1. Range Splitter** (`server/bot/gto-advanced.ts`) :
- Catégorise : Premium, Strong, Medium, Weak, Draws
- Range multi-street évolutive

**2. Monte Carlo** :
- 500 simulations par décision
- Équité vs range adverse
- EV calculation

**3. Opponent Profiler** (`server/bot/opponent-profiler.ts`) :
- Track VPIP, PFR, AF
- Tendances fold/call/raise
- Adaptation exploitative

**4. Mixed Strategies** :
- Randomisation selon distribution GTO
- Évite patterns détectables
- Ex : 60% call / 40% raise

## 🤖 Anti-Détection

### Layers

**1. Timing Humanizer** (`server/bot/humanizer.ts`) :
- Délais variables (500-3000ms)
- Distribution normale
- Variation selon fatigue simulée

**2. Mouse Humanizer** :
- Courbes Bézier
- Jitter aléatoire
- Overshoots occasionnels

**3. Cognitive Errors** (`server/bot/cognitive-errors.ts`) :
- 0.2% fold incorrect
- Misclick simulé 1/100 mains
- Timing errors

**4. Player Profile** (`server/bot/player-profile.ts`) :
- Style évolutif selon heure
- Fatigue simulation
- Tilt detection

**5. Pattern Detector** (`server/bot/anti-pattern-detector.ts`) :
- Détecte patterns répétitifs
- Auto-ajustement si détecté

## 🔧 Worker Architecture

### Main Thread
- Coordination générale
- Event Bus
- API HTTP/WebSocket

### Vision Worker Pool (4 workers)
```typescript
// server/bot/workers/vision-worker-thread.ts
- OCR parallèle
- Template matching
- CNN classification
```

### GTO Worker
```typescript
// server/bot/workers/gto-worker-thread.ts
- Monte Carlo simulations
- Range calculations
```

### Humanizer Worker
```typescript
// server/bot/workers/humanizer-worker-thread.ts
- Timing generation
- Mouse path calculation
```

### Event Bus (Redis Streams)
```typescript
// server/bot/event-bus.ts
- Communication inter-workers
- Event replay
- Persistence
```

## 📦 Data Flow

```
Window Handle
    ↓
DXGI Capture (6ms) → Screenshot Buffer
    ↓
Diff Detector → Changed regions only
    ↓
Vision Worker Pool → Parallel OCR (4 threads)
    ↓
State Confidence Analyzer → Validation
    ↓
Event Bus → Redis Stream
    ↓
GTO Worker → Decision (30-50ms)
    ↓
Humanizer Worker → Timing + Mouse
    ↓
Platform Adapter → Execute action
```

## 🧪 Testing Pipeline

### 1. Dataset Collection
```bash
script/collect-dataset.bat
```
- 300+ screenshots annotés
- Métadonnées complètes
- Auto-labeling

### 2. Comprehensive Tests
```bash
script/run-comprehensive-tests.bat
```
- 6 phases de tests
- Multi-résolution (1080p, 1440p, 4K)
- Multi-DPI (100%-200%)
- Performance (6, 12, 24 tables)
- Robustesse

### 3. ML Training
```typescript
// Générer données synthétiques
await collector.generateSyntheticData('rank', 500);
await collector.exportForTraining('rank', './output');
```

## 🔐 Sécurité

### 1. Encryption
- AES-256-GCM pour mots de passe
- Clé dérivée de ENCRYPTION_KEY env var
- IV unique par entrée

### 2. Log Sanitization
```typescript
// server/bot/log-sanitizer.ts
- Masque credentials
- Obfusque usernames
- Nettoie stack traces
```

### 3. Anti-Detection
- Process masking
- Memory pattern randomization
- API call obfuscation

## 📈 Performance

### Benchmarks (24 tables)
- Capture : 6ms/table (DXGI) vs 35ms (screenshot)
- OCR : 15-25ms/table (pool)
- GTO : 30-50ms/decision
- Total : ~100ms/action

### Optimisations
- Diff-based OCR : -70% CPU
- Template matching : 100× plus rapide que OCR
- Worker pool : 4× parallélisation
- Redis cache : -90% requêtes GTO

## 🔄 État et Synchronisation

### State Management
```typescript
// server/bot/table-manager.ts
- State machine par table
- Event-driven updates
- Atomic state transitions
```

### Multi-Device Sync
```typescript
// WebSocket broadcasts
- Real-time state sync
- Auto-play coordination
- Device presence
```

## 📊 Monitoring

### Métriques Disponibles
- Vision errors (`/api/vision/errors`)
- Worker stats (`/api/workers/stats`)
- OCR cache hit rate
- GTO cache efficiency
- State confidence levels

### Debug Tools
- Replay Viewer
- Debug Visualizer
- Comprehensive test reports
- Vision error logger

### 🔧 Architecture

Le bot utilise une architecture modulaire avec séparation des responsabilités :

### Gestion des Sessions

**Robustesse** :
- Pattern `try/finally` garantissant que les sessions sont toujours fermées proprement
- Nettoyage automatique des sessions obsolètes (>4 heures) au démarrage
- Endpoints d'arrêt forcé pour gérer les sessions bloquées

**Endpoints** :
- `POST /api/session/start` - Démarrer une nouvelle session
- `POST /api/session/stop` - Arrêt normal avec nettoyage
- `POST /api/session/force-stop` - Arrêt forcé (sessions bloquées)
- `POST /api/session/cleanup-stale` - Nettoyage manuel des sessions obsolètes

**Détection GGClub** :
- Scan automatique des fenêtres Windows via `node-window-manager`
- Détection basée sur des patterns de titre flexibles
- Filtrage des fenêtres minimisées/invisibles
- Logs détaillés pour le débogage