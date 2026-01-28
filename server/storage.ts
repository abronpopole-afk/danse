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
    return await db.select().from(platformAccounts);
  }

  async createPlatformAccount(account: InsertPlatformAccount): Promise<PlatformAccount> {
    const [newAccount] = await db.insert(platformAccounts).values(account).returning();
    return newAccount;
  }

  async getCurrentSession(): Promise<BotSession | null> {
    const [session] = await db
      .select()
      .from(botSessions)
      .where(eq(botSessions.status, "active"))
      .orderBy(desc(botSessions.startedAt))
      .limit(1);
    return session || null;
  }

  async startSession(session: InsertBotSession): Promise<BotSession> {
    const [newSession] = await db.insert(botSessions).values({
      ...session,
      status: "active",
      startedAt: new Date()
    }).returning();
    return newSession;
  }

  async stopSession(id: string): Promise<void> {
    await db
      .update(botSessions)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(botSessions.id, id));
  }

  async appendLog(log: InsertActionLog): Promise<ActionLog> {
    const [newLog] = await db.insert(actionLogs).values(log).returning();
    
    // File logging
    if (process.env.NODE_ENV !== 'test') {
      ensureLogDir();
      // Ensure path is properly handled for different OS during development
      let logPath = LOG_DIR;
      if (process.platform !== "win32") {
        logPath = "/tmp/gto_logs";
        if (!fs.existsSync(logPath)) fs.mkdirSync(logPath, { recursive: true });
      }

      const logFile = path.join(logPath, `log_${new Date().toISOString().split('T')[0]}.txt`);
      const logLine = `[${new Date().toISOString()}] [${log.logType}] ${log.message} ${log.metadata ? JSON.stringify(log.metadata) : ''}\n`;
      
      try {
        fs.appendFileSync(logFile, logLine);
      } catch (e) {
        console.error("Failed to write to log file:", e);
      }
    }

    return newLog;
  }
}

export const storage = new DatabaseStorage();
