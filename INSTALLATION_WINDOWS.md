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

## Fonctionnalités natives (optionnel)

Pour les fonctionnalités avancées comme la capture d'écran DXGI, vous devez compiler les modules natifs :

### Prérequis pour les modules natifs

1. **Visual Studio Build Tools 2022**
   - Téléchargez sur [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
   - Installez avec le workload "Desktop development with C++"

2. **Python 3.11**
   - Téléchargez sur [python.org](https://www.python.org/downloads/)

### Compilation des modules natifs

```powershell
# Ouvrez PowerShell en administrateur
cd "chemin\vers\gto-poker-bot"
npm install
cd native
npx node-gyp rebuild
```

## Dépannage

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

## Support

Pour tout problème, ouvrez une issue sur [GitHub](https://github.com/bobibobini1-cell/gto-poker-bot/issues).
