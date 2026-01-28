const IS_TAURI = process.env.TAURI_ENV === 'true' || process.env.TAURI_PLATFORM;

if (IS_TAURI) {
  console.log("[Tauri] Mode Natif détecté - Serveur Express en mode support");
}

import express, { type Request, Response, NextFunction } from "express";
import { db } from "./db";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

import fs from 'fs';
import path from 'path';

async function runAutoMigration() {
  log("Step 1: Checking database connectivity and schema...");
  try {
    const command = process.platform === 'win32' 
      ? "npx drizzle-kit push" 
      : "npm run db:push";
    
    log(`Step 2: Running auto-migration command: ${command}`);
    const { stdout, stderr } = await execAsync(command);
    if (stdout) log(`Step 3: Migration stdout: ${stdout}`);
    if (stderr) log(`Step 4: Migration stderr: ${stderr}`);
    log("Step 5: ✅ Database schema synchronization complete");
  } catch (error) {
    log(`Step 6: ❌ Auto-migration failed critical error: ${error}. Application may face issues.`);
  }
}

// Configuration des logs centralisée
const LOG_DIR = process.platform === 'win32' 
  ? 'C:\\Users\\adria\\AppData\\Roaming\\GTO Poker Bot\\logs'
  : path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error(`Impossible de créer le dossier de logs: ${err}`);
  }
}

const logStream = fs.createWriteStream(path.join(LOG_DIR, 'backend.log'), { flags: 'a' });

// Redirection de console vers le fichier log en plus de la console standard
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const msg = `[${new Date().toISOString()}] [INFO] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  logStream.write(msg);
  originalLog.apply(console, args);
};

console.error = (...args) => {
  const msg = `[${new Date().toISOString()}] [ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  logStream.write(msg);
  originalError.apply(console, args);
};

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  log("🚀 Starting GTO Poker Bot Server Initialization...");
  
  // Run database migration before anything else
  await runAutoMigration();

  log("Step 7: Loading bot sessions...");
  try {
    const sessions = await storage.getAllBotSessions();
    const activeSessions = sessions.filter(s => s.status === 'running');
    log(`Step 8: Found ${activeSessions.length} active sessions to cleanup`);
    for (const session of activeSessions) {
      await storage.updateBotSession(session.id, {
        status: "stopped",
        stoppedAt: new Date(),
      });
      log(`🧹 Session active résiduelle nettoyée: ${session.id}`);
    }
  } catch (error) {
    log(`Warning: Session cleanup encountered an error: ${error}`);
  }

  log("Step 9: Checking for stale sessions...");
  try {
    const staleSession = await storage.getActiveBotSession();
    if (staleSession && staleSession.startedAt) {
        log(`Step 10: Processing session ${staleSession.id}`);
        // Session age logic
        const sessionAge = Date.now() - new Date(staleSession.startedAt).getTime();
        const MAX_STALE_AGE = 4 * 60 * 60 * 1000;
        if (sessionAge > MAX_STALE_AGE) {
            await storage.updateBotSession(staleSession.id, { status: "stopped", stoppedAt: new Date() });
            log(`🧹 Session expirée nettoyée: ${staleSession.id}`);
        } else {
            log(`ℹ️ Session existante active: ${staleSession.id}`);
        }
    }
  } catch (error) {
    log(`Warning: Stale session check failed: ${error}`);
  }

  log("Step 11: Initializing Player Profile...");
  try {
    const { initializePlayerProfile } = await import("./bot/player-profile");
    await initializePlayerProfile();
    log("✅ Player profile initialized successfully");
  } catch (error) {
    log(`Warning: Player profile initialization failed: ${error}`);
  }

  log("Step 12: Initializing Event Bus & Handlers...");
  try {
    const { initializeEventBus } = await import("./bot/event-bus");
    const { registerEventHandlers } = await import("./bot/event-handlers");
    const eventBus = await initializeEventBus();
    await registerEventHandlers(eventBus);
    eventBus.startConsuming().catch(err => log(`Event bus error: ${err}`));
    log("✅ Event bus and handlers ready");
  } catch (error) {
    log(`Warning: Event bus initialization failed: ${error}`);
  }

  log("Step 13: Initializing GTO Engine & Cache...");
  try {
    const { gtoConfig } = await import("./config");
    const { initializeGtoAdapter } = await import("./bot/gto-adapter");
    await initializeGtoAdapter({
        apiEndpoint: gtoConfig?.apiEndpoint,
        apiKey: gtoConfig?.apiKey,
        useSimulation: !gtoConfig?.enabled || !gtoConfig?.apiKey,
        useAdvanced: true,
    });
    log("✅ GTO Adapter initialized");

    if (gtoConfig?.cacheEnabled !== false) {
        const { getGtoCache, getCommonPreflopSituations } = await import("./bot/gto-cache");
        const cache = getGtoCache();
        cache.warmup(getCommonPreflopSituations()).catch(err => log(`Cache warmup error: ${err}`));
        log("✅ GTO cache warmup started");
    }
  } catch (error) {
    log(`Warning: GTO initialization failed: ${error}`);
  }

  log("Step 14: Registering API Routes...");
  await registerRoutes(httpServer, app);
  log("✅ API Routes registered");

  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    log("✅ Vite development server ready");
  } else {
    log("Step 15: Production mode - serving static files");
    serveStatic(app);
  }

  const PORT = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";
  
  log(`Step 16: Attempting to listen on ${host}:${PORT}`);
  httpServer.listen(PORT, host, async () => {
    log(`Step 17: ✓ Server successfully listening on http://${host}:${PORT}`);

    log("Step 18: Starting Range Updater...");
    try {
        const { getRangeUpdater } = await import("./bot/range-updater");
        const rangeUpdater = getRangeUpdater();
        rangeUpdater.addSource({ name: "Solver Simulation", updateFrequency: "weekly", enabled: true });
        await rangeUpdater.startAutoUpdate();
        log("Step 19: ✅ All systems go! Server ready.");
    } catch (err) {
        log(`Warning: Range updater failed: ${err}`);
    }
  });
})().catch(error => {
  log(`❌ FATAL ERROR DURING STARTUP: ${error}`);
  process.exit(1);
});
