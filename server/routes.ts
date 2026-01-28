import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlatformAccountSchema, insertBotSessionSchema, insertActionLogSchema } from "@shared/schema";

export function registerRoutes(app: Express): Server {
  // Platform Accounts
  app.get("/api/platform-accounts", async (_req, res) => {
    console.log("[API] Fetching platform accounts");
    try {
      const accounts = await storage.getPlatformAccounts();
      console.log(`[API] Found ${accounts.length} accounts`);
      res.json(accounts);
    } catch (e: any) {
      console.error("[API ERROR] getPlatformAccounts:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/platform-accounts", async (req, res) => {
    console.log("[API] Creating platform account:", req.body);
    const result = insertPlatformAccountSchema.safeParse(req.body);
    if (!result.success) {
      console.warn("[API] Validation failed:", result.error);
      return res.status(400).json({ error: result.error });
    }
    try {
      const account = await storage.createPlatformAccount(result.data);
      console.log("[API] Account created successfully:", account.id);
      await storage.appendLog({
        logType: "INFO",
        message: `Account created for ${account.platformName}: ${account.username}`,
        sessionId: null,
        tableId: null,
        metadata: { accountId: account.id }
      });
      res.json(account);
    } catch (e: any) {
      console.error("[API ERROR] createPlatformAccount:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Bot Sessions
  app.get("/api/session/current", async (_req, res) => {
    console.log("[API] Fetching current session");
    try {
      const session = await storage.getCurrentSession();
      console.log("[API] Current session:", session?.id || "none");
      
      // In mock-up style, we often return stats and tables with the session
      // to simplify frontend loading
      res.json({
        session: session || null,
        stats: session ? {
          totalTables: session.tablesActive || 0,
          activeTables: session.tablesActive || 0,
          totalHandsPlayed: session.handsPlayed || 0,
          totalProfit: session.totalProfit || 0
        } : null,
        tables: [] // Would normally fetch tables for this session
      });
    } catch (e: any) {
      console.error("[API ERROR] getCurrentSession:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/session/start", async (req, res) => {
    console.log("[API] Starting session requested");
    const result = insertBotSessionSchema.safeParse(req.body);
    if (!result.success) {
      console.warn("[API] Session validation failed:", result.error);
      return res.status(400).json({ error: result.error });
    }
    try {
      const session = await storage.startSession(result.data);
      console.log("[API] Session started:", session.id);
      await storage.appendLog({
        logType: "INFO",
        message: "Session started manually",
        sessionId: session.id,
        tableId: null,
        metadata: { sessionId: session.id }
      });
      res.json(session);
    } catch (e: any) {
      console.error("[API ERROR] startSession:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/session/stop/:id", async (req, res) => {
    console.log(`[API] Stopping session ${req.params.id}`);
    try {
      await storage.stopSession(req.params.id);
      await storage.appendLog({
        logType: "INFO",
        message: "Session stopped manually",
        sessionId: req.params.id,
        tableId: null,
        metadata: { sessionId: req.params.id }
      });
      console.log(`[API] Session ${req.params.id} stopped successfully`);
      res.json({ success: true });
    } catch (e: any) {
      console.error(`[API ERROR] stopSession ${req.params.id}:`, e);
      res.status(500).json({ error: e.message, success: false });
    }
  });

  // Logging
  app.post("/api/logs", async (req, res) => {
    console.log("[API] Incoming frontend log:", req.body.message);
    const result = insertActionLogSchema.safeParse(req.body);
    if (!result.success) {
      console.warn("[API] Log validation failed:", result.error);
      return res.status(400).json({ error: result.error });
    }
    try {
      const log = await storage.appendLog(result.data);
      res.json(log);
    } catch (e: any) {
      console.error("[API ERROR] appendLog:", e);
      res.status(500).json({ error: e.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
