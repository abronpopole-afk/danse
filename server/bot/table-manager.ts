import { EventEmitter } from "events";
import { PokerTable, PlayerData, GtoRecommendation } from "@shared/schema";
import { getGtoAdapter, HandContext } from "./gto-engine";
import { getHumanizer, HumanizedAction } from "./humanizer";
import { storage } from "../storage";

export type TableStatus = "waiting" | "playing" | "paused" | "error" | "disconnected";
export type Street = "preflop" | "flop" | "turn" | "river";

export interface TableState {
  id: string;
  tableIdentifier: string;
  tableName: string;
  stakes: string;
  status: TableStatus;
  heroPosition: number;
  heroStack: number;
  heroCards: string[];
  communityCards: string[];
  currentStreet: Street;
  currentPot: number;
  players: PlayerData[];
  isHeroTurn: boolean;
  facingBet: number;
  lastGtoRecommendation?: GtoRecommendation;
  lastHumanizedAction?: HumanizedAction;
  handsPlayed: number;
  sessionProfit: number;
}

export interface TableEvent {
  type: "state_update" | "action_required" | "hand_complete" | "error" | "connected" | "disconnected";
  tableId: string;
  data: any;
  timestamp: Date;
}

export class TableSession extends EventEmitter {
  private tableState: TableState;
  private isProcessingAction = false;
  private actionQueue: (() => Promise<void>)[] = [];
  private heartbeatInterval?: NodeJS.Timeout;
  private errorCount = 0;
  private maxErrors = 5;
  private lastActivityTime = Date.now();
  private responseTimeHistory: number[] = [];
  private avgResponseTime = 0;

  constructor(tableConfig: {
    id: string;
    tableIdentifier: string;
    tableName: string;
    stakes: string;
  }) {
    super();

    this.tableState = {
      id: tableConfig.id,
      tableIdentifier: tableConfig.tableIdentifier,
      tableName: tableConfig.tableName,
      stakes: tableConfig.stakes,
      status: "waiting",
      heroPosition: 0,
      heroStack: 0,
      heroCards: [],
      communityCards: [],
      currentStreet: "preflop",
      currentPot: 0,
      players: [],
      isHeroTurn: false,
      facingBet: 0,
      handsPlayed: 0,
      sessionProfit: 0,
    };
  }

  incrementError(): void {
    this.errorCount++;
    if (this.errorCount >= this.maxErrors) {
      this.updateState({ status: "error" });
      this.emit("maxErrorsReached", { tableId: this.tableState.id, errorCount: this.errorCount });
    }
  }

  resetErrors(): void {
    this.errorCount = 0;
  }

  updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  getTimeSinceLastActivity(): number {
    return Date.now() - this.lastActivityTime;
  }

  trackResponseTime(duration: number): void {
    this.responseTimeHistory.push(duration);
    if (this.responseTimeHistory.length > 20) {
      this.responseTimeHistory.shift();
    }
    this.avgResponseTime = this.responseTimeHistory.reduce((a, b) => a + b, 0) / this.responseTimeHistory.length;
  }

  getAverageResponseTime(): number {
    return this.avgResponseTime;
  }

  isHealthy(): boolean {
    return this.errorCount < this.maxErrors && 
           this.getTimeSinceLastActivity() < 300000 && // 5 min
           this.tableState.status !== "error";
  }

  getState(): TableState {
    return { ...this.tableState };
  }

  getId(): string {
    return this.tableState.id;
  }

  getStatus(): TableStatus {
    return this.tableState.status;
  }

  updateState(updates: Partial<TableState>): void {
    const oldStatus = this.tableState.status;
    this.tableState = { ...this.tableState, ...updates };
    this.emit("stateChange", this.tableState);
    this.emitTableEvent("state_update", this.tableState);

    // Persist state changes to database
    const dbUpdates: any = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.heroPosition !== undefined) dbUpdates.heroPosition = updates.heroPosition;
    if (updates.heroStack !== undefined) dbUpdates.heroStack = updates.heroStack;
    if (updates.currentPot !== undefined) dbUpdates.currentPot = updates.currentPot;
    if (updates.heroCards) dbUpdates.heroCards = updates.heroCards;
    if (updates.communityCards) dbUpdates.communityCards = updates.communityCards;
    if (updates.currentStreet) dbUpdates.currentStreet = updates.currentStreet;
    if (updates.players) dbUpdates.playersData = JSON.parse(JSON.stringify(updates.players));

