import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, real, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const botSessions = pgTable("bot_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("stopped"),
  startedAt: timestamp("started_at"),
  stoppedAt: timestamp("stopped_at"),
  totalProfit: real("total_profit").default(0),
  handsPlayed: integer("hands_played").default(0),
  tablesActive: integer("tables_active").default(0),
});

export const insertBotSessionSchema = createInsertSchema(botSessions).omit({ id: true });
export type InsertBotSession = z.infer<typeof insertBotSessionSchema>;
export type BotSession = typeof botSessions.$inferSelect;

export const pokerTables = pgTable("poker_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => botSessions.id),
  tableIdentifier: text("table_identifier").notNull(),
  tableName: text("table_name").notNull(),
  stakes: text("stakes").notNull(),
  status: text("status").notNull().default("waiting"),
  heroPosition: integer("hero_position"),
  heroStack: real("hero_stack"),
  currentPot: real("current_pot").default(0),
  heroCards: text("hero_cards").array(),
  communityCards: text("community_cards").array(),
  currentStreet: text("current_street").default("preflop"),
  playersData: jsonb("players_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPokerTableSchema = createInsertSchema(pokerTables).omit({ id: true, createdAt: true });
export type InsertPokerTable = z.infer<typeof insertPokerTableSchema>;
export type PokerTable = typeof pokerTables.$inferSelect;

export const handHistories = pgTable("hand_histories", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id").references(() => botSessions.id),
  handNumber: text("hand_number").notNull(),
  heroCards: text("hero_cards").array(),
  communityCards: text("community_cards").array(),
  heroPosition: text("hero_position"),
  actions: jsonb("actions"),
  gtoRecommendation: jsonb("gto_recommendation"),
  actualAction: text("actual_action"),
  result: real("result"),
  evDifference: real("ev_difference"),
  playedAt: timestamp("played_at").defaultNow(),
});

export const insertHandHistorySchema = createInsertSchema(handHistories).omit({ id: true, playedAt: true });
export type InsertHandHistory = z.infer<typeof insertHandHistorySchema>;
export type HandHistory = typeof handHistories.$inferSelect;

export const humanizerConfig = pgTable("humanizer_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  minDelayMs: integer("min_delay_ms").notNull().default(1500),
  maxDelayMs: integer("max_delay_ms").notNull().default(4200),
  enableBezierMouse: boolean("enable_bezier_mouse").notNull().default(true),
  enableMisclicks: boolean("enable_misclicks").notNull().default(false),
  misclickProbability: real("misclick_probability").default(0.0001),
  enableRandomFolds: boolean("enable_random_folds").notNull().default(false),
  randomFoldProbability: real("random_fold_probability").default(0.001),
  thinkingTimeVariance: real("thinking_time_variance").default(0.3),
  preActionDelay: integer("pre_action_delay").default(500),
  postActionDelay: integer("post_action_delay").default(300),
  stealthModeEnabled: boolean("stealth_mode_enabled").notNull().default(true),
});

export const insertHumanizerConfigSchema = createInsertSchema(humanizerConfig).omit({ id: true });
export type InsertHumanizerConfig = z.infer<typeof insertHumanizerConfigSchema>;
export type HumanizerConfig = typeof humanizerConfig.$inferSelect;

export const gtoConfig = pgTable("gto_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiEndpoint: text("api_endpoint"),
  apiKey: text("api_key"),
  enabled: boolean("enabled").notNull().default(false),
  fallbackToSimulation: boolean("fallback_to_simulation").notNull().default(true),
  cacheEnabled: boolean("cache_enabled").notNull().default(true),
  maxCacheAge: integer("max_cache_age").default(3600),
});

export const insertGtoConfigSchema = createInsertSchema(gtoConfig).omit({ id: true });
export type InsertGtoConfig = z.infer<typeof insertGtoConfigSchema>;
export type GtoConfig = typeof gtoConfig.$inferSelect;

