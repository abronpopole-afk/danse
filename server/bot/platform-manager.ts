import { EventEmitter } from "events";
import {
  PlatformAdapter,
  ConnectionConfig,
  PlatformCredentials,
  TableWindow,
  GameTableState,
  PlatformEvent,
  ConnectionStatus,
  cardInfoToNotation,
  gameStateToPlayerData,
} from "./platform-adapter";
import { createPlatformAdapter, getSupportedPlatforms } from "./platforms";
import { getTableManager, TableSession, TableState } from "./table-manager";
import { getHumanizer, HumanizedAction } from "./humanizer";
import { getGtoAdapter, HandContext } from "./gto-engine";
import { storage } from "../storage";

export interface PlatformManagerConfig {
  platformName: string;
  credentials: PlatformCredentials;
  autoReconnect: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  scanIntervalMs: number;
  actionDelayMs: number;
  enableAutoAction: boolean;
}

export interface ManagedTable {
  windowHandle: number;
  windowId: string;
  tableSession: TableSession;
  lastGameState?: GameTableState;
  isProcessingAction: boolean;
  lastActionTime: number;
  actionQueue: QueuedAction[];
}

export interface QueuedAction {
  action: string;
  amount?: number;
  humanizedAction: HumanizedAction;
  timestamp: number;
}

export type PlatformManagerStatus = "idle" | "connecting" | "running" | "paused" | "error" | "disconnected";

export class PlatformManager extends EventEmitter {
  private adapter: PlatformAdapter | null = null;
  private config: PlatformManagerConfig | null = null;
  private status: PlatformManagerStatus = "idle";
  private managedTables: Map<number, ManagedTable> = new Map();
  private gameStatePollingInterval?: NodeJS.Timeout;
  private windowScanInterval?: NodeJS.Timeout;
  private actionProcessingInterval?: NodeJS.Timeout;
  private isProcessing: boolean = false;

  constructor() {
    super();
  }

  async initialize(config: PlatformManagerConfig): Promise<boolean> {
    this.config = config;
    this.status = "connecting";
    this.emit("statusChange", this.status);

    const adapter = createPlatformAdapter(config.platformName);
    if (!adapter) {
      this.status = "error";
      this.emit("error", { message: `Platform ${config.platformName} not supported` });
      return false;
    }

    this.adapter = adapter;
    this.setupAdapterListeners();

    const connectionConfig: ConnectionConfig = {
      credentials: config.credentials,
      autoReconnect: config.autoReconnect,
      reconnectDelayMs: config.reconnectDelayMs,
      maxReconnectAttempts: config.maxReconnectAttempts,
    };

    const connected = await this.adapter.connect(connectionConfig);

    if (connected) {
      this.status = "running";
      this.startPolling();
      this.emit("statusChange", this.status);

      await storage.createActionLog({
        logType: "info",
        message: `Connecté à ${config.platformName}`,
        metadata: { platform: config.platformName },
      });

      return true;
    }

    this.status = "error";
    this.emit("statusChange", this.status);
    return false;
  }

  private setupAdapterListeners(): void {
    if (!this.adapter) return;

    this.adapter.on("platformEvent", (event: PlatformEvent) => {
      this.handlePlatformEvent(event);
    });

    this.adapter.on("configUpdated", (config: any) => {
      this.emit("configUpdated", config);
    });
  }

  private handlePlatformEvent(event: PlatformEvent): void {
    switch (event.type) {
      case "table_detected":
        this.handleTableDetected(event.data);
        break;
      case "table_closed":
        this.handleTableClosed(event.data);
        break;
      case "game_state":
        this.emit("gameState", event.data);
        break;
      case "action_required":
        this.handleActionRequired(event.data);
        break;
      case "anti_detection_alert":
        this.handleAntiDetectionAlert(event.data);
        break;
      case "connection_status":
        this.handleConnectionStatusChange(event.data);
        break;
      case "error":
        this.emit("error", event.data);
        break;
      case "warning":
        this.emit("warning", event.data);
        break;
    }

    this.emit("platformEvent", event);
  }