    if (Object.keys(dbUpdates).length > 0) {
      storage.updatePokerTable(this.tableState.id, dbUpdates).catch((err: any) => {
        console.error(`[TableSession] Failed to persist state to DB for table ${this.tableState.id}:`, err);
      });
    }
  }

  private emitTableEvent(type: TableEvent["type"], data: any): void {
    const event: TableEvent = {
      type,
      tableId: this.tableState.id,
      data,
      timestamp: new Date(),
    };
    this.emit("tableEvent", event);
  }

  async start(): Promise<void> {
    this.updateState({ status: "playing" });
    this.startHeartbeat();
    this.emitTableEvent("connected", { tableId: this.tableState.id });

    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "info",
      message: `Table ${this.tableState.tableName} démarrée`,
      metadata: { stakes: this.tableState.stakes },
    });
  }

  async pause(): Promise<void> {
    this.updateState({ status: "paused" });
    this.stopHeartbeat();
  }

  async resume(): Promise<void> {
    this.updateState({ status: "playing" });
    this.startHeartbeat();
  }

  async stop(): Promise<void> {
    this.updateState({ status: "disconnected" });
    this.stopHeartbeat();
    this.emitTableEvent("disconnected", { tableId: this.tableState.id });

    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "info",
      message: `Table ${this.tableState.tableName} arrêtée`,
      metadata: { handsPlayed: this.tableState.handsPlayed, profit: this.tableState.sessionProfit },
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.emit("heartbeat", { tableId: this.tableState.id, timestamp: new Date() });
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  async processNewHand(data: {
    heroCards: string[];
    heroPosition: number;
    heroStack: number;
    players: PlayerData[];
    currentPot: number;
  }): Promise<void> {
    this.updateState({
      heroCards: data.heroCards,
      heroPosition: data.heroPosition,
      heroStack: data.heroStack,
      players: data.players,
      currentPot: data.currentPot,
      communityCards: [],
      currentStreet: "preflop",
      isHeroTurn: false,
      facingBet: 0,
    });

    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "info",
      message: `Nouvelle main: ${data.heroCards.join(" ")}`,
      metadata: { position: data.heroPosition, stack: data.heroStack },
    });
  }

  async processCommunityCards(cards: string[], street: Street): Promise<void> {
    this.updateState({
      communityCards: cards,
      currentStreet: street,
    });

    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "info",
      message: `${street.charAt(0).toUpperCase() + street.slice(1)}: ${cards.join(" ")}`,
    });
  }

  async processActionRequired(context: {
    potSize: number;
    facingBet: number;
    isInPosition: boolean;
    numPlayers: number;
  }): Promise<{ action: string; humanizedAction: HumanizedAction }> {
    const startTime = Date.now();
    this.updateActivity();
    this.updateState({ isHeroTurn: true, facingBet: context.facingBet, currentPot: context.potSize });

    try {
      const handContext: HandContext = {
      heroCards: this.tableState.heroCards,
      communityCards: this.tableState.communityCards,
      street: this.tableState.currentStreet,
      heroPosition: this.tableState.heroPosition.toString(),
      potSize: context.potSize,
      heroStack: this.tableState.heroStack,
      facingBet: context.facingBet,
      numPlayers: context.numPlayers,
      isInPosition: context.isInPosition,
    };

    const gtoAdapter = getGtoAdapter();
    const recommendation = await gtoAdapter.getRecommendation(handContext);

    this.updateState({ lastGtoRecommendation: recommendation });

    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "action",
      message: `GTO Wizard: ${recommendation.bestAction} (${Math.round(recommendation.confidence * 100)}%)`,
      metadata: { recommendation },
    });

    let selectedAction = this.selectAction(recommendation);

    const humanizer = getHumanizer();
    const handStrength = this.estimateHandStrength();
    
    // Dégrader la décision selon l'état émotionnel (tilt/fatigue)
    selectedAction = humanizer.getDegradedDecision(selectedAction, handStrength);
    const isStrongSpot = recommendation.confidence > 0.8 && context.facingBet < context.potSize * 0.5;

    // 1. Vérifier erreur intentionnelle (0.1-1%)
    const errorCheck = humanizer.shouldTriggerIntentionalError(handStrength);
    if (errorCheck.shouldError) {
      if (errorCheck.errorType === 'premature_fold' && handStrength > 0.8) {
        selectedAction = "FOLD";
        await storage.createActionLog({
          tableId: this.tableState.id,
          logType: "warning",
          message: `[Anti-Detection] Erreur humaine rare: fold premium hand (${(Math.random() * 0.9 + 0.1).toFixed(2)}%)`,
        });
      } else if (errorCheck.errorType === 'wrong_sizing') {
        // Sizing volontairement bizarre
        if (selectedAction.includes("BET") || selectedAction.includes("RAISE")) {
          const weirdSizing = [0.18, 0.23, 0.44, 0.88, 1.12, 1.33, 2.2, 2.75][Math.floor(Math.random() * 8)];
          selectedAction = selectedAction.includes("BET") 
            ? `BET ${Math.round(weirdSizing * 100)}%`
            : `RAISE ${Math.round(weirdSizing * 100)}%`;
          await storage.createActionLog({
            tableId: this.tableState.id,
            logType: "warning",
            message: `[Anti-Detection] Sizing imparfait intentionnel: ${weirdSizing}x pot`,
          });
        }
      } else if (errorCheck.errorType === 'wrong_action') {
        // Action incorrecte (check au lieu de bet)
        if (selectedAction.includes("BET")) {
          selectedAction = "CHECK";
          await storage.createActionLog({
            tableId: this.tableState.id,
            logType: "warning",
            message: `[Anti-Detection] Action incorrecte intentionnelle: check au lieu de bet`,
          });
        }
      }
    }

    // 2. Fold marginal dans strong spot (0.5%)
    if (humanizer.shouldFoldMarginalInStrongSpot(handStrength, isStrongSpot)) {
      selectedAction = "FOLD";
      await storage.createActionLog({
        tableId: this.tableState.id,
        logType: "warning",
        message: `[Anti-Detection] Fold conservateur main marginale en spot fort (0.5%)`,
      });
    }

    // 3. Vérifier fold aléatoire rare (tilt/fatigue)
    if (humanizer.shouldTriggerRandomFold() && handStrength < 0.6 && handStrength > 0.3) {
      selectedAction = "FOLD";
      await storage.createActionLog({
        tableId: this.tableState.id,
        logType: "warning",
        message: `[Anti-Detection] Fold aléatoire (fatigue/tilt)`,
      });
    }

    const isComplexDecision = recommendation.confidence < 0.7 || 
      recommendation.actions.filter(a => a.probability > 0.2).length > 2;

    const humanizedAction = humanizer.humanizeAction(
      selectedAction, 
      handStrength, 
      isComplexDecision,
      undefined,
      undefined,
      this.tableState.currentStreet,
      context.potSize
    );

    this.updateState({ lastHumanizedAction: humanizedAction });

    const processingTime = Date.now() - startTime;
    this.trackResponseTime(processingTime);
    this.resetErrors();

    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "warning",
      message: `Humanizer: Délai ${humanizedAction.delay}ms (traité en ${processingTime}ms)`,
      metadata: { thinkingPauses: humanizedAction.thinkingPauses, processingTime },
    });

    // Self-detection: enregistrer métriques
    const actionTime = Date.now() - startTime;
    const { getSelfDetectionAnalyzer } = await import("./self-detection");
    const detector = getSelfDetectionAnalyzer();

    const sizing = selectedAction.includes('%') 
      ? parseFloat(selectedAction.match(/(\d+)%/)?.[1] || '0') / 100 
      : 0;

    const wasGtoOptimal = recommendation.bestAction === selectedAction;
    const wasHumanError = humanizedAction.shouldMisclick || Math.random() < 0.01;

    detector.recordAction(actionTime, sizing, wasGtoOptimal, wasHumanError);

    // Alerter si patterns suspects
    if (detector.shouldTriggerAlert()) {
      const issues = detector.getCriticalIssues();
      console.warn('[TableManager] ⚠️  Suspicious patterns detected:', issues.map(i => i.description).join(', '));
    }

    return { action: selectedAction, humanizedAction };
    } catch (error) {
      this.incrementError();
      throw error;
    }
  }

  private selectAction(recommendation: GtoRecommendation): string {
    const random = Math.random();
    let cumulative = 0;

    for (const action of recommendation.actions) {
      cumulative += action.probability;
      if (random < cumulative) {
        return action.action;
      }
    }

    return recommendation.bestAction;
  }

  private estimateHandStrength(): number {
    return 0.5;
  }

  async executeAction(action: string): Promise<void> {
    this.updateState({ isHeroTurn: false });

    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "success",
      message: `Action exécutée: ${action}`,
    });
  }

  async processHandComplete(result: number): Promise<void> {
    this.updateState({
      handsPlayed: this.tableState.handsPlayed + 1,
      sessionProfit: this.tableState.sessionProfit + result,
      heroCards: [],
      communityCards: [],
      currentStreet: "preflop",
      isHeroTurn: false,
    });

    // Enregistrer l'action dans le profil pour tracking tilt/fatigue
    const { getPlayerProfile } = await import("./player-profile");
    const profile = getPlayerProfile();
    profile.recordAction(
      this.tableState.lastHumanizedAction?.action || "UNKNOWN",
      result,
      this.tableState.currentPot
    );

    // Simuler chat/notes (humanisation supplémentaire)
    const { getChatSimulator } = await import("./chat-simulator");
    const chatSim = getChatSimulator();

    let eventType: "hand_won" | "hand_lost" | "bad_beat" | undefined;
    if (result > 0) eventType = "hand_won";
    else if (result < -20) eventType = "bad_beat"; // Grosse perte
    else if (result < 0) eventType = "hand_lost";

    const chatMessage = chatSim.shouldSendChat({
      eventType,
      sessionDuration: (Date.now() - Date.now()) / 60000, // TODO: track réel
    });

    if (chatMessage) {
      await storage.createActionLog({
        tableId: this.tableState.id,
        logType: "info",
        message: `[Chat Simulator] Message envoyé: "${chatMessage.content}"`,
        metadata: { chatMessage },
      });
    }

    // Mettre à jour table dynamics
    const { getOpponentProfiler } = await import("./opponent-profiler");
    const opponentProfiler = getOpponentProfiler();

    opponentProfiler.updateTableDynamics(
      this.tableState.id,
      {
        handNumber: `${this.tableState.handsPlayed}`,
        potSize: this.tableState.currentPot,
        heroAction: this.tableState.lastHumanizedAction?.action || "UNKNOWN",
        heroResult: result,
      }
    );

    await storage.createHandHistory({
      handNumber: `${Date.now()}`,
      heroCards: this.tableState.heroCards,
      communityCards: this.tableState.communityCards,
      heroPosition: this.tableState.heroPosition.toString(),
      gtoRecommendation: this.tableState.lastGtoRecommendation,
      actualAction: this.tableState.lastHumanizedAction?.action,
      result,
    });

    this.emitTableEvent("hand_complete", { result, totalProfit: this.tableState.sessionProfit });
  }
}

