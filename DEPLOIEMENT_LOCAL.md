
# 🚀 Guide de Déploiement Local - GTO Poker Bot

Ce guide vous permettra d'installer et de faire fonctionner le bot de poker sur votre machine locale Windows/Linux avec interface graphique.

## 📋 Prérequis Système

### Système d'exploitation
- **Windows 10/11** (recommandé) OU
- **Linux** avec interface graphique (Ubuntu 20.04+, Debian, Fedora)
- **macOS** (support partiel - certains modules natifs peuvent ne pas fonctionner)

### Configuration matérielle minimale
- **RAM** : 8 GB minimum (16 GB recommandé)
- **CPU** : 4 cœurs minimum
- **Disque** : 5 GB d'espace libre
- **Résolution écran** : 1920x1080 minimum (pour la détection des tables)

### Logiciels requis
- **Node.js** version 20.x ou supérieure
- **PostgreSQL** version 14 ou supérieure
- **Git** pour cloner le dépôt
- **Build tools** pour compiler les modules natifs

---

## 📦 Étape 1 : Installation des Prérequis

### 1.1 Installation de Node.js

#### Windows
1. Télécharger l'installateur depuis https://nodejs.org/
2. Choisir la version LTS (20.x)
3. Exécuter l'installateur
4. Cocher "Automatically install the necessary tools"
5. Vérifier l'installation :
```bash
node --version  # Doit afficher v20.x.x
npm --version   # Doit afficher 10.x.x
```

#### Linux (Ubuntu/Debian)
```bash
# Installation de Node.js 20.x via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installation des build tools
sudo apt-get install -y build-essential python3

# Vérification
node --version
npm --version
```

### 1.2 Installation de PostgreSQL

#### Windows
1. Télécharger depuis https://www.postgresql.org/download/windows/
2. Installer PostgreSQL 16
3. Définir un mot de passe pour l'utilisateur `postgres`
4. Noter le port (par défaut : 5432)

#### Linux (Ubuntu/Debian)
```bash
# Installation de PostgreSQL
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

# Démarrage du service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Création d'un utilisateur
sudo -u postgres psql -c "CREATE USER poker_bot WITH PASSWORD 'votre_mot_de_passe';"
sudo -u postgres psql -c "CREATE DATABASE poker_bot OWNER poker_bot;"
```

### 1.3 Installation de Redis (Requis pour l'Event Bus)

**⚠️ IMPORTANT** : Redis est maintenant **requis** pour le système d'événements distribués, permettant de gérer efficacement plusieurs tables et comptes simultanément. Le bot peut fonctionner en mode dégradé sans Redis, mais avec des limitations importantes (max 4-6 tables).

#### Windows

Redis n'a pas de version officielle Windows native, mais plusieurs options existent :

**Option 1 : WSL2 (Recommandé pour Windows 10/11)**
```bash
# Activer WSL2 (si pas déjà fait)
wsl --install

# Dans WSL2, installer Redis
sudo apt-get update
sudo apt-get install -y redis-server

# Configurer Redis pour écouter sur toutes les interfaces
sudo sed -i 's/bind 127.0.0.1 ::1/bind 0.0.0.0/g' /etc/redis/redis.conf

# Démarrer Redis
sudo service redis-server start

# Vérifier que Redis fonctionne
redis-cli ping  # Doit retourner "PONG"
```

**Option 2 : Memurai (Alternative native Windows)**
```bash
# Télécharger depuis https://www.memurai.com/
# Installer l'exécutable
# Redis sera disponible sur localhost:6379
```

**Option 3 : Redis depuis archive (Portable)**
```bash
# Télécharger redis-windows depuis GitHub
# https://github.com/tporadowski/redis/releases

# Extraire dans C:\Redis
# Lancer redis-server.exe
cd C:\Redis
.\redis-server.exe
```

#### Linux (Ubuntu/Debian)
```bash
# Installation de Redis
sudo apt-get update
sudo apt-get install -y redis-server

# Configurer Redis pour démarrer automatiquement
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Configurer pour écouter sur 0.0.0.0 (si nécessaire pour multi-machines)
sudo sed -i 's/bind 127.0.0.1 ::1/bind 0.0.0.0/g' /etc/redis/redis.conf

# Optionnel : Définir un mot de passe Redis
sudo sed -i 's/# requirepass foobared/requirepass votre_mot_de_passe_redis/g' /etc/redis/redis.conf

# Redémarrer Redis
sudo systemctl restart redis-server

# Vérifier que Redis fonctionne
redis-cli ping  # Doit retourner "PONG"
```

#### macOS
```bash
# Installation avec Homebrew
brew install redis

# Démarrer Redis
brew services start redis

# Vérifier
redis-cli ping  # Doit retourner "PONG"
```

### 1.4 Installation des Build Tools pour Modules Natifs

#### Windows
```bash
# Installer windows-build-tools (en PowerShell Administrateur)
npm install -g windows-build-tools

# OU installer Visual Studio Build Tools manuellement
# https://visualstudio.microsoft.com/downloads/
# Sélectionner "Desktop development with C++"
```

#### Linux (Ubuntu/Debian)
```bash
# Dépendances pour robotjs, screenshot-desktop et node-window-manager
sudo apt-get install -y \
  libxtst-dev \
  libpng++-dev \
  libx11-dev \
  libxinerama-dev \
  libxrandr-dev \
  libxcursor-dev \
  libxi-dev \
  build-essential \
  python3

# Dépendances pour Tesseract OCR
sudo apt-get install -y tesseract-ocr libtesseract-dev
```

