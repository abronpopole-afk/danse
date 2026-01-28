import { db } from "./db";
import { 
  platformAccounts, type PlatformAccount, type InsertPlatformAccount,
  botSessions, type BotSession, type InsertBotSession,
  actionLogs, type ActionLog, type InsertActionLog
} from "../shared/schema";
import { eq, desc } from "drizzle-orm";
import fs from "fs";
import path from "path";

const LOG_DIR = "C:\\Users\\adria\\AppData\\Roaming\\GTO Poker Bot\\logs";

function ensureLogDir() {
  if (process.platform === "win32") {
    if (!fs.existsSync(LOG_DIR)) {
      try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      } catch (e) {
        console.error("Failed to create log directory:", e);
      }
    }
  }
}

export interface IStorage {
  // Platform Accounts
  getPlatformAccounts(): Promise<PlatformAccount[]>;
  createPlatformAccount(account: InsertPlatformAccount): Promise<PlatformAccount>;
  
  // Bot Sessions
  getCurrentSession(): Promise<BotSession | null>;
  startSession(session: InsertBotSession): Promise<BotSession>;
  stopSession(id: string): Promise<void>;
  
  // Logging
  appendLog(log: InsertActionLog): Promise<ActionLog>;
}

export class DatabaseStorage implements IStorage {
  async getPlatformAccounts(): Promise<PlatformAccount[]> {
    console.log("[DB] Selecting platform accounts...");
    try {
      const results = await db.select().from(platformAccounts);
      console.log(`[DB] Selected ${results.length} accounts`);
      return results;
    } catch (e) {
      console.error("[DB ERROR] getPlatformAccounts:", e);
      throw e;
    }
  }

  async createPlatformAccount(account: InsertPlatformAccount): Promise<PlatformAccount> {
    console.log("[DB] [CREATE_ACCOUNT] Attempting to insert into platform_accounts:", account.username);
    try {
      const [newAccount] = await db.insert(platformAccounts).values(account).returning();
      console.log("[DB] [CREATE_ACCOUNT] Successfully inserted account ID:", newAccount.id);
      
      await this.appendLog({
        logType: "INFO",
        message: `PLATFORM ACCOUNT PERSISTED: ${newAccount.username} on ${newAccount.platformName}`,
        sessionId: null,
        tableId: null,
        metadata: { dbId: newAccount.id }
      });
      
      return newAccount;
    } catch (e) {
      console.error("[DB ERROR] [CREATE_ACCOUNT] Failed to insert account:", e);
      throw e;
    }
  }

  async getCurrentSession(): Promise<BotSession | null> {
    console.log("[DB] Fetching active session...");
    try {
      const [session] = await db
        .select()
        .from(botSessions)
        .where(eq(botSessions.status, "active"))
        .orderBy(desc(botSessions.startedAt))
        .limit(1);
      
      if (session) {
        console.log("[DB] Found active session:", session.id);
      } else {
        console.log("[DB] No active session found in database");
      }
      return session || null;
    } catch (e) {
      console.error("[DB ERROR] getCurrentSession:", e);
      throw e;
    }
  }

  async startSession(session: InsertBotSession): Promise<BotSession> {
    console.log("[DB] [START_SESSION] Starting new session...");
    try {
      // Ensure no other active session exists
      await db.update(botSessions)
        .set({ status: "stopped", stoppedAt: new Date() })
        .where(eq(botSessions.status, "active"));

      const [newSession] = await db.insert(botSessions).values({
        ...session,
        status: "active",
        startedAt: new Date()
      }).returning();
      
      console.log("[DB] [START_SESSION] Session created with ID:", newSession.id);
      
      await this.appendLog({
        logType: "INFO",
        message: `SESSION STARTED: ${newSession.id}`,
        sessionId: newSession.id,
        tableId: null,
        metadata: { status: "active", startedAt: newSession.startedAt }
      });

      return newSession;
    } catch (e) {
      console.error("[DB ERROR] [START_SESSION] Failed to create session:", e);
      throw e;
    }
  }

  async stopSession(id: string): Promise<void> {
    console.log(`[DB] [STOP_SESSION] Attempting to stop session: ${id}`);
    try {
      await db
        .update(botSessions)
        .set({ status: "stopped", stoppedAt: new Date() })
        .where(eq(botSessions.id, id));
      
      await this.appendLog({
        logType: "WARN",
        message: `Session ${id} marked as stopped in database`,
        sessionId: id,
        tableId: null,
        metadata: { action: "stop_session", timestamp: new Date().toISOString() }
      });
      console.log(`[DB] [STOP_SESSION] Session ${id} successfully stopped`);
    } catch (e) {
      console.error(`[DB ERROR] [STOP_SESSION] Failed to stop session ${id}:`, e);
      await this.appendLog({
        logType: "ERROR",
        message: `CRITICAL: Failed to stop session ${id}: ${e instanceof Error ? e.message : String(e)}`,
        sessionId: id,
        tableId: null,
        metadata: { error: String(e) }
      });
      throw e;
    }
  }

  async appendLog(log: InsertActionLog): Promise<ActionLog> {
    const [newLog] = await db.insert(actionLogs).values(log).returning();
    
    // Console logging for debugging in Replit
    console.log(`[LOG] [${log.logType}] ${log.message}`, log.metadata);

    // File logging
    if (process.env.NODE_ENV !== 'test') {
      ensureLogDir();
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toISOString().split('T')[1].split('.')[0];
      
      const logLine = `[${dateStr} ${timeStr}] [${log.logType}] ${log.message} ${log.metadata ? JSON.stringify(log.metadata) : ''}\n`;

      // CRITICAL: Force write to the specific Windows path requested by user if on Windows
      // In Replit (Linux), we use the fallback but log the intention
      const primaryLogDir = "C:\\Users\\adria\\AppData\\Roaming\\GTO Poker Bot\\logs";
      const fallbackLogDir = "/tmp/gto_logs";
      
      const targetDir = process.platform === "win32" ? primaryLogDir : fallbackLogDir;

      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const logFile = path.join(targetDir, `gto_poker_bot_${dateStr}.log`);
        fs.appendFileSync(logFile, logLine);
      } catch (e) {
        console.error(`[CRITICAL LOG ERROR] Failed to write to ${targetDir}:`, e);
      }
    }

    return newLog;
  }
}

export const storage = new DatabaseStorage();