  private async handleTableDetected(data: { window: TableWindow }): Promise<void> {
    const { window } = data;

    if (this.managedTables.has(window.handle)) {
      return;
    }

    try {
      const tableManager = getTableManager();
      const tableSession = await tableManager.addTable({
        tableIdentifier: window.windowId,
        tableName: window.title,
        stakes: this.extractStakesFromTitle(window.title),
      });

      const managedTable: ManagedTable = {
        windowHandle: window.handle,
        windowId: window.windowId,
        tableSession,
        isProcessingAction: false,
        lastActionTime: 0,
        actionQueue: [],
      };

      this.managedTables.set(window.handle, managedTable);

      await tableSession.start();

      await storage.createActionLog({
        tableId: tableSession.getId(),
        logType: "info",
        message: `Table détectée: ${window.title}`,
        metadata: { windowHandle: window.handle },
      });

      this.emit("tableAdded", { windowHandle: window.handle, tableId: tableSession.getId() });
    } catch (error) {
      console.error("Error handling table detection:", error);
      this.emit("error", { message: "Failed to add detected table", error });
    }
  }

  private extractStakesFromTitle(title: string): string {
    const stakesMatch = title.match(/NL(\d+)/i) || title.match(/(\d+)\/(\d+)/);
    if (stakesMatch) {
      return stakesMatch[0];
    }
    return "Unknown";
  }

  private async handleTableClosed(data: { windowId: string; handle: number }): Promise<void> {
    const managedTable = this.managedTables.get(data.handle);
    if (!managedTable) return;

    try {
      const tableManager = getTableManager();
      await tableManager.removeTable(managedTable.tableSession.getId());
      this.managedTables.delete(data.handle);

      this.emit("tableRemoved", { windowHandle: data.handle });
    } catch (error) {
      console.error("Error handling table close:", error);
    }
  }

  private async handleActionRequired(data: { 
    windowHandle: number; 
    gameState: GameTableState;
    availableActions: any[];
  }): Promise<void> {
    if (!this.config?.enableAutoAction) return;

    const managedTable = this.managedTables.get(data.windowHandle);
    if (!managedTable || managedTable.isProcessingAction) return;

    try {
      managedTable.isProcessingAction = true;

      const { action, humanizedAction } = await this.calculateAction(
        data.gameState, 
        managedTable.tableSession
      );

      managedTable.actionQueue.push({
        action,
        amount: this.extractAmountFromAction(action),
        humanizedAction,
        timestamp: Date.now(),
      });

      this.emit("actionQueued", { 
        windowHandle: data.windowHandle, 
        action, 
        humanizedAction 
      });
    } catch (error) {
      console.error("Error handling action required:", error);
      managedTable.isProcessingAction = false;
    }
  }

  private async calculateAction(
    gameState: GameTableState,
    tableSession: TableSession
  ): Promise<{ action: string; humanizedAction: HumanizedAction }> {
    const heroCards = gameState.heroCards.map(c => cardInfoToNotation(c));
    const communityCards = gameState.communityCards.map(c => cardInfoToNotation(c));

    await tableSession.processNewHand({
      heroCards,
      heroPosition: gameState.heroPosition,
      heroStack: gameState.heroStack,
      players: gameStateToPlayerData(gameState.players),
      currentPot: gameState.potSize,
    });

    if (gameState.communityCards.length > 0 && gameState.currentStreet !== "unknown") {
      await tableSession.processCommunityCards(communityCards, gameState.currentStreet);
    }

    const result = await tableSession.processActionRequired({
      potSize: gameState.potSize,
      facingBet: gameState.facingBet,
      isInPosition: this.isHeroInPosition(gameState),
      numPlayers: gameState.players.filter(p => !p.isFolded).length,
    });

    return result;
  }

