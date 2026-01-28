import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlatformAccountSchema, insertBotSessionSchema, insertActionLogSchema } from "@shared/schema";

export function registerRoutes(app: Express): Server {
  // Platform Accounts
  app.get("/api/platform-accounts", async (_req, res) => {
    const accounts = await storage.getPlatformAccounts();
    res.json(accounts);
  });

  app.post("/api/platform-accounts", async (req, res) => {
    const result = insertPlatformAccountSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const account = await storage.createPlatformAccount(result.data);
    await storage.appendLog({
      logType: "INFO",
      message: `Account created for ${account.platformName}: ${account.username}`,
      sessionId: null,
      tableId: null,
      metadata: { accountId: account.id }
    });
    res.json(account);
  });

  // Bot Sessions
  app.get("/api/session/current", async (_req, res) => {
    const session = await storage.getCurrentSession();
    res.json(session);
  });

  app.post("/api/session/start", async (req, res) => {
    const result = insertBotSessionSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const session = await storage.startSession(result.data);
    await storage.appendLog({
      logType: "INFO",
      message: "Session started manually",
      sessionId: session.id,
      tableId: null,
      metadata: { sessionId: session.id }
    });
    res.json(session);
  });

  app.post("/api/session/stop/:id", async (req, res) => {
    await storage.stopSession(req.params.id);
    await storage.appendLog({
      logType: "INFO",
      message: "Session stopped manually",
      sessionId: req.params.id,
      tableId: null,
      metadata: { sessionId: req.params.id }
    });
    res.sendStatus(200);
  });

  // Logging
  app.post("/api/logs", async (req, res) => {
    const result = insertActionLogSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const log = await storage.appendLog(result.data);
    res.json(log);
  });

  const httpServer = createServer(app);
  return httpServer;
}
