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
import { getTaskScheduler } from "./task-scheduler";
import { getSafeModeManager } from "./safe-mode";
import { logger } from "../logger";

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
  private pendingHandles: Set<number> = new Set();
  private isProcessing: boolean = false;
  private schedulerStarted: boolean = false;

  constructor() {
    super();
  }

  async initialize(config: PlatformManagerConfig): Promise<boolean> {
    logger.session("PlatformManager", "Tentative de connexion", { 
      platform: config.platformName,
      username: config.credentials.username 
    });

    this.config = config;
    this.status = "connecting";
    this.emit("statusChange", this.status);

    const adapter = createPlatformAdapter(config.platformName);
    if (!adapter) {
      this.status = "error";
      const errorMsg = `Platform ${config.platformName} non supportée`;
      logger.error("PlatformManager", errorMsg, { 
        supportedPlatforms: getSupportedPlatforms() 
      });
      this.emit("error", { message: errorMsg });
      return false;
    }

    logger.info("PlatformManager", "Adaptateur créé", { platform: config.platformName });

    this.adapter = adapter;
    this.setupAdapterListeners();

    const connectionConfig: ConnectionConfig = {
      credentials: config.credentials,
      autoReconnect: config.autoReconnect,
      reconnectDelayMs: config.reconnectDelayMs,
      maxReconnectAttempts: config.maxReconnectAttempts,
    };

    logger.debug("PlatformManager", "Tentative de connexion à la plateforme...");
    const connected = await this.adapter.connect(connectionConfig);

    if (connected) {
      this.status = "running";
      logger.session("PlatformManager", `✅ CONNECTÉ à ${config.platformName}`, { 
        username: config.credentials.username 
      });

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
    logger.error("PlatformManager", "❌ Échec de connexion", { platform: config.platformName });
    this.emit("statusChange", this.status);
    return false;
  }

  getAdapter(): PlatformAdapter | null {
    return this.adapter;
  }

  getManagedTables(): ManagedTable[] {
    return Array.from(this.managedTables.values());
  }

  getStatus(): PlatformManagerStatus {
    return this.status;
  }

  private setupAdapterListeners(): void {
    if (!this.adapter) return;

    this.adapter.on("platformEvent", (event: PlatformEvent) => {
      this.handlePlatformEvent(event);
    });

    this.adapter.on("hero_turn", async (data: any) => {
      const managedTable = this.managedTables.get(data.windowHandle);
      if (managedTable) {
        logger.info("PlatformManager", `[GAME] Hero to act detected on table ${data.tableId}`);
        await managedTable.tableSession.start();
        managedTable.tableSession.updateState({ status: "playing" });
        
        await storage.createActionLog({
          tableId: managedTable.tableSession.getId(),
          logType: "info",
          message: "[GAME] Hero to act detected",
          metadata: { windowHandle: data.windowHandle }
        });
      }
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
    const cleanHandle = Math.abs(window.handle);
    logger.info("PlatformManager", `Traitement table détectée: ${window.title} (${cleanHandle})`);

    // Check if window handle or windowId is already managed OR pending
    if (this.managedTables.has(cleanHandle) || this.pendingHandles.has(cleanHandle)) {
      logger.debug("PlatformManager", "Table avec ce handle déjà gérée ou en cours d'ajout", { handle: cleanHandle });
      return;
    }

    // Check by windowId
    for (const managed of this.managedTables.values()) {
      if (managed.windowId === window.windowId) {
        logger.debug("PlatformManager", "Table avec cet ID déjà gérée", { windowId: window.windowId });
        // Update handle mapping if it changed but ID is same
        this.managedTables.set(cleanHandle, managed);
        return;
      }
    }

    // Atomic guard: mark as pending
    this.pendingHandles.add(cleanHandle);

    try {
      const tableManager = getTableManager();
      const tableSession = await tableManager.addTable({
        tableIdentifier: window.windowId,
        tableName: window.title,
        stakes: this.extractStakesFromTitle(window.title),
      });

      const managedTable: ManagedTable = {
        windowHandle: cleanHandle,
        windowId: window.windowId,
        tableSession,
        isProcessingAction: false,
        lastActionTime: 0,
        actionQueue: [],
      };

      this.managedTables.set(cleanHandle, managedTable);

      // Force status to playing to ensure polling triggers OCR
      await tableSession.start();
      tableSession.updateState({ status: "playing" });

      await storage.createActionLog({
        tableId: tableSession.getId(),
        logType: "info",
        message: `Table détectée: ${window.title}`,
        metadata: { windowHandle: cleanHandle },
      });

      this.emit("tableAdded", { windowHandle: cleanHandle, tableId: tableSession.getId() });
    } catch (error: any) {
      console.error("Error handling table detection:", error);
      this.emit("error", { message: "Failed to add detected table", error });
    } finally {
      // Remove from pending once complete or failed
      this.pendingHandles.delete(cleanHandle);
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

    const safeModeManager = getSafeModeManager();
    if (!safeModeManager.canAutoAct()) {
      this.emit("actionBlocked", {
        windowHandle: data.windowHandle,
        reason: "Safe mode: Freeze - Manual intervention required",
      });
      return;
    }

    const managedTable = this.managedTables.get(data.windowHandle);
    if (!managedTable || managedTable.isProcessingAction) return;

    try {
      managedTable.isProcessingAction = true;

      if (!managedTable.tableSession) {
        throw new Error(`TableSession missing for window ${data.windowHandle}`);
      }

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
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("PlatformManager", `Error handling action required: ${errorMessage}`, {
        windowHandle: data.windowHandle,
        stack: error instanceof Error ? error.stack : undefined
      });
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
    const safeModeManager = getSafeModeManager();

    const evaluation = safeModeManager.evaluateMode(suspicionLevel);

    if (evaluation.changed) {
      this.emit("safeModeChanged", {
        mode: evaluation.mode,
        reason: evaluation.reason,
        actions: evaluation.actions,
        suspicionLevel,
      });

      if (evaluation.mode === "freeze") {
        this.emit("emergencyPause", {
          reason: "Safe mode: Freeze activated",
          suspicionLevel,
          recommendation: "Manual intervention required",
        });
      } else if (evaluation.mode === "conservative") {
        this.emit("warning", {
          message: "Safe mode: Conservative activated",
          suspicionLevel,
          factors: data.factors,
          actions: evaluation.actions,
        });
      }
    }

    if (suspicionLevel > 0.8 && evaluation.mode !== "freeze") {
      this.pause();
      this.emit("emergencyPause", { 
        reason: "Critical suspicion level", 
        suspicionLevel,
        recommendation: "Wait before resuming",
      });
    } else if (suspicionLevel > 0.5 && evaluation.mode === "normal") {
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

    if (this.schedulerStarted) return;
    
    // Lancer le scan initial immédiatement
    logger.info("PlatformManager", "🚀 Lancement du scan initial des tables...");
    this.scanForNewTables().catch(err => {
      logger.error("PlatformManager", "Échec du scan initial", { error: String(err) });
    });

    const scheduler = getTaskScheduler();

    // Tâche 1: Scan des nouvelles tables (priorité normale, toutes les 5s)
    scheduler.addTask({
      id: "window_scan",
      name: "Scan Table Windows",
      priority: "normal",
      intervalMs: 5000,
      run: async () => {
        await this.scanForNewTables();
      },
    });

    // Tâche 2: Polling game states (priorité haute, configurable)
    scheduler.addTask({
      id: "game_state_poll",
      name: "Poll Game States",
      priority: "high",
      intervalMs: this.config.scanIntervalMs,
      run: async () => {
        await this.pollAllGameStatesThrottled();
      },
    });

    // Tâche 3: Processing action queues (priorité critique, 50ms)
    scheduler.addTask({
      id: "action_processing",
      name: "Process Action Queues",
      priority: "critical",
      intervalMs: 50,
      run: async () => {
        await this.processActionQueues();
      },
    });

    // Tâche 4: Health check (priorité background, 30s)
    scheduler.addTask({
      id: "health_check",
      name: "Table Health Check",
      priority: "background",
      intervalMs: 30000,
      run: async () => {
        const tableManager = getTableManager();
        await tableManager.performHealthCheck();
        await tableManager.recoverErrorTables();
      },
    });

    // Démarrer l'event loop si pas déjà fait
    this.schedulerStarted = true;
    scheduler.start().catch(error => {
      console.error("Task scheduler error:", error);
      this.schedulerStarted = false;
    });
  }

  private async pollAllGameStatesThrottled(): Promise<void> {
    if (!this.adapter || this.status !== "running") {
      if (this.status !== "running") {
        logger.debug("PlatformManager", `Polling ignoré: status=${this.status}`);
      }
      return;
    }

    const tables = Array.from(this.managedTables.values());
    if (tables.length === 0) {
      logger.debug("PlatformManager", "Aucune table gérée pour le polling");
      return;
    }

    const tableManager = getTableManager();
    const prioritizedTables = tables; // Simplified for now to ensure all tables are polled

    logger.info("PlatformManager", `Analyse en cours pour ${prioritizedTables.length} table(s)`);

    // Poll par batch de 6 tables max simultanément
    const batchSize = 6;
    for (let i = 0; i < prioritizedTables.length; i += batchSize) {
      const batch = prioritizedTables.slice(i, i + batchSize);

      await Promise.all(batch.map(async (managedTable) => {
        try {
          logger.info("PlatformManager", `[${managedTable.windowHandle}] Appel getGameState...`);
          const gameState = await this.adapter!.getGameState(managedTable.windowHandle);

          if (!gameState || !this.validateGameState(gameState)) {
            logger.warning("PlatformManager", `[${managedTable.windowHandle}] GameState invalide ou incomplet`);
            managedTable.tableSession.incrementError();
            return;
          }

          logger.info("PlatformManager", `[${managedTable.windowHandle}] GameState reçu`, { 
            street: gameState.currentStreet,
            heroTurn: gameState.isHeroTurn 
          });

          // Vérifier la confiance de l'état détecté
          const stateConfidenceResult = await this.validateStateConfidence(
            managedTable.windowHandle,
            gameState
          );

          if (!stateConfidenceResult.proceed) {
            logger.warning("PlatformManager", `[${managedTable.windowHandle}] Confiance trop faible: ${stateConfidenceResult.reason}`);
            managedTable.tableSession.incrementError();
            return;
          }

          managedTable.lastGameState = gameState;
          this.updateTableSession(managedTable, gameState);
          managedTable.tableSession.resetErrors();
          
          // Émettre l'événement pour le frontend
          this.emit("gameState", gameState);
        } catch (error) {
          logger.error("PlatformManager", `[${managedTable.windowHandle}] Erreur lors du polling`, { error: String(error) });
          managedTable.tableSession.incrementError();
        }
      }));

      // Petit délai entre les batchs pour réduire la charge CPU
      if (i + batchSize < prioritizedTables.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  private async validateStateConfidence(
    windowHandle: number,
    gameState: GameTableState
  ): Promise<{ proceed: boolean; reason?: string; uncertainties: string[] }> {
    const { getStateConfidenceAnalyzer } = await import("./state-confidence");
    const analyzer = getStateConfidenceAnalyzer();

    // Simuler des scores de confiance basés sur la détection
    const rawDetections = {
      heroCards: {
        cards: gameState.heroCards.map(c => cardInfoToNotation(c)),
        confidence: gameState.heroCards.length === 2 ? 0.85 : 0.50,
        method: "template_matching",
      },
      communityCards: {
        cards: gameState.communityCards.map(c => cardInfoToNotation(c)),
        confidence: gameState.communityCards.length > 0 ? 0.80 : 0.95,
        method: "template_matching",
      },
      potSize: {
        value: gameState.potSize,
        confidence: gameState.potSize > 0 ? 0.75 : 0.90,
        method: "ocr",
      },
      heroStack: {
        value: gameState.heroStack,
        confidence: gameState.heroStack > 0 ? 0.80 : 0.50,
        method: "ocr",
      },
      facingBet: {
        value: gameState.facingBet,
        confidence: 0.70,
        method: "ocr",
      },
      buttons: {
        fold: { enabled: true, confidence: 0.88 },
        call: { enabled: gameState.facingBet > 0, confidence: 0.82 },
        raise: { enabled: true, confidence: 0.75 },
      },
      players: {
        count: gameState.players.length,
        confidence: 0.85,
      },
      currentStreet: {
        street: gameState.currentStreet,
        confidence: 0.90,
      },
      isHeroTurn: {
        value: gameState.isHeroTurn,
        confidence: gameState.isHeroTurn ? 0.85 : 0.95,
      },
    };

    const stateConfidence = analyzer.analyzeStateConfidence(rawDetections);
    analyzer.addToHistory(windowHandle, stateConfidence);

    const decision = analyzer.shouldProceedWithAction(windowHandle, stateConfidence);

    if (!decision.proceed) {
      // Capturer un screenshot pour analyse ultérieure
      const screenshot = await this.adapter?.captureScreen(windowHandle);
      analyzer.recordUncertainState(windowHandle, stateConfidence, decision.reason || "Unknown", screenshot);

      // Vérifier si on doit retry
      const retryInfo = analyzer.shouldRetry(windowHandle);
      if (retryInfo.retry && retryInfo.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, retryInfo.delayMs));
      }
    } else {
      analyzer.clearUncertainStates(windowHandle);
    }

    return decision;
  }

  private stopPolling(): void {
    const scheduler = getTaskScheduler();

    // Désactiver les tâches mais ne pas arrêter le scheduler
    // (il peut être utilisé par d'autres composants)
    scheduler.disableTask("window_scan");
    scheduler.disableTask("game_state_poll");
    scheduler.disableTask("action_processing");
    scheduler.disableTask("health_check");
  }

  private async scanForNewTables(): Promise<void> {
    if (!this.adapter || this.status !== "running") {
      logger.info("PlatformManager", "Scan tables ignoré", { 
        hasAdapter: !!this.adapter, 
        status: this.status 
      });
      return;
    }

    try {
      logger.info("PlatformManager", "🔍 Lancement du scan des fenêtres...");
      const tables = await this.adapter.detectTableWindows();
      logger.info("PlatformManager", `Scan terminé: ${tables.length} table(s) trouvée(s)`);
      
      // Synchronisation manuelle au cas où l'événement n'est pas traité assez vite
      for (const table of tables) {
        if (!this.managedTables.has(table.handle)) {
          logger.info("PlatformManager", `Nouvelle table détectée via scan: ${table.title} (${table.handle})`);
          await this.handleTableDetected({ window: table });
        }
      }
    } catch (error) {
      logger.error("PlatformManager", "Erreur lors du scan des tables", { error: String(error) });
    }
  }

  private async pollAllGameStates(): Promise<void> {
    if (!this.adapter || this.status !== "running") return;

    const pollPromises = Array.from(this.managedTables.values()).map(async (managedTable) => {
      try {
        const gameState = await this.adapter!.getGameState(managedTable.windowHandle);

        if (!gameState || !this.validateGameState(gameState)) {
          managedTable.tableSession.incrementError();
          console.warn(`Invalid game state for window ${managedTable.windowHandle}`);
          return;
        }

        managedTable.lastGameState = gameState;
        this.updateTableSession(managedTable, gameState);
        managedTable.tableSession.resetErrors();
      } catch (error) {
        console.error(`Error polling game state for window ${managedTable.windowHandle}:`, error);
        managedTable.tableSession.incrementError();

        if (!managedTable.tableSession.isHealthy()) {
          this.emit("tableUnhealthy", { 
            windowHandle: managedTable.windowHandle,
            tableId: managedTable.tableSession.getId() 
          });
        }
      }
    });

    await Promise.all(pollPromises);
  }

  private validateGameState(gameState: GameTableState): boolean {
    // Validation minimale - ne pas bloquer si players est vide (MockAdapter)
    // La vraie validation se fera lors de la prise de décision
    const basicValid = gameState.potSize >= 0 && 
                       gameState.heroStack >= 0 &&
                       gameState.heroCards.length <= 2;
    
    // Si c'est le tour du héro avec des boutons détectés, on valide même sans players
    if (basicValid && gameState.isHeroTurn && gameState.availableActions.length > 0) {
      return true;
    }
    
    // Sinon, validation standard (mais on accepte players vide si on a des cartes hero)
    return basicValid && (gameState.players.length > 0 || gameState.heroCards.length > 0);
  }

  private updateTableSession(managedTable: ManagedTable, gameState: GameTableState): void {
    const tableState = managedTable.tableSession.getState();

    // Détection nouvelle main
    const isNewHand = gameState.currentStreet === "preflop" && 
                      tableState.currentStreet !== "preflop" &&
                      gameState.heroCards.length === 2;

    if (isNewHand) {
      managedTable.tableSession.processNewHand({
        heroCards: gameState.heroCards.map(c => cardInfoToNotation(c)),
        heroPosition: gameState.heroPosition,
        heroStack: gameState.heroStack,
        players: gameStateToPlayerData(gameState.players),
        currentPot: gameState.potSize,
      }).catch(error => console.error("Error processing new hand:", error));
    }

    // Détection changement de street
    if (gameState.currentStreet !== "unknown" && gameState.currentStreet !== tableState.currentStreet) {
      const communityCards = gameState.communityCards.map(c => cardInfoToNotation(c));

      if (communityCards.length > 0) {
        managedTable.tableSession.processCommunityCards(communityCards, gameState.currentStreet)
          .catch(error => console.error("Error processing community cards:", error));
      }

      managedTable.tableSession.updateState({
        currentStreet: gameState.currentStreet,
      });
    }

    managedTable.tableSession.updateState({
      isHeroTurn: gameState.isHeroTurn,
      currentPot: gameState.potSize,
      facingBet: gameState.facingBet,
    });

    managedTable.tableSession.updateActivity();
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
    const humanizedAction = await humanizer.humanizeAction(action, 0.5, false);

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

  getSchedulerStats(): any {
    const scheduler = getTaskScheduler();
    return {
      system: scheduler.getSystemStats(),
      tasks: scheduler.getAllTasks().map(t => ({
        id: t.id,
        name: t.name,
        priority: t.priority,
        enabled: t.enabled,
        isRunning: t.isRunning,
        runCount: t.runCount,
        errorCount: t.errorCount,
        avgExecutionTime: Math.round(t.avgExecutionTime),
        maxExecutionTime: t.maxExecutionTime,
        nextRunIn: Math.max(0, t.nextRunTime - Date.now()),
      })),
    };
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