  private isHeroInPosition(gameState: GameTableState): boolean {
    const activePlayers = gameState.players.filter(p => !p.isFolded);
    if (activePlayers.length === 0) return false;

    const heroIdx = activePlayers.findIndex(p => p.position === gameState.heroPosition);
    return heroIdx === activePlayers.length - 1;
  }

  private extractAmountFromAction(action: string): number | undefined {
    const match = action.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : undefined;
  }

  private handleAntiDetectionAlert(data: any): void {
    const suspicionLevel = this.adapter?.getSuspicionLevel() || 0;

    if (suspicionLevel > 0.8) {
      this.pause();
      this.emit("emergencyPause", { 
        reason: "High suspicion level", 
        suspicionLevel,
        recommendation: "Wait before resuming",
      });
    } else if (suspicionLevel > 0.5) {
      this.emit("warning", {
        message: "Elevated suspicion level detected",
        suspicionLevel,
        factors: data.factors,
      });
    }
  }

  private handleConnectionStatusChange(data: { status: ConnectionStatus }): void {
    if (data.status === "disconnected" || data.status === "error") {
      this.status = "disconnected";
      this.stopPolling();
      this.emit("statusChange", this.status);
    } else if (data.status === "banned") {
      this.status = "error";
      this.stopPolling();
      this.emit("banned", { message: "Account banned from platform" });
    }
  }

  private startPolling(): void {
    if (!this.adapter || !this.config) return;

    this.windowScanInterval = setInterval(async () => {
      await this.scanForNewTables();
    }, 5000);

    this.gameStatePollingInterval = setInterval(async () => {
      await this.pollAllGameStates();
    }, this.config.scanIntervalMs);

    this.actionProcessingInterval = setInterval(async () => {
      await this.processActionQueues();
    }, 50);
  }

  private stopPolling(): void {
    if (this.windowScanInterval) {
      clearInterval(this.windowScanInterval);
      this.windowScanInterval = undefined;
    }
    if (this.gameStatePollingInterval) {
      clearInterval(this.gameStatePollingInterval);
      this.gameStatePollingInterval = undefined;
    }
    if (this.actionProcessingInterval) {
      clearInterval(this.actionProcessingInterval);
      this.actionProcessingInterval = undefined;
    }
  }

  private async scanForNewTables(): Promise<void> {
    if (!this.adapter || this.status !== "running") return;

    try {
      await this.adapter.detectTableWindows();
    } catch (error) {
      console.error("Error scanning for tables:", error);
    }
  }

  private async pollAllGameStates(): Promise<void> {
    if (!this.adapter || this.status !== "running") return;

    const pollPromises = Array.from(this.managedTables.values()).map(async (managedTable) => {
      try {
        const gameState = await this.adapter!.getGameState(managedTable.windowHandle);
        managedTable.lastGameState = gameState;

        this.updateTableSession(managedTable, gameState);
      } catch (error) {
        console.error(`Error polling game state for window ${managedTable.windowHandle}:`, error);
      }
    });

    await Promise.all(pollPromises);
  }

  private updateTableSession(managedTable: ManagedTable, gameState: GameTableState): void {
    const tableState = managedTable.tableSession.getState();

    if (gameState.currentStreet !== "unknown" && gameState.currentStreet !== tableState.currentStreet) {
      managedTable.tableSession.updateState({
        currentStreet: gameState.currentStreet,
      });
    }

    managedTable.tableSession.updateState({
      isHeroTurn: gameState.isHeroTurn,
      currentPot: gameState.potSize,
      facingBet: gameState.facingBet,
    });
  }