---

## 🔧 Étape 2 : Clonage et Configuration du Projet

### 2.1 Cloner le dépôt
```bash
# Créer un dossier pour le projet
mkdir poker-bot
cd poker-bot

# Cloner depuis Replit (ou votre dépôt Git)
git clone https://replit.com/@VotreUsername/VotreRepl.git .

# OU télécharger le ZIP depuis Replit et l'extraire
```

### 2.2 Configuration de la base de données

1. Créer un fichier `.env` à la racine du projet :
```bash
touch .env
```

2. Éditer `.env` avec les informations suivantes :
```env
# Base de données PostgreSQL
DATABASE_URL=postgresql://poker_bot:votre_mot_de_passe@localhost:5432/poker_bot

# Redis (Event Bus)
REDIS_URL=redis://localhost:6379
# Si vous avez défini un mot de passe Redis :
# REDIS_URL=redis://:votre_mot_de_passe_redis@localhost:6379

# Port de l'application
PORT=5000

# Environnement
NODE_ENV=development

# Session secret (générer une clé aléatoire)
SESSION_SECRET=votre_secret_super_securise_ici

# Optionnel : API GTO Wizard
GTO_WIZARD_API_KEY=votre_cle_api_ici
```

3. Initialiser la base de données :
```bash
# Installer les dépendances globales
npm install -g drizzle-kit tsx

# Pousser le schéma vers la base de données
npm run db:push

# Appliquer la migration du profil joueur
psql -U poker_bot -d poker_bot -f script/migrate-player-profile.sql
```

---

## 📥 Étape 3 : Installation des Dépendances

### 3.1 Installation des dépendances Node.js
```bash
# Installation de toutes les dépendances
npm install

# Cela peut prendre 5-10 minutes
# Les modules natifs seront compilés automatiquement
```

### 3.2 Vérification des modules natifs

Vérifier que les modules critiques sont installés :
```bash
# Vérifier tesseract.js
npm list tesseract.js

# Vérifier robotjs
npm list robotjs

# Vérifier screenshot-desktop
npm list screenshot-desktop

# Vérifier node-window-manager
npm list node-window-manager

# Vérifier helmet
npm list helmet
```

Si un module échoue, le réinstaller individuellement :
```bash
# Exemple pour robotjs
npm install robotjs --build-from-source
```

---

## 🎮 Étape 4 : Configuration de la Plateforme GGClub

### 4.1 Installation de GGClub

1. Télécharger et installer le client GGClub/GGPoker
2. Créer un compte ou se connecter
3. Lancer le client et s'assurer qu'il fonctionne

### 4.2 Configuration de l'affichage

Pour une détection optimale :
1. **Résolution d'écran** : 1920x1080 (Full HD)
2. **Mise en page des tables** : Mode "Classic" ou "Simple"
3. **Taille des tables** : Taille par défaut (pas de redimensionnement)
4. **Thème** : Thème par défaut (éviter les thèmes personnalisés)

### 4.3 Calibration initiale

Le bot nécessite une calibration pour détecter les éléments de la table :

1. Démarrer le bot (voir étape 5)
2. Ouvrir une table GGClub
3. Accéder à l'interface de calibration via le dashboard
4. Suivre l'assistant de calibration pour définir les régions :
   - Position des cartes du héros
   - Position des cartes communes
   - Position du pot
   - Position des boutons d'action
   - Positions des joueurs

---

## 🚀 Étape 5 : Démarrage du Bot

### 5.1 Démarrage en mode développement
```bash
# Démarrer le serveur de développement
npm run dev

# Le serveur démarre sur http://localhost:5000
# Le frontend avec Hot Module Replacement est activé
```

### 5.2 Vérification du démarrage

Vérifier dans la console :
```
✓ tesseract.js initialized
✓ screenshot-desktop loaded
✓ robotjs loaded
✓ node-window-manager loaded
✓ Database connected
✓ Player profile initialized from database
✓ EventBus initialized (Redis connected)
✓ serving on port 5000
```

**Note** : Si Redis n'est pas disponible, le bot fonctionnera en mode local dégradé avec un message :
```
[EventBus] Mode dégradé activé (sans Redis)
```

Si des modules ne chargent pas :
- Vérifier les logs d'erreur
- Réinstaller le module problématique
- Vérifier les build tools

### 5.3 Accès au Dashboard

1. Ouvrir un navigateur
2. Aller sur http://localhost:5000
3. Vous devriez voir le dashboard du bot

---

## 🎯 Étape 6 : Première Utilisation

### 6.1 Configuration initiale

