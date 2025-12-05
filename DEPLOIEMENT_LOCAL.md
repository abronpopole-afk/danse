
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

### 1.3 Installation des Build Tools pour Modules Natifs

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
✓ serving on port 5000
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

## ⚙️ Étape 8 : Configuration Multi-Tables

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

## 🧠 Étape 10 : Comprendre le Player Profile

### 10.1 Dimensions émotionnelles

Le profil simule 3 dimensions :
- **Tilt (0-100)** : Augmente avec bad beats et losing streaks, décroît avec le temps
- **Fatigue (0-100)** : Augmente exponentiellement après 2h, suit le rythme circadien
- **Focus (0-100)** : = 100 - fatigue

### 10.2 Personnalités

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

### 10.3 Événements déclencheurs

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
- Rythme circadien : moins de fatigue pendant peak hours (14h-22h)

---

## 🐛 Étape 11 : Dépannage

### 11.1 Problèmes Courants

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

### 11.2 Logs de debug

Activer les logs détaillés :
```bash
# Mode debug complet
DEBUG=* npm run dev

# Logs spécifiques
DEBUG=bot:* npm run dev
```

### 11.3 Réinitialisation complète

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

## 📊 Étape 12 : Monitoring et Statistiques

### 12.1 Dashboard en temps réel

Accéder aux statistiques via http://localhost:5000 :
- **Profit/Loss** : Gains/pertes par session
- **Hands Played** : Nombre de mains jouées
- **Win Rate** : Taux de victoire
- **Table Health** : État des connexions
- **Player State** : Tilt, fatigue, focus en temps réel
- **Scheduler Stats** : Performance du système de tâches

### 12.2 API Endpoints

```bash
# État du profil
curl http://localhost:5000/api/player-profile

# Stats du scheduler
curl http://localhost:5000/api/platform/scheduler-stats

# État général
curl http://localhost:5000/api/stats
```

### 12.3 Logs et historique

Les logs sont stockés dans :
- **Base de données** : Table `action_logs`
- **Console** : Affichage en temps réel
- **Player Profile State** : Table `player_profile_state`

---

## 🔒 Étape 13 : Sécurité et Recommandations

### 13.1 Sécurité des identifiants

1. **Ne jamais commiter .env** : Ajouter à .gitignore
2. **Clés API** : Stocker dans des variables d'environnement
3. **Mots de passe** : Utiliser des mots de passe forts
4. **Encryption** : Les mots de passe sont chiffrés en AES-256-GCM

### 13.2 Utilisation responsable

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

## 🚀 Étape 14 : Build de Production

### 14.1 Build de l'application

Pour créer une version optimisée :
```bash
# Build complet (client + serveur)
npm run build

# Le build est créé dans dist/
```

### 14.2 Démarrage en production

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

# Nettoyer et réinstaller
rm -rf node_modules && npm install

# Logs détaillés
DEBUG=* npm run dev

# Stats du scheduler
curl http://localhost:5000/api/platform/scheduler-stats

# État du profil
curl http://localhost:5000/api/player-profile
```

---

## ✅ Félicitations !

Votre bot de poker GTO est maintenant opérationnel avec :
- ✅ Task Scheduler intelligent pour gestion optimale des tâches
- ✅ Player Profile dynamique simulant un joueur humain
- ✅ Multi-tables avec throttling automatique
- ✅ Anti-détection avancé
- ✅ Monitoring temps réel

N'oubliez pas d'utiliser ce système de manière **responsable et éthique**.

**Bon jeu ! 🎰♠️♥️♦️♣️**