  private async processActionQueues(): Promise<void> {
    if (!this.adapter || this.status !== "running" || this.isProcessing) return;

    this.isProcessing = true;

    try {
      for (const [windowHandle, managedTable] of this.managedTables) {
        if (managedTable.actionQueue.length === 0) continue;

        const queuedAction = managedTable.actionQueue[0];
        const now = Date.now();

        if (now - queuedAction.timestamp < queuedAction.humanizedAction.delay) {
          continue;
        }

        managedTable.actionQueue.shift();

        await this.executeAction(windowHandle, queuedAction);

        managedTable.isProcessingAction = false;
        managedTable.lastActionTime = now;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeAction(windowHandle: number, queuedAction: QueuedAction): Promise<void> {
    if (!this.adapter) return;

    const { action, amount } = queuedAction;

    try {
      await this.adapter.focusWindow(windowHandle);

      const actionLower = action.toLowerCase();

      if (actionLower === "fold") {
        await this.adapter.executeFold(windowHandle);
      } else if (actionLower === "call") {
        await this.adapter.executeCall(windowHandle);
      } else if (actionLower === "check") {
        await this.adapter.executeCheck(windowHandle);
      } else if (actionLower.includes("raise") || actionLower.includes("bet")) {
        if (amount !== undefined) {
          await this.adapter.executeRaise(windowHandle, amount);
        }
      } else if (actionLower === "allin" || actionLower === "all-in" || actionLower === "all in") {
        await this.adapter.executeAllIn(windowHandle);
      }

      const managedTable = this.managedTables.get(windowHandle);
      if (managedTable) {
        await managedTable.tableSession.executeAction(action);
      }

      this.emit("actionExecuted", { windowHandle, action, amount });
    } catch (error) {
      console.error(`Error executing action ${action}:`, error);
      this.emit("actionError", { windowHandle, action, error });
    }
  }

  async pause(): Promise<void> {
    this.status = "paused";
    this.stopPolling();
    this.emit("statusChange", this.status);

    const tableManager = getTableManager();
    await tableManager.pauseAll();
  }

  async resume(): Promise<void> {
    if (this.status !== "paused") return;

    this.status = "running";
    this.startPolling();
    this.emit("statusChange", this.status);

    const tableManager = getTableManager();
    await tableManager.resumeAll();
  }

  async stop(): Promise<void> {
    this.stopPolling();

    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter.cleanup();
      this.adapter = null;
    }

    const tableManager = getTableManager();
    await tableManager.stopAll();

    this.managedTables.clear();
    this.status = "idle";
    this.emit("statusChange", this.status);
  }

  getStatus(): PlatformManagerStatus {
    return this.status;
  }

  getAdapter(): PlatformAdapter | null {
    return this.adapter;
  }

  getManagedTables(): ManagedTable[] {
    return Array.from(this.managedTables.values());
  }

  getTableByWindowHandle(windowHandle: number): ManagedTable | undefined {
    return this.managedTables.get(windowHandle);
  }

  getSuspicionLevel(): number {
    return this.adapter?.getSuspicionLevel() || 0;
  }

  async manualAction(windowHandle: number, action: string, amount?: number): Promise<void> {
    if (!this.adapter) {
      throw new Error("Platform adapter not initialized");
    }

    const managedTable = this.managedTables.get(windowHandle);
    if (!managedTable) {
      throw new Error(`Table with window handle ${windowHandle} not found`);
    }

    const humanizer = getHumanizer();
    const humanizedAction = humanizer.humanizeAction(action, 0.5, false);

    managedTable.actionQueue.push({
      action,
      amount,
      humanizedAction,
      timestamp: Date.now(),
    });
  }

  updateAntiDetectionConfig(config: Partial<any>): void {
    this.adapter?.updateAntiDetectionConfig(config);
  }
}

let globalPlatformManager: PlatformManager | null = null;

export function getPlatformManager(): PlatformManager {
  if (!globalPlatformManager) {
    globalPlatformManager = new PlatformManager();
  }
  return globalPlatformManager;
}

export function resetPlatformManager(): void {
  if (globalPlatformManager) {
    globalPlatformManager.stop().catch(console.error);
    globalPlatformManager = null;
  }
}

export { getSupportedPlatforms };
