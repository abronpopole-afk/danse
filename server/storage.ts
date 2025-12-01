import { 
  type User, type InsertUser,
  type BotSession, type InsertBotSession,
  type PokerTable, type InsertPokerTable,
  type HandHistory, type InsertHandHistory,
  type HumanizerConfig, type InsertHumanizerConfig,
  type GtoConfig, type InsertGtoConfig,
  type PlatformConfig, type InsertPlatformConfig,
  type ActionLog, type InsertActionLog,
  type BotStats, type InsertBotStats,
  users, botSessions, pokerTables, handHistories,
  humanizerConfig, gtoConfig, platformConfig, actionLogs, botStats
} from "@shared/schema";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, desc } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createBotSession(session: InsertBotSession): Promise<BotSession>;
  getBotSession(id: string): Promise<BotSession | undefined>;
  getActiveBotSession(): Promise<BotSession | undefined>;
  updateBotSession(id: string, updates: Partial<BotSession>): Promise<BotSession | undefined>;
  getAllBotSessions(): Promise<BotSession[]>;
  
  createPokerTable(table: InsertPokerTable): Promise<PokerTable>;
  getPokerTable(id: string): Promise<PokerTable | undefined>;
  getTablesBySession(sessionId: string): Promise<PokerTable[]>;
  updatePokerTable(id: string, updates: Partial<PokerTable>): Promise<PokerTable | undefined>;
  deletePokerTable(id: string): Promise<void>;
  
  createHandHistory(hand: InsertHandHistory): Promise<HandHistory>;
  getHandHistoriesBySession(sessionId: string): Promise<HandHistory[]>;
  getHandHistoriesByTable(tableId: string): Promise<HandHistory[]>;
  getRecentHandHistories(limit: number): Promise<HandHistory[]>;
  
  getHumanizerConfig(): Promise<HumanizerConfig | undefined>;
  updateHumanizerConfig(updates: Partial<HumanizerConfig>): Promise<HumanizerConfig>;
  createDefaultHumanizerConfig(): Promise<HumanizerConfig>;
  
  getGtoConfig(): Promise<GtoConfig | undefined>;
  updateGtoConfig(updates: Partial<GtoConfig>): Promise<GtoConfig>;
  createDefaultGtoConfig(): Promise<GtoConfig>;
  
  getPlatformConfig(): Promise<PlatformConfig | undefined>;
  updatePlatformConfig(updates: Partial<PlatformConfig>): Promise<PlatformConfig>;
  createPlatformConfig(config: InsertPlatformConfig): Promise<PlatformConfig>;
  
  createActionLog(log: InsertActionLog): Promise<ActionLog>;
  getActionLogsBySession(sessionId: string): Promise<ActionLog[]>;
  getRecentActionLogs(limit: number): Promise<ActionLog[]>;
  
  getBotStats(sessionId: string): Promise<BotStats | undefined>;
  updateBotStats(sessionId: string, updates: Partial<BotStats>): Promise<BotStats>;
  createBotStats(stats: InsertBotStats): Promise<BotStats>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async createBotSession(session: InsertBotSession): Promise<BotSession> {
    const result = await db.insert(botSessions).values(session).returning();
    return result[0];
  }

  async getBotSession(id: string): Promise<BotSession | undefined> {
    const result = await db.select().from(botSessions).where(eq(botSessions.id, id));
    return result[0];
  }

  async getActiveBotSession(): Promise<BotSession | undefined> {
    const result = await db.select().from(botSessions)
      .where(eq(botSessions.status, "running"))
      .orderBy(desc(botSessions.startedAt))
      .limit(1);
    return result[0];
  }

  async updateBotSession(id: string, updates: Partial<BotSession>): Promise<BotSession | undefined> {
    const result = await db.update(botSessions)
      .set(updates)
      .where(eq(botSessions.id, id))
      .returning();
    return result[0];
  }

  async getAllBotSessions(): Promise<BotSession[]> {
    return await db.select().from(botSessions).orderBy(desc(botSessions.startedAt));
  }

  async createPokerTable(table: InsertPokerTable): Promise<PokerTable> {
    const result = await db.insert(pokerTables).values(table).returning();
    return result[0];
  }

  async getPokerTable(id: string): Promise<PokerTable | undefined> {
    const result = await db.select().from(pokerTables).where(eq(pokerTables.id, id));
    return result[0];
  }

  async getTablesBySession(sessionId: string): Promise<PokerTable[]> {
    return await db.select().from(pokerTables)
      .where(eq(pokerTables.sessionId, sessionId))
      .orderBy(desc(pokerTables.createdAt));
  }

  async updatePokerTable(id: string, updates: Partial<PokerTable>): Promise<PokerTable | undefined> {
    const result = await db.update(pokerTables)
      .set(updates)
      .where(eq(pokerTables.id, id))
      .returning();
    return result[0];
  }

  async deletePokerTable(id: string): Promise<void> {
    await db.delete(pokerTables).where(eq(pokerTables.id, id));
  }

  async createHandHistory(hand: InsertHandHistory): Promise<HandHistory> {
    const result = await db.insert(handHistories).values(hand).returning();
    return result[0];
  }

  async getHandHistoriesBySession(sessionId: string): Promise<HandHistory[]> {
    return await db.select().from(handHistories)
      .where(eq(handHistories.sessionId, sessionId))
      .orderBy(desc(handHistories.playedAt));
  }

  async getHandHistoriesByTable(tableId: string): Promise<HandHistory[]> {
    return await db.select().from(handHistories)
      .where(eq(handHistories.tableId, tableId))
      .orderBy(desc(handHistories.playedAt));
  }

  async getRecentHandHistories(limit: number): Promise<HandHistory[]> {
    return await db.select().from(handHistories)
      .orderBy(desc(handHistories.playedAt))
      .limit(limit);
  }

  async getHumanizerConfig(): Promise<HumanizerConfig | undefined> {
    const result = await db.select().from(humanizerConfig).limit(1);
    return result[0];
  }

  async updateHumanizerConfig(updates: Partial<HumanizerConfig>): Promise<HumanizerConfig> {
    const existing = await this.getHumanizerConfig();
    if (!existing) {
      return this.createDefaultHumanizerConfig();
    }
    const result = await db.update(humanizerConfig)
      .set(updates)
      .where(eq(humanizerConfig.id, existing.id))
      .returning();
    return result[0];
  }

  async createDefaultHumanizerConfig(): Promise<HumanizerConfig> {
    const result = await db.insert(humanizerConfig).values({}).returning();
    return result[0];
  }

  async getGtoConfig(): Promise<GtoConfig | undefined> {
    const result = await db.select().from(gtoConfig).limit(1);
    return result[0];
  }

  async updateGtoConfig(updates: Partial<GtoConfig>): Promise<GtoConfig> {
    const existing = await this.getGtoConfig();
    if (!existing) {
      return this.createDefaultGtoConfig();
    }
    const result = await db.update(gtoConfig)
      .set(updates)
      .where(eq(gtoConfig.id, existing.id))
      .returning();
    return result[0];
  }

  async createDefaultGtoConfig(): Promise<GtoConfig> {
    const result = await db.insert(gtoConfig).values({}).returning();
    return result[0];
  }

  async getPlatformConfig(): Promise<PlatformConfig | undefined> {
    const result = await db.select().from(platformConfig).limit(1);
    return result[0];
  }

  async updatePlatformConfig(updates: Partial<PlatformConfig>): Promise<PlatformConfig> {
    const existing = await this.getPlatformConfig();
    if (!existing) {
      return this.createPlatformConfig({ platformName: "unknown", ...updates } as InsertPlatformConfig);
    }
    const result = await db.update(platformConfig)
      .set(updates)
      .where(eq(platformConfig.id, existing.id))
      .returning();
    return result[0];
  }

  async createPlatformConfig(config: InsertPlatformConfig): Promise<PlatformConfig> {
    const result = await db.insert(platformConfig).values(config).returning();
    return result[0];
  }

  async createActionLog(log: InsertActionLog): Promise<ActionLog> {
    const result = await db.insert(actionLogs).values(log).returning();
    return result[0];
  }

  async getActionLogsBySession(sessionId: string): Promise<ActionLog[]> {
    return await db.select().from(actionLogs)
      .where(eq(actionLogs.sessionId, sessionId))
      .orderBy(desc(actionLogs.createdAt));
  }

  async getRecentActionLogs(limit: number): Promise<ActionLog[]> {
    return await db.select().from(actionLogs)
      .orderBy(desc(actionLogs.createdAt))
      .limit(limit);
  }

  async getBotStats(sessionId: string): Promise<BotStats | undefined> {
    const result = await db.select().from(botStats)
      .where(eq(botStats.sessionId, sessionId));
    return result[0];
  }

  async updateBotStats(sessionId: string, updates: Partial<BotStats>): Promise<BotStats> {
    const existing = await this.getBotStats(sessionId);
    if (!existing) {
      return this.createBotStats({ sessionId, ...updates } as InsertBotStats);
    }
    const result = await db.update(botStats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(botStats.sessionId, sessionId))
      .returning();
    return result[0];
  }

  async createBotStats(stats: InsertBotStats): Promise<BotStats> {
    const result = await db.insert(botStats).values(stats).returning();
    return result[0];
  }
}

export const storage = new DatabaseStorage();