export class MultiTableManager extends EventEmitter {
  private tables: Map<string, TableSession> = new Map();
  private maxTables: number = 6; // Default max tables
  private sessionId?: string;
  private isRunning = false;
  private tablePriorities: Map<string, number> = new Map(); // 0-100, higher = more important
  private systemLoadThreshold = 0.8; // 80% CPU usage threshold
  private autoThrottle = true;

  // New properties for batch processing
  private processingQueue: string[] = []; // Stores table IDs to be processed
  private batchSize: number = 6; // Default batch size
  private isProcessing: boolean = false; // Flag to indicate if batch processing is active

  constructor(maxTables: number = 24) { // Changed default to 24
    super();
    this.maxTables = maxTables;
    this.batchSize = 6; // Keep the batch size for processing
  }

  setTablePriority(tableId: string, priority: number): void {
    this.tablePriorities.set(tableId, Math.max(0, Math.min(100, priority)));
  }

  getTablePriority(tableId: string): number {
    return this.tablePriorities.get(tableId) ?? 50; // Default priority
  }

  getPrioritizedTables(): TableSession[] {
    return Array.from(this.tables.values()).sort((a, b) => {
      const priorityA = this.getTablePriority(a.getId());
      const priorityB = this.getTablePriority(b.getId());
      return priorityB - priorityA;
    });
  }

