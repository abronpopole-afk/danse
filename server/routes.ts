
import { getEventBus } from "./bot/event-bus";

import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { getTableManager, TableEvent, TableState } from "./bot/table-manager";
import { getGtoAdapter, initializeGtoAdapter } from "./bot/gto-engine";
import { getHumanizer, updateHumanizerFromConfig } from "./bot/humanizer";
import { getPlatformManager, getSupportedPlatforms, PlatformManagerConfig } from "./bot/platform-manager";
import { getTaskScheduler } from "./bot/task-scheduler";
import { insertHumanizerConfigSchema, insertGtoConfigSchema, insertPlatformConfigSchema } from "@shared/schema";
import { z } from "zod";

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
    connectedClients.add(ws);
    
    const tempDeviceId = generateDeviceId();
    let currentDeviceId = tempDeviceId;
    
    console.log(`Client WebSocket connecté (temp: ${tempDeviceId})`);

    const tableManager = getTableManager();
    const platformManager = getPlatformManager();

    ws.send(JSON.stringify({
      type: "connected",
      payload: { 
        message: "Connexion établie au serveur GTO Bot",
        tempDeviceId,
        autoPlayEnabled,
        connectedDevices: getConnectedDevicesInfo(),
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
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
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

  app.post("/api/session/start", async (req, res) => {
    try {
      const existingSession = await storage.getActiveBotSession();
      if (existingSession) {
        return res.status(400).json({ error: "Une session est déjà active" });
      }

      const session = await storage.createBotSession({
        status: "running",
        startedAt: new Date(),
      });

      tableManager.setSessionId(session.id);

      await storage.createBotStats({
        sessionId: session.id,
      });

      await storage.createActionLog({
        sessionId: session.id,
        logType: "info",
        message: "Session démarrée",
      });

      broadcastToClients({
        type: "session_started",
        payload: { sessionId: session.id }
      });

      res.json({ success: true, session });
    } catch (error: any) {
      console.error("Erreur démarrage session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/session/stop", async (req, res) => {
    try {
      const session = await storage.getActiveBotSession();
      if (!session) {
        return res.status(400).json({ error: "Aucune session active" });
      }

      await tableManager.stopAll();

      const stats = tableManager.getStats();

      await storage.updateBotSession(session.id, {
        status: "stopped",
        stoppedAt: new Date(),
        totalProfit: stats.totalProfit,
        handsPlayed: stats.totalHandsPlayed,
      });

      await storage.createActionLog({
        sessionId: session.id,
        logType: "info",
        message: "Session arrêtée",
        metadata: stats,
      });

      broadcastToClients({
        type: "session_stopped",
        payload: { sessionId: session.id, stats }
      });

      res.json({ success: true, stats });
    } catch (error: any) {
      console.error("Erreur arrêt session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/session/current", async (req, res) => {
    try {
      const session = await storage.getActiveBotSession();
      const stats = tableManager.getStats();
      const tables = tableManager.getAllTableStates();

      res.json({ session, stats, tables });
    } catch (error: any) {
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
      let config = await storage.getGtoConfig();
      if (!config) {
        config = await storage.createDefaultGtoConfig();
      }

      const gtoAdapter = getGtoAdapter();

      res.json({ 
        config,
        connected: gtoAdapter.isConnected(),
        usingSimulation: config.fallbackToSimulation || !config.apiKey
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/gto-config", async (req, res) => {
    try {
      const updates = req.body;

      const config = await storage.updateGtoConfig(updates);

      await initializeGtoAdapter({
        apiEndpoint: config.apiEndpoint ?? undefined,
        apiKey: config.apiKey ?? undefined,
        useSimulation: config.fallbackToSimulation ?? true,
      });

      broadcastToClients({
        type: "gto_config_updated",
        payload: { config }
      });

      res.json({ success: true, config });
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
      const config = await storage.updatePlatformConfig(updates);

      broadcastToClients({
        type: "platform_config_updated",
        payload: { config }
      });

      res.json({ success: true, config });
    } catch (error: any) {
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
        return res.status(400).json({ 
          error: "Validation échouée", 
          details: parseResult.error.errors 
        });
      }

      const { platformName, username, password, autoReconnect, enableAutoAction } = parseResult.data;

      const supportedPlatforms = getSupportedPlatforms();
      if (!supportedPlatforms.includes(platformName.toLowerCase())) {
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
        await storage.updatePlatformConfig({
          platformName,
          username,
          enabled: true,
          connectionStatus: "connected",
          lastConnectionAt: new Date(),
        });

        broadcastToClients({
          type: "platform_connected",
          payload: { platformName, status: platformManager.getStatus() }
        });
      }

      res.json({ 
        success: connected, 
        status: platformManager.getStatus(),
        message: connected ? "Connexion réussie" : "Échec de la connexion"
      });
    } catch (error: any) {
      console.error("Erreur connexion plateforme:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/disconnect", async (req, res) => {
    try {
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

      res.json({ success: true, status: platformManager.getStatus() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/pause", async (req, res) => {
    try {
      const platformManager = getPlatformManager();
      await platformManager.pause();

      broadcastToClients({
        type: "platform_paused",
        payload: { status: platformManager.getStatus() }
      });

      res.json({ success: true, status: platformManager.getStatus() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/resume", async (req, res) => {
    try {
      const platformManager = getPlatformManager();
      await platformManager.resume();

      broadcastToClients({
        type: "platform_resumed",
        payload: { status: platformManager.getStatus() }
      });

      res.json({ success: true, status: platformManager.getStatus() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/platform/action", async (req, res) => {
    try {
      const parseResult = platformActionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Validation échouée", 
          details: parseResult.error.errors 
        });
      }

      const { windowHandle, action, amount } = parseResult.data;

      const platformManager = getPlatformManager();

      if (platformManager.getStatus() !== "running") {
        return res.status(400).json({ 
          error: "Plateforme non connectée ou en pause",
          status: platformManager.getStatus()
        });
      }

      const managedTable = platformManager.getTableByWindowHandle(windowHandle);
      if (!managedTable) {
        return res.status(404).json({ 
          error: `Table avec windowHandle ${windowHandle} non trouvée`,
          availableTables: platformManager.getManagedTables().map(t => ({
            windowHandle: t.windowHandle,
            tableId: t.tableSession.getId()
          }))
        });
      }

      await platformManager.manualAction(windowHandle, action, amount);

      res.json({ success: true, message: "Action en file d'attente" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/platform/anti-detection", async (req, res) => {
    try {
      const parseResult = antiDetectionConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Validation échouée", 
          details: parseResult.error.errors 
        });
      }

      const updates = parseResult.data;

      const platformManager = getPlatformManager();
      const adapter = platformManager.getAdapter();

      if (!adapter) {
        return res.status(400).json({ error: "Aucun adaptateur de plateforme initialisé" });
      }

      platformManager.updateAntiDetectionConfig(updates);

      broadcastToClients({
        type: "anti_detection_updated",
        payload: { config: adapter.getAntiDetectionConfig() }
      });

      res.json({ 
        success: true, 
        config: adapter.getAntiDetectionConfig()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const platformManager = getPlatformManager();

  platformManager.on("statusChange", (status) => {
    broadcastToClients({ type: "platform_status_change", payload: { status } });
  });

  platformManager.on("tableAdded", (data) => {
    broadcastToClients({ type: "platform_table_added", payload: data });
  });

  platformManager.on("tableRemoved", (data) => {
    broadcastToClients({ type: "platform_table_removed", payload: data });
  });

  platformManager.on("actionQueued", (data) => {
    broadcastToClients({ type: "platform_action_queued", payload: data });
  });

  platformManager.on("actionExecuted", (data) => {
    broadcastToClients({ type: "platform_action_executed", payload: data });
  });

  platformManager.on("warning", (data) => {
    broadcastToClients({ type: "platform_warning", payload: data });
  });

  platformManager.on("emergencyPause", (data) => {
    broadcastToClients({ type: "platform_emergency_pause", payload: data });
  });

  platformManager.on("banned", (data) => {
    broadcastToClients({ type: "platform_banned", payload: data });
  });

  platformManager.on("platformEvent", (event) => {
    broadcastToClients({ type: "platform_event", payload: event });
  });

  app.get("/api/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getRecentActionLogs(limit);
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stats", async (req, res) => {
    try {
      const session = await storage.getActiveBotSession();
      const tableStats = tableManager.getStats();

      let dbStats = null;
      if (session) {
        dbStats = await storage.getBotStats(session.id);
      }

      res.json({
        session,
        tableStats,
        dbStats,
        humanizerSettings: getHumanizer().getSettings(),
        gtoConnected: getGtoAdapter().isConnected(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/hand-histories", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const histories = await storage.getRecentHandHistories(limit);
      res.json({ histories });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/simulate/hand", async (req, res) => {
    try {
      const { heroCards, communityCards, position, potSize, facingBet, numPlayers } = req.body;

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

      const humanizer = getHumanizer();
      const humanizedAction = humanizer.humanizeAction(
        recommendation.bestAction,
        0.5,
        recommendation.confidence < 0.7
      );

      res.json({
        recommendation,
        humanizedAction,
        simulatedDelay: humanizedAction.delay,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Safe Mode Routes
  app.get("/api/safe-mode", async (req, res) => {
    try {
      const { getSafeModeManager } = await import("./bot/safe-mode");
      const safeModeManager = getSafeModeManager();
      
      res.json({
        currentMode: safeModeManager.getCurrentMode(),
        config: safeModeManager.getConfig(),
        description: safeModeManager.getModeDescription(),
        history: safeModeManager.getHistory().slice(-10),
      });
    } catch (error) {
      console.error("Error getting safe mode:", error);
      res.status(500).json({ error: "Failed to get safe mode" });
    }
  });

  app.post("/api/safe-mode/config", async (req, res) => {
    try {
      const { getSafeModeManager } = await import("./bot/safe-mode");
      const safeModeManager = getSafeModeManager();
      
      safeModeManager.updateConfig(req.body);
      
      res.json({
        success: true,
        config: safeModeManager.getConfig(),
      });
    } catch (error) {
      console.error("Error updating safe mode config:", error);
      res.status(500).json({ error: "Failed to update safe mode config" });
    }
  });

  app.post("/api/safe-mode/reset", async (req, res) => {
    try {
      const { getSafeModeManager } = await import("./bot/safe-mode");
      const safeModeManager = getSafeModeManager();
      
      safeModeManager.reset();
      
      res.json({
        success: true,
        currentMode: safeModeManager.getCurrentMode(),
      });
    } catch (error) {
      console.error("Error resetting safe mode:", error);
      res.status(500).json({ error: "Failed to reset safe mode" });
    }
  });

  // Player Profile Routes
  app.get("/api/player-profile", async (req, res) => {
    try {
      const { getPlayerProfile } = await import("./bot/player-profile");
      const profile = getPlayerProfile();

      res.json({
        state: profile.getState(),
        config: profile.getConfig(),
        modifiers: profile.getModifiers(),
      });
    } catch (error) {
      console.error("Error getting player profile:", error);
      res.status(500).json({ error: "Failed to get player profile" });
    }
  });

  app.post("/api/player-profile/personality", async (req, res) => {
    try {
      const { personality } = req.body;
      const { getPlayerProfile } = await import("./bot/player-profile");
      const profile = getPlayerProfile();

      profile.updatePersonality(personality);

      res.json({
        state: profile.getState(),
        config: profile.getConfig(),
      });
    } catch (error) {
      console.error("Error updating personality:", error);
      res.status(500).json({ error: "Failed to update personality" });
    }
  });

  app.post("/api/player-profile/reset", async (req, res) => {
    try {
      const { getPlayerProfile } = await import("./bot/player-profile");
      const profile = getPlayerProfile();

      profile.reset();

      res.json({
        state: profile.getState(),
        message: "Profile reset successfully",
      });
    } catch (error) {
      console.error("Error resetting profile:", error);
      res.status(500).json({ error: "Failed to reset profile" });
    }
  });

  // Task Scheduler Stats
  app.get("/api/scheduler/stats", async (_req, res) => {
    try {
      const scheduler = getTaskScheduler();
      const stats = {
        system: scheduler.getSystemStats(),
        tasks: scheduler.getAllTasks().map(t => ({
          id: t.id,
          name: t.name,
          priority: t.priority,
          enabled: t.enabled,
          isRunning: t.isRunning,
          runCount: t.runCount,
          errorCount: t.errorCount,
          avgExecutionTime: Math.round(t.avgExecutionTime),
          maxExecutionTime: t.maxExecutionTime,
          nextRunIn: Math.max(0, t.nextRunIn - Date.now()),
        })),
      };
      res.json(stats);
    } catch (error) {
      console.error("Error fetching scheduler stats:", error);
      res.status(500).json({ error: "Failed to fetch scheduler stats" });
    }
  });

  // Auto-Calibration Stats
  app.get("/api/calibration/auto-stats", async (_req, res) => {
    try {
      const { getAutoCalibrationManager } = await import("./bot/auto-calibration");
      const autoCalibration = getAutoCalibrationManager();
      const stats = autoCalibration.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching auto-calibration stats:", error);
      res.status(500).json({ error: "Failed to fetch auto-calibration stats" });
    }
  });

  app.get("/api/state-confidence/:windowHandle", async (req, res) => {
    try {
      const { getStateConfidenceAnalyzer } = await import("./bot/state-confidence");
      const analyzer = getStateConfidenceAnalyzer();
      const windowHandle = parseInt(req.params.windowHandle);

      const stats = analyzer.getStats(windowHandle);
      const uncertainStates = analyzer.getUncertainStates(windowHandle);

      res.json({
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
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/state-confidence/config", async (req, res) => {
    try {
      const { getStateConfidenceAnalyzer } = await import("./bot/state-confidence");
      const analyzer = getStateConfidenceAnalyzer();

      analyzer.updateConfig(req.body);

      res.json({ success: true, config: req.body });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // OCR Error Correction Stats
  app.get("/api/ocr-correction/stats", (_req, res) => {
    try {
      const { ocrErrorCorrector } = require("./bot/ocr-error-correction");
      const stats = ocrErrorCorrector.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting OCR correction stats:", error);
      res.status(500).json({ error: "Failed to get OCR correction stats" });
    }
  });

  // Event Bus Stats
  app.get("/api/event-bus/stats", async (_req, res) => {
    try {
      const eventBus = getEventBus();
      const streamInfo = await eventBus.getStreamInfo();
      const pendingCount = await eventBus.getPendingCount();
      
      res.json({
        streamInfo,
        pendingCount,
        isConsuming: eventBus.listenerCount("processed") > 0,
      });
    } catch (error) {
      console.error("Error getting event bus stats:", error);
      res.status(500).json({ error: "Failed to get event bus stats" });
    }
  });

  app.post("/api/event-bus/trim", async (req, res) => {
    try {
      const { maxLength = 10000 } = req.body;
      const eventBus = getEventBus();
      
      await eventBus.trimStream(maxLength);
      
      res.json({ success: true, message: `Stream trimmed to ${maxLength} events` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== REMOTE CONTROL API FOR MULTI-DEVICE SYNC =====
  
  app.get("/api/remote/status", async (_req, res) => {
    try {
      const session = await storage.getActiveBotSession();
      const stats = tableManager.getStats();
      const platformManager = getPlatformManager();
      
      res.json({
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
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/remote/auto-play", async (req, res) => {
    try {
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
      
      res.json({
        success: true,
        autoPlayEnabled,
        platformStatus: platformManager.getStatus(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/remote/devices", async (_req, res) => {
    try {
      res.json({
        devices: getConnectedDevicesInfo(),
        count: connectedDevices.size,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/remote/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getRecentActionLogs(limit);
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
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
      if (connectedDevices.has(currentDeviceId)) {
        const device = connectedDevices.get(currentDeviceId)!;
        device.lastPing = new Date();
      }
      ws.send(JSON.stringify({ type: "pong", payload: { timestamp: Date.now() } }));
      break;

    case "device_register": {
      const { deviceType, deviceName } = message.payload || {};
      const deviceId = message.payload?.deviceId || currentDeviceId;
      
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
      
      break;
    }

    case "request_logs": {
      const limit = message.payload?.limit || 50;
      try {
        const logs = await storage.getRecentActionLogs(limit);
        ws.send(JSON.stringify({
          type: "logs_response",
          payload: { logs }
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Erreur récupération logs" }
        }));
      }
      break;
    }

    case "request_session_state": {
      try {
        const session = await storage.getActiveBotSession();
        const stats = tableManager.getStats();
        const tables = tableManager.getAllTableStates();
        
        ws.send(JSON.stringify({
          type: "session_state",
          payload: {
            session,
            stats,
            tables,
            autoPlayEnabled,
            platformStatus: platformManager.getStatus(),
            connectedDevices: getConnectedDevicesInfo(),
          }
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Erreur récupération session" }
        }));
      }
      break;
    }

    case "get_devices":
      ws.send(JSON.stringify({
        type: "devices_list",
        payload: {
          devices: getConnectedDevicesInfo(),
          count: connectedDevices.size,
        }
      }));
      break;

    case "subscribe_table":
      break;

    case "unsubscribe_table":
      break;

    default:
      ws.send(JSON.stringify({ type: "error", payload: { message: `Type de message inconnu: ${message.type}` } }));
  }
}
