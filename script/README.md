# Scripts d'installation - GTO Poker Bot

## Installation rapide sur Windows 11

### Methode 1 : Installation Complete (RECOMMANDEE)

1. **Telecharger le projet** depuis Replit (ZIP) et extraire dans `C:\Users\VotreNom\poker-bot`
2. **Clic droit** sur `script\SETUP.bat` > **Executer en tant qu'administrateur**
3. **Suivre les instructions** a l'ecran (installation ~15-30 min)
4. **Demarrer** avec `START-BOT.bat`

Le script `setup.ps1` installe automatiquement :
- Tous les prerequis (Node.js, Python, PostgreSQL, Git, Build Tools)
- Les dependances npm et modules natifs (robotjs, sharp, opencv)
- Compile le module DXGI pour capture rapide
- Initialise la base de donnees

### Methode 2 : PowerShell direct

```powershell
# Ouvrir PowerShell en Administrateur
Set-ExecutionPolicy Bypass -Scope Process -Force
.\script\setup.ps1
```

#### Options du script PowerShell

```powershell
# Installation personnalisee
.\setup.ps1 -InstallPath "D:\PokerBot" -PostgresPassword "MonMotDePasse"

# Sauter certaines installations
.\setup.ps1 -SkipPostgres   # Si PostgreSQL deja installe
.\setup.ps1 -SkipNodeJs     # Si Node.js deja installe
.\setup.ps1 -SkipPython     # Si Python deja installe
.\setup.ps1 -SkipDXGI       # Ne pas compiler DXGI

# Demarrer le bot apres installation
.\setup.ps1 -LaunchBot
```

### Initialisation de la base de donnees uniquement

Si vous voulez seulement initialiser la base de donnees PostgreSQL :

```powershell
# Methode interactive (recommandee)
.\script\init-database-windows.ps1

# Le script vous demandera le mot de passe PostgreSQL

# OU fournir le mot de passe directement
.\script\init-database-windows.ps1 -PostgresPassword "VotreMotDePassePostgres"

# Options avancees
.\script\init-database-windows.ps1 -DbName "poker_bot" -DbUser "poker_bot" -PostgresPassword "VotreMotDePassePostgres"
```

**Note importante** : Le mot de passe `PostgresPassword` est le mot de passe de l'utilisateur `postgres` defini lors de l'installation de PostgreSQL, PAS le mot de passe qui sera cree pour l'utilisateur `poker_bot`.

### Methode 3 : Installation basique (ancien script)

```powershell
.\script\install-windows.ps1
```

### Methode 4 : Prerequis d'abord, projet ensuite

Si vous voulez installer les prerequis AVANT de telecharger le projet :

1. Executer `SETUP.bat` (il creera le dossier et le fichier .env)
2. Telecharger le projet et l'extraire dans le dossier indique
3. Re-executer `SETUP.bat` (il detectera le projet et installera les dependances)

---

## Scripts disponibles

| Fichier | Description |
|---------|-------------|
| `SETUP.bat` | **Installation complete** (recommande) |
| `setup.ps1` | Script PowerShell v2.0 complet |
| `INSTALL.bat` | Lanceur installation basique |
| `install-windows.ps1` | Script PowerShell v1.0 |
| `start-bot.bat` | Demarrer le bot |
| `check-modules.bat` | Verifier tous les modules |

---

## Ce que le script installe

### Outils de base
1. **Chocolatey** - Gestionnaire de paquets Windows
2. **Node.js 20 LTS** - Runtime JavaScript
3. **Git** - Controle de version

### Pour la compilation native
4. **Python 3.11** - Avec OpenCV et numpy
5. **Visual Studio 2022 Build Tools** - Compilateur C++
6. **node-gyp** - Compilation modules Node.js natifs

### Base de donnees
7. **PostgreSQL 16** - Base de donnees

### Modules natifs compiles
8. **robotjs** - Controle souris/clavier
9. **screenshot-desktop** - Capture ecran
10. **node-window-manager** - Detection fenetres
11. **sharp** - Traitement images rapide
12. **tesseract.js** - OCR (reconnaissance texte)
13. **DXGI Desktop Duplication** - Capture ultra-rapide (~20ms)

---

## Apres l'installation

### 1. Verifier les modules natifs

```batch
check-modules.bat
```

Modules requis :
- `tesseract.js` - Reconnaissance de caracteres (OCR)
- `screenshot-desktop` - Capture d'ecran
- `robotjs` - Controle souris/clavier
- `node-window-manager` - Detection des fenetres

### 2. Si un module echoue

```bash
# Reinstaller avec compilation
npm install robotjs --build-from-source
npm install screenshot-desktop --build-from-source
```

### 3. Demarrer le bot

```batch
start-bot.bat
```

Ou manuellement :
```bash
npm run dev
```

### 4. Acceder au dashboard

Ouvrir : http://localhost:5000

---

## Configuration PostgreSQL

Parametres par defaut :
- **Utilisateur** : `poker_bot`
- **Mot de passe** : `poker_bot_2024`
- **Base de donnees** : `poker_bot`
- **Port** : `5432`

Connection string :
```
postgresql://poker_bot:poker_bot_2024@localhost:5432/poker_bot
```

---

## Depannage

### "Le script ne se lance pas"
- Clic droit > Executer en tant qu'administrateur

### "npm install echoue"
```bash
# Nettoyer et reinstaller
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### "robotjs ne compile pas"
1. Installer Visual Studio Build Tools
2. Redemarrer le terminal
3. `npm install robotjs --build-from-source`

### "PostgreSQL ne demarre pas"
```bash
# Verifier le service
net start postgresql-x64-16
```

---

## Support

- Documentation complete : `DEPLOIEMENT_LOCAL.md`
- Logs du bot : Dashboard > Onglet Logs
