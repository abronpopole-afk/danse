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
    console.log("[DB] Inserting platform account:", account.username);
    try {
      const [newAccount] = await db.insert(platformAccounts).values(account).returning();
      console.log("[DB] Inserted account ID:", newAccount.id);
      return newAccount;
    } catch (e) {
      console.error("[DB ERROR] createPlatformAccount:", e);
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
    console.log("[DB] Starting new session...");
    try {
      const [newSession] = await db.insert(botSessions).values({
        ...session,
        status: "active",
        startedAt: new Date()
      }).returning();
      console.log("[DB] Session created:", newSession.id);
      return newSession;
    } catch (e) {
      console.error("[DB ERROR] startSession:", e);
      throw e;
    }
  }

  async stopSession(id: string): Promise<void> {
    console.log(`[DB] Stopping session: ${id}`);
    try {
      await db
        .update(botSessions)
        .set({ status: "stopped", stoppedAt: new Date() })
        .where(eq(botSessions.id, id));
      console.log(`[DB] Session ${id} marked as stopped`);
    } catch (e) {
      console.error(`[DB ERROR] stopSession ${id}:`, e);
      throw e;
    }
  }

  async appendLog(log: InsertActionLog): Promise<ActionLog> {
    const [newLog] = await db.insert(actionLogs).values(log).returning();
    
    // Console logging for debugging in Replit
    console.log(`[LOG] ${log.logType}: ${log.message}`, log.metadata);

    // File logging
    if (process.env.NODE_ENV !== 'test') {
      ensureLogDir();
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toISOString().split('T')[1].split('.')[0];
      
      // We always attempt to write to the requested Windows path
      // but provide a fallback for the Replit environment
      const pathsToTry = [LOG_DIR];
      if (process.platform !== "win32") {
        pathsToTry.push("/tmp/gto_logs");
      }

      for (const logPath of pathsToTry) {
        try {
          if (!fs.existsSync(logPath)) {
            fs.mkdirSync(logPath, { recursive: true });
          }
          const logFile = path.join(logPath, `gto_poker_bot_${dateStr}.log`);
          const logLine = `[${dateStr} ${timeStr}] [${log.logType}] ${log.message} ${log.metadata ? JSON.stringify(log.metadata) : ''}\n`;
          fs.appendFileSync(logFile, logLine);
          // If we successfully wrote to one, we can stop if it's the primary one
          if (logPath === LOG_DIR) break; 
        } catch (e) {
          console.error(`Failed to write to log path ${logPath}:`, e);
        }
      }
    }

    return newLog;
  }
}

export const storage = new DatabaseStorage();
