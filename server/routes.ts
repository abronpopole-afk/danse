import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { getTableManager, TableEvent, TableState } from "./bot/table-manager";
import { getGtoAdapter, initializeGtoAdapter } from "./bot/gto-engine";
import { getHumanizer, updateHumanizerFromConfig } from "./bot/humanizer";
import { insertHumanizerConfigSchema, insertGtoConfigSchema, insertPlatformConfigSchema } from "@shared/schema";
import { z } from "zod";

interface WebSocketMessage {
  type: string;
  payload?: any;
}

const connectedClients: Set<WebSocket> = new Set();

function broadcastToClients(message: WebSocketMessage): void {
  const messageStr = JSON.stringify(message);
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  wss.on("connection", (ws) => {
    connectedClients.add(ws);
    console.log("Client WebSocket connecté");
    
    ws.send(JSON.stringify({
      type: "connected",
      payload: { message: "Connexion établie au serveur GTO Bot" }
    }));
    
    const tableManager = getTableManager();
    ws.send(JSON.stringify({
      type: "initial_state",
      payload: {
        tables: tableManager.getAllTableStates(),
        stats: tableManager.getStats(),
        humanizerSettings: getHumanizer().getSettings(),
      }
    }));
    
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        await handleWebSocketMessage(ws, message);
      } catch (error) {
        console.error("Erreur WebSocket:", error);
        ws.send(JSON.stringify({ type: "error", payload: { message: "Message invalide" } }));
      }
    });
    
    ws.on("close", () => {
      connectedClients.delete(ws);
      console.log("Client WebSocket déconnecté");
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

  return httpServer;
}

async function handleWebSocketMessage(ws: WebSocket, message: WebSocketMessage): Promise<void> {
  const tableManager = getTableManager();
  
  switch (message.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong", payload: { timestamp: Date.now() } }));
      break;
      
    case "get_state":
      ws.send(JSON.stringify({
        type: "state",
        payload: {
          tables: tableManager.getAllTableStates(),
          stats: tableManager.getStats(),
          humanizerSettings: getHumanizer().getSettings(),
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
