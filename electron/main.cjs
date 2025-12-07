const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
let serverStarted = false;

// Parser .env manuellement (sans dépendance externe)
function parseEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();
      
      // Enlever les guillemets
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      process.env[key] = value;
    }
    return true;
  } catch (err) {
    console.log(`[Electron] Erreur parsing ${filePath}:`, err.message);
    return false;
  }
}

// Charger .env depuis le bon emplacement
function loadEnvFile() {
  // Pour les exe portables, PORTABLE_EXECUTABLE_DIR contient le VRAI dossier de l'exe
  // (l'exe s'extrait dans un dossier temp mais cette variable pointe vers l'original)
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  
  const possibleEnvPaths = [];
  
  // PRIORITÉ 1: Dossier de l'exe portable (là où l'utilisateur a placé l'exe)
  if (portableDir) {
    possibleEnvPaths.push(path.join(portableDir, '.env'));
  }
  
  // PRIORITÉ 2: Répertoire de travail actuel
  possibleEnvPaths.push(path.join(process.cwd(), '.env'));
  
  // Autres emplacements possibles
  if (process.resourcesPath) {
    possibleEnvPaths.push(path.join(path.dirname(process.resourcesPath), '.env'));
  }
  possibleEnvPaths.push(path.join(path.dirname(process.execPath), '.env'));
  possibleEnvPaths.push(path.join(__dirname, '.env'));
  possibleEnvPaths.push(path.join(__dirname, '..', '.env'));

  console.log('[Electron] ====== RECHERCHE .ENV ======');
  console.log('[Electron] PORTABLE_EXECUTABLE_DIR:', portableDir || '(non défini)');
  console.log('[Electron] process.execPath:', process.execPath);
  console.log('[Electron] process.resourcesPath:', process.resourcesPath);
  console.log('[Electron] process.cwd():', process.cwd());
  console.log('[Electron] __dirname:', __dirname);

  for (const envPath of possibleEnvPaths) {
    console.log(`[Electron] Vérification: ${envPath}`);
    try {
      if (fs.existsSync(envPath)) {
        console.log(`[Electron] ✅ Fichier .env trouvé: ${envPath}`);
        
        // Parser le fichier manuellement (sans dotenv)
        parseEnvFile(envPath);
        
        // Vérifier que DATABASE_URL est bien chargé
        if (process.env.DATABASE_URL) {
          console.log('[Electron] ✅ DATABASE_URL configuré');
          return true;
        } else {
          console.log('[Electron] ⚠️ .env trouvé mais DATABASE_URL manquant');
        }
      }
    } catch (err) {
      console.log(`[Electron] Erreur lecture ${envPath}:`, err.message);
    }
  }

  console.error('[Electron] ❌ Aucun fichier .env valide trouvé');
  return false;
}

// Charger .env avant tout
const envLoaded = loadEnvFile();

const isDev = !app.isPackaged;
const PORT = process.env.PORT || 5000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    show: false,
    backgroundColor: '#1a1a2e'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Ouvrir Dashboard', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    { 
      label: 'Ouvrir dans le navigateur', 
      click: () => {
        shell.openExternal(`http://localhost:${PORT}`);
      }
    },
    { type: 'separator' },
    { 
      label: 'Quitter', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('GTO Poker Bot');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function startServer() {
  if (serverStarted) {
    console.log('[Server] Already started');
    return;
  }

  const serverPath = path.join(__dirname, '..', 'dist', 'index.cjs');
  const envPath = path.join(__dirname, '..', '.env'); // Ce chemin n'est plus utilisé pour la vérification initiale

  // Vérifier si .env existe (cette vérification est maintenant gérée par loadEnvFile)
  // if (!require('fs').existsSync(envPath)) { ... }

  process.env.NODE_ENV = 'production';
  process.env.PORT = PORT.toString();

  console.log('[Server] Loading server from:', serverPath);
  console.log('[Server] Working directory:', path.join(__dirname, '..'));

  try {
    // Changer le working directory pour le serveur
    process.chdir(path.join(__dirname, '..'));

    // Charger le serveur directement (pas de spawn)
    require(serverPath);

    serverStarted = true;
    console.log('[Server] Started successfully');
  } catch (error) {
    console.error('[Server] Failed to start:', error);

    // Afficher une erreur si la BDD n'est pas accessible
    if (error.message && (error.message.includes('DATABASE_URL') || error.message.includes('ECONNREFUSED'))) {
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'Erreur de base de données',
        'Impossible de se connecter à la base de données PostgreSQL.\n\n' +
        'Vérifiez que:\n' +
        '1. PostgreSQL est installé et démarré\n' +
        '2. Le fichier .env contient DATABASE_URL\n' +
        '3. La base de données "poker_bot" existe\n\n' +
        'Lancez "INIT-DATABASE.bat" pour configurer automatiquement.\n\n' +
        'Erreur: ' + error.message
      );
      app.quit();
      return;
    }

    // Retry après 3 secondes pour autres erreurs
    if (!app.isQuitting) {
      setTimeout(() => {
        serverStarted = false;
        startServer();
      }, 3000);
    }
  }
}

app.whenReady().then(() => {
  // Vérifier que .env est chargé
  if (!envLoaded) {
    const { dialog } = require('electron');
    
    // Pour exe portable, utiliser PORTABLE_EXECUTABLE_DIR
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const targetDir = portableDir || path.dirname(process.execPath);
    
    dialog.showErrorBox(
      'Base de données non configurée',
      'Le fichier .env est manquant ou invalide.\n\n' +
      'Étapes:\n' +
      '1. Ouvrir le dossier "script"\n' +
      '2. Click droit sur INIT-DATABASE.bat\n' +
      '3. Exécuter en tant qu\'administrateur\n' +
      '4. Copier le .env généré dans le MÊME dossier que l\'exe:\n' +
      '   ' + targetDir + '\n\n' +
      'Le fichier attendu est:\n' +
      '   ' + path.join(targetDir, '.env')
    );
    return;
  }

  startServer();

  setTimeout(() => {
    createWindow();
    createTray();
  }, 2000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Ne pas quitter l'app sur Windows
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

ipcMain.handle('get-server-status', () => {
  return {
    running: serverStarted,
    port: PORT
  };
});

ipcMain.handle('restart-server', () => {
  // Le serveur tourne dans le même processus, pas besoin de restart
  return { success: true, message: 'Server runs in-process' };
});