  getHealthyTables(): TableSession[] {
    return Array.from(this.tables.values()).filter(t => t.isHealthy());
  }

  async optimizeLoad(): Promise<void> {
    const healthyTables = this.getHealthyTables();

    if (this.autoThrottle && healthyTables.length > 4) {
      const avgResponseTime = healthyTables.reduce((sum, t) => sum + t.getAverageResponseTime(), 0) / healthyTables.length;

      // If average response time > 2s, pause low priority tables
      if (avgResponseTime > 2000) {
        const prioritizedTables = this.getPrioritizedTables();
        const tablesToPause = prioritizedTables.slice(Math.floor(prioritizedTables.length / 2));

        for (const table of tablesToPause) {
          if (table.getStatus() === "playing") {
            await table.pause();
            this.emit("tablePausedForOptimization", { tableId: table.getId() });
          }
        }
      }
    }
  }

  async recoverErrorTables(): Promise<void> {
    const errorTables = Array.from(this.tables.values()).filter(t => t.getStatus() === "error");

    for (const table of errorTables) {
      try {
        table.resetErrors();
        await table.resume();
        this.emit("tableRecovered", { tableId: table.getId() });
      } catch (error) {
        console.error(`Failed to recover table ${table.getId()}:`, error);
      }
    }
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  async addTable(config: {
    tableIdentifier: string;
    tableName: string;
    stakes: string;
  }): Promise<TableSession> {
    if (this.tables.size >= this.maxTables) {
      throw new Error(`Maximum de ${this.maxTables} tables atteint`);
    }

    // Get session ID - use stored or fallback to active session
    let sessionId = this.sessionId;
    if (!sessionId) {
      const activeSession = await storage.getActiveBotSession();
      sessionId = activeSession?.id ?? null;
      if (activeSession?.id) {
        console.log(`[TableManager] ⚠️ sessionId was undefined, using active session: ${activeSession.id}`);
        this.sessionId = activeSession.id;
      }
    }

    console.log(`[TableManager] Adding table: ${config.tableName} with sessionId: ${sessionId}`);

    const pokerTable = await storage.createPokerTable({
      sessionId,
      tableIdentifier: config.tableIdentifier,
      tableName: config.tableName,
      stakes: config.stakes,
      status: "waiting",
    });

    const session = new TableSession({
      id: pokerTable.id,
      tableIdentifier: config.tableIdentifier,
      tableName: config.tableName,
      stakes: config.stakes,
    });

    session.on("tableEvent", (event: TableEvent) => {
      this.emit("tableEvent", event);
    });

    session.on("stateChange", (state: TableState) => {
      this.emit("tableStateChange", { tableId: state.id, state });
    });

    this.tables.set(pokerTable.id, session);
    this.processingQueue.push(pokerTable.id); // Add to processing queue

    if (this.isRunning) {
      await session.start();
    }

    this.emit("tableAdded", { tableId: pokerTable.id, config });

    // Start processing if not already running and there are tables
    if (this.isRunning && !this.isProcessing) {
      this.processTableBatch();
    }

    return session;
  }

  async removeTable(tableId: string): Promise<void> {
    const session = this.tables.get(tableId);
    if (!session) {
      throw new Error(`Table ${tableId} non trouvée`);
    }

    await session.stop();
    this.tables.delete(tableId);
    this.processingQueue = this.processingQueue.filter(id => id !== tableId); // Remove from queue

    await storage.deletePokerTable(tableId);

    this.emit("tableRemoved", { tableId });
  }

  getTable(tableId: string): TableSession | undefined {
    return this.tables.get(tableId);
  }

  getAllTables(): TableSession[] {
    return Array.from(this.tables.values());
  }

  getActiveTableCount(): number {
    return Array.from(this.tables.values()).filter(t => t.getStatus() === "playing").length;
  }

  getAllTableStates(): TableState[] {
    return this.getAllTables().map(t => t.getState());
  }

  async startAll(): Promise<void> {
    this.isRunning = true;

    const startPromises = Array.from(this.tables.values()).map(table => table.start());
    await Promise.all(startPromises);

    // Start batch processing
    if (this.tables.size > 0) {
      this.processTableBatch();
    }

    this.emit("allTablesStarted");
  }

  async pauseAll(): Promise<void> {
    this.isRunning = false; // Set isRunning to false to stop new batch processing
    const pausePromises = Array.from(this.tables.values()).map(table => table.pause());
    await Promise.all(pausePromises);

    this.emit("allTablesPaused");
  }

  async resumeAll(): Promise<void> {
    this.isRunning = true;
    const resumePromises = Array.from(this.tables.values()).map(table => table.resume());
    await Promise.all(resumePromises);

    // Restart batch processing if there are tables
    if (this.tables.size > 0) {
      this.processTableBatch();
    }

    this.emit("allTablesResumed");
  }

  async stopAll(): Promise<void> {
    this.isRunning = false;
    this.isProcessing = false; // Stop processing immediately

    const stopPromises = Array.from(this.tables.values()).map(table => table.stop());
    await Promise.all(stopPromises);

    this.emit("allTablesStopped");
  }

  // Batch processing logic
  private async processTableBatch(): Promise<void> {
    if (!this.isRunning || this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    while (this.processingQueue.length > 0 && this.isRunning) {
      const batch = this.processingQueue.splice(0, this.batchSize);
      const processingPromises = batch.map(async (tableId) => {
        const table = this.tables.get(tableId);
        if (table && table.isHealthy()) {
          // In a real scenario, this would trigger a more intensive processing
          // For now, we simulate it by just checking health and emitting an event
          // console.log(`Processing batch for table ${tableId}`);
          await table.updateActivity(); // Simulate some processing
        }
      });
      await Promise.all(processingPromises);

      // Small delay between batches to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100)); // e.g., 100ms delay
    }

    this.isProcessing = false;

    // If there are still tables to process and the manager is running, start the next batch
    if (this.processingQueue.length > 0 && this.isRunning) {
      this.processTableBatch();
    }
  }

  getStats(): {
    totalTables: number;
    activeTables: number;
    totalHandsPlayed: number;
    totalProfit: number;
    healthyTables: number;
    avgResponseTime: number;
    tablesByStatus: Record<TableStatus, number>;
  } {
    const tables = this.getAllTables();
    const healthyTables = this.getHealthyTables();

    const tablesByStatus: Record<TableStatus, number> = {
      waiting: 0,
      playing: 0,
      paused: 0,
      error: 0,
      disconnected: 0,
    };

    tables.forEach(t => {
      tablesByStatus[t.getStatus()]++;
    });

    const totalResponseTime = tables.reduce((sum, t) => sum + t.getAverageResponseTime(), 0);
    const avgResponseTime = tables.length > 0 ? totalResponseTime / tables.length : 0;

    return {
      totalTables: tables.length,
      activeTables: this.getActiveTableCount(),
      totalHandsPlayed: tables.reduce((sum, t) => sum + t.getState().handsPlayed, 0),
      totalProfit: tables.reduce((sum, t) => sum + t.getState().sessionProfit, 0),
      healthyTables: healthyTables.length,
      avgResponseTime,
      tablesByStatus,
    };
  }

  async performHealthCheck(): Promise<void> {
    const tables = this.getAllTables();

    for (const table of tables) {
      if (!table.isHealthy() && table.getStatus() !== "error") {
        await storage.createActionLog({
          tableId: table.getId(),
          logType: "warning",
          message: `Table unhealthy: ${table.getTimeSinceLastActivity()}ms inactive`,
        });
      }
    }

    await this.optimizeLoad();

    // Ensure batch processing continues if needed
    if (this.isRunning && this.tables.size > 0 && !this.isProcessing) {
      this.processTableBatch();
    }
  }
}

let globalTableManager: MultiTableManager = new MultiTableManager();

export function getTableManager(): MultiTableManager {
  return globalTableManager;
}

export function resetTableManager(maxTables?: number): void {
  globalTableManager = new MultiTableManager(maxTables);
}