export const platformConfig = pgTable("platform_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platformName: text("platform_name").notNull(),
  username: text("username"),
  enabled: boolean("enabled").notNull().default(false),
  connectionStatus: text("connection_status").default("disconnected"),
  lastConnectionAt: timestamp("last_connection_at"),
  settings: jsonb("settings"),
});

export const insertPlatformConfigSchema = createInsertSchema(platformConfig).omit({ id: true });
export type InsertPlatformConfig = z.infer<typeof insertPlatformConfigSchema>;
export type PlatformConfig = typeof platformConfig.$inferSelect;

export const actionLogs = pgTable("action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => botSessions.id),
  tableId: varchar("table_id").references(() => pokerTables.id),
  logType: text("log_type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActionLogSchema = createInsertSchema(actionLogs).omit({ id: true, createdAt: true });
export type InsertActionLog = z.infer<typeof insertActionLogSchema>;
export type ActionLog = typeof actionLogs.$inferSelect;

export const botStats = pgTable("bot_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => botSessions.id),
  handsPerHour: integer("hands_per_hour").default(0),
  bbPer100: real("bb_per_100").default(0),
  gtoPrecision: real("gto_precision").default(0),
  vpip: real("vpip").default(0),
  pfr: real("pfr").default(0),
  aggression: real("aggression").default(0),
  winRate: real("win_rate").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBotStatsSchema = createInsertSchema(botStats).omit({ id: true, updatedAt: true });
export type InsertBotStats = z.infer<typeof insertBotStatsSchema>;
export type BotStats = typeof botStats.$inferSelect;

export const playerProfileState = pgTable("player_profile_state", {
  id: serial("id").primaryKey(),
  personality: text("personality").notNull().default("balanced"),
  tiltLevel: real("tilt_level").notNull().default(0),
  fatigueLevel: real("fatigue_level").notNull().default(0),
  sessionDuration: real("session_duration").notNull().default(0),
  recentBadBeats: integer("recent_bad_beats").notNull().default(0),
  consecutiveLosses: integer("consecutive_losses").notNull().default(0),
  consecutiveWins: integer("consecutive_wins").notNull().default(0),
  lastBigWin: real("last_big_win").notNull().default(0),
  lastBigLoss: real("last_big_loss").notNull().default(0),
  sessionStartTime: timestamp("session_start_time").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlayerProfileStateSchema = createInsertSchema(playerProfileState).omit({ id: true, sessionStartTime: true, updatedAt: true });
export type PlayerProfileState = typeof playerProfileState.$inferSelect;
export type InsertPlayerProfileState = z.infer<typeof insertPlayerProfileStateSchema>;

export const gtoRecommendationSchema = z.object({
  actions: z.array(z.object({
    action: z.string(),
    probability: z.number(),
    ev: z.number().optional(),
  })),
  bestAction: z.string(),
  confidence: z.number(),
});

export type GtoRecommendation = z.infer<typeof gtoRecommendationSchema>;

export const playerDataSchema = z.object({
  position: z.number(),
  name: z.string(),
  stack: z.number(),
  cards: z.array(z.string()).optional(),
  isActive: z.boolean(),
  isFolded: z.boolean(),
  currentBet: z.number().optional(),
});

export type PlayerData = z.infer<typeof playerDataSchema>;

export const safeModeConfigSchema = z.object({
  mode: z.enum(["normal", "conservative", "freeze"]),
  suspicionThreshold: z.object({
    conservative: z.number().min(0).max(1),
    freeze: z.number().min(0).max(1),
  }),
  conservativeSettings: z.object({
    foldBorderlineHands: z.boolean(),
    noRoboticRaises: z.boolean(),
    minDelayMs: z.number().min(500),
    maxDelayMs: z.number().min(1000),
    maxActiveTables: z.number().min(1).max(24),
  }),
  freezeSettings: z.object({
    disableAutoActions: z.boolean(),
    continueReading: z.boolean(),
    continueStats: z.boolean(),
    alertUser: z.boolean(),
  }),
});

export type SafeModeConfig = z.infer<typeof safeModeConfigSchema>;

export const playerProfileStateSchema = insertPlayerProfileStateSchema.extend({
});