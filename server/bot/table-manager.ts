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
    this.tableState = { ...this.tableState, ...updates };
    this.emit("stateChange", this.tableState);
    this.emitTableEvent("state_update", this.tableState);
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
  
  async processActionRequired(data: {
    potSize: number;
    facingBet: number;
    isInPosition: boolean;
    numPlayers: number;
  }): Promise<{ action: string; humanizedAction: HumanizedAction }> {
    this.updateState({ isHeroTurn: true, facingBet: data.facingBet, currentPot: data.potSize });
    
    const handContext: HandContext = {
      heroCards: this.tableState.heroCards,
      communityCards: this.tableState.communityCards,
      street: this.tableState.currentStreet,
      heroPosition: this.tableState.heroPosition.toString(),
      potSize: data.potSize,
      heroStack: this.tableState.heroStack,
      facingBet: data.facingBet,
      numPlayers: data.numPlayers,
      isInPosition: data.isInPosition,
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
    
    const selectedAction = this.selectAction(recommendation);
    
    const humanizer = getHumanizer();
    const isComplexDecision = recommendation.confidence < 0.7 || 
      recommendation.actions.filter(a => a.probability > 0.2).length > 2;
    
    const handStrength = this.estimateHandStrength();
    const humanizedAction = humanizer.humanizeAction(selectedAction, handStrength, isComplexDecision);
    
    this.updateState({ lastHumanizedAction: humanizedAction });
    
    await storage.createActionLog({
      tableId: this.tableState.id,
      logType: "warning",
      message: `Humanizer: Délai ${humanizedAction.delay}ms`,
      metadata: { thinkingPauses: humanizedAction.thinkingPauses },
    });
    
    return { action: selectedAction, humanizedAction };
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
    
    await storage.createHandHistory({
      tableId: this.tableState.id,
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
  private maxTables: number = 6;
  private sessionId?: string;
  private isRunning = false;
  
  constructor(maxTables: number = 6) {
    super();
    this.maxTables = maxTables;
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
    
    const pokerTable = await storage.createPokerTable({
      sessionId: this.sessionId ?? null,
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
    
    if (this.isRunning) {
      await session.start();
    }
    
    this.emit("tableAdded", { tableId: pokerTable.id, config });
    
    return session;
  }
  
  async removeTable(tableId: string): Promise<void> {
    const session = this.tables.get(tableId);
    if (!session) {
      throw new Error(`Table ${tableId} non trouvée`);
    }
    
    await session.stop();
    this.tables.delete(tableId);
    
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
    
    this.emit("allTablesStarted");
  }
  
  async pauseAll(): Promise<void> {
    const pausePromises = Array.from(this.tables.values()).map(table => table.pause());
    await Promise.all(pausePromises);
    
    this.emit("allTablesPaused");
  }
  
  async resumeAll(): Promise<void> {
    const resumePromises = Array.from(this.tables.values()).map(table => table.resume());
    await Promise.all(resumePromises);
    
    this.emit("allTablesResumed");
  }
  
  async stopAll(): Promise<void> {
    this.isRunning = false;
    
    const stopPromises = Array.from(this.tables.values()).map(table => table.stop());
    await Promise.all(stopPromises);
    
    this.emit("allTablesStopped");
  }
  
  getStats(): {
    totalTables: number;
    activeTables: number;
    totalHandsPlayed: number;
    totalProfit: number;
  } {
    const tables = this.getAllTables();
    return {
      totalTables: tables.length,
      activeTables: this.getActiveTableCount(),
      totalHandsPlayed: tables.reduce((sum, t) => sum + t.getState().handsPlayed, 0),
      totalProfit: tables.reduce((sum, t) => sum + t.getState().sessionProfit, 0),
    };
  }
}

let globalTableManager: MultiTableManager = new MultiTableManager();

export function getTableManager(): MultiTableManager {
  return globalTableManager;
}

export function resetTableManager(maxTables?: number): void {
  globalTableManager = new MultiTableManager(maxTables);
}
