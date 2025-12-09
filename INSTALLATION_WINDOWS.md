# Installation GTO Poker Bot sur Windows

## Prérequis

Avant d'installer GTO Poker Bot, assurez-vous d'avoir :

1. **Windows 10 ou 11** (64-bit)
2. **Node.js 18+** - Télécharger sur [nodejs.org](https://nodejs.org/)
3. **(Optionnel) Python 3.11** - Pour certaines fonctionnalités avancées

## Installation Rapide

### Étape 1 : Télécharger l'installateur

1. Allez sur la [page des releases](https://github.com/bobibobini1-cell/gto-poker-bot/releases)
2. Téléchargez le fichier `GTO-Poker-Bot-Setup-X.X.X.exe`

### Étape 2 : Exécuter le script de préparation (optionnel mais recommandé)

Avant la première utilisation, exécutez le script de préparation :

1. Téléchargez `windows-setup.bat` depuis le dépôt
2. Clic droit → **Exécuter en tant qu'administrateur**
3. Suivez les instructions à l'écran

### Étape 3 : Installer l'application

1. Double-cliquez sur `GTO-Poker-Bot-Setup-X.X.X.exe`
2. Suivez l'assistant d'installation
3. Choisissez le dossier d'installation

### Étape 4 : Lancer l'application

- Utilisez le raccourci sur le Bureau : **GTO Poker Bot**
- Ou lancez depuis le Menu Démarrer

## Version Portable

Si vous préférez une version sans installation :

1. Téléchargez `GTO-Poker-Bot-X.X.X-portable.exe`
2. Placez-le où vous voulez
3. Double-cliquez pour lancer

## Modules Natifs Inclus

L'application Windows inclut automatiquement les modules natifs suivants :

- **robotjs** : Contrôle automatique de la souris et du clavier
- **screenshot-desktop** : Capture d'écran rapide
- **node-window-manager** : Détection et gestion des fenêtres
- **DXGI Desktop Duplication** : Capture ultra-rapide (6× plus rapide)

### Système de Chargement

Le système utilise un chargeur natif optimisé (`native-loader.ts`) qui :
- Détecte automatiquement si l'application est empaquetée
- Charge les modules depuis `app.asar.unpacked` si nécessaire
- Gère les fallbacks en cas d'échec de chargement
- Supporte Linux/Replit en mode dégradé

### Compilation DXGI (optionnel)

Pour les fonctionnalités avancées comme la capture d'écran DXGI :

1. **Visual Studio Build Tools 2022**
   - Téléchargez sur [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
   - Installez avec le workload "Desktop development with C++"

2. **Python 3.11**
   - Téléchargez sur [python.org](https://www.python.org/downloads/)

```powershell
# Ouvrez PowerShell en administrateur
cd "chemin\vers\gto-poker-bot"
npm install
cd native
npx node-gyp rebuild
```

## Détection automatique des tables

L'application détecte automatiquement les tables GGClub ouvertes sur Windows :

1. **Critères de détection** :
   - Titre de fenêtre contenant "ggclub", "ggpoker", "nl", "plo", "holdem", etc.
   - Fenêtres non minimisées et visibles
   - Détection insensible à la casse

2. **Vérification de la détection** :
   - Ouvrir une ou plusieurs tables GGClub
   - Dans le dashboard, cliquer sur "Détecter Tables"
   - Consulter les logs pour voir les fenêtres détectées
   - Les tables apparaissent automatiquement dans la liste

3. **Résolution des problèmes** :
   - Si aucune table n'est détectée, vérifier que GGClub est bien ouvert
   - S'assurer qu'une table est active (pas minimisée)
   - Consulter `logs/bot-YYYY-MM-DD.log` pour voir toutes les fenêtres scannées

## Gestion des sessions

**Démarrage et arrêt** :
- Utilisez le bouton "DÉMARRER SESSION" pour commencer
- "STOP URGENCE" pour un arrêt propre
- "FORCER" pour forcer l'arrêt si la session est bloquée

**Nettoyage automatique** :
- Les sessions de plus de 4 heures sont automatiquement nettoyées au démarrage
- Empêche l'accumulation de sessions fantômes

## Dépannage

### Aucune table détectée

Si le bot ne détecte pas vos tables GGClub :

1. **Vérifiez que GGClub est ouvert** avec au moins une table active
2. **Consultez les logs** dans `logs/bot-YYYY-MM-DD.log`
3. **Recherchez** les lignes contenant `[GGClubAdapter]`
4. Vérifiez que `node-window-manager` est bien chargé (ligne `✓ node-window-manager chargé`)

Si vous voyez `❌ node-window-manager ÉCHEC`, réinstallez le module :
```powershell
npm install node-window-manager --build-from-source
```

### Session bloquée

Si une session reste bloquée en "running" :

1. Utilisez le bouton **"FORCER"** dans le dashboard
2. Ou via API : `POST http://localhost:5000/api/session/force-stop`
3. Au prochain démarrage, les sessions obsolètes seront nettoyées automatiquement

### Erreur "spawn node ENOENT"

Cette erreur signifie que Node.js n'est pas trouvé. Solution :

1. **Vérifiez l'installation Node.js** :
```powershell
node --version
```

2. **Si la commande échoue**, Node.js n'est pas installé :
   - Téléchargez depuis [nodejs.org](https://nodejs.org/)
   - Installez la version LTS (20.x)
   - **Important**: Cochez "Add to PATH" lors de l'installation
   - Redémarrez Windows après installation

3. **Testez le diagnostic** :
   - Naviguez vers le dossier d'installation
   - Exécutez: `node electron/check-node.cjs`

### L'application ne démarre pas

1. Vérifiez que Node.js est installé : `node --version`
2. Redémarrez votre PC après l'installation de Node.js
3. Exécutez le script `windows-setup.bat` en administrateur

### Erreur "MSVS_VERSION not set"

```powershell
npm config set msvs_version 2022
```

### Erreur de port 5000 déjà utilisé

L'application utilise le port 5000. Si ce port est déjà utilisé :

1. Fermez les autres applications utilisant ce port
2. Ou modifiez le port dans les paramètres

## Logs et débogage

Le bot génère automatiquement des logs détaillés dans le dossier `logs/` :

- `bot-YYYY-MM-DD.log` : Logs généraux quotidiens
- `session-YYYY-MM-DD.log` : Logs de session de jeu

Pour plus d'informations sur le système de logs, consultez `docs/LOGGING_WINDOWS.md`.

### Consulter les logs en temps réel

```powershell
# PowerShell
Get-Content logs/bot-2024-01-08.log -Tail 50 -Wait

# Git Bash
tail -f logs/bot-2024-01-08.log
```

## Support

Pour tout problème, ouvrez une issue sur [GitHub](https://github.com/bobibobini1-cell/gto-poker-bot/issues).

N'oubliez pas de consulter les logs pour diagnostiquer les problèmes !
