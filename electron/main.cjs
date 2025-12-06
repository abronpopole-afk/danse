const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let serverProcess;

const isDev = process.env.NODE_ENV === 'development';
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
      label: 'Redémarrer le serveur', 
      click: () => {
        restartServer();
      }
    },
    { type: 'separator' },
    { 
      label: 'Quitter', 
      click: () => {
        app.isQuitting = true;
        stopServer();
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
  const serverPath = path.join(__dirname, '..', 'dist', 'index.cjs');
  
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: PORT.toString()
  };

  // Utiliser le Node.js embarqué d'Electron (TOUJOURS disponible)
  // Évite tous les problèmes de chemins Windows, permissions, etc.
  const nodePath = process.execPath;
  
  console.log('[Server] Starting with node path:', nodePath);
  console.log('[Server] Server path:', serverPath);
  console.log('[Server] Working directory:', path.join(__dirname, '..'));

  serverProcess = spawn(nodePath, [serverPath], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: ['pipe', 'pipe', 'pipe']
    // Ne pas utiliser shell pour éviter ENOENT avec cmd.exe
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server] ${data}`);
    if (mainWindow) {
      mainWindow.webContents.send('server-log', data.toString());
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error] ${data}`);
    if (mainWindow) {
      mainWindow.webContents.send('server-error', data.toString());
    }
  });

  serverProcess.on('close', (code) => {
    console.log(`[Server] Process exited with code ${code}`);
    if (!app.isQuitting) {
      console.log('[Server] Restarting in 3 seconds...');
      setTimeout(startServer, 3000);
    }
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

function restartServer() {
  stopServer();
  setTimeout(startServer, 1000);
}

app.whenReady().then(() => {
  startServer();
  
  setTimeout(() => {
    createWindow();
    createTray();
  }, 2000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});

ipcMain.handle('get-server-status', () => {
  return {
    running: serverProcess !== null,
    port: PORT
  };
});

ipcMain.handle('restart-server', () => {
  restartServer();
  return { success: true };
});
