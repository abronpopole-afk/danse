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
  humanizerConfig, gtoConfig, platformConfig, actionLogs, botStats, playerProfileState
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

  getPlayerProfileState(): Promise<any>;
  savePlayerProfileState(state: any): Promise<any>;
  updatePlayerProfileState(state: any): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  constructor(private db: any, private schema: any) {} // Added db and schema as parameters

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(this.schema.users).where(eq(this.schema.users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(this.schema.users).where(eq(this.schema.users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(this.schema.users).values(insertUser).returning();
    return result[0];
  }

  async createBotSession(session: InsertBotSession): Promise<BotSession> {
    const result = await this.db.insert(this.schema.botSessions).values(session).returning();
    return result[0];
  }

  async getBotSession(id: string): Promise<BotSession | undefined> {
    const result = await this.db.select().from(this.schema.botSessions).where(eq(this.schema.botSessions.id, id));
    return result[0];
  }

  async getActiveBotSession(): Promise<BotSession | undefined> {
    const result = await this.db.select().from(this.schema.botSessions)
      .where(eq(this.schema.botSessions.status, "running"))
      .orderBy(desc(this.schema.botSessions.startedAt))
      .limit(1);
    return result[0];
  }

  async updateBotSession(id: string, updates: Partial<BotSession>): Promise<BotSession | undefined> {
    const result = await this.db.update(this.schema.botSessions)
      .set(updates)
      .where(eq(this.schema.botSessions.id, id))
      .returning();
    return result[0];
  }

  async getAllBotSessions(): Promise<BotSession[]> {
    return await this.db.select().from(this.schema.botSessions).orderBy(desc(this.schema.botSessions.startedAt));
  }

  async createPokerTable(table: InsertPokerTable): Promise<PokerTable> {
    const result = await this.db.insert(this.schema.pokerTables).values(table).returning();
    return result[0];
  }

  async getPokerTable(id: string): Promise<PokerTable | undefined> {
    const result = await this.db.select().from(this.schema.pokerTables).where(eq(this.schema.pokerTables.id, id));
    return result[0];
  }

  async getTablesBySession(sessionId: string): Promise<PokerTable[]> {
    return await this.db.select().from(this.schema.pokerTables)
      .where(eq(this.schema.pokerTables.sessionId, sessionId))
      .orderBy(desc(this.schema.pokerTables.createdAt));
  }

  async updatePokerTable(id: string, updates: Partial<PokerTable>): Promise<PokerTable | undefined> {
    const result = await this.db.update(this.schema.pokerTables)
      .set(updates)
      .where(eq(this.schema.pokerTables.id, id))
      .returning();
    return result[0];
  }

  async deletePokerTable(id: string): Promise<void> {
    await this.db.delete(this.schema.pokerTables).where(eq(this.schema.pokerTables.id, id));
  }

  async createHandHistory(hand: InsertHandHistory): Promise<HandHistory> {
    const result = await this.db.insert(this.schema.handHistories).values(hand).returning();
    return result[0];
  }

  async getHandHistoriesBySession(sessionId: string): Promise<HandHistory[]> {
    return await this.db.select().from(this.schema.handHistories)
      .where(eq(this.schema.handHistories.sessionId, sessionId))
      .orderBy(desc(this.schema.handHistories.playedAt));
  }

  async getHandHistoriesByTable(tableId: string): Promise<HandHistory[]> {
    return await this.db.select().from(this.schema.handHistories)
      .where(eq(this.schema.handHistories.tableId, tableId))
      .orderBy(desc(this.schema.handHistories.playedAt));
  }

  async getRecentHandHistories(limit: number = 20): Promise<HandHistory[]> {
    return this.db
      .select()
      .from(this.schema.handHistories)
      .orderBy(desc(this.schema.handHistories.createdAt))
      .limit(limit);
  }

  async getPlayerProfileState(): Promise<any> {
    const result = await this.db
      .select()
      .from(this.schema.playerProfileState)
      .orderBy(desc(this.schema.playerProfileState.updatedAt))
      .limit(1);
    return result[0] || null;
  }

  async savePlayerProfileState(state: any): Promise<any> {
    const [saved] = await this.db
      .insert(this.schema.playerProfileState)
      .values({
        personality: state.personality,
        tiltLevel: state.tiltLevel,
        fatigueLevel: state.fatigueLevel,
        sessionDuration: state.sessionDuration,
        recentBadBeats: state.recentBadBeats,
        consecutiveLosses: state.consecutiveLosses,
        consecutiveWins: state.consecutiveWins,
        lastBigWin: state.lastBigWin,
        lastBigLoss: state.lastBigLoss,
        sessionStartTime: new Date(Date.now() - state.sessionDuration * 60000),
      })
      .returning();
    return saved;
  }

  async updatePlayerProfileState(state: any): Promise<any> {
    const existing = await this.getPlayerProfileState();
    if (!existing) {
      return this.savePlayerProfileState(state);
    }

    const [updated] = await this.db
      .update(this.schema.playerProfileState)
      .set({
        personality: state.personality,
        tiltLevel: state.tiltLevel,
        fatigueLevel: state.fatigueLevel,
        sessionDuration: state.sessionDuration,
        recentBadBeats: state.recentBadBeats,
        consecutiveLosses: state.consecutiveLosses,
        consecutiveWins: state.consecutiveWins,
        lastBigWin: state.lastBigWin,
        lastBigLoss: state.lastBigLoss,
        updatedAt: new Date(),
      })
      .where(eq(this.schema.playerProfileState.id, existing.id))
      .returning();
    return updated;
  }

  async getHumanizerConfig(): Promise<HumanizerConfig | undefined> {
    const result = await this.db.select().from(this.schema.humanizerConfig).limit(1);
    return result[0];
  }

  async updateHumanizerConfig(updates: Partial<HumanizerConfig>): Promise<HumanizerConfig> {
    const existing = await this.getHumanizerConfig();
    if (!existing) {
      return this.createDefaultHumanizerConfig();
    }
    const result = await this.db.update(this.schema.humanizerConfig)
      .set(updates)
      .where(eq(this.schema.humanizerConfig.id, existing.id))
      .returning();
    return result[0];
  }

  async createDefaultHumanizerConfig(): Promise<HumanizerConfig> {
    const result = await this.db.insert(this.schema.humanizerConfig).values({}).returning();
    return result[0];
  }

  async getGtoConfig(): Promise<GtoConfig | undefined> {
    const result = await this.db.select().from(this.schema.gtoConfig).limit(1);
    return result[0];
  }

  async updateGtoConfig(updates: Partial<GtoConfig>): Promise<GtoConfig> {
    const existing = await this.getGtoConfig();
    if (!existing) {
      return this.createDefaultGtoConfig();
    }
    const result = await this.db.update(this.schema.gtoConfig)
      .set(updates)
      .where(eq(this.schema.gtoConfig.id, existing.id))
      .returning();
    return result[0];
  }

  async createDefaultGtoConfig(): Promise<GtoConfig> {
    const result = await this.db.insert(this.schema.gtoConfig).values({}).returning();
    return result[0];
  }

  async getPlatformConfig(): Promise<PlatformConfig | undefined> {
    const result = await this.db.select().from(this.schema.platformConfig).limit(1);
    return result[0];
  }

  async updatePlatformConfig(updates: Partial<PlatformConfig>): Promise<PlatformConfig> {
    const existing = await this.getPlatformConfig();
    if (!existing) {
      return this.createPlatformConfig({ platformName: "unknown", ...updates } as InsertPlatformConfig);
    }
    const result = await this.db.update(this.schema.platformConfig)
      .set(updates)
      .where(eq(this.schema.platformConfig.id, existing.id))
      .returning();
    return result[0];
  }

  async createPlatformConfig(config: InsertPlatformConfig): Promise<PlatformConfig> {
    const result = await this.db.insert(this.schema.platformConfig).values(config).returning();
    return result[0];
  }

  async createActionLog(log: InsertActionLog): Promise<ActionLog> {
    const result = await this.db.insert(this.schema.actionLogs).values(log).returning();
    return result[0];
  }

  async getActionLogsBySession(sessionId: string): Promise<ActionLog[]> {
    return await this.db.select().from(this.schema.actionLogs)
      .where(eq(this.schema.actionLogs.sessionId, sessionId))
      .orderBy(desc(this.schema.actionLogs.createdAt));
  }

  async getRecentActionLogs(limit: number): Promise<ActionLog[]> {
    return await this.db.select().from(this.schema.actionLogs)
      .orderBy(desc(this.schema.actionLogs.createdAt))
      .limit(limit);
  }

  async getBotStats(sessionId: string): Promise<BotStats | undefined> {
    const result = await this.db.select().from(this.schema.botStats)
      .where(eq(this.schema.botStats.sessionId, sessionId));
    return result[0];
  }

  async updateBotStats(sessionId: string, updates: Partial<BotStats>): Promise<BotStats> {
    const existing = await this.getBotStats(sessionId);
    if (!existing) {
      return this.createBotStats({ sessionId, ...updates } as InsertBotStats);
    }
    const result = await this.db.update(this.schema.botStats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(this.schema.botStats.sessionId, sessionId))
      .returning();
    return result[0];
  }

  async createBotStats(stats: InsertBotStats): Promise<BotStats> {
    const result = await this.db.insert(this.schema.botStats).values(stats).returning();
    return result[0];
  }
}

export const storage = new DatabaseStorage(db, {
  users,
  botSessions,
  pokerTables,
  handHistories,
  humanizerConfig,
  gtoConfig,
  platformConfig,
  actionLogs,
  botStats,
  playerProfileState // Assuming playerProfileState is defined in @shared/schema
});