Dans le dashboard (http://localhost:5000) :

1. **Onglet Settings** :
   - **Player Profile** : Configurer la personnalité initiale (balanced recommandé)
   - **Humanizer** : Configurer les délais et le comportement
   - **GTO Engine** : Activer/désactiver le mode simulation, configurer la clé API (optionnel)
   - **Anti-Detection** : Activer le mode furtif

2. **Onglet Calibration** :
   - Créer un profil de calibration pour GGClub
   - Calibrer les régions de détection
   - Tester la détection sur une table ouverte

### 6.2 Configuration du Player Profile

Le système de profil simule un joueur humain avec :
- **Tilt** : Se déclenche après bad beats ou losing streaks
- **Fatigue** : Augmente après 2 heures, suit le rythme circadien
- **Focus** : Diminue avec la fatigue
- **Personnalité** : Change automatiquement selon l'état émotionnel

Recommandations :
- Commencer avec "balanced" pour un jeu optimal
- Laisser le système gérer les transitions automatiques
- Surveiller le niveau de tilt (pause si >60%)

### 6.3 Connexion à une table

1. Ouvrir GGClub et rejoindre une table de poker
2. Dans le dashboard, cliquer sur "Détecter Tables"
3. Le bot devrait détecter la fenêtre GGClub
4. Cliquer sur "Connecter" pour lier la table au bot

### 6.4 Démarrage de la session

1. Vérifier que la table est bien détectée (indicateur vert)
2. Cliquer sur "Démarrer Session"
3. Le bot commence à observer et à jouer
4. Surveiller les logs dans l'onglet "Logs"
5. Observer le profil joueur dans le panneau "Player Profile"

---

## 🔍 Étape 7 : Tests et Validation

### 7.1 Mode Simulation (sans risque)

Pour tester sans jouer réellement :

Dans le dashboard :
1. Aller dans Settings > GTO Engine
2. Activer "Mode Simulation"
3. Le bot simulera des décisions sans cliquer

### 7.2 Tests sur Tables de Jeu Gratuit

1. Rejoindre une table de "play money" sur GGClub
2. Démarrer une session avec des mises minimales
3. Observer le comportement du bot pendant 10-15 mains
4. Vérifier :
   - Détection correcte des cartes
   - Timing humain des actions
   - Décisions cohérentes
   - Évolution du profil (tilt, fatigue)

### 7.3 Monitoring en temps réel

Surveiller dans le dashboard :
- **Stats Grid** : Statistiques de session
- **Player Profile** : État émotionnel (tilt, fatigue, focus)
- **Table Visualizer** : État des tables actives
- **Action Log** : Historique des actions
- **Task Scheduler Stats** : Performance du système de tâches
- **Anti-Detection** : Score de suspicion

---

## 🧪 Étape 8 : Tests Automatisés et Validation

Le système intègre maintenant une **suite de tests automatisés** complète pour valider chaque composant.

### 8.1 Tests de captures GGClub (Benchmark Vision/OCR)

Pour tester la détection OCR et mesurer la performance réelle :

```bash
# Via API (serveur démarré)
curl -X POST http://localhost:5000/api/tests/capture-benchmark \
  -H "Content-Type: application/json" \
  -d '{"windowHandle": 1001, "iterations": 50}'
```

Les résultats seront dans `./test-results/captures/`

### 8.2 Test multi-tables (6 tables)

```bash
curl -X POST http://localhost:5000/api/tests/multi-table
```

Vérifie que le bot peut gérer 6 tables sans latence excessive.

### 8.3 Test end-to-end

```bash
curl -X POST http://localhost:5000/api/tests/e2e
```

Teste le cycle complet : connexion → détection → décision → action.

### 8.4 Vision Error Logger

Le système intègre un **logger d'erreurs de vision** qui enregistre automatiquement tous les problèmes de détection :

```bash
# Consulter les erreurs récentes
curl http://localhost:5000/api/vision/errors

# Erreurs critiques uniquement
curl http://localhost:5000/api/vision/errors/critical

# Métriques de performance
curl http://localhost:5000/api/vision/metrics

# Générer un rapport complet
curl http://localhost:5000/api/vision/report
```

**Métriques trackées** :
- Taux d'erreur OCR par type (cartes, pot, positions)
- Temps de détection moyen
- Erreurs critiques (bloquant les actions)
- Screenshots automatiques lors d'erreurs

**Via le Dashboard** :
- Onglet Debug > Vision Errors
- Visualisation en temps réel
- Export JSON avec screenshots

### 8.5 Replay des sessions

Les sessions de jeu sont enregistrées dans `./replays/`. Pour analyser une session :

1. Aller dans le dashboard
2. Onglet "Debug"
3. Charger une session enregistrée
4. Revoir frame par frame les décisions

---

## ⚙️ Étape 9 : Configuration Multi-Tables

### 8.1 Activer le multi-tabling

1. Ouvrir 2-4 tables GGClub (commencer petit)
2. Dans le dashboard, cliquer sur "Détecter Tables"
3. Connecter chaque table individuellement
4. Démarrer la session multi-tables

### 8.2 Optimisation des performances

Le Task Scheduler optimise automatiquement :
- **Priorisation** : Actions critiques traitées en priorité
- **Throttling** : Max 6 tables traitées simultanément
- **Batching** : Polling par groupes pour réduire la charge CPU
- **Health Check** : Surveillance automatique toutes les 30s

Pour surveiller les performances :
- Aller dans Settings > Platform Status
- Consulter "Scheduler Stats"
- Vérifier que avgExecutionTime < intervalMs

---

## 🛡️ Étape 9 : Anti-Détection

### 9.1 Configuration recommandée

Dans Settings > Anti-Detection :
```
- Pattern Detection Threshold: 60%
- Min Action Interval: 500ms
- Max Repetitive Actions: 5
- Emergency Auto-Adjust: ACTIVÉ
```

Dans Settings > Player Profile :
```
- Initial Personality: balanced
- Auto Personality Switch: ACTIVÉ
- Tilt Threshold: 60 (pause automatique)
- Fatigue Threshold: 80 (pause automatique)
```

### 9.2 Bonnes pratiques

1. **Ne pas jouer 24/7** : Faire des pauses régulières (le profil simule la fatigue)
2. **Varier les horaires** : Le rythme circadien aide mais ne pas jouer aux mêmes heures
3. **Limiter les tables** : Max 6-8 tables simultanées
4. **Sessions courtes** : 2-3 heures maximum (fatigue exponentielle après 2h)
5. **Surveiller le profil** : Si tilt >60% ou fatigue >80%, arrêter
6. **Laisser le système s'adapter** : Les transitions automatiques sont plus réalistes

---

## 🧠 Étape 10 : Vision Améliorée (Deep Learning)

### 10.1 Poker OCR Engine (Pure JavaScript ML)

Le système intègre maintenant un **moteur OCR dédié au poker** basé sur des réseaux de neurones convolutifs (CNN) :

**Architecture** :
- **Neural Network** : Implémentation pure JavaScript (pas de dépendances externes TensorFlow/PyTorch)
- **Card Classifier** : CNN pour reconnaissance de rangs et couleurs de cartes
- **Training Pipeline** : Système d'entraînement avec augmentation de données
- **Data Collector** : Collecte automatique d'exemples pour amélioration continue

**Fonctionnalités** :
- Reconnaissance de cartes (rangs : 2-A, couleurs : ♠♥♦♣)
- Reconnaissance de chiffres (0-9, ., ,, K, M, B, $, €)
- Fallback automatique vers Tesseract si confiance ML < 75%
- Double validation pour fiabilité 99%+
- Détection rapide : 50-100ms par carte

**Utilisation automatique** :
```typescript
// Dans GGClubAdapter
// 1. ML OCR (prioritaire si disponible)
// 2. Tesseract OCR (fallback)
// 3. Template matching (dernier recours)
```

### 10.2 Entraînement du Modèle

**Collecte automatique de données** :
Le système collecte automatiquement des exemples pendant le jeu quand la confiance est élevée (>95%).

**Entraînement manuel** :
```bash
# Lancer le pipeline d'entraînement
npm run train:ml-ocr

# Les poids sont sauvegardés dans server/bot/ml-ocr/weights/
# - rank-weights.json (reconnaissance rangs)
# - suit-weights.json (reconnaissance couleurs)
# - digit-weights.json (reconnaissance chiffres/montants)
```

**Génération de données synthétiques** :
```typescript
// Si pas assez d'exemples, génération automatique
await dataCollector.generateSyntheticData('rank', 500);
await dataCollector.generateSyntheticData('suit', 500);
await dataCollector.generateSyntheticData('digit', 500);
```

### 10.3 Configuration ML OCR

Dans le fichier `server/bot/ml-ocr/poker-ocr-engine.ts` :

```typescript
const config = {
  useMLPrimary: true,              // Utiliser ML en priorité
  useTesseractFallback: true,       // Fallback Tesseract
  confidenceThreshold: 0.75,        // Seuil de confiance minimum
  collectTrainingData: true,        // Collecter des exemples
  maxRetries: 2                     // Nombre de tentatives
};
```

**Statistiques disponibles** :
```bash
# Voir les stats ML OCR
curl http://localhost:5000/api/ml-ocr/stats

# Résultat
{
  "mlCalls": 1234,
  "tesseractCalls": 56,
  "avgMlLatency": 85,
  "avgTesseractLatency": 320
}
```

### 10.2 Multi-Frame Validator

**Validation multi-frame** pour fiabilité accrue :
- Capture 2-3 frames consécutifs
- Compare les résultats
- N'accepte que si consensus (99% fiabilité)
- Évite les faux positifs dus à animations

**Configuration** :
```typescript
// Dans .env ou config
VISION_MULTI_FRAME_VALIDATION=true
VISION_FRAME_COUNT=3  // 2-3 frames
VISION_CONSENSUS_THRESHOLD=0.8  // 80% accord
```

### 10.3 Pot Detector (Histogramme Couleur)

Détection du pot par **analyse de couleur** :
- Scan de la région du pot
- Histogramme couleur pour détecter les chips
- Compte les piles par couleur dominante
- Fallback si OCR rate le montant

### 10.4 Image Processing Pipeline

Pipeline complet de traitement d'image :
```
Screenshot → Preprocessing → OCR + ML Classifier → Multi-Frame Validation → Confidence Score
```

**Preprocessing** :
- Conversion grayscale adaptative
- Noise reduction
- Contrast enhancement
- Region extraction optimisée

## 🎯 Étape 11 : Système de Cache GTO

### 10.1 Fonctionnement du Cache

Le bot intègre un système de cache intelligent pour les recommandations GTO :

**Caractéristiques** :
- Cache en RAM de 10 000 entrées maximum
- TTL (Time To Live) : 60 minutes par défaut
- Économie moyenne : 200-400ms par requête cachée
- Éviction LRU (Least Recently Used) automatique

**Métriques** :
- Hit Rate : Pourcentage de requêtes servies depuis le cache
- Avg Savings : Temps moyen économisé par hit
- Entries : Nombre d'entrées actuellement en cache

### 10.2 Warmup du Cache

Le cache peut être pré-chargé avec des situations communes :

```bash
# Via l'API
curl -X POST http://localhost:5000/api/gto-config/warmup

# Résultat attendu
{
  "success": true,
  "message": "Cache warmed up with 144 common situations",
  "stats": {
    "hits": 0,
    "misses": 144,
    "entries": 144,
    "hitRate": 0,
    "avgSavingsMs": 0
  }
}
```

**Situations pré-calculées** :
- Mains premium (AA, KK, QQ, AK) depuis toutes les positions
- RFI (Raise First In) ranges par position
- 3-bet situations courantes
- Total : ~144 situations preflop

### 10.3 Gestion du Cache

**Via le Dashboard** :
1. Aller dans Settings > GTO Engine
2. Activer "Cache des requêtes"
3. Cliquer sur "Warmup Cache" pour pré-charger
4. Cliquer sur "Clear Cache" pour réinitialiser

**Via l'API** :
```bash
# Vider le cache
curl -X POST http://localhost:5000/api/gto-config/clear-cache

# Consulter les stats
curl http://localhost:5000/api/gto-config
```

### 10.4 Configuration du Cache

Dans le fichier `.env` (optionnel) :
```env
# Taille maximale du cache (nombre d'entrées)
GTO_CACHE_MAX_SIZE=10000

# TTL en minutes
GTO_CACHE_TTL_MINUTES=60
```

**Note** : Le cache fonctionne automatiquement. Il améliore significativement les performances en évitant des appels API répétés pour des situations similaires.

## 🛡️ Étape 12 : Anti-Détection Globale Améliorée

### 12.1 Erreurs Humaines Simulées

Le système simule maintenant des **erreurs intentionnelles** pour paraître humain :

**Types d'erreurs** :
- **Misclick rare** : 0.1-0.5% des actions
- **Fold de mains fortes** : 0.5% en position marginale (AA/KK)
- **Sizing imparfait** : ±5-15% variation volontaire
- **Over-bet/Under-bet** : Occasionnellement non-optimal
- **Erreurs cognitives** : Mauvaises lectures du pot (0.8%)
- **Approximations stratégiques** : Ranges imprécis
- **Clics hésitants** : Mouvements interrompus puis repris (1.2%)
- **Actions incorrectes** : Check au lieu de bet (rare)

**Configuration automatique** :
```typescript
// Dans Player Profile (automatique selon tilt/fatigue)
{
  mistakeRate: 0.003,        // 0.3% erreurs de base
  foldStrongHandRate: 0.005, // 0.5% fold AA/KK
  sizingVariation: 0.1,      // ±10% variation
  tiltInducedErrors: true,   // Plus d'erreurs si tilt >60%
  fatigueErrors: true,       // Plus d'erreurs si fatigue >70%
  cognitiveMisreads: 0.008   // 0.8% mauvaises lectures pot
}
```

### 12.2 Comportement Global Humanisé

**Chat/Notes Simulation** :
- Utilisation de chat occasionnelle (1-2% des mains)
- Notes sur adversaires (tracking automatique)
- Délais avant de répondre au chat
- Messages context-aware

**Pattern Breaking** :
- Variation sizing même avec mêmes mains
- Changement de ligne occasionnel
- 3-bet bluff aléatoire (non-GTO)
- Limp occasionnel en position tardive

**Fatigue Simulation** :
- Actions plus rapides si tilt/fatigue
- Pauses micro (1-3s) sur gros pots
- Hésitation simulée (check → bet)

### 12.3 Anti-Detection Score

Le système calcule un **score de suspicion** :
```bash
curl http://localhost:5000/api/platform/status
```

Réponse :
```json
{
  "suspicionLevel": 15,  // 0-100
  "antiDetectionScore": {
    "timingVariance": 95,    // Plus c'est haut, mieux c'est
    "actionPatterns": 88,
    "humanErrors": 92,
    "globalBehavior": 90
  }
}
```

**Si suspicion >70%** → Safe Mode activé automatiquement

### 12.4 Auto-Détection Inversée (Self-Detection)

Le système analyse son propre comportement pour détecter des patterns suspects :

**Métriques surveillées** :
- **Timings réguliers** : Coefficient de variation <15% = suspect
- **Sizing cohérent** : Écart-type <0.08 = suspect
- **Précision GTO** : >92% = surhumain
- **Taux d'erreur** : <0.5% = trop parfait
- **Clustering temporel** : Actions trop régulièrement espacées

**API de surveillance** :
```bash
# Obtenir les patterns suspects
curl http://localhost:5000/api/self-detection/patterns

# Métriques comportementales
curl http://localhost:5000/api/self-detection/metrics
```

**Réponse exemple** :
```json
{
  "suspiciousPatterns": [
    {
      "type": "timing",
      "severity": "high",
      "description": "Timings peu variés (CV=22%)",
      "recommendation": "Activer micro-pauses et hésitations"
    }
  ],
  "metrics": {
    "avgActionTime": 2450,
    "stdDevActionTime": 540,
    "gtoAccuracy": 0.87,
    "errorRate": 0.008
  }
}
```

**Actions automatiques si alertes critiques** :
- Augmentation automatique de `thinkingTimeVariance`
- Injection de bruit GTO (déviation intentionnelle)
- Déclenchement d'interactions humaines aléatoires
- Augmentation des erreurs intentionnelles

## 🧠 Étape 13 : Comprendre le Player Profile

### 11.1 Dimensions émotionnelles

Le profil simule 3 dimensions :
- **Tilt (0-100)** : Augmente avec bad beats et losing streaks, décroît avec le temps
- **Fatigue (0-100)** : Augmente exponentiellement après 2h, suit le rythme circadien
- **Focus (0-100)** : = 100 - fatigue

### 11.2 Personnalités

Chaque personnalité affecte le jeu différemment :

**Balanced** (recommandé)
- Jeu GTO optimal
- Délais normaux
- Pas d'erreurs intentionnelles

**Aggressive**
- Bet sizing +20%
- Ranges plus larges
- Actions plus rapides

**Passive**
- Bet sizing -20%
- Ranges plus serrées
- Actions plus lentes

**Thinking**
- Délais x1.5
- Variance x1.3
- Jeu réfléchi

**Tired** (auto-activé si fatigue >70%)
- Délais x2
- 5% d'erreurs
- Micro-pauses sur gros pots

**Tilted** (auto-activé si tilt >60%)
- Délais x0.7 (actions rapides)
- 10% d'erreurs
- Ranges x1.5 plus larges
- Bet sizing +30%

### 11.3 Événements déclencheurs

**Tilt augmente** :
- Bad beat : +15
- Perte grosse main : +10
- 3 pertes consécutives : +20

**Tilt diminue** :
- Temps qui passe : -1 par minute
- Main gagnée : -5

**Fatigue augmente** :
- Linéaire : 0-2h
- Exponentielle : après 2h
- Rythme circadien : moins de fatigue pendant les heures de pic

### 11.4 Impact de la fatigue sur les mouvements de souris

**Tremblements micro-moteurs (80-120 Hz)** :
- Amplitude de base : 0.3 pixels
- Amplitude avec fatigue : 0.3 + (fatigue × 1.2) pixels
- Simule les tremblements naturels de la main humaine
- Fréquence variable (80-120 Hz) pour réalisme

**Trajectoires biaisées** :
- Biais personnel constant (simule un humain spécifique)
- Influence maximale au début/fin du mouvement
- Trajectoire non parfaite même sans fatigue
- Jitter de base : 2-5 pixels selon fatigue

**Loi de Fitts** :
- Temps de mouvement = 50ms + 150ms × log₂(distance/20 + 1)
- Vitesse non constante : accélération début, décélération fin
- Ajusté par multiplicateur de fatigue (mouvements plus lents)
- Bell curve : lent début/fin, rapide au milieu

**Erreurs de précision** :
- Activées seulement si fatigue > 50%
- Amplitude proportionnelle à la fatigue
- Simule une main tremblante en fin de session

**Hésitations** :
- 1.2% de chance de mouvement interrompu
- Pause 150-600ms avec micro-mouvements
- Plus fréquent si fatigué ou après loss

---

## 📊 Étape 14 : Auto-Update des Ranges GTO

### 14.1 Range Updater Pipeline

Le système met à jour **automatiquement les ranges GTO** :

**Fonctionnalités** :
- Update automatique toutes les semaines
- Sources multiples (GTO Wizard API, Solver, Custom)
- Stockage chiffré en base de données
- Cache warmup automatique après update

**Configuration** :
```bash
# Voir le statut
curl http://localhost:5000/api/ranges/status

# Forcer un update
curl -X POST http://localhost:5000/api/ranges/update

# Ajouter une source
curl -X POST http://localhost:5000/api/ranges/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GTO Wizard",
    "apiEndpoint": "https://api.gtowizard.com/v1/ranges",
    "updateFrequency": "weekly",
    "enabled": true
  }'
```

**Via le Dashboard** :
- Onglet Ranges
- Visualisation des ranges actuels
- Historique des updates
- Ajout/suppression de sources

### 14.2 Chiffrement des Ranges

Les ranges sont **chiffrés AES-256-GCM** avant stockage :
- Protection contre accès non autorisé à la DB
- Déchiffrement automatique à l'utilisation
- Clé rotatable via `DB_ENCRYPTION_KEY`

### 14.3 Warmup Automatique

Après chaque update :
- Les 144+ situations preflop communes sont pré-calculées
- Cache GTO warmup automatique
- Économie de 200-400ms sur les premières mains

## ⚡ Étape 15 : Event Bus et Workers

### 12.1 Architecture Event Bus

Le système utilise Redis Streams pour un bus d'événements distribué :

**Avantages** :
- Découplage complet des composants
- Scalabilité horizontale (plusieurs instances)
- Gestion de 200+ tables simultanées
- Persistence des événements
- Replay automatique en cas d'erreur

**Types d'événements** :
- `vision.request` / `vision.response` : OCR et détection
- `gto.request` / `gto.response` : Calculs GTO
- `action.queued` / `action.executed` : Exécution d'actions
- `ui.update` : Mises à jour de l'interface

### 12.2 Worker Pool

Le bot utilise des Worker Threads pour les tâches CPU-intensives :

**Vision Worker** :
- Screenshot et OCR
- Template matching
- Détection de cartes
- Non-bloquant pour le thread principal

**GTO Worker** :
- Calculs d'équité Monte Carlo
- Range construction
- Bluffing strategy
- Parallélisation automatique

**Humanizer Worker** :
- Calculs de timing
- Génération de trajectoires Bézier
- Simulation de fatigue

### 12.3 Monitoring des Workers

```bash
# Via l'API
curl http://localhost:5000/api/workers/stats

# Résultat
{
  "success": true,
  "workers": {
    "vision": {
      "activeThreads": 2,
      "queueSize": 0,
      "avgProcessingTime": 150,
      "totalProcessed": 1234
    },
    "gto": {
      "activeThreads": 1,
      "queueSize": 0,
      "avgProcessingTime": 80,
      "totalProcessed": 567
    }
  }
}
```

**Via le Dashboard** :
- Aller dans Settings > Platform Status
- Section "Worker Pool Stats"
- Surveiller les temps de traitement

### 12.4 Event Bus Stats

```bash
# Infos du stream Redis
curl http://localhost:5000/api/event-bus/stats

# Résultat
{
  "streamInfo": {
    "length": 1523,
    "groups": 1,
    "firstEntry": "1234567890-0",
    "lastEntry": "1234567891-0"
  },
  "pendingCount": 0,
  "isConsuming": true
}
```

**Maintenance** :
```bash
# Trim le stream (garder les 10000 derniers événements)
curl -X POST http://localhost:5000/api/event-bus/trim \
  -H "Content-Type: application/json" \
  -d '{"maxLength": 10000}'
```

### 12.5 Mode Dégradé (sans Redis)

Si Redis n'est pas disponible, le bot fonctionne en mode local :
- Événements traités en mémoire
- Pas de persistence
- Limite à 4-6 tables simultanées
- Log : `[EventBus] Mode dégradé activé (sans Redis)`

**Recommandation** : Installer Redis pour exploitation optimale.

## 🐛 Étape 16 : Dépannage

### 13.1 Problèmes Courants

#### Le bot ne détecte pas les fenêtres GGClub
```bash
# Vérifier que node-window-manager fonctionne
node -e "import('node-window-manager').then(m => console.log(m.windowManager.getWindows()))"

# Sur Linux, donner les permissions X11
xhost +local:
```

#### Les modules natifs ne compilent pas (Windows)
```bash
# Réinstaller windows-build-tools
npm install -g windows-build-tools

# Puis réinstaller les modules
npm install robotjs --build-from-source
```

#### La détection OCR est imprécise
```bash
# Sur Linux, installer tesseract avec les langues
sudo apt-get install tesseract-ocr-eng tesseract-ocr-fra

# Recalibrer les régions dans le dashboard
```

#### Base de données ne se connecte pas
```bash
# Vérifier que PostgreSQL est démarré
sudo systemctl status postgresql  # Linux
# Services > PostgreSQL            # Windows

# Tester la connexion
psql -U poker_bot -d poker_bot -h localhost
```

#### Redis ne se connecte pas
```bash
# Vérifier que Redis est démarré
sudo systemctl status redis-server  # Linux
redis-cli ping                       # Doit retourner "PONG"

# Sur Windows avec WSL2
wsl sudo service redis-server status

# Vérifier la connexion depuis Node.js
node -e "import('ioredis').then(m => { const r = new m.default('redis://localhost:6379'); r.ping().then(console.log).finally(() => r.quit()); })"

# Si erreur ECONNREFUSED, vérifier que Redis écoute bien
sudo netstat -tlnp | grep redis
```

#### Le bot fonctionne mais Redis n'est pas utilisé
```bash
# Vérifier que REDIS_URL est défini dans .env
grep REDIS_URL .env

# Si absent, ajouter :
echo "REDIS_URL=redis://localhost:6379" >> .env

# Redémarrer le bot
npm run dev
```

#### Le Task Scheduler ralentit
```bash
# Consulter les stats via l'API
curl http://localhost:5000/api/platform/scheduler-stats

# Vérifier les tâches lentes (>80% interval)
# Réduire le nombre de tables si nécessaire
```

#### Le profil ne se charge pas
```bash
# Vérifier la table player_profile_state
psql -U poker_bot -d poker_bot -c "SELECT * FROM player_profile_state;"

# Réappliquer la migration si nécessaire
psql -U poker_bot -d poker_bot -f script/migrate-player-profile.sql
```

### 13.2 Logs de debug

Activer les logs détaillés :
```bash
# Mode debug complet
DEBUG=* npm run dev

# Logs spécifiques
DEBUG=bot:* npm run dev
```

### 13.3 Réinitialisation complète

En cas de problème majeur :
```bash
# Supprimer node_modules et réinstaller
rm -rf node_modules package-lock.json
npm install

# Réinitialiser la base de données
npm run db:push
psql -U poker_bot -d poker_bot -f script/migrate-player-profile.sql

# Supprimer les fichiers de build
rm -rf dist
```

---

## 📊 Étape 17 : Monitoring et Statistiques

### 14.1 Dashboard en temps réel

Accéder aux statistiques via http://localhost:5000 :
- **Profit/Loss** : Gains/pertes par session
- **Hands Played** : Nombre de mains jouées
- **Win Rate** : Taux de victoire
- **Table Health** : État des connexions
- **Player State** : Tilt, fatigue, focus en temps réel
- **Scheduler Stats** : Performance du système de tâches

### 14.2 API Endpoints

**Stats GTO Cache** :
```bash
curl http://localhost:5000/api/gto-config
```

**Stats Workers** :
```bash
curl http://localhost:5000/api/workers/stats
```

**Stats Event Bus** :
```bash
curl http://localhost:5000/api/event-bus/stats
```

**Stats Vision Errors** :
```bash
curl http://localhost:5000/api/vision/metrics

# Erreurs critiques
curl http://localhost:5000/api/vision/errors/critical
```

**Stats Range Updater** :
```bash
curl http://localhost:5000/api/ranges/status

```bash
# État du profil
curl http://localhost:5000/api/player-profile

# Stats du scheduler
curl http://localhost:5000/api/platform/scheduler-stats

# État général
curl http://localhost:5000/api/stats
```

### 14.3 Logs et historique

Les logs sont stockés dans :
- **Base de données** : Table `action_logs`
- **Console** : Affichage en temps réel
- **Player Profile State** : Table `player_profile_state`

---

## 🔒 Étape 18 : Sécurité et Recommandations

### 18.1 Chiffrement Complet

Le système intègre maintenant un **chiffrement AES-256-GCM** pour :
- Mots de passe des comptes (voir PASSWORD_STORAGE.md)
- Ranges GTO en base de données
- Cache GTO en mémoire
- Logs sensibles (sanitisation automatique)

**Variables d'environnement requises** :
```env
ENCRYPTION_KEY=your-32-byte-hex-key          # Mots de passe
DB_ENCRYPTION_KEY=your-32-byte-hex-key-db    # Ranges/Cache
WS_AUTH_TOKEN=your-secure-token              # WebSocket
```

Voir [SECURITY.md](rag://rag_source_0) pour plus de détails.

### 15.1 Sécurité des identifiants

1. **Ne jamais commiter .env** : Ajouter à .gitignore
2. **Clés API** : Stocker dans des variables d'environnement
3. **Mots de passe** : Utiliser des mots de passe forts
4. **Encryption** : Les mots de passe sont chiffrés en AES-256-GCM

### 15.2 Utilisation responsable

⚠️ **AVERTISSEMENT IMPORTANT** :
- L'utilisation de bots est **interdite** sur la plupart des plateformes de poker
- Ce bot est à **usage éducatif uniquement**
- Utiliser ce bot sur de vraies plateformes peut entraîner :
  - Bannissement du compte
  - Confiscation des fonds
  - Actions légales

**Recommandations** :
1. Utiliser uniquement sur des tables de "play money"
2. Ne pas utiliser sur des comptes avec de l'argent réel
3. Respecter les conditions d'utilisation des plateformes
4. Le système de profil réduit la détection mais ne la garantit pas

---

## 🚀 Étape 19 : Build de Production

### 16.1 Build de l'application

Pour créer une version optimisée :
```bash
# Build complet (client + serveur)
npm run build

# Le build est créé dans dist/
```

### 16.2 Démarrage en production

```bash
# Démarrer en mode production
NODE_ENV=production npm start

# Avec PM2 (gestionnaire de processus)
npm install -g pm2
pm2 start npm --name "poker-bot" -- start
pm2 save
```

---

## 📝 Checklist de Démarrage

Avant de lancer le bot, vérifier :

- [ ] Node.js 20.x installé
- [ ] PostgreSQL installé et démarré
- [ ] Redis installé et démarré (recommandé)
- [ ] Build tools installés
- [ ] Dépendances `npm install` terminées
- [ ] Fichier `.env` configuré
- [ ] Base de données initialisée (`npm run db:push`)
- [ ] Migration profil appliquée (`migrate-player-profile.sql`)
- [ ] GGClub installé et configuré
- [ ] Résolution d'écran 1920x1080
- [ ] Calibration effectuée
- [ ] Player Profile configuré (balanced recommandé)
- [ ] Tests sur table gratuite réussis
- [ ] Anti-détection configuré
- [ ] Task Scheduler opérationnel
- [ ] GTO Cache warmup effectué (optionnel)
- [ ] Workers opérationnels (vérifier `/api/workers/stats`)
- [ ] Event Bus connecté à Redis (ou mode dégradé OK)
- [ ] Clés de chiffrement configurées (ENCRYPTION_KEY, DB_ENCRYPTION_KEY)
- [ ] WebSocket auth token configuré (WS_AUTH_TOKEN)
- [ ] Vision Error Logger opérationnel
- [ ] Poker OCR Engine initialisé (ML + Tesseract)
- [ ] Card Classifier ML prêt
- [ ] Data Collector actif
- [ ] Range Updater configuré
- [ ] Dashboard accessible sur http://localhost:5000

---

## 🆘 Support et Assistance

### Ressources
- **Documentation Replit** : https://replit.com/docs
- **Logs** : Toujours vérifier les logs en premier
- **API Endpoints** : Utiliser les endpoints pour diagnostics

### Commandes utiles
```bash
# Vérifier l'état du serveur
npm run dev

# Vérifier la base de données
npm run db:push

# Vérifier Redis
redis-cli ping

# Nettoyer et réinstaller
rm -rf node_modules && npm install

# Logs détaillés
DEBUG=* npm run dev

# Stats du scheduler
curl http://localhost:5000/api/platform/scheduler-stats

# État du profil
curl http://localhost:5000/api/player-profile

# Infos Event Bus
curl http://localhost:5000/api/event-bus/stats

# Stats GTO Cache
curl http://localhost:5000/api/gto-config

# Warmup GTO Cache
curl -X POST http://localhost:5000/api/gto-config/warmup

# Stats Workers
curl http://localhost:5000/api/workers/stats
```

---

## ✅ Félicitations !

Votre bot de poker GTO est maintenant opérationnel avec :
- ✅ Task Scheduler intelligent pour gestion optimale des tâches
- ✅ Player Profile dynamique simulant un joueur humain
- ✅ Multi-tables avec throttling automatique
- ✅ Anti-détection avancé avec erreurs humaines simulées
- ✅ GTO Cache avec warmup (économie 200-400ms par hit)
- ✅ Event Bus Redis pour scalabilité (200+ tables)
- ✅ Worker Threads pour calculs non-bloquants
- ✅ Vision améliorée : ML Card Classifier + Multi-Frame Validation
- ✅ Vision Error Logger avec métriques détaillées
- ✅ Auto-update des ranges GTO (hebdomadaire)
- ✅ Chiffrement AES-256-GCM (mots de passe, ranges, cache)
- ✅ Tests automatisés (captures, multi-tables, E2E)
- ✅ Replay Viewer pour analyse post-session
- ✅ Monitoring temps réel avec API complète

N'oubliez pas d'utiliser ce système de manière **responsable et éthique**.

**Bon jeu ! 🎰♠️♥️♦️♣️**
