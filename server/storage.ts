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
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

function deepMerge(target: any, source: any): any {
  if (source === null || source === undefined) {
    return target;
  }
  if (target === null || target === undefined) {
    return source;
  }
  if (typeof source !== 'object' || typeof target !== 'object') {
    return source;
  }
  if (Array.isArray(source)) {
    return source;
  }
  
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

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
    logger.debug('[Storage]', 'Recherche utilisateur par username', { username });
    const result = await this.db.select().from(this.schema.users).where(eq(this.schema.users.username, username));
    if (result[0]) {
      logger.info('[Storage]', '✅ Utilisateur trouvé', { 
        username,
        userId: result[0].id 
      });
    } else {
      logger.warning('[Storage]', '⚠️ Utilisateur non trouvé', { username });
    }
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    logger.info('[Storage]', 'Création nouvel utilisateur', { username: insertUser.username });
    const result = await this.db.insert(this.schema.users).values(insertUser).returning();
    logger.session('[Storage]', '✅ Utilisateur créé avec succès', { 
      userId: result[0].id,
      username: result[0].username 
    });
    return result[0];
  }

  async createBotSession(session: InsertBotSession): Promise<BotSession> {
    logger.info('[Storage]', 'Création nouvelle session bot', { 
      userId: session.userId,
      platform: session.platform 
    });
    const result = await this.db.insert(this.schema.botSessions).values(session).returning();
    logger.session('[Storage]', '✅ Session bot créée', { 
      sessionId: result[0].id,
      status: result[0].status 
    });
    return result[0];
  }

  async getBotSession(id: string): Promise<BotSession | undefined> {
    logger.debug('[Storage]', 'Récupération session bot', { sessionId: id });
    const result = await this.db.select().from(this.schema.botSessions).where(eq(this.schema.botSessions.id, id));
    if (result[0]) {
      logger.info('[Storage]', '✅ Session trouvée', { 
        sessionId: id,
        status: result[0].status 
      });
    } else {
      logger.warning('[Storage]', '⚠️ Session non trouvée', { sessionId: id });
    }
    return result[0];
  }

  async getActiveBotSession(): Promise<BotSession | undefined> {
    logger.debug('[Storage]', 'Recherche session active...');
    const result = await this.db.select().from(this.schema.botSessions)
      .where(eq(this.schema.botSessions.status, "running"))
      .orderBy(desc(this.schema.botSessions.startedAt))
      .limit(1);
    if (result[0]) {
      logger.session('[Storage]', '✅ Session active trouvée', { 
        sessionId: result[0].id,
        startedAt: result[0].startedAt 
      });
    } else {
      logger.info('[Storage]', 'ℹ️ Aucune session active');
    }
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
    logger.debug('[Storage]', 'Récupération tables pour session', { sessionId });
    const tables = await this.db.select().from(this.schema.pokerTables)
      .where(eq(this.schema.pokerTables.sessionId, sessionId))
      .orderBy(desc(this.schema.pokerTables.createdAt));
    logger.info('[Storage]', '✅ Tables récupérées', { 
      sessionId,
      tableCount: tables.length,
      tables: tables.map(t => ({ id: t.id, name: t.tableName, status: t.status }))
    });
    return tables;
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
    logger.debug('[Storage]', 'Récupération configuration plateforme...');
    const result = await this.db.select().from(this.schema.platformConfig).limit(1);
    if (result[0]) {
      // Auto-fix: mapper les noms de plateforme incorrects vers le nom canonique
      const platformNameMap: Record<string, string> = {
        "ggpoker": "ggclub",
        "gg poker": "ggclub",
        "gg-poker": "ggclub",
      };
      
      const currentName = result[0].platformName?.toLowerCase();
      if (currentName && platformNameMap[currentName]) {
        const correctName = platformNameMap[currentName];
        logger.warning('[Storage]', `⚠️ Auto-fix: platformName ${result[0].platformName} -> ${correctName}`);
        
        // Corriger dans la base de données
        await this.db.update(this.schema.platformConfig)
          .set({ platformName: correctName })
          .where(eq(this.schema.platformConfig.id, result[0].id));
        
        result[0].platformName = correctName;
        logger.session('[Storage]', `✅ PlatformName corrigé en base: ${correctName}`);
      }
      
      logger.info('[Storage]', '✅ Config plateforme trouvée', { 
        platform: result[0].platformName,
        enabled: result[0].enabled,
        connectionStatus: result[0].connectionStatus 
      });
    } else {
      logger.warning('[Storage]', '⚠️ Aucune config plateforme');
    }
    return result[0];
  }

  async updatePlatformConfig(updates: Partial<PlatformConfig>): Promise<PlatformConfig> {
    logger.info('[Storage]', 'Mise à jour config plateforme', { 
      platform: updates.platformName,
      updates: Object.keys(updates) 
    });
    const existing = await this.getPlatformConfig();
    if (!existing) {
      logger.warning('[Storage]', 'Config non existante, création...');
      const platformName = updates.platformName || "unknown";
      const username = updates.username || null;
      
      // Générer accountId basé sur username@platform ou un ID unique
      const accountId = username && platformName 
        ? `${username}@${platformName}`
        : `account_${Date.now()}`;
      
      const newConfig = await this.createPlatformConfig({ 
        platformName,
        username,
        accountId,
        enabled: updates.enabled ?? false,
        connectionStatus: updates.connectionStatus || "disconnected",
        settings: updates.settings || null,
      } as InsertPlatformConfig);
      
      logger.session('[Storage]', '✅ Config plateforme créée', {
        id: newConfig.id,
        platform: newConfig.platformName,
        username: newConfig.username,
        accountId: newConfig.accountId
      });
      
      return newConfig;
    }
    
    const mergedUpdates: Partial<PlatformConfig> = {};
    if (updates.platformName !== undefined) mergedUpdates.platformName = updates.platformName;
    if (updates.username !== undefined) mergedUpdates.username = updates.username;
    if (updates.enabled !== undefined) mergedUpdates.enabled = updates.enabled;
    if (updates.connectionStatus !== undefined) mergedUpdates.connectionStatus = updates.connectionStatus;
    if (updates.lastConnectionAt !== undefined) mergedUpdates.lastConnectionAt = updates.lastConnectionAt;
    
    if (updates.settings !== undefined) {
      const existingSettings = existing.settings || {};
      const newSettings = updates.settings || {};
      mergedUpdates.settings = deepMerge(existingSettings, newSettings);
    }
    
    if (Object.keys(mergedUpdates).length === 0) {
      return existing;
    }
    
    const result = await this.db.update(this.schema.platformConfig)
      .set(mergedUpdates)
      .where(eq(this.schema.platformConfig.id, existing.id))
      .returning();
    
    logger.session('[Storage]', '✅ Config plateforme mise à jour', {
      id: result[0].id,
      platform: result[0].platformName,
      username: result[0].username
    });
    
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
  playerProfileState
});