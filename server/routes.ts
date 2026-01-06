import { getEventBus } from "./bot/event-bus";

import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { getTableManager, TableEvent, TableState } from "./bot/table-manager";
import { getGtoAdapter, initializeGtoAdapter, SimulatedGtoAdapter } from "./bot/gto-engine";
import { getHumanizer, updateHumanizerFromConfig } from "./bot/humanizer";
import { getPlatformManager, getSupportedPlatforms, PlatformManagerConfig } from "./bot/platform-manager";
import { getTaskScheduler } from "./bot/task-scheduler";
import { insertHumanizerConfigSchema, insertGtoConfigSchema, insertPlatformConfigSchema } from "@shared/schema";
import { z } from "zod";
import { GGClubCaptureTest } from "./bot/tests/ggclub-capture-test";
import { MultiTablePerformanceTest } from "./bot/tests/multi-table-performance";
import { E2ETest } from "./bot/tests/e2e-test";
import { logger } from "./logger";


const platformConnectSchema = z.object({
  platformName: z.string().min(1, "Platform name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  autoReconnect: z.boolean().optional().default(true),
  enableAutoAction: z.boolean().optional().default(true),
});

const platformActionSchema = z.object({
  windowHandle: z.number().int().positive("Window handle must be a positive integer"),
  action: z.string().min(1, "Action is required"),
  amount: z.number().optional(),
});

const antiDetectionConfigSchema = z.object({
  enableMouseJitter: z.boolean().optional(),
  mouseJitterRange: z.number().optional(),
  enableRandomPauses: z.boolean().optional(),
  pauseMinMs: z.number().optional(),
  pauseMaxMs: z.number().optional(),
  enableWindowFocusSwitching: z.boolean().optional(),
  focusSwitchIntervalMs: z.number().optional(),
  enableProcessMasking: z.boolean().optional(),
  enableTimingVariation: z.boolean().optional(),
  timingVariationPercent: z.number().optional(),
  enableMemoryPatternRandomization: z.boolean().optional(),
  enableApiCallObfuscation: z.boolean().optional(),
  maxActionsPerMinute: z.number().optional(),
  actionPatternVariation: z.number().optional(),
});

interface WebSocketMessage {
  type: string;
  payload?: any;
}

interface ConnectedDevice {
  ws: WebSocket;
  deviceId: string;
  deviceType: "desktop" | "tablet" | "mobile" | "unknown";
  deviceName: string;
  connectedAt: Date;
  lastPing: Date;
}

const connectedDevices: Map<string, ConnectedDevice> = new Map();
const connectedClients: Set<WebSocket> = new Set();

let autoPlayEnabled = true;

function generateDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function broadcastToClients(message: WebSocketMessage): void {
  const messageStr = JSON.stringify(message);
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

function broadcastToDevices(message: WebSocketMessage, excludeDeviceId?: string): void {
  const messageStr = JSON.stringify(message);
  connectedDevices.forEach((device, deviceId) => {
    if (deviceId !== excludeDeviceId && device.ws.readyState === WebSocket.OPEN) {
      device.ws.send(messageStr);
    }
  });
}

function getConnectedDevicesInfo(): Array<{ deviceId: string; deviceType: string; deviceName: string; connectedAt: string }> {
  return Array.from(connectedDevices.values()).map(d => ({
    deviceId: d.deviceId,
    deviceType: d.deviceType,
    deviceName: d.deviceName,
    connectedAt: d.connectedAt.toISOString(),
  }));
}

export function getAutoPlayState(): boolean {
  return autoPlayEnabled;
}

export function setAutoPlayState(enabled: boolean): void {
  autoPlayEnabled = enabled;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const tempDeviceId = generateDeviceId();
    let currentDeviceId = tempDeviceId;
    let isAuthenticated = false;

    logger.info("WebSocket", "Nouvelle connexion entrante", { 
      tempDeviceId, 
      remoteAddress: req.socket.remoteAddress,
      url: req.url 
    });

    // Extraire le token d'authentification
    const url = new URL(req.url || "", `ws://${req.headers.host}`);
    const token = url.searchParams.get("token") || req.headers["x-auth-token"];

    // Valider le token (simple check pour demo, à améliorer)
    const validToken = process.env.WS_AUTH_TOKEN || "poker-bot-secure-token-2024";

    if (token !== validToken) {
      logger.warning("WebSocket", "Tentative de connexion non authentifiée", { 
        tempDeviceId, 
        hasToken: !!token 
      });
      ws.send(JSON.stringify({
        type: "error",
        payload: { message: "Authentication required" }
      }));
      ws.close(1008, "Authentication required");
      return;
    }

    isAuthenticated = true;
    connectedClients.add(ws);

    logger.info("WebSocket", "Client authentifié avec succès", { tempDeviceId });

    const tableManager = getTableManager();
    const platformManager = getPlatformManager();

    ws.send(JSON.stringify({
      type: "connected",
      payload: { 
        message: "Connexion établie au serveur GTO Bot",
        tempDeviceId,
        autoPlayEnabled,
        connectedDevices: getConnectedDevicesInfo(),
        authenticated: true,
      }
    }));

    ws.send(JSON.stringify({
      type: "initial_state",
      payload: {
        tables: tableManager.getAllTableStates(),
        stats: tableManager.getStats(),
        humanizerSettings: getHumanizer().getSettings(),
        autoPlayEnabled,
        platformStatus: platformManager.getStatus(),
        connectedDevices: getConnectedDevicesInfo(),
      }
    }));

    ws.on("message", async (data) => {
      // Vérifier l'authentification avant traitement
      if (!isAuthenticated) {
        ws.send(JSON.stringify({ 
          type: "error", 
          payload: { message: "Not authenticated" } 
        }));
        return;
      }

      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;

        // Sanitiser les logs
        const { sanitizeObject } = await import("./bot/log-sanitizer");
        console.log("[WebSocket] Message reçu:", sanitizeObject(message));

        const result = await handleWebSocketMessage(ws, message, currentDeviceId);
        if (result?.newDeviceId) {
          currentDeviceId = result.newDeviceId;
        }
      } catch (error) {
        console.error("Erreur WebSocket:", error);
        ws.send(JSON.stringify({ type: "error", payload: { message: "Message invalide" } }));
      }
    });

    ws.on("close", () => {
      connectedClients.delete(ws);

      if (connectedDevices.has(currentDeviceId)) {
        const device = connectedDevices.get(currentDeviceId);
        connectedDevices.delete(currentDeviceId);
        console.log(`Device déconnecté: ${device?.deviceName} (${currentDeviceId})`);

        broadcastToClients({
          type: "device_disconnected",
          payload: { 
            deviceId: currentDeviceId,
            connectedDevices: getConnectedDevicesInfo(),
          }
        });
      } else {
        console.log("Client WebSocket déconnecté");
      }
    });
  });

  const tableManager = getTableManager();

  tableManager.on("tableEvent", (event: TableEvent) => {
    broadcastToClients({ type: "table_event", payload: event });
  });

  tableManager.on("tableStateChange", (data: { tableId: string; state: TableState }) => {
    broadcastToClients({ type: "table_state_change", payload: data });
  });

  tableManager.on("tableAdded", (data: any) => {
    broadcastToClients({ type: "table_added", payload: data });
  });

  tableManager.on("tableRemoved", (data: any) => {
    broadcastToClients({ type: "table_removed", payload: data });
  });

  // Health check endpoint pour Electron
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0"
    });
  });

  app.post("/api/session/start", async (req, res) => {
    try {
      const { logger } = await import("./logger");

      logger.session("SessionManager", "🚀 Démarrage session demandé");

      const existingSession = await storage.getActiveBotSession();
      if (existingSession) {
        logger.warning("SessionManager", "Session déjà active", { sessionId: existingSession.id });
        return res.status(400).json({ error: "Une session est déjà active" });
      }

      const session = await storage.createBotSession({
        status: "running",
        startedAt: new Date(),
      });

      logger.session("SessionManager", "✅ Session créée", { sessionId: session.id });

      tableManager.setSessionId(session.id);

      await storage.createBotStats({
        sessionId: session.id,
      });

      await storage.createActionLog({
        sessionId: session.id,
        logType: "info",
        message: "Session démarrée",
      });

      // Initialize PlatformManager with saved config
      const platformConfig = await storage.getPlatformConfig();
      if (platformConfig && platformConfig.platformName) {
        const platformManager = getPlatformManager();
        
        logger.session("SessionManager", "🔌 Initialisation PlatformManager", { 
          platform: platformConfig.platformName 
        });

        // Settings are stored in JSONB field
        const settings = (platformConfig.settings || {}) as Record<string, any>;

        const pmConfig: PlatformManagerConfig = {
          platformName: platformConfig.platformName,
          credentials: {
            username: platformConfig.username || "",
            password: settings.password || "",
          },
          autoReconnect: settings.autoReconnect ?? true,
          reconnectDelayMs: settings.reconnectDelayMs ?? 5000,
          maxReconnectAttempts: settings.maxReconnectAttempts ?? 3,
          scanIntervalMs: settings.scanIntervalMs ?? 500,
          actionDelayMs: settings.actionDelayMs ?? 100,
          enableAutoAction: settings.enableAutoAction ?? true,
        };

        const initialized = await platformManager.initialize(pmConfig);
        
        if (initialized) {
          logger.session("SessionManager", "✅ PlatformManager initialisé avec succès");
        } else {
          logger.warning("SessionManager", "⚠️ PlatformManager non initialisé - vérifiez la configuration");
        }
      } else {
        logger.warning("SessionManager", "⚠️ Pas de configuration de plateforme - détection de tables désactivée");
      }

      broadcastToClients({
        type: "session_started",
        payload: { sessionId: session.id }
      });

      res.json({ success: true, session });
    } catch (error: any) {
      const { logger } = await import("./logger");
      logger.error("SessionManager", "Erreur démarrage session", { error: String(error) });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/session/stop", async (req, res) => {
    const session = await storage.getActiveBotSession();
    if (!session) {
      return res.status(400).json({ error: "Aucune session active" });
    }

    let stats = { totalProfit: 0, totalHandsPlayed: 0 };
    let stopError: Error | null = null;
    
    try {
      // Stop PlatformManager first
      const platformManager = getPlatformManager();
      await platformManager.stop();
      logger.session("SessionManager", "🔌 PlatformManager arrêté");

      await tableManager.stopAll();
      stats = tableManager.getStats();
    } catch (err: any) {
      stopError = err;
      logger.error("SessionManager", "Erreur arrêt tables", { error: String(err) });
    } finally {
      try {
        await storage.updateBotSession(session.id, {
          status: "stopped",
          stoppedAt: new Date(),
          totalProfit: stats.totalProfit,
          handsPlayed: stats.totalHandsPlayed,
        });
      } catch (dbErr: any) {
        logger.error("SessionManager", "Erreur DB lors arrêt", { error: String(dbErr) });
      }

      try {
        await storage.createActionLog({
          sessionId: session.id,
          logType: "info",
          message: stopError ? "Session arrêtée (avec erreurs)" : "Session arrêtée",
          metadata: stats,
        });
      } catch (logErr) {}

      broadcastToClients({
        type: "session_stopped",
        payload: { sessionId: session.id, stats }
      });

      logger.session("SessionManager", "✅ Session arrêtée", { sessionId: session.id });
    }

    res.json({ success: true, stats });
  });

  app.post("/api/session/force-stop", async (req, res) => {
    const session = await storage.getActiveBotSession();
    if (!session) {
      return res.status(400).json({ error: "Aucune session active" });
    }

    logger.warning("SessionManager", "⚠️ Arrêt forcé demandé", { sessionId: session.id });

    try {
      await tableManager.stopAll();
    } catch (e) {
      logger.warning("SessionManager", "Tables non arrêtées proprement", { error: String(e) });
    }

    try {
      await storage.updateBotSession(session.id, {
        status: "stopped",
        stoppedAt: new Date(),
      });

      broadcastToClients({
        type: "session_stopped",
        payload: { sessionId: session.id, forced: true }
      });

      logger.session("SessionManager", "✅ Session arrêtée de force", { sessionId: session.id });
      res.json({ success: true, forced: true });
    } catch (error: any) {
      logger.error("SessionManager", "Erreur arrêt forcé", { error: String(error) });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/session/cleanup-stale", async (req, res) => {
    try {
      const session = await storage.getActiveBotSession();
      if (!session) {
        return res.json({ success: true, message: "Aucune session à nettoyer" });
      }

      if (!session.startedAt) {
        return res.json({ success: true, cleaned: false, message: "Session sans date de début" });
      }

      const sessionAge = Date.now() - new Date(session.startedAt).getTime();
      const MAX_SESSION_AGE = 24 * 60 * 60 * 1000;

      if (sessionAge > MAX_SESSION_AGE) {
        await storage.updateBotSession(session.id, {
          status: "stopped",
          stoppedAt: new Date(),
        });

        logger.warning("SessionManager", "🧹 Session expirée nettoyée", { 
          sessionId: session.id,
          ageHours: Math.round(sessionAge / (60 * 60 * 1000))
        });

        return res.json({ success: true, cleaned: true, sessionId: session.id });
      }

      res.json({ success: true, cleaned: false, message: "Session encore valide" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/session/current", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/session/current');
      const session = await storage.getActiveBotSession();

      if (!session) {
        logger.info('[API]', 'Aucune session active');
        return res.json({
          session: null,
          stats: {
            totalTables: 0,
            activeTables: 0,
            totalHandsPlayed: 0,
            totalProfit: 0,
            healthyTables: 0,
            avgResponseTime: 0,
            tablesByStatus: {
              waiting: 0,
              playing: 0,
              paused: 0,
              error: 0,
              disconnected: 0,
            },
          },
          tables: [],
        });
      }

      logger.debug('[API]', 'Session active trouvée', { sessionId: session.id });
      const tables = await storage.getTablesBySession(session.id);

      const stats = {
        totalTables: tables.length,
        activeTables: tables.filter(t => t.status === "playing").length,
        totalHandsPlayed: tables.reduce((sum, t) => sum + (t.handsPlayed || 0), 0),
        totalProfit: tables.reduce((sum, t) => sum + (t.profit || 0), 0),
        healthyTables: tables.filter(t => t.status === "playing" || t.status === "waiting").length,
        avgResponseTime: 0,
        tablesByStatus: {
          waiting: tables.filter(t => t.status === "waiting").length,
          playing: tables.filter(t => t.status === "playing").length,
          paused: tables.filter(t => t.status === "paused").length,
          error: tables.filter(t => t.status === "error").length,
          disconnected: tables.filter(t => t.status === "disconnected").length,
        },
      };

      logger.info('[API]', 'Stats session', stats);
      res.json({ session, stats, tables });
    } catch (error: any) {
      logger.error('[API]', 'Erreur récupération session', { 
        error: error.message,
        stack: error.stack 
      });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tables", async (req, res) => {
    try {
      const { tableIdentifier, tableName, stakes } = req.body;

      if (!tableIdentifier || !tableName || !stakes) {
        return res.status(400).json({ error: "Paramètres manquants" });
      }

      const table = await tableManager.addTable({
        tableIdentifier,
        tableName,
        stakes,
      });

      res.json({ success: true, table: table.getState() });
    } catch (error: any) {
      console.error("Erreur ajout table:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/tables/:tableId", async (req, res) => {
    try {
      const { tableId } = req.params;
      await tableManager.removeTable(tableId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Erreur suppression table:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tables", async (req, res) => {
    try {
      const tables = tableManager.getAllTableStates();
      res.json({ tables });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tables/:tableId/start", async (req, res) => {
    try {
      const { tableId } = req.params;
      const table = tableManager.getTable(tableId);
      if (!table) {
        return res.status(404).json({ error: "Table non trouvée" });
      }
      await table.start();
      res.json({ success: true, state: table.getState() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tables/:tableId/pause", async (req, res) => {
    try {
      const { tableId } = req.params;
      const table = tableManager.getTable(tableId);
      if (!table) {
        return res.status(404).json({ error: "Table non trouvée" });
      }
      await table.pause();
      res.json({ success: true, state: table.getState() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tables/start-all", async (req, res) => {
    try {
      await tableManager.startAll();
      res.json({ success: true, stats: tableManager.getStats() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tables/stop-all", async (req, res) => {
    try {
      await tableManager.stopAll();
      res.json({ success: true, stats: tableManager.getStats() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/humanizer", async (req, res) => {
    try {
      let config = await storage.getHumanizerConfig();
      if (!config) {
        config = await storage.createDefaultHumanizerConfig();
      }

      const currentSettings = getHumanizer().getSettings();

      res.json({ config, currentSettings });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/humanizer", async (req, res) => {
    try {
      const updates = req.body;

      const config = await storage.updateHumanizerConfig(updates);
      updateHumanizerFromConfig(config);

      broadcastToClients({
        type: "humanizer_updated",
        payload: { config, settings: getHumanizer().getSettings() }
      });

      res.json({ success: true, config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gto-config", async (req, res) => {
    try {
      const config = await storage.getGtoConfig();
      const adapter = getGtoAdapter();
      const { getGtoCache } = await import("./bot/gto-cache");
      const cache = getGtoCache();
      const cacheStats = cache.getStats();

      res.json({
        config,
        connected: adapter.isConnected(),
        usingSimulation: adapter instanceof SimulatedGtoAdapter,
        cache: cacheStats,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/gto-config", async (req, res) => {
    try {
      const updates = req.body;
      const config = await storage.updateGtoConfig(updates);

      // Reinitialize GTO adapter with new config
      await initializeGtoAdapter({
        apiEndpoint: config.apiEndpoint,
        apiKey: config.apiKey,
        useSimulation: !config.enabled || !config.apiKey,
        useAdvanced: true,
      });

      res.json({ success: true, config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gto-config/warmup", async (req, res) => {
    try {
      const { getGtoCache, getCommonPreflopSituations } = await import("./bot/gto-cache");
      const cache = getGtoCache();

      // Warmup with common preflop situations
      const situations = getCommonPreflopSituations();
      await cache.warmup(situations);

      const stats = cache.getStats();

      res.json({ 
        success: true, 
        message: `Cache warmed up with ${situations.length} common situations`,
        stats,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gto-config/clear-cache", async (req, res) => {
    try {
      const { getGtoCache } = await import("./bot/gto-cache");
      const cache = getGtoCache();
      cache.clear();

      res.json({ 
        success: true, 
        message: "GTO cache cleared",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/platform-config", async (req, res) => {
    try {
      let config = await storage.getPlatformConfig();
      res.json({ config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/platform-config", async (req, res) => {
    try {
      const updates = req.body;
      console.log("[API] PATCH /api/platform-config - Received updates:", JSON.stringify(updates));

      // Mapping des noms de plateformes vers le nom canonique supporté
      const platformNameMap: Record<string, string> = {
        "ggpoker": "ggclub",
        "gg poker": "ggclub",
        "gg-poker": "ggclub",
        "ggclub": "ggclub",
        "gg club": "ggclub",
        "gg-club": "ggclub",
      };

      // Si platformName est fourni, le valider et le mapper
      if (updates.platformName) {
        const normalizedName = updates.platformName.toLowerCase().trim();
        const mappedName = platformNameMap[normalizedName];
        
        if (mappedName) {
          updates.platformName = mappedName;
          logger.info('[API]', `Platform name mapped: ${normalizedName} -> ${mappedName}`);
        } else {
          const supportedPlatforms = getSupportedPlatforms();
          if (!supportedPlatforms.includes(normalizedName)) {
            logger.warning('[API]', `Plateforme non supportée: ${updates.platformName}`, { supportedPlatforms });
            return res.status(400).json({ 
              error: `Plateforme non supportée: ${updates.platformName}`,
              supportedPlatforms 
            });
          }
        }
      }

      const config = await storage.updatePlatformConfig(updates);
      console.log("[API] PATCH /api/platform-config - Saved config:", JSON.stringify(config));

      // Si une session est active et qu'on a une config valide, initialiser PlatformManager
      const activeSession = await storage.getActiveBotSession();
      if (activeSession && config.platformName && config.enabled) {
        const platformManager = getPlatformManager();
        const currentStatus = platformManager.getStatus();
        
        // Initialiser seulement si pas déjà en cours d'exécution ou en connexion
        if (currentStatus === "idle" || currentStatus === "disconnected") {
          logger.session("API", "🔌 Initialisation PlatformManager après sauvegarde config");
          
          tableManager.setSessionId(activeSession.id);
          
          const settings = (config.settings || {}) as Record<string, any>;
          const pmConfig: PlatformManagerConfig = {
            platformName: config.platformName,
            credentials: {
              username: config.username || "",
              password: settings.password || "",
            },
            autoReconnect: settings.autoReconnect ?? true,
            reconnectDelayMs: settings.reconnectDelayMs ?? 5000,
            maxReconnectAttempts: settings.maxReconnectAttempts ?? 3,
            scanIntervalMs: settings.scanIntervalMs ?? 500,
            actionDelayMs: settings.actionDelayMs ?? 100,
            enableAutoAction: settings.enableAutoAction ?? true,
          };
          
          // Lancer l'initialisation en background pour ne pas bloquer la réponse
          platformManager.initialize(pmConfig).then(initialized => {
            if (initialized) {
              logger.session("API", "✅ PlatformManager initialisé - scan des tables démarré");
              
              // Notifier le frontend que la session est réellement active
              broadcastToClients({
                type: "session_started",
                payload: { sessionId: activeSession.id }
              });
            } else {
              logger.warning("API", "⚠️ Échec initialisation PlatformManager");
            }
          }).catch(err => {
            logger.error("API", "Erreur initialisation PlatformManager", { error: String(err) });
          });
        }
      }

      broadcastToClients({
        type: "platform_config_updated",
        payload: { config }
      });

      res.json({ success: true, config });
    } catch (error: any) {
      console.error("[API] PATCH /api/platform-config - Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/platform/supported", async (req, res) => {
    try {
      const platforms = getSupportedPlatforms();
      res.json({ platforms });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/platform/status", async (req, res) => {
    try {
      const platformManager = getPlatformManager();
      const adapter = platformManager.getAdapter();

      res.json({
        status: platformManager.getStatus(),
        suspicionLevel: platformManager.getSuspicionLevel(),
        connectionStatus: adapter?.getConnectionStatus() || "disconnected",
        capabilities: adapter?.getCapabilities() || null,
        antiDetectionConfig: adapter?.getAntiDetectionConfig() || null,
        managedTables: platformManager.getManagedTables().map(t => ({
          windowHandle: t.windowHandle,
          windowId: t.windowId,
          tableId: t.tableSession.getId(),
          isProcessingAction: t.isProcessingAction,
          lastActionTime: t.lastActionTime,
          queuedActions: t.actionQueue.length,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/connect", async (req, res) => {
    try {
      const parseResult = platformConnectSchema.safeParse(req.body);
      if (!parseResult.success) {
        logger.warning('[API]', 'Échec validation connexion plateforme', { errors: parseResult.error.errors });
        return res.status(400).json({ 
          error: "Validation échouée", 
          details: parseResult.error.errors 
        });
      }

      const { platformName, username, password, autoReconnect, enableAutoAction } = parseResult.data;
      logger.info('[API]', `Tentative de connexion à la plateforme: ${platformName}`, { username });

      const supportedPlatforms = getSupportedPlatforms();
      if (!supportedPlatforms.includes(platformName.toLowerCase())) {
        logger.warning('[API]', `Plateforme non supportée demandée`, { platformName, supportedPlatforms });
        return res.status(400).json({ 
          error: `Plateforme non supportée: ${platformName}`,
          supportedPlatforms 
        });
      }

      const platformManager = getPlatformManager();

      const config: PlatformManagerConfig = {
        platformName,
        credentials: {
          username,
          password,
        },
        autoReconnect: autoReconnect ?? true,
        reconnectDelayMs: 5000,
        maxReconnectAttempts: 3,
        scanIntervalMs: 200,
        actionDelayMs: 100,
        enableAutoAction: enableAutoAction ?? true,
      };

      const connected = await platformManager.initialize(config);

      if (connected) {
        logger.info('[API]', `Connexion à ${platformName} réussie.`);
        
        // Mettre à jour la configuration de la plateforme avec les identifiants si demandés
        const platformConfigUpdates: any = {
          platformName,
          username,
          enabled: true,
          connectionStatus: "connected",
          lastConnectionAt: new Date(),
        };

        if (req.body.rememberPassword) {
          platformConfigUpdates.settings = {
            ...(req.body.settings || {}),
            password: password,
            rememberPassword: true
          };
        }

        await storage.updatePlatformConfig(platformConfigUpdates);

        broadcastToClients({
          type: "platform_connected",
          payload: { platformName, status: platformManager.getStatus() }
        });
      } else {
        logger.warning('[API]', `Échec de la connexion à ${platformName}.`);
      }

      res.json({ 
        success: connected, 
        status: platformManager.getStatus(),
        message: connected ? "Connexion réussie" : "Échec de la connexion"
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur connexion plateforme', { 
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/disconnect", async (req, res) => {
    try {
      logger.info('[API]', 'Demande de déconnexion de la plateforme.');
      const platformManager = getPlatformManager();
      await platformManager.stop();

      await storage.updatePlatformConfig({
        enabled: false,
        connectionStatus: "disconnected",
      });

      broadcastToClients({
        type: "platform_disconnected",
        payload: { status: "disconnected" }
      });

      logger.info('[API]', 'Déconnexion de la plateforme effectuée.');
      res.json({ success: true, status: platformManager.getStatus() });
    } catch (error: any) {
      logger.error('[API]', 'Erreur déconnexion plateforme', { 
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/pause", async (req, res) => {
    try {
      logger.info('[API]', 'Demande de pause de la plateforme.');
      const platformManager = getPlatformManager();
      await platformManager.pause();

      broadcastToClients({
        type: "platform_paused",
        payload: { status: platformManager.getStatus() }
      });

      logger.info('[API]', 'Plateforme mise en pause.');
      res.json({ success: true, status: platformManager.getStatus() });
    } catch (error: any) {
      logger.error('[API]', 'Erreur mise en pause plateforme', { 
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/resume", async (req, res) => {
    try {
      logger.info('[API]', 'Demande de reprise de la plateforme.');
      const platformManager = getPlatformManager();
      await platformManager.resume();

      broadcastToClients({
        type: "platform_resumed",
        payload: { status: platformManager.getStatus() }
      });

      logger.info('[API]', 'Plateforme reprise.');
      res.json({ success: true, status: platformManager.getStatus() });
    } catch (error: any) {
      logger.error('[API]', 'Erreur reprise plateforme', { 
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/action", async (req, res) => {
    try {
      const parseResult = platformActionSchema.safeParse(req.body);
      if (!parseResult.success) {
        logger.warning('[API]', 'Échec validation action plateforme', { errors: parseResult.error.errors });
        return res.status(400).json({ 
          error: "Validation échouée", 
          details: parseResult.error.errors 
        });
      }

      const { windowHandle, action, amount } = parseResult.data;
      logger.info('[API]', `Demande d\'action sur la plateforme`, { windowHandle, action, amount });

      const platformManager = getPlatformManager();

      if (platformManager.getStatus() !== "running") {
        logger.warning('[API]', 'Action demandée alors que la plateforme n\'est pas en cours d\'exécution', { status: platformManager.getStatus() });
        return res.status(400).json({ 
          error: "Plateforme non connectée ou en pause",
          status: platformManager.getStatus()
        });
      }

      const managedTable = platformManager.getTableByWindowHandle(windowHandle);
      if (!managedTable) {
        logger.warning('[API]', `Table avec windowHandle non trouvée`, { windowHandle, availableTables: platformManager.getManagedTables().map(t => ({ windowHandle: t.windowHandle, tableId: t.tableSession.getId() })) });
        return res.status(404).json({ 
          error: `Table avec windowHandle ${windowHandle} non trouvée`,
          availableTables: platformManager.getManagedTables().map(t => ({
            windowHandle: t.windowHandle,
            tableId: t.tableSession.getId()
          }))
        });
      }

      await platformManager.manualAction(windowHandle, action, amount);
      logger.info('[API]', 'Action manuelle mise en file d\'attente.');

      res.json({ success: true, message: "Action en file d'attente" });
    } catch (error: any) {
      logger.error('[API]', 'Erreur action plateforme', { 
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/platform/anti-detection", async (req, res) => {
    try {
      const parseResult = antiDetectionConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        logger.warning('[API]', 'Échec validation configuration anti-détection', { errors: parseResult.error.errors });
        return res.status(400).json({ 
          error: "Validation échouée", 
          details: parseResult.error.errors 
        });
      }

      const updates = parseResult.data;
      logger.info('[API]', 'Mise à jour de la configuration anti-détection', updates);

      const platformManager = getPlatformManager();
      const adapter = platformManager.getAdapter();

      if (!adapter) {
        logger.error('[API]', 'Tentative de mise à jour de l\'anti-détection sans adaptateur initialisé');
        return res.status(400).json({ error: "Aucun adaptateur de plateforme initialisé" });
      }

      platformManager.updateAntiDetectionConfig(updates);
      logger.info('[API]', 'Configuration anti-détection mise à jour avec succès.');

      broadcastToClients({
        type: "anti_detection_updated",
        payload: { config: adapter.getAntiDetectionConfig() }
      });

      res.json({ 
        success: true, 
        config: adapter.getAntiDetectionConfig()
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur mise à jour anti-détection', { 
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  const platformManager = getPlatformManager();

  platformManager.on("statusChange", (status) => {
    logger.debug('[PlatformManager]', 'Changement de statut', { status });
    broadcastToClients({ type: "platform_status_change", payload: { status } });
  });

  platformManager.on("tableAdded", (data) => {
    logger.debug('[PlatformManager]', 'Table ajoutée', data);
    broadcastToClients({ type: "platform_table_added", payload: data });
  });

  platformManager.on("tableRemoved", (data) => {
    logger.debug('[PlatformManager]', 'Table retirée', data);
    broadcastToClients({ type: "platform_table_removed", payload: data });
  });

  platformManager.on("actionQueued", (data) => {
    logger.debug('[PlatformManager]', 'Action mise en file d\'attente', data);
    broadcastToClients({ type: "platform_action_queued", payload: data });
  });

  platformManager.on("actionExecuted", (data) => {
    logger.debug('[PlatformManager]', 'Action exécutée', data);
    broadcastToClients({ type: "platform_action_executed", payload: data });
  });

  platformManager.on("warning", (data) => {
    logger.warn('[PlatformManager]', 'Avertissement', data);
    broadcastToClients({ type: "platform_warning", payload: data });
  });

  platformManager.on("emergencyPause", (data) => {
    logger.error('[PlatformManager]', 'Pause d\'urgence déclenchée', data);
    broadcastToClients({ type: "platform_emergency_pause", payload: data });
  });

  platformManager.on("banned", (data) => {
    logger.error('[PlatformManager]', 'Banni de la plateforme', data);
    broadcastToClients({ type: "platform_banned", payload: data });
  });

  platformManager.on("platformEvent", (event) => {
    logger.debug('[PlatformManager]', 'Événement plateforme', event);
    broadcastToClients({ type: "platform_event", payload: event });
  });

  app.get("/api/logs", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/logs');
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getRecentActionLogs(limit);
      logger.info('[API]', `Récupération de ${logs.length} logs d'action.`);
      res.json({ logs });
    } catch (error: any) {
      logger.error('[API]', 'Erreur récupération logs d\'action', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/logs/files", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/logs/files');
      const { logger } = await import("./logger");
      const lines = parseInt(req.query.lines as string) || 100;
      const logs = logger.getRecentLogs(lines);
      logger.info('[API]', `Récupération de ${logs.length} lignes de logs de fichiers.`);
      res.json({ logs, count: logs.length });
    } catch (error: any) {
      logger.error('[API]', 'Erreur récupération logs de fichiers', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/logs/session", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/logs/session');
      const { logger } = await import("./logger");
      const logs = logger.getSessionLogs();
      logger.info('[API]', `Récupération de ${logs.length} logs de session.`);
      res.json({ logs, count: logs.length });
    } catch (error: any) {
      logger.error('[API]', 'Erreur récupération logs de session', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stats", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/stats');
      const session = await storage.getActiveBotSession();
      const tableStats = tableManager.getStats();

      let dbStats = null;
      if (session) {
        dbStats = await storage.getBotStats(session.id);
        logger.debug('[API]', 'Stats DB récupérées pour la session active', { sessionId: session.id });
      } else {
        logger.info('[API]', 'Aucune session active pour récupérer les stats DB.');
      }

      const statsResponse = {
        session,
        tableStats,
        dbStats,
        humanizerSettings: getHumanizer().getSettings(),
        gtoConnected: getGtoAdapter().isConnected(),
      };
      logger.info('[API]', 'Statistiques globales renvoyées.');
      res.json(statsResponse);
    } catch (error: any) {
      logger.error('[API]', 'Erreur récupération des statistiques globales', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/hand-histories", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/hand-histories');
      const limit = parseInt(req.query.limit as string) || 20;
      const histories = await storage.getRecentHandHistories(limit);
      logger.info('[API]', `Récupération de ${histories.length} historiques de mains récents.`);
      res.json({ histories });
    } catch (error: any) {
      logger.error('[API]', 'Erreur récupération des historiques de mains', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/simulate/hand", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/simulate/hand');
      const { heroCards, communityCards, position, potSize, facingBet, numPlayers } = req.body;

      logger.debug('[API]', 'Simulation de main demandée', { heroCards, communityCards, position, potSize, facingBet, numPlayers });

      const gtoAdapter = getGtoAdapter();
      const recommendation = await gtoAdapter.getRecommendation({
        heroCards: heroCards || ["Ah", "Ks"],
        communityCards: communityCards || [],
        street: communityCards?.length > 0 ? 
          (communityCards.length === 3 ? "flop" : 
           communityCards.length === 4 ? "turn" : "river") : "preflop",
        heroPosition: position || "BTN",
        potSize: potSize || 100,
        heroStack: 1000,
        facingBet: facingBet || 0,
        numPlayers: numPlayers || 6,
        isInPosition: true,
      });

      logger.info('[API]', 'Recommandation GTO obtenue', { recommendation });

      const humanizer = getHumanizer();
      const humanizedAction = humanizer.humanizeAction(
        recommendation.bestAction,
        0.5,
        recommendation.confidence < 0.7
      );
      logger.info('[API]', 'Action humanisée calculée', { humanizedAction });

      res.json({
        recommendation,
        humanizedAction,
        simulatedDelay: humanizedAction.delay,
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la simulation de main', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  // Safe Mode Routes
  app.get("/api/safe-mode", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/safe-mode');
      const { getSafeModeManager } = await import("./bot/safe-mode");
      const safeModeManager = getSafeModeManager();

      const response = {
        currentMode: safeModeManager.getCurrentMode(),
        config: safeModeManager.getConfig(),
        description: safeModeManager.getModeDescription(),
        history: safeModeManager.getHistory().slice(-10),
      };
      logger.info('[API]', 'Statut du mode sécurisé renvoyé.');
      res.json(response);
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération du mode sécurisé', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to get safe mode" });
    }
  });

  app.post("/api/safe-mode/config", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/safe-mode/config');
      const { getSafeModeManager } = await import("./bot/safe-mode");
      const safeModeManager = getSafeModeManager();

      safeModeManager.updateConfig(req.body);
      logger.info('[API]', 'Configuration du mode sécurisé mise à jour.');

      res.json({
        success: true,
        config: safeModeManager.getConfig(),
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la mise à jour de la configuration du mode sécurisé', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to update safe mode config" });
    }
  });

  app.post("/api/safe-mode/reset", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/safe-mode/reset');
      const { getSafeModeManager } = await import("./bot/safe-mode");
      const safeModeManager = getSafeModeManager();

      safeModeManager.reset();
      logger.info('[API]', 'Mode sécurisé réinitialisé.');

      res.json({
        success: true,
        currentMode: safeModeManager.getCurrentMode(),
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la réinitialisation du mode sécurisé', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to reset safe mode" });
    }
  });

  // Player Profile Routes
  app.get("/api/player-profile", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/player-profile');
      const { getPlayerProfile } = await import("./bot/player-profile");
      const profile = getPlayerProfile();

      const response = {
        state: profile.getState(),
        config: profile.getConfig(),
        modifiers: profile.getModifiers(),
      };
      logger.info('[API]', 'Profil joueur renvoyé.');
      res.json(response);
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération du profil joueur', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to get player profile" });
    }
  });

  app.post("/api/player-profile/personality", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/player-profile/personality');
      const { personality } = req.body;
      const { getPlayerProfile } = await import("./bot/player-profile");
      const profile = getPlayerProfile();

      profile.updatePersonality(personality);
      logger.info('[API]', 'Personnalité du profil joueur mise à jour.');

      res.json({
        state: profile.getState(),
        config: profile.getConfig(),
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la mise à jour de la personnalité du profil joueur', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to update personality" });
    }
  });

  app.post("/api/player-profile/reset", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/player-profile/reset');
      const { getPlayerProfile } = await import("./bot/player-profile");
      const profile = getPlayerProfile();

      profile.reset();
      logger.info('[API]', 'Profil joueur réinitialisé.');

      res.json({
        state: profile.getState(),
        message: "Profile reset successfully",
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la réinitialisation du profil joueur', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to reset profile" });
    }
  });

  // Task Scheduler Stats
  app.get("/api/scheduler/stats", async (_req, res) => {
    try {
      logger.debug('[API]', 'GET /api/scheduler/stats');
      const { getWorkerManager } = await import("./bot/workers/worker-manager");
      const workerManager = getWorkerManager();
      const stats = workerManager.getStats();
      logger.info('[API]', 'Statistiques du planificateur de tâches renvoyées.');
      res.json({ 
        success: true,
        workers: stats,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération des statistiques du planificateur de tâches', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-Calibration Stats
  app.get("/api/calibration/auto-stats", async (_req, res) => {
    try {
      logger.debug('[API]', 'GET /api/calibration/auto-stats');
      const { getAutoCalibrationManager } = await import("./bot/auto-calibration");
      const autoCalibration = getAutoCalibrationManager();
      const stats = autoCalibration.getStats();
      logger.info('[API]', 'Statistiques d\'auto-calibration renvoyées.');
      res.json(stats);
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération des statistiques d\'auto-calibration', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to fetch auto-calibration stats" });
    }
  });

  app.get("/api/state-confidence/:windowHandle", async (req, res) => {
    try {
      logger.debug('[API]', `GET /api/state-confidence/:windowHandle`, { windowHandle: req.params.windowHandle });
      const { getStateConfidenceAnalyzer } = await import("./bot/state-confidence");
      const analyzer = getStateConfidenceAnalyzer();
      const windowHandle = parseInt(req.params.windowHandle);

      const stats = analyzer.getStats(windowHandle);
      const uncertainStates = analyzer.getUncertainStates(windowHandle);

      const response = {
        stats,
        uncertainStates: uncertainStates.map(s => ({
          timestamp: s.timestamp,
          reason: s.reason,
          retryCount: s.retryCount,
          partialState: {
            globalConfidence: s.partialState.globalConfidence,
            heroCardsConfidence: s.partialState.heroCards?.confidence,
            potSizeConfidence: s.partialState.potSize?.confidence,
          },
        })),
      };
      logger.info('[API]', 'Statistiques de confiance de l\'état renvoyées.');
      res.json(response);
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération des statistiques de confiance de l\'état', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/state-confidence/config", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/state-confidence/config');
      const { getStateConfidenceAnalyzer } = await import("./bot/state-confidence");
      const analyzer = getStateConfidenceAnalyzer();

      analyzer.updateConfig(req.body);
      logger.info('[API]', 'Configuration de la confiance de l\'état mise à jour.');

      res.json({ success: true, config: req.body });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la mise à jour de la configuration de la confiance de l\'état', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  // OCR Error Correction Stats
  app.get("/api/ocr-correction/stats", (_req, res) => {
    try {
      logger.debug('[API]', 'GET /api/ocr-correction/stats');
      const { ocrErrorCorrector } = require("./bot/ocr-error-correction");
      const stats = ocrErrorCorrector.getStats();
      logger.info('[API]', 'Statistiques de correction OCR renvoyées.');
      res.json(stats);
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération des statistiques de correction OCR', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to get OCR correction stats" });
    }
  });

  // Event Bus Stats
  app.get("/api/event-bus/stats", async (_req, res) => {
    try {
      logger.debug('[API]', 'GET /api/event-bus/stats');
      const eventBus = getEventBus();
      const streamInfo = await eventBus.getStreamInfo();
      const pendingCount = await eventBus.getPendingCount();

      const response = {
        streamInfo,
        pendingCount,
        isConsuming: eventBus.listenerCount("processed") > 0,
      };
      logger.info('[API]', 'Statistiques du bus d\'événements renvoyées.');
      res.json(response);
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération des statistiques du bus d\'événements', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to get event bus stats" });
    }
  });

  app.post("/api/event-bus/trim", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/event-bus/trim');
      const { maxLength = 10000 } = req.body;
      const eventBus = getEventBus();

      await eventBus.trimStream(maxLength);
      logger.info('[API]', `Bus d'événements élagué à ${maxLength} événements.`);

      res.json({ success: true, message: `Stream trimmed to ${maxLength} events` });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de l\'élagage du bus d\'événements', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  // ===== REMOTE CONTROL API FOR MULTI-DEVICE SYNC =====

  app.get("/api/remote/status", async (_req, res) => {
    try {
      logger.debug('[API]', 'GET /api/remote/status');
      const session = await storage.getActiveBotSession();
      const stats = tableManager.getStats();
      const platformManager = getPlatformManager();

      const response = {
        session: session ? {
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
        } : null,
        stats,
        autoPlayEnabled,
        platformStatus: platformManager.getStatus(),
        connectedDevices: getConnectedDevicesInfo(),
        timestamp: Date.now(),
      };
      logger.info('[API]', 'Statut de contrôle à distance renvoyé.');
      res.json(response);
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération du statut de contrôle à distance', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/remote/auto-play", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/remote/auto-play');
      const { enabled } = req.body;
      const previousState = autoPlayEnabled;

      if (typeof enabled === "boolean") {
        autoPlayEnabled = enabled;
      } else {
        autoPlayEnabled = !autoPlayEnabled;
      }

      const platformManager = getPlatformManager();

      if (autoPlayEnabled !== previousState) {
        try {
          if (autoPlayEnabled) {
            await platformManager.resume();
          } else {
            await platformManager.pause();
          }
        } catch (error) {
          console.error("Erreur changement auto-play:", error);
          logger.error('[API]', 'Erreur lors du changement d\'état auto-play via plateforme', { error: error.message });
        }
      }

      broadcastToClients({
        type: "auto_play_changed",
        payload: {
          enabled: autoPlayEnabled,
          changedBy: "api",
          timestamp: Date.now(),
        }
      });

      logger.info('[API]', `Changement d'état auto-play effectué. Nouvel état: ${autoPlayEnabled}`);
      res.json({
        success: true,
        autoPlayEnabled,
        platformStatus: platformManager.getStatus(),
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors du changement d\'état auto-play', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/remote/devices", async (_req, res) => {
    try {
      logger.debug('[API]', 'GET /api/remote/devices');
      const deviceList = getConnectedDevicesInfo();
      logger.info('[API]', `Liste des ${deviceList.length} appareils connectés renvoyée.`);
      res.json({
        devices: deviceList,
        count: connectedDevices.size,
      });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération de la liste des appareils connectés', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/remote/logs", async (req, res) => {
    try {
      logger.debug('[API]', 'GET /api/remote/logs');
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getRecentActionLogs(limit);
      logger.info('[API]', `Récupération de ${logs.length} logs d'action pour le contrôle à distance.`);
      res.json({ logs });
    } catch (error: any) {
      logger.error('[API]', 'Erreur lors de la récupération des logs pour le contrôle à distance', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  });

  // ===== TEST ENDPOINTS =====
  app.post("/api/tests/capture-benchmark", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/tests/capture-benchmark');
      const { windowHandle, iterations } = req.body;
      const test = new GGClubCaptureTest();
      await test.initialize();

      console.log(`[API] Starting capture benchmark: ${iterations || 50} iterations`);
      logger.info('[API]', 'Démarrage du benchmark de capture.', { windowHandle, iterations });
      await test.runBenchmark(windowHandle || 1001, iterations || 50);
      logger.info('[API]', 'Benchmark de capture terminé.');

      res.json({ 
        success: true, 
        message: "Benchmark complete",
        resultsPath: "./test-results/captures/",
      });
    } catch (error: any) {
      console.error("[API] Capture benchmark error:", error);
      logger.error('[API]', 'Erreur lors du benchmark de capture', { error: error.message, stack: error.stack });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/tests/multi-table", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/tests/multi-table');
      const { tableCount } = req.body;
      const test = new MultiTablePerformanceTest();

      console.log(`[API] Starting multi-table test: ${tableCount || 6} tables`);
      logger.info('[API]', 'Démarrage du test multi-tables.', { tableCount });

      if (tableCount === 12) {
        await test.testTwelveTables();
      } else if (tableCount === 24) {
        await test.testTwentyFourTables();
      } else {
        await test.testSixTables();
      }
      logger.info('[API]', 'Test multi-tables terminé.');

      const report = test.getReport();

      res.json({ 
        success: true, 
        message: "Multi-table test complete",
        report,
      });
    } catch (error: any) {
      console.error("[API] Multi-table test error:", error);
      logger.error('[API]', 'Erreur lors du test multi-tables', { error: error.message, stack: error.stack });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/tests/stress", async (_req, res) => {
    try {
      logger.debug('[API]', 'POST /api/tests/stress');
      const test = new MultiTablePerformanceTest();

      console.log("[API] Starting stress test (6, 12, 24 tables)");
      logger.info('[API]', 'Démarrage du test de stress.');
      await test.stressTest();
      logger.info('[API]', 'Test de stress terminé.');

      const report = test.getReport();

      res.json({ 
        success: true, 
        message: "Stress test complete",
        report,
      });
    } catch (error: any) {
      console.error("[API] Stress test error:", error);
      logger.error('[API]', 'Erreur lors du test de stress', { error: error.message, stack: error.stack });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/tests/e2e", async (_req, res) => {
    try {
      logger.debug('[API]', 'POST /api/tests/e2e');
      const test = new E2ETest();

      console.log("[API] Starting E2E test");
      logger.info('[API]', 'Démarrage du test E2E.');
      await test.runFullCycle();
      logger.info('[API]', 'Test E2E terminé.');

      res.json({ 
        success: true, 
        message: "E2E test complete",
        replayPath: "./replays/",
      });
    } catch (error: any) {
      console.error("[API] E2E test error:", error);
      logger.error('[API]', 'Erreur lors du test E2E', { error: error.message, stack: error.stack });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/tests/comprehensive", async (_req, res) => {
    try {
      logger.debug('[API]', 'POST /api/tests/comprehensive');
      const { runComprehensiveTests } = await import("./bot/tests/comprehensive-test-suite");

      console.log("[API] Starting comprehensive test suite");
      logger.info('[API]', 'Démarrage de la suite de tests complète.');
      const report = await runComprehensiveTests();
      logger.info('[API]', 'Suite de tests complète terminée.');

      res.json({ 
        success: true, 
        message: "Comprehensive tests complete",
        report,
        resultsPath: "./test-results/comprehensive/",
      });
    } catch (error: any) {
      console.error("[API] Comprehensive test error:", error);
      logger.error('[API]', 'Erreur lors de la suite de tests complète', { error: error.message, stack: error.stack });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/dataset/collect", async (req, res) => {
    try {
      logger.debug('[API]', 'POST /api/dataset/collect');
      const { DatasetCollector } = await import("../script/collect-dataset");
      const { targetCount = 300 } = req.body;

      console.log(`[API] Starting dataset collection (${targetCount} screenshots)`);
      logger.info('[API]', 'Démarrage de la collecte de dataset.', { targetCount });

      const collector = new DatasetCollector({
        targetScreenshots: targetCount,
        minConfidence: 0.7,
        delayBetweenCaptures: 2000,
      });

      await collector.initialize();
      logger.debug('[API]', 'Dataset collector initialisé.');

      // Run in background
      collector.collectFromActiveTables().catch(console.error);
      logger.info('[API]', 'Collecte de dataset lancée en arrière-plan.');

      res.json({ 
        success: true, 
        message: "Dataset collection started",
        targetCount,
        outputDir: "./dataset/ggclub-captures",
      });
    } catch (error: any) {
      console.error("[API] Dataset collection error:", error);
      logger.error('[API]', 'Erreur lors du démarrage de la collecte de dataset', { error: error.message, stack: error.stack });
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/dataset/stats", async (_req, res) => {
    try {
      logger.debug('[API]', 'GET /api/dataset/stats');
      const { getDataCollector } = await import("./bot/ml-ocr/data-collector");
      const collector = await getDataCollector();
      const stats = collector.getStats();
      logger.info('[API]', 'Statistiques du collecteur de dataset renvoyées.');
      res.json({ success: true, stats });
    } catch (error: any) {
      console.error("[API] Dataset stats error:", error);
      logger.error('[API]', 'Erreur lors de la récupération des statistiques du collecteur de dataset', { error: error.message, stack: error.stack });
      res.status(500).json({ error: String(error) });
    }
  });


  return httpServer;
}

function registerVisionRoutes(app: Express): void {
  app.get("/api/vision/errors", async (_req, res) => {
    try {
      logger.debug('[Vision API]', 'GET /api/vision/errors');
      const { visionErrorLogger } = await import("./bot/vision-error-logger");
      const count = parseInt(_req.query.count as string) || 50;
      const errors = visionErrorLogger.getRecentErrors(count);
      logger.info('[Vision API]', `Récupération de ${errors.length} erreurs de vision récentes.`);
      res.json(errors);
    } catch (error: any) {
      logger.error('[Vision API]', 'Erreur lors de la récupération des erreurs de vision', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to fetch vision errors" });
    }
  });

  app.get("/api/vision/errors/critical", async (_req, res) => {
    try {
      logger.debug('[Vision API]', 'GET /api/vision/errors/critical');
      const { visionErrorLogger } = await import("./bot/vision-error-logger");
      const errors = visionErrorLogger.getCriticalErrors();
      logger.info('[Vision API]', `Récupération de ${errors.length} erreurs critiques de vision.`);
      res.json(errors);
    } catch (error: any) {
      logger.error('[Vision API]', 'Erreur lors de la récupération des erreurs critiques de vision', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to fetch vision errors" });
    }
  });

  app.get("/api/vision/metrics", async (_req, res) => {
    try {
      logger.debug('[Vision API]', 'GET /api/vision/metrics');
      const { visionErrorLogger } = await import("./bot/vision-error-logger");
      const windowMs = parseInt(_req.query.window as string) || 3600000;
      const metrics = visionErrorLogger.getMetrics(windowMs);
      logger.info('[Vision API]', `Récupération des métriques de vision pour la fenêtre de ${windowMs}ms.`);
      res.json(metrics);
    } catch (error: any) {
      logger.error('[Vision API]', 'Erreur lors de la récupération des métriques de vision', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to fetch vision metrics" });
    }
  });

  app.get("/api/vision/report", async (_req, res) => {
    try {
      logger.debug('[Vision API]', 'GET /api/vision/report');
      const { visionErrorLogger } = await import("./bot/vision-error-logger");
      const report = visionErrorLogger.generateReport();
      logger.info('[Vision API]', 'Génération du rapport d\'erreurs de vision.');
      res.type("text/plain").send(report);
    } catch (error: any) {
      logger.error('[Vision API]', 'Erreur lors de la génération du rapport d\'erreurs de vision', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to generate vision report" });
    }
  });

  app.post("/api/vision/export", async (_req, res) => {
    try {
      logger.debug('[Vision API]', 'POST /api/vision/export');
      const { visionErrorLogger } = await import("./bot/vision-error-logger");
      const includeScreenshots = _req.body.includeScreenshots === true;
      const log = visionErrorLogger.exportErrorLog(includeScreenshots);
      logger.info('[Vision API]', `Exportation du journal d'erreurs de vision${includeScreenshots ? ' avec captures d\'écran' : ''}.`);
      res.type("application/json").send(log);
    } catch (error: any) {
      logger.error('[Vision API]', 'Erreur lors de l\'exportation du journal d\'erreurs de vision', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to export vision error log" });
    }
  });

  app.post("/api/vision/clear", async (_req, res) => {
    try {
      logger.debug('[Vision API]', 'POST /api/vision/clear');
      const { visionErrorLogger } = await import("./bot/vision-error-logger");
      visionErrorLogger.clearErrors();
      logger.info('[Vision API]', 'Erreurs de vision effacées.');
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[Vision API]', 'Erreur lors de l\'effacement des erreurs de vision', { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Failed to clear vision errors" });
    }
  });

  // Replay Viewer routes
  // Range Updater Routes
  app.get("/api/ranges/status", async (_req, res) => {
  try {
    logger.debug('[Range API]', 'GET /api/ranges/status');
    const { getRangeUpdater } = await import("./bot/range-updater");
    const updater = getRangeUpdater();
    const status = updater.getStatus();
    logger.info('[Range API]', 'Statut du Range Updater renvoyé.');
    res.json(status);
  } catch (error: any) {
    logger.error('[Range API]', 'Erreur lors de la récupération du statut du Range Updater', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ranges/update", async (_req, res) => {
  try {
    logger.debug('[Range API]', 'POST /api/ranges/update');
    const { getRangeUpdater } = await import("./bot/range-updater");
    const updater = getRangeUpdater();
    await updater.forceUpdate();
    logger.info('[Range API]', 'Mise à jour forcée des ranges effectuée.');
    res.json({ success: true, message: "Range update completed" });
  } catch (error: any) {
    logger.error('[Range API]', 'Erreur lors de la mise à jour forcée des ranges', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ranges/sources", async (req, res) => {
  try {
    logger.debug('[Range API]', 'POST /api/ranges/sources');
    const { getRangeUpdater } = await import("./bot/range-updater");
    const updater = getRangeUpdater();
    const source = req.body;
    updater.addSource(source);
    logger.info('[Range API]', 'Source ajoutée au Range Updater.', { source });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('[Range API]', 'Erreur lors de l\'ajout d\'une source au Range Updater', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/ranges/sources/:name", async (req, res) => {
  try {
    logger.debug('[Range API]', 'DELETE /api/ranges/sources/:name', { name: req.params.name });
    const { getRangeUpdater } = await import("./bot/range-updater");
    const updater = getRangeUpdater();
    updater.removeSource(req.params.name);
    logger.info('[Range API]', `Source '${req.params.name}' retirée du Range Updater.`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('[Range API]', `Erreur lors du retrait de la source '${req.params.name}' du Range Updater`, { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ranges/sources", async (_req, res) => {
  try {
    logger.debug('[Range API]', 'GET /api/ranges/sources');
    const { getRangeUpdater } = await import("./bot/range-updater");
    const updater = getRangeUpdater();
    const sources = updater.getSources();
    logger.info('[Range API]', `Liste des ${sources.length} sources du Range Updater renvoyée.`);
    res.json({ sources });
  } catch (error: any) {
    logger.error('[Range API]', 'Erreur lors de la récupération des sources du Range Updater', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/replay/sessions", async (_req, res) => {
  try {
    logger.debug('[Replay API]', 'GET /api/replay/sessions');
    const sessions = await storage.getAllBotSessions();
    logger.info('[Replay API]', `Récupération de ${sessions.length} sessions de replay.`);
    res.json({ sessions });
  } catch (error: any) {
    console.error("Error fetching replay sessions:", error);
    logger.error('[Replay API]', 'Erreur lors de la récupération des sessions de replay', { error: error.message, stack: error.stack });
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

app.get("/api/replay/session/:sessionId", async (req, res) => {
  try {
    logger.debug('[Replay API]', 'GET /api/replay/session/:sessionId', { sessionId: req.params.sessionId });
    const { getDebugReplaySystem } = await import("./bot/debug-replay");
    const replaySystem = getDebugReplaySystem();
    const frames = await replaySystem.loadSession(req.params.sessionId);
    logger.info('[Replay API]', `Chargement de ${frames.length} frames pour la session de replay ${req.params.sessionId}.`);
    res.json({ frames });
  } catch (error: any) {
    console.error("Error loading replay session:", error);
    logger.error('[Replay API]', `Erreur lors du chargement de la session de replay ${req.params.sessionId}`, { error: error.message, stack: error.stack });
    res.status(500).json({ error: "Failed to load session" });
  }
});

app.get("/api/replay/analytics/:sessionId", async (req, res) => {
  try {
    logger.debug('[Replay API]', 'GET /api/replay/analytics/:sessionId', { sessionId: req.params.sessionId });
    const { getReplayViewer } = await import("./bot/replay-viewer");
    const viewer = getReplayViewer();
    await viewer.loadSession(req.params.sessionId);
    const analytics = await viewer.analyzeSession();
    logger.info('[Replay API]', `Analyse de la session de replay ${req.params.sessionId} terminée.`);
    res.json(analytics);
  } catch (error: any) {
    console.error("Error analyzing replay:", error);
    logger.error('[Replay API]', `Erreur lors de l'analyse de la session de replay ${req.params.sessionId}`, { error: error.message, stack: error.stack });
    res.status(500).json({ error: "Failed to analyze session" });
  }
  });
}

async function handleWebSocketMessage(
  ws: WebSocket, 
  message: WebSocketMessage, 
  currentDeviceId: string
): Promise<{ newDeviceId?: string } | void> {
  const tableManager = getTableManager();
  const platformManager = getPlatformManager();

  switch (message.type) {
    case "ping":
      logger.debug('[WebSocket]', 'Received PING from device', { deviceId: currentDeviceId });
      if (connectedDevices.has(currentDeviceId)) {
        const device = connectedDevices.get(currentDeviceId)!;
        device.lastPing = new Date();
      }
      ws.send(JSON.stringify({ type: "pong", payload: { timestamp: Date.now() } }));
      break;

    case "device_register": {
      const { deviceType, deviceName } = message.payload || {};
      const deviceId = message.payload?.deviceId || currentDeviceId;
      logger.info('[WebSocket]', 'Device registration requested', { deviceId, deviceType, deviceName, fromTempId: currentDeviceId });

      const device: ConnectedDevice = {
        ws,
        deviceId,
        deviceType: deviceType || "unknown",
        deviceName: deviceName || `Device ${deviceId.slice(-6)}`,
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      connectedDevices.set(deviceId, device);
      console.log(`Device enregistré: ${device.deviceName} (${deviceType}) - ${deviceId}`);

      ws.send(JSON.stringify({
        type: "device_registered",
        payload: {
          deviceId,
          deviceType: device.deviceType,
          deviceName: device.deviceName,
        }
      }));

      broadcastToDevices({
        type: "device_connected",
        payload: {
          deviceId,
          deviceType: device.deviceType,
          deviceName: device.deviceName,
          connectedDevices: getConnectedDevicesInfo(),
        }
      }, deviceId);

      return { newDeviceId: deviceId };
    }

    case "get_state":
      logger.debug('[WebSocket]', 'Received GET_STATE request', { deviceId: currentDeviceId });
      ws.send(JSON.stringify({
        type: "state",
        payload: {
          tables: tableManager.getAllTableStates(),
          stats: tableManager.getStats(),
          humanizerSettings: getHumanizer().getSettings(),
          autoPlayEnabled,
          platformStatus: platformManager.getStatus(),
          connectedDevices: getConnectedDevicesInfo(),
        }
      }));
      break;

    case "toggle_auto_play": {
      const newState = message.payload?.enabled;
      const previousState = autoPlayEnabled;
      logger.info('[WebSocket]', `Toggle auto-play requested`, { deviceId: currentDeviceId, newState });

      if (typeof newState === "boolean") {
        autoPlayEnabled = newState;
      } else {
        autoPlayEnabled = !autoPlayEnabled;
      }

      console.log(`Auto-play ${autoPlayEnabled ? "activé" : "désactivé"} par ${currentDeviceId}`);

      if (autoPlayEnabled !== previousState) {
        try {
          if (autoPlayEnabled) {
            await platformManager.resume();
          } else {
            await platformManager.pause();
          }
        } catch (error) {
          console.error("Erreur changement auto-play:", error);
          logger.error('[WebSocket]', 'Error changing auto-play state via platform manager', { error: error.message });
        }
      }

      broadcastToClients({
        type: "auto_play_changed",
        payload: {
          enabled: autoPlayEnabled,
          changedBy: currentDeviceId,
          timestamp: Date.now(),
        }
      });
      logger.info('[WebSocket]', `Auto-play state changed to ${autoPlayEnabled}`);
      break;
    }

    case "request_logs": {
      const limit = message.payload?.limit || 50;
      logger.debug('[WebSocket]', 'Received LOGS request', { deviceId: currentDeviceId, limit });
      try {
        const logs = await storage.getRecentActionLogs(limit);
        ws.send(JSON.stringify({
          type: "logs_response",
          payload: { logs }
        }));
        logger.info('[WebSocket]', `Sent ${logs.length} logs in response to request.`);
      } catch (error) {
        logger.error('[WebSocket]', 'Error retrieving logs for WebSocket request', { error: error.message });
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Erreur récupération logs" }
        }));
      }
      break;
    }

    case "request_session_state": {
      logger.debug('[WebSocket]', 'Received SESSION_STATE request', { deviceId: currentDeviceId });
      try {
        const session = await storage.getActiveBotSession();
        const stats = tableManager.getStats();
        const tables = tableManager.getAllTableStates();

        const response = {
          session,
          stats,
          tables,
          autoPlayEnabled,
          platformStatus: platformManager.getStatus(),
          connectedDevices: getConnectedDevicesInfo(),
        };
        ws.send(JSON.stringify({
          type: "session_state",
          payload: response
        }));
        logger.info('[WebSocket]', 'Sent session state response.');
      } catch (error) {
        logger.error('[WebSocket]', 'Error retrieving session state for WebSocket request', { error: error.message });
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Erreur récupération session" }
        }));
      }
      break;
    }

    case "get_devices":
      logger.debug('[WebSocket]', 'Received GET_DEVICES request', { deviceId: currentDeviceId });
      const deviceList = getConnectedDevicesInfo();
      ws.send(JSON.stringify({
        type: "devices_list",
        payload: {
          devices: deviceList,
          count: connectedDevices.size,
        }
      }));
      logger.info('[WebSocket]', `Sent list of ${deviceList.length} connected devices.`);
      break;

    case "subscribe_table":
      logger.debug('[WebSocket]', 'Received SUBSCRIBE_TABLE message', { deviceId: currentDeviceId, payload: message.payload });
      // TODO: Implement table subscription logic
      break;

    case "unsubscribe_table":
      logger.debug('[WebSocket]', 'Received UNSUBSCRIBE_TABLE message', { deviceId: currentDeviceId, payload: message.payload });
      // TODO: Implement table unsubscription logic
      break;

    default:
      logger.warning('[WebSocket]', 'Received unknown message type', { deviceId: currentDeviceId, messageType: message.type });
      ws.send(JSON.stringify({ type: "error", payload: { message: `Type de message inconnu: ${message.type}` } }));
  }
}