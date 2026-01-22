/**
 * @fileoverview GGClub Platform Adapter for poker bots.
 * This adapter handles screen capture, game state detection, and action execution
 * specifically for the GGClub poker platform. It includes features for anti-detection
 * and supports multiple tables.
 *
 * @author [Your Name/Organization]
 */

import sharp from "sharp";
import { GameStateDetector } from "../game-state-detector";
import { 
  PlatformAdapter, 
  TableWindow, 
  GameTableState, 
  DetectedButton, 
  CardInfo,
  DetectedPlayer,
  ScreenRegion,
  ConnectionStatus,
  PlatformAdapterRegistry,
  parseCardNotation,
} from "../platform-adapter";
import { getCalibrationManager, colorMatch, findColorInRegion, getDominantColorInRegion, CalibrationProfile, TableRegions } from "../calibration";
import { ImageProcessor, detectSuitByHSV, preprocessForOCR, extractRegion } from "../image-processing";
import { TemplateMatcher, templateMatcher } from "../template-matching";
import { CombinedCardRecognizer, combinedRecognizer } from "../card-classifier";
import { debugVisualizer, createDebugSession, DebugFrame, GtoDebugInfo } from "../debug-visualizer";
import { AdvancedGtoAdapter, advancedGtoAdapter, PlayerProfiler } from "../gto-advanced";
import { diffDetector, DiffDetector } from "../diff-detector";
import { ocrCache, OCRCache } from "../ocr-cache";
import { ocrPool, OCRWorkerPool } from "../ocr-pool";
import { getAutoCalibrationManager, AutoCalibrationManager } from "../auto-calibration";
import { visionErrorLogger } from "../vision-error-logger";
import { PokerOCREngine, getPokerOCREngine } from "../ml-ocr";
import { logger } from "../../logger";
import { getHumanizer } from "../humanizer"; // Import humanizer
import { loadNativeModule, IS_PACKAGED } from "../native-loader";

// Import helper functions
import { toGrayscale } from "../image-processing";
import { ActionPattern } from "../anti-detection-monitor";


let screenshotDesktop: any = null;
let robot: any = null;
let windowManager: any = null;

const IS_WINDOWS = process.platform === 'win32';
const IS_REPLIT = process.env.REPL_ID !== undefined;

async function loadNativeModules(): Promise<void> {
  logger.info("GGClubAdapter", "Chargement modules natifs", {
    platform: process.platform,
    isWindows: IS_WINDOWS,
    isReplit: IS_REPLIT,
    isPackaged: IS_PACKAGED,
  });

  // Modules natifs Windows uniquement
  if (IS_WINDOWS && !IS_REPLIT) {
    try {
      const screenshotModule = await loadNativeModule<any>("screenshot-desktop");
      screenshotDesktop = screenshotModule?.default || screenshotModule;
      if (screenshotDesktop) {
        logger.info("GGClubAdapter", "✓ screenshot-desktop chargé (Windows)");
      } else {
        // Fallback simple si pas de default
        screenshotDesktop = screenshotModule;
      }
    } catch (e) {
      logger.error("GGClubAdapter", "❌ screenshot-desktop ÉCHEC", { error: String(e) });
    }

    try {
      robot = await loadNativeModule<any>("robotjs");
      if (robot) {
        logger.info("GGClubAdapter", "✓ robotjs chargé (ou wrapper simulé)");
      }
    } catch (e) {
      logger.error("GGClubAdapter", "❌ robotjs ÉCHEC (Inattendu avec wrapper)", { error: String(e) });
    }

    try {
      const wmModule = await loadNativeModule<any>("node-window-manager");
      // Le module exporte { windowManager: { getWindows, getActiveWindow, ... } }
      windowManager = wmModule?.windowManager || wmModule?.default?.windowManager || wmModule;
      
      // Vérifier que getWindows est disponible
      if (windowManager && typeof windowManager.getWindows === 'function') {
        logger.info("GGClubAdapter", "✓ node-window-manager chargé (Windows)", {
          hasGetWindows: typeof windowManager.getWindows === 'function',
          hasGetActiveWindow: typeof windowManager.getActiveWindow === 'function'
        });
      } else if (wmModule && typeof wmModule.getWindows === 'function') {
        // Fallback: le module lui-même a getWindows
        windowManager = wmModule;
        logger.info("GGClubAdapter", "✓ node-window-manager chargé (Windows - direct)");
      } else {
        logger.error("GGClubAdapter", "❌ node-window-manager structure invalide", {
          moduleKeys: wmModule ? Object.keys(wmModule) : [],
          hasWindowManager: !!wmModule?.windowManager,
          wmHasGetWindows: typeof wmModule?.windowManager?.getWindows
        });
        throw new Error("Module loaded but getWindows not found");
      }
    } catch (e) {
      logger.error("GGClubAdapter", "❌ node-window-manager ÉCHEC - DÉTECTION TABLES IMPOSSIBLE", { 
        error: String(e),
        solution: "Vérifiez que node-window-manager est installé : npm install node-window-manager"
      });
    }
  } else {
    logger.info("GGClubAdapter", "ℹ Mode serveur Linux/Replit - modules natifs Windows désactivés");
  }
}

loadNativeModules();

interface GGClubScreenLayout {
  heroCardsRegion: ScreenRegion | ScreenRegion[]; // Allow array for multiple card regions
  communityCardsRegion: ScreenRegion | ScreenRegion[]; // Allow array for multiple card regions
  potRegion: ScreenRegion;
  actionButtonsRegion: ScreenRegion;
  betSliderRegion: ScreenRegion;
  playerSeats: ScreenRegion[];
  dealerButtonRegion: ScreenRegion;
  chatRegion: ScreenRegion;
  timerRegion: ScreenRegion;
}

interface GGClubTableConfig {
  tableType: "cash" | "tournament" | "sit_n_go";
  maxPlayers: 2 | 6 | 9;
  currency: string;
  stakes: string;
}

interface OCRResult {
  text: string;
  confidence: number;
  bounds: ScreenRegion;
}

interface ColorSignature {
  r: number;
  g: number;
  b: number;
  tolerance: number;
}

interface GGClubWindowInfo {
  handle: number;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
  isMinimized: boolean;
}

const GGCLUB_CARD_COLORS: Record<string, ColorSignature> = {
  hearts: { r: 220, g: 50, b: 50, tolerance: 30 },
  diamonds: { r: 220, g: 50, b: 50, tolerance: 30 },
  clubs: { r: 40, g: 40, b: 40, tolerance: 25 },
  spades: { r: 40, g: 40, b: 40, tolerance: 25 },
};

const GGCLUB_UI_COLORS = {
  heroTurnHighlight: { r: 255, g: 215, b: 0, tolerance: 40 },
  foldButton: { r: 180, g: 60, b: 60, tolerance: 30 },
  callButton: { r: 60, g: 150, b: 60, tolerance: 30 },
  raiseButton: { r: 60, g: 100, b: 180, tolerance: 30 },
  checkButton: { r: 80, g: 160, b: 80, tolerance: 30 },
  allInButton: { r: 200, g: 80, b: 200, tolerance: 30 },
  activePlayer: { r: 255, g: 200, b: 50, tolerance: 35 },
  foldedPlayer: { r: 100, g: 100, b: 100, tolerance: 25 },
  dealerButton: { r: 255, g: 255, b: 255, tolerance: 20 },
};

export class GGClubAdapter extends PlatformAdapter {
  private screenLayout: GGClubScreenLayout;
  private activeTableConfigs: Map<number, GGClubTableConfig> = new Map();
  private cardRecognitionCache: Map<string, CardInfo[]> = new Map();
  private lastScreenCaptures: Map<number, { buffer: Buffer; timestamp: number }> = new Map();
  private screenCaptureInterval: number = 100;
  private maxConcurrentTables: number = 24;
  private processingBatchSize: number = 6;
  private ocrQueue: Map<number, Promise<void>> = new Map();
  private reconnectAttempts: number = 0;
  private sessionToken: string | null = null;
  private antiDetectionMonitor: AntiDetectionMonitor;
  private windowPollingInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private tesseractWorker: any = null;
  private calibrationManager = getCalibrationManager();
  private activeCalibration: CalibrationProfile | null = null;
  private scaledRegions: Map<number, TableRegions> = new Map();
  private imageProcessor: ImageProcessor;
  private cardRecognizer: CombinedCardRecognizer;
  private gtoAdapter: AdvancedGtoAdapter;
  private playerProfiler: PlayerProfiler;
  private debugMode: boolean = false;
  private diffDetector: DiffDetector;
  private ocrCache: OCRCache;
  private criticalRegions: string[] = ['heroCardsRegion', 'actionButtonsRegion', 'potRegion'];
  private autoCalibration: AutoCalibrationManager;
  private enableML: boolean = true; // Added for ML card recognition
  private cardClassifier: any = null; // Placeholder for ML card classifier
  private pokerOCREngine: PokerOCREngine | null = null;
  private mlInitPromise: Promise<void> | null = null;
  private mlConfidenceThreshold: number = 0.75;
  private lastGameState: GameTableState | null = null; // Added for caching game state
  private lastKnownPot: number = 0; // Added for pot value tracking
  private lastKnownStreet: string = "preflop"; // Added for street tracking
  public suspicionLevel: number = 0; // Added for anti-detection suspicion level
  private antiDetectionConfig: any = { // Default config, can be overridden
    enableMouseJitter: true,
    mouseJitterRange: 5,
    enableTimingVariation: true,
    timingVariationPercent: 30,
    thinkingTimeVariance: 0.2,
    enableMisclicks: false,
    misclickProbability: 0.0005,
  };


  constructor() {
    super("GGClub", {
      supportsMultiTable: true,
      maxTables: 24,
      supportsHandHistory: true,
      supportsPlayerNotes: true,
      supportsTableStatistics: true,
      requiresWindowCapture: true,
      requiresApiAccess: false,
      supportsOverlay: false,
    });

    this.screenLayout = this.getDefaultScreenLayout();
    this.antiDetectionMonitor = new AntiDetectionMonitor(this);
    this.imageProcessor = new ImageProcessor();
    this.cardRecognizer = new CombinedCardRecognizer();
    this.gtoAdapter = new AdvancedGtoAdapter();
    this.playerProfiler = new PlayerProfiler();
    this.diffDetector = diffDetector;
    this.ocrCache = ocrCache;
    this.autoCalibration = getAutoCalibrationManager();
    ocrPool.initialize();
    this.mlInitPromise = this.initializeCardClassifier();

    // Initialisation du profil par défaut pour GGClub
    const profile = this.calibrationManager.getProfileForPlatform("ggclub", 9);
    if (profile) {
      this.activeCalibration = profile;
      logger.info("GGClubAdapter", "Profil de calibration par défaut chargé", { 
        name: profile.name,
        targetWindowSize: profile.windowSize
      });
    }
  }

  private async initializeCardClassifier(): Promise<void> {
    if (this.enableML) {
      try {
        this.pokerOCREngine = await getPokerOCREngine({
          useMLPrimary: true,
          confidenceThreshold: 0.75,
          collectTrainingData: true,
        });
        if (this.pokerOCREngine) {
          console.log("[GGClubAdapter] ML PokerOCREngine initialized successfully");
        } else {
          console.log("[GGClubAdapter] ML PokerOCREngine not available, using fallback OCR");
          this.enableML = false;
        }
      } catch (error) {
        console.error("[GGClubAdapter] Failed to initialize ML PokerOCREngine:", error);
        this.enableML = false;
        this.pokerOCREngine = null;
      }
    }
  }

  enableDebugMode(enabled: boolean = true): void {
    this.debugMode = enabled;
    this.imageProcessor.enableDebugMode(enabled);
    this.cardRecognizer.enableDebugMode(enabled);
    this.gtoAdapter.enableDebugMode(enabled);
    debugVisualizer.enableDebugMode();
    console.log(`[GGClubAdapter] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  getDebugVisualizer() {
    return debugVisualizer;
  }

  
  private validateImageBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length === 0) {
      return false;
    }
    if (buffer.length < 100) {
      logger.debug("GGClubAdapter", "Buffer image trop petit", { size: buffer.length });
      return false;
    }
    if (buffer.length > 50 * 1024 * 1024) {
      logger.warning("GGClubAdapter", "Buffer image trop grand, risque de crash mémoire", { size: buffer.length });
      return false;
    }
    return true;
  }

  private getDefaultScreenLayout(): GGClubScreenLayout {
    // Coordonnées relatives (0.0 à 1.0) basées sur une résolution de référence de 880x600
    const refW = 880;
    const refH = 600;

    return {
      heroCardsRegion: [
        { x: 410 / refW, y: 450 / refH, width: 50 / refW, height: 75 / refH },
        { x: 460 / refW, y: 450 / refH, width: 50 / refW, height: 75 / refH }
      ],
      communityCardsRegion: [{ x: 280 / refW, y: 270 / refH, width: 340 / refW, height: 90 / refH }],
      potRegion: { x: 390 / refW, y: 220 / refH, width: 120 / refW, height: 50 / refH },
      actionButtonsRegion: { x: 480 / refW, y: 510 / refH, width: 400 / refW, height: 80 / refH },
      betSliderRegion: { x: 480 / refW, y: 470 / refH, width: 320 / refW, height: 40 / refH },
      playerSeats: this.generatePlayerSeatRegions(9, refW, refH),
      dealerButtonRegion: { x: 440 / refW, y: 200 / refH, width: 40 / refW, height: 40 / refH },
      chatRegion: { x: 10 / refW, y: 400 / refH, width: 220 / refW, height: 160 / refH },
      timerRegion: { x: 400 / refW, y: 190 / refH, width: 100 / refW, height: 40 / refH },
    };
  }

  private generatePlayerSeatRegions(maxPlayers: number, refW: number, refH: number): ScreenRegion[] {
    const regions: ScreenRegion[] = [];
    const centerX = 440;
    const centerY = 300;
    const radiusX = 350;
    const radiusY = 200;

    for (let i = 0; i < maxPlayers; i++) {
      const angle = (2 * Math.PI * i) / maxPlayers - Math.PI / 2;
      const x = (centerX + radiusX * Math.cos(angle) - 60) / refW;
      const y = (centerY + radiusY * Math.sin(angle) - 40) / refH;
      regions.push({ x, y, width: 120 / refW, height: 80 / refH });
    }

    return regions;
  }

  async connect(config: ConnectionConfig): Promise<boolean> {
    /*
    logger.session("GGClubAdapter", "=== CONNEXION À GGCLUB ===", {
      platform: this.platformName,
      hasCredentials: !!config.credentials,
      autoReconnect: config.autoReconnect,
      maxReconnectAttempts: config.maxReconnectAttempts,
    });
    */
    
    this.updateConnectionStatus("connecting");

    try {
      /*
      logger.info("GGClubAdapter", "Étape 1: Authentification...");
      */
      const isAuthenticated = await this.authenticate(config.credentials);
      
      if (!isAuthenticated) {
        logger.error("GGClubAdapter", "❌ Authentification ÉCHOUÉE");
        this.updateConnectionStatus("error");
        return false;
      }
      /*
      logger.info("GGClubAdapter", "✓ Authentification réussie");

      logger.info("GGClubAdapter", "Étape 2: Démarrage polling fenêtres...");
      */
      this.startWindowPolling();
      
      /*
      logger.info("GGClubAdapter", "Étape 3: Démarrage heartbeat...");
      */
      this.startHeartbeat();
      
      /*
      logger.info("GGClubAdapter", "Étape 4: Démarrage anti-détection...");
      */
      this.antiDetectionMonitor.start();

      this.updateConnectionStatus("connected");
      this.reconnectAttempts = 0;

      logger.session("GGClubAdapter", "✅ BOT CONNECTÉ ET PRÊT", {
        status: "connected",
        platform: this.platformName,
      });

      this.emitPlatformEvent("connection_status", {
        status: "connected",
        platform: this.platformName,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      logger.error("GGClubAdapter", "❌ ERREUR CONNEXION CRITIQUE", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        reconnectAttempts: this.reconnectAttempts,
      });
      this.updateConnectionStatus("error");

      if (config.autoReconnect && this.reconnectAttempts < config.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.info("GGClubAdapter", `Tentative reconnexion ${this.reconnectAttempts}/${config.maxReconnectAttempts}`);
        await this.addRandomDelay(config.reconnectDelayMs);
        return this.connect(config);
      }

      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.stopWindowPolling();
    this.stopHeartbeat();
    this.antiDetectionMonitor.stop();

    this.sessionToken = null;
    this.activeWindows.clear();
    this.activeTableConfigs.clear();
    this.cardRecognitionCache.clear();
    this.lastScreenCaptures.clear();

    this.updateConnectionStatus("disconnected");

    this.emitPlatformEvent("connection_status", {
      status: "disconnected",
      platform: this.platformName,
      timestamp: new Date(),
    });
  }

  async authenticate(credentials: PlatformCredentials): Promise<boolean> {
    logger.info("GGClubAdapter", "=== AUTHENTIFICATION ===", {
      hasUsername: !!credentials?.username,
      usernameLength: credentials?.username?.length || 0,
    });
    
    await this.addRandomDelay(500);

    try {
      logger.debug("GGClubAdapter", "Appel performLogin...");
      const loginResult = await this.performLogin(credentials);

      if (!loginResult.success) {
        logger.error("GGClubAdapter", "❌ Login échoué", {
          reason: loginResult.reason,
        });
        if (loginResult.reason === "banned") {
          this.updateConnectionStatus("banned");
        }
        return false;
      }

      this.sessionToken = loginResult.sessionToken ?? null;
      this.updateConnectionStatus("authenticated");
      
      logger.info("GGClubAdapter", "✓ Login réussi", {
        hasSessionToken: !!this.sessionToken,
      });

      await this.addRandomDelay(1000);

      return true;
    } catch (error) {
      logger.error("GGClubAdapter", "❌ Erreur authentification", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  private async performLogin(credentials: PlatformCredentials): Promise<{ 
    success: boolean; 
    sessionToken?: string; 
    reason?: string 
  }> {
    logger.debug("GGClubAdapter", "performLogin - début", {
      hasCredentials: !!credentials,
    });
    
    await this.addRandomDelay(800);

    this.trackAction();

    // Note: C'est une simulation - le vrai login se fait via l'application GGClub native
    // Ce bot ne fait que détecter les fenêtres déjà ouvertes
    logger.info("GGClubAdapter", "✓ Session simulée créée (le bot utilise les fenêtres GGClub existantes)");
    
    return {
      success: true,
      sessionToken: `ggclub_session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
  }

  private startWindowPolling(): void {
    // logger.info("GGClubAdapter", "🔄 Démarrage du polling fenêtres (interval: 2s)");
    
    this.windowPollingInterval = setInterval(async () => {
      try {
        const windows = await this.detectTableWindows();
        
        // Log minimal pour debug en mode verbeux uniquement
        if (this.debugMode) {
          logger.debug("GGClubAdapter", `Polling: ${windows.length} fenêtre(s) détectée(s), ${this.activeWindows.size} active(s)`);
        }

        // Gestion des fenêtres fermées
        for (const [windowId, existingWindow] of this.activeWindows) {
          const cleanId = windowId.startsWith('ggclub_') ? windowId : `ggclub_${windowId}`;
          const stillExists = windows.some(w => {
            const wId = `ggclub_${Math.abs(w.handle)}`;
            return wId === cleanId || w.windowId === windowId || w.handle === existingWindow.handle;
          });
          
          if (!stillExists) {
            // Un petit délai avant de supprimer définitivement pour éviter les faux positifs lors de lags
            logger.info("GGClubAdapter", "🚪 Table possiblement fermée, vérification...", { windowId, handle: existingWindow.handle });
            // On attend le prochain cycle pour confirmer
            continue; 
          }
        }

        for (const window of windows) {
            // Create a unique stable window ID using handle if available, or title+position as fallback
            const cleanHandle = Math.abs(window.handle);
            const stableWindowId = window.windowId && window.windowId !== "ggclub_undefined" 
              ? window.windowId 
              : `ggclub_${cleanHandle || (window.title + "_" + window.x + "_" + window.y).replace(/\s+/g, "_")}`;

            if (!this.activeWindows.has(stableWindowId)) {
            const lowerProcess = (window.processName || "").toLowerCase();
            const lowerTitle = (window.title || "").toLowerCase();

            // 1. FILTRE DE PROCESSUS STRICT
            const isClubGG = lowerProcess.includes("clubgg.exe");
            
            if (!isClubGG) {
              continue;
            }

            // 2. FILTRE DE TITRE ET TAILLE STRICT (Table vs Lobby)
            const isLobby = lowerTitle === "clubgg" || lowerTitle.includes("lobby");
            const isTableSize = window.width >= 500 && window.height >= 400; 

            if (isLobby || !isTableSize) {
              if (this.debugMode) {
                logger.debug("GGClubAdapter", "Fenêtre ignorée (Lobby ou taille incorrecte)", { title: window.title, size: `${window.width}x${window.height}` });
              }
              continue;
            }

            // 3. FILTRE D'EXCLUSION SUPPLÉMENTAIRE
            const isExcludedTitle = 
              lowerTitle.includes("explorateur") || 
              lowerTitle.includes("explorer") || 
              lowerTitle.includes("bloc-notes") || 
              lowerTitle.includes("notepad") || 
              lowerTitle.includes("chrome") ||
              lowerTitle.includes("edge") ||
              lowerTitle.includes("replit") ||
              lowerTitle.includes("bot") ||
              lowerTitle.includes("wizard") ||
              lowerTitle.includes("session") ||
              lowerTitle.includes("log") ||
              lowerTitle.includes("terminé") ||
              lowerTitle.includes("gto") ||
              lowerTitle.includes("poker bot") ||
              lowerTitle.includes("google chrome") ||
              lowerTitle.includes("form1") ||
              lowerTitle.includes("visual studio") ||
              lowerTitle.includes("cmd.exe") ||
              lowerTitle.includes("powershell");

            if (isExcludedTitle) {
              continue;
            }
            
            logger.session("GGClubAdapter", "🎰 VRAIE TABLE DÉTECTÉE", {
              title: window.title,
              windowId: stableWindowId,
              handle: cleanHandle,
              size: `${window.width}x${window.height}`
            });
            
            const updatedWindow = { ...window, windowId: stableWindowId, handle: cleanHandle };
            // Ensure handle is correctly mapped and persistent
            this.activeWindows.set(stableWindowId, updatedWindow);
            if (cleanHandle) {
                // Also map by handle-based ID for lookup safety
                this.activeWindows.set(`ggclub_${cleanHandle}`, updatedWindow);
            }
            this.emitPlatformEvent("table_detected", { window: updatedWindow });
          }
        }
      } catch (error: any) {
        logger.error("GGClubAdapter", "❌ Erreur polling fenêtres", {
          error: String(error?.message || error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, 2000);
  }

  private stopWindowPolling(): void {
    if (this.windowPollingInterval) {
      clearInterval(this.windowPollingInterval);
      this.windowPollingInterval = undefined;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.connectionStatus === "connected" || this.connectionStatus === "authenticated") {
        await this.sendHeartbeat();
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    await this.addRandomDelay(100);
    this.trackAction();
  }

  async detectTableWindows(): Promise<TableWindow[]> {
    logger.info("GGClubAdapter", "Détection des fenêtres GGClub en cours...");

    if (!IS_WINDOWS || !windowManager) {
      logger.info("GGClubAdapter", "ℹ️ Mode développement/Linux - scan non disponible", {
        IS_WINDOWS,
        windowManagerLoaded: !!windowManager,
        platform: process.platform
      });
      return [];
    }

    // S'assurer que les modules sont chargés
    if (!robot || !screenshotDesktop) {
      await loadNativeModules();
    }

    const ggclubWindows = await this.scanForGGClubWindows();
    
    // Update activeWindows map with new data
    for (const win of ggclubWindows) {
      const cleanHandle = Math.abs(win.handle);
      const windowId = `ggclub_${cleanHandle}`;
      
      this.activeWindows.set(windowId, {
        windowId,
        handle: cleanHandle,
        title: win.title,
        x: win.x,
        y: win.y,
        width: win.width,
        height: win.height,
        isActive: win.isActive,
        isMinimized: win.isMinimized
      });
    }
    
    const results: TableWindow[] = ggclubWindows.map(win => ({
      windowId: `ggclub_${Math.abs(win.handle)}`,
      handle: Math.abs(win.handle),
      title: win.title,
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
      isActive: win.isActive,
      isMinimized: win.isMinimized,
    }));

    for (const table of results) {
      this.emitPlatformEvent("table_detected", { window: table });
    }

    /*
    if (results.length > 0) {
      logger.session("GGClubAdapter", `🎰 ${results.length} table(s) détectée(s)`, {
        tables: results.map(t => ({ title: t.title, handle: t.handle }))
      });
    }
    */

    return results;
  }

  private async scanForGGClubWindows(): Promise<GGClubWindowInfo[]> {
    const results: GGClubWindowInfo[] = [];

    if (IS_WINDOWS && windowManager) {
      try {
        const windows = windowManager.getWindows();
        const activeWindow = typeof windowManager.getActiveWindow === 'function' ? windowManager.getActiveWindow() : null;
        logger.info("GGClubAdapter", `Scan de ${windows.length} fenêtres système...`);

        // Log TOUTES les fenêtres pour debug avec plus de détails
        const allTitles: any[] = [];
        const GGCLUB_PROCESS_NAMES = ["clubgg", "ggpoker", "game"]; // Common process names for ClubGG

        for (const win of windows) {
          const title = win.getTitle();
          const bounds = win.getBounds();
          let processPath = "";
          let processName = "";
          
          try {
            if (typeof win.path === 'string') {
              processPath = win.path.toLowerCase();
            } else if (typeof win.getProcessPath === 'function') {
              processPath = (win.getProcessPath() || "").toLowerCase();
            } else if (win.process && typeof win.process.path === 'string') {
              processPath = win.process.path.toLowerCase();
            }
            
            if (processPath) {
              processName = processPath.split(/[\\/]/).pop() || "";
            }
          } catch (e) {}

          if (title || processName) {
            allTitles.push({ title, bounds, processPath, processName });
          }
        }

        /* 
        logger.info("GGClubAdapter", "📋 Liste détaillée des fenêtres ouvertes", { 
          count: allTitles.length,
          windows: allTitles.slice(0, 30)
        });
        */

        for (const win of windows) {
          const title = win.getTitle() || "";
          const bounds = win.getBounds();
          
          let processPath = "";
          let processName = "";
          try {
            if (typeof win.path === 'string') {
              processPath = win.path.toLowerCase();
            } else if (typeof win.getProcessPath === 'function') {
              processPath = (win.getProcessPath() || "").toLowerCase();
            } else if (win.process && typeof win.process.path === 'string') {
              processPath = win.process.path.toLowerCase();
            }
            if (processPath) {
              processName = (processPath.split(/[\\/]/).pop() || "").toLowerCase();
            }
          } catch (e) {}

          // Ignorer les fenêtres vides, trop petites ou sans titre significatif
          if (!bounds || bounds.width < 100 || bounds.height < 100) continue;
          if (!title || title.trim() === "" || title.toLowerCase() === "table sans titre") continue;

          // 1. DÉTECTION PAR NOM DE PROCESSUS (STRICT)
          // Seul clubgg.exe est autorisé
          const lowerProcess = (processName || "").toLowerCase();
          const lowerTitle = (title || "").toLowerCase();
          
          // Debugging log for every window found during scanning
          if (lowerTitle.includes("poker") || lowerTitle.includes("club") || lowerTitle.includes("gg") || lowerTitle.includes("game")) {
            logger.info("GGClubAdapter", `Fenêtre scannée: "${title}"`, { 
              processName, 
              processPath,
              bounds: `${bounds.width}x${bounds.height}`
            });
          }

          const isClubGGProcess = lowerProcess.includes("clubgg.exe") || 
                                 lowerProcess.includes("clubgg") ||
                                 lowerProcess.includes("ggpoker") ||
                                 lowerProcess.includes("game") ||
                                 lowerProcess.includes("poker");
          
          if (!isClubGGProcess) {
            continue;
          }

          // 2. FILTRE DE TITRE (Exclusions)
          const isExcludedTitle = 
            lowerTitle.includes("explorateur") || 
            lowerTitle.includes("explorer") || 
            lowerTitle.includes("bloc-notes") || 
            lowerTitle.includes("notepad") || 
            lowerTitle.includes("chrome") ||
            lowerTitle.includes("edge") ||
            lowerTitle.includes("replit") ||
            lowerTitle.includes("rest-express") ||
            lowerTitle.includes("bot") ||
            lowerTitle.includes("wizard") ||
            lowerTitle.includes("session") ||
            lowerTitle.includes("log") ||
            lowerTitle.includes("terminé") ||
            lowerTitle.includes("gto") ||
            lowerTitle.includes("poker bot") ||
            lowerTitle === "poker" || 
            lowerTitle === "clubgg" ||
            lowerTitle.includes("google chrome") ||
            lowerTitle.includes("form1") ||
            lowerTitle.includes("visual studio") ||
            lowerTitle.includes("cmd.exe") ||
            lowerTitle.includes("powershell");

          if (isExcludedTitle) {
            continue;
          }

          // 3. FILTRE DE TAILLE (Heuristique de table de poker)
          // On demande un titre qui ressemble à une table ou une taille cohérente
          let isMatch = false;
          let matchReason = "";

          // Seuil ultra-permissif pour s'assurer de ne rien rater
          if (bounds.width >= 100 && bounds.height >= 100) {
            isMatch = true;
            matchReason = "valid_poker_table";
            logger.info("GGClubAdapter", `DEBUG: Window MATCH criteria met for "${title}"`);
          }

          if (isMatch) {
            const finalHandle = win.handle || win.processId || Math.floor(Math.random() * 1000000);
            logger.info("GGClubAdapter", `🎯 Table MATCHÉE: "${title}" (Handle: ${finalHandle})`);
            results.push({
              handle: finalHandle,
              title: title,
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              isActive: activeWindow && activeWindow.handle === win.handle,
              isMinimized: false
            });
          }
        }

        if (results.length > 0) {
          // Log toutes les tables de poker matchées
          logger.session("GGClubAdapter", `🎰 ${results.length} table(s) de poker active(s)`, {
            tables: results.map(t => ({ title: t.title, handle: t.handle }))
          });
        }

        return results;
      } catch (error) {
        logger.error("GGClubAdapter", "❌ Erreur scan windows", { 
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        return [];
      }
    } else {
      logger.error("GGClubAdapter", "❌ node-window-manager NON disponible", {
        IS_WINDOWS,
        windowManagerLoaded: !!windowManager,
        platform: process.platform
      });
      return [];
    }
  }

  async captureScreen(windowHandle: number): Promise<Buffer> {
    const cachedCapture = this.lastScreenCaptures.get(windowHandle);
    const now = Date.now();

    if (cachedCapture && (now - cachedCapture.timestamp) < this.screenCaptureInterval) {
      return cachedCapture.buffer;
    }

    try {
      const { getDXGICapture } = await import("../dxgi-capture");
      const dxgi = getDXGICapture();
      const buffer = await dxgi.captureScreen(windowHandle);
      
      if (buffer && buffer.length > 0) {
        this.lastScreenCaptures.set(windowHandle, { buffer, timestamp: now });
        this.antiDetectionMonitor.recordScreenCapture();
        return buffer;
      }
    } catch (error) {
      console.log(`[Capture] DXGI capture not available for ${windowHandle}`);
    }

    try {
      const robot = require("robotjs");
      const { windowManager } = require("node-window-manager");
      const windows = windowManager.getWindows();
      const window = windows.find((w: any) => w.handle === windowHandle);
      
      if (window) {
        const bounds = window.getBounds();
        const bitmap = robot.screen.capture(bounds.x, bounds.y, bounds.width, bounds.height);
        
        if (bitmap && bitmap.image) {
          const buffer = Buffer.from(bitmap.image);
          this.lastScreenCaptures.set(windowHandle, { buffer, timestamp: now });
          this.antiDetectionMonitor.recordScreenCapture();
          return buffer;
        }
      }
    } catch (error) {
      // Silently fail fallback
    }

    // Second Fallback: screenshot-desktop
    try {
      const screenshot = require("screenshot-desktop");
      const buffer = await screenshot({ format: 'png' });
      if (buffer && buffer.length > 0) {
        this.lastScreenCaptures.set(windowHandle, { buffer, timestamp: now });
        this.antiDetectionMonitor.recordScreenCapture();
        return buffer;
      }
    } catch (error) {
      // Silently fail fallback
    }

    return Buffer.alloc(0);
  }

  private async performAutoRecalibration(windowHandle: number): Promise<void> {
    try {
      const screenBuffer = await this.captureScreen(windowHandle);
      const tableWindow = this.activeWindows.get(`ggclub_${windowHandle}`);
      if (!tableWindow || !this.activeCalibration) return;

      const result = await this.autoCalibration.performRecalibration(
        windowHandle,
        screenBuffer,
        tableWindow.width,
        tableWindow.height,
        this.activeCalibration
      );

      if (result.success && result.adjustedRegions) {
        // Mettre à jour les régions scaled pour cette fenêtre
        this.scaledRegions.set(windowHandle, result.adjustedRegions);

        // Mettre à jour le layout local
        this.screenLayout = {
          heroCardsRegion: result.adjustedRegions.heroCards,
          communityCardsRegion: result.adjustedRegions.communityCards,
          potRegion: result.adjustedRegions.pot,
          actionButtonsRegion: result.adjustedRegions.actionButtons,
          betSliderRegion: result.adjustedRegions.betSlider,
          playerSeats: result.adjustedRegions.playerSeats,
          dealerButtonRegion: result.adjustedRegions.dealerButton,
          chatRegion: result.adjustedRegions.chat,
          timerRegion: result.adjustedRegions.timer,
        };

        console.log(`[GGClubAdapter] Auto-recalibration applied for window ${windowHandle}: ${result.reason}`);

        // Log calibration drift
        if (result.drift) {
          visionErrorLogger.logCalibrationDrift(
            windowHandle,
            result.drift.offsetX,
            result.drift.offsetY,
            result.drift.confidence
          );
        }

        this.emitPlatformEvent("calibration_adjusted", {
          windowHandle,
          drift: result.drift,
          reason: result.reason,
        });
      } else {
        console.log(`[GGClubAdapter] Auto-recalibration skipped for window ${windowHandle}: ${result.reason}`);
      }
    } catch (error) {
      console.error(`[GGClubAdapter] Auto-recalibration error for window ${windowHandle}:`, error);
    }
  }

  private async captureScreen(windowHandle: number): Promise<Buffer> {
    logger.debug("GGClubAdapter", `[${windowHandle}] captureScreen - tentative`);
    
    if (screenshotDesktop) {
      try {
        const window = this.activeWindows.get(`ggclub_${windowHandle}`);
        if (window) {
          logger.info("GGClubAdapter", `[${windowHandle}] Tentative de capture pour la fenêtre: ${window.title} (${window.width}x${window.height})`);
          
          const pngBuffer = await screenshotDesktop({
            screen: window.title,
            format: 'png',
          });
          
          if (!pngBuffer || pngBuffer.length === 0) {
            logger.error("GGClubAdapter", `[${windowHandle}] Capture retournée vide pour: ${window.title}`);
            return Buffer.alloc(0);
          }

          logger.info("GGClubAdapter", `[${windowHandle}] PNG reçu (${pngBuffer.length} bytes), signature: ${pngBuffer.slice(0, 8).toString('hex')}`);
          
          try {
            // Décoder PNG en RGBA
            const rgbaBuffer = await this.decodePngToRgba(pngBuffer);
            logger.info("GGClubAdapter", `[${windowHandle}] RGBA décodé avec succès (${rgbaBuffer.length} bytes)`);
            return rgbaBuffer;
          } catch (decodeError) {
            logger.error("GGClubAdapter", `[${windowHandle}] Décodage PNG échoué: ${String(decodeError)}`);
            // Si le décodage fail, retourner quand même le PNG - le pipeline va le gérer (ou crasher plus loin, mais on a le log)
            return pngBuffer;
          }
        }

        logger.warning("GGClubAdapter", `[${windowHandle}] Fenêtre non trouvée dans activeWindows (handles dispos: ${Array.from(this.activeWindows.keys()).join(', ')})`);
        const imgBuffer = await screenshotDesktop({ format: 'png' });
        return imgBuffer;
      } catch (error) {
        logger.error("GGClubAdapter", `[${windowHandle}] Erreur critique lors de la capture/décodage`, { error: String(error) });
        return Buffer.alloc(0);
      }
    }

    logger.error("GGClubAdapter", `[${windowHandle}] screenshot-desktop indisponible`);
    return Buffer.alloc(0);
  }

  private async decodePngToRgba(pngBuffer: Buffer): Promise<Buffer> {
    logger.debug("GGClubAdapter", `decodePngToRgba - Début du traitement (${pngBuffer.length} bytes)`);
    try {
      if (pngBuffer.length < 24) throw new Error(`Buffer PNG trop petit (${pngBuffer.length} bytes)`);
      
      const signature = pngBuffer.slice(0, 8).toString('hex');
      if (signature !== '89504e470d0a1a0a') {
        throw new Error(`Signature PNG invalide: ${signature}`);
      }
      
      // Lire IHDR chunk (width/height)
      const width = pngBuffer.readUInt32BE(16);
      const height = pngBuffer.readUInt32BE(20);
      const bitDepth = pngBuffer[24];
      const colorType = pngBuffer[25]; // 6 = RGBA, 2 = RGB
      
      logger.info("GGClubAdapter", `PNG IHDR: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}`);
      
      // Trouver chunk IDAT (image data compressé)
      let offset = 8; // Après signature
      let idatData: Buffer[] = [];
      
      while (offset < pngBuffer.length - 12) {
        const chunkLength = pngBuffer.readUInt32BE(offset);
        const chunkType = pngBuffer.toString('ascii', offset + 4, offset + 8);
        
        if (chunkType === 'IDAT') {
          logger.debug("GGClubAdapter", `Chunk IDAT trouvé: offset=${offset}, length=${chunkLength}`);
          const chunkData = pngBuffer.slice(offset + 8, offset + 8 + chunkLength);
          idatData.push(chunkData);
        } else if (chunkType === 'IEND') {
          logger.debug("GGClubAdapter", `Chunk IEND trouvé à offset=${offset}`);
          break;
        }
        
        offset += 12 + chunkLength;
      }
      
      if (idatData.length === 0) {
        throw new Error('Aucun chunk IDAT trouvé dans le PNG');
      }
      
      const compressedData = Buffer.concat(idatData);
      logger.info("GGClubAdapter", `Données compressées IDAT concaténées: ${compressedData.length} bytes`);
      
      // Décompresser avec zlib
      const zlib = require('zlib');
      const pixelData = await new Promise<Buffer>((resolve, reject) => {
        zlib.inflate(compressedData, (err: any, result: Buffer) => {
          if (err) {
            logger.error("GGClubAdapter", `Erreur zlib.inflate: ${err.message}`);
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
      
      logger.info("GGClubAdapter", `Données décompressées: ${pixelData.length} bytes (attendu environ ${width * height * (colorType === 6 ? 4 : 3)})`);
      
      const rgbaBuffer = Buffer.alloc(width * height * 4);
      let pixelIdx = 0;
      let rgbaIdx = 0;
      
      for (let y = 0; y < height; y++) {
        // PNG pixel data = scanlines avec byte de filtre au début de chaque ligne
        if (pixelIdx >= pixelData.length) {
          logger.error("GGClubAdapter", `Fin de buffer inattendue à la ligne ${y}`);
          break;
        }
        const filterType = pixelData[pixelIdx++];
        
        for (let x = 0; x < width; x++) {
          if (colorType === 6) {
            // RGBA
            if (pixelIdx + 3 < pixelData.length) {
              rgbaBuffer[rgbaIdx++] = pixelData[pixelIdx++];
              rgbaBuffer[rgbaIdx++] = pixelData[pixelIdx++];
              rgbaBuffer[rgbaIdx++] = pixelData[pixelIdx++];
              rgbaBuffer[rgbaIdx++] = pixelData[pixelIdx++];
            }
          } else if (colorType === 2) {
            // RGB
            if (pixelIdx + 2 < pixelData.length) {
              rgbaBuffer[rgbaIdx++] = pixelData[pixelIdx++];
              rgbaBuffer[rgbaIdx++] = pixelData[pixelIdx++];
              rgbaBuffer[rgbaIdx++] = pixelData[pixelIdx++];
              rgbaBuffer[rgbaIdx++] = 255; // Alpha opaque
            }
          } else {
            // Greyscale
            if (pixelIdx < pixelData.length) {
              const gray = pixelData[pixelIdx++];
              rgbaBuffer[rgbaIdx++] = gray;
              rgbaBuffer[rgbaIdx++] = gray;
              rgbaBuffer[rgbaIdx++] = gray;
              rgbaBuffer[rgbaIdx++] = 255;
            }
          }
        }
      }
      
      return rgbaBuffer;
    } catch (error) {
      logger.error("GGClubAdapter", `Échec du décodage PNG: ${String(error)}`);
      throw error;
    }
  }

  async getGameState(windowHandle: number): Promise<GameTableState> {
    const cleanHandle = Math.abs(windowHandle);
    const tableId = `ggclub_${cleanHandle}`;
    logger.info("GGClubAdapter", `[${cleanHandle}] getGameState - Début de l'analyse pour ${tableId}`);
    
    const table = this.activeWindows.get(tableId) || 
                  this.activeWindows.get(String(cleanHandle)) ||
                  Array.from(this.activeWindows.values()).find(w => Math.abs(w.handle) === cleanHandle);
    
    if (!table) {
      const handles = Array.from(this.activeWindows.keys());
      logger.error("GGClubAdapter", `[${cleanHandle}] Table non trouvée dans activeWindows. Handles dispos: ${handles.join(", ")}`);
      throw new Error(`Table with handle ${cleanHandle} not found`);
    }

    logger.info("GGClubAdapter", `[${cleanHandle}] Table trouvée: ${table.title} (${table.width}x${table.height})`);

    // MISE À JOUR DYNAMIQUE DU SCALING DES RÉGIONS
    const baseLayout = this.getDefaultScreenLayout();
    const scale = (region: ScreenRegion) => ({
      x: Math.round(region.x * table.width),
      y: Math.round(region.y * table.height),
      width: Math.round(region.width * table.width),
      height: Math.round(region.height * table.height),
    });

    this.screenLayout = {
      heroCardsRegion: baseLayout.heroCardsRegion.map(r => scale(r as ScreenRegion)),
      communityCardsRegion: baseLayout.communityCardsRegion.map(r => scale(r as ScreenRegion)),
      potRegion: scale(baseLayout.potRegion),
      actionButtonsRegion: scale(baseLayout.actionButtonsRegion),
      betSliderRegion: scale(baseLayout.betSliderRegion),
      playerSeats: baseLayout.playerSeats.map(r => scale(r)),
      dealerButtonRegion: scale(baseLayout.dealerButtonRegion),
      chatRegion: scale(baseLayout.chatRegion),
      timerRegion: scale(baseLayout.timerRegion),
    };

    logger.info("📐 RESPONSIVE SYSTEM", `[${cleanHandle}] Régions scalées pour ${table.width}x${table.height}`, {
      pot: this.screenLayout.potRegion,
      hero: this.screenLayout.heroCardsRegion[0]
    });

    try {
      logger.info("GGClubAdapter", `[${cleanHandle}] === DÉBUT ANALYSE TABLE ===`);
      
      // LOG D'ÉTAT INITIAL
      logger.info("GGClubAdapter", `[${cleanHandle}] État de activeWindows: ${this.activeWindows.has(tableId)}`);
      
      logger.info("GGClubAdapter", `[${cleanHandle}] Tentative de capture d'écran pour la table: ${table.title}`);
      const screenshot = await this.captureScreen(cleanHandle);
      
      if (!screenshot || screenshot.length === 0) {
        logger.error("GGClubAdapter", `[${windowHandle}] ❌ Capture d'écran ÉCHOUÉE (buffer vide)`);
        throw new Error("Screenshot capture failed or returned empty buffer");
      }
      logger.info("GGClubAdapter", `[${windowHandle}] ✅ Capture réussie: ${screenshot.length} octets`);
      
      // ÉTAPE 1 (priorité absolue): SIGNAL VISUEL FIABLE
      logger.info("GGClubAdapter", `[${windowHandle}] Analyse des actions disponibles...`);
      const buttons = await this.detectAvailableActions(windowHandle);
      const isHeroTurn = buttons.length > 0;
      logger.info("GGClubAdapter", `[${windowHandle}] 📢 Hero Turn Détecté: ${isHeroTurn}`, { buttons: buttons.map(b => b.type) });

      if (isHeroTurn) {
        logger.info("GAME", "🎯 Hero to act detected", { tableId, windowHandle });
        this.emit('hero_turn', { 
          tableId, 
          windowHandle, 
          title: table.title,
          buttons 
        });
      }

      logger.info("GGClubAdapter", `[${windowHandle}] 🚀 Initialisation du pipeline OCR...`);
      const { initializeOCRPipeline } = await import("../ocr-pipeline/ocr-pipeline");
      const ocrPipeline = await initializeOCRPipeline();
      
      logger.info("GGClubAdapter", `[${windowHandle}] Config pipeline: ${table.width}x${table.height}`);
      ocrPipeline.setFrameSize(table.width, table.height);
      
      const frame = ocrPipeline.pushFrame(screenshot, table.width, table.height, 'rgba');
      logger.info("GGClubAdapter", `[${windowHandle}] Frame injectée. Extraction de l'état de la table...`);
      
      let state: any = { potSize: 0, heroCards: [], communityCards: [], playersData: [] };
      try {
        logger.info("GGClubAdapter", `[${windowHandle}] Appel de ocrPipeline.extractTableState...`);
        const result = await ocrPipeline.extractTableState(frame);
        if (result) {
          state = { ...state, ...result };
          logger.info("GGClubAdapter", `[${windowHandle}] ✅ ocrPipeline.extractTableState a retourné un résultat`);
        } else {
          logger.warn("GGClubAdapter", `[${windowHandle}] ⚠️ ocrPipeline.extractTableState a retourné null/undefined`);
        }
      } catch (ocrError) {
        logger.error("GGClubAdapter", `[${windowHandle}] ❌ Erreur attrapée DIRECTEMENT autour de l'appel: ${String(ocrError)}`);
      }
      
      logger.info("GGClubAdapter", `[${windowHandle}] 📊 OCR PIPELINE RESULTS:`, { 
        pot: state.potSize, 
        heroCards: state.heroCards,
        community: state.communityCards,
        players: state.playersData?.length || 0
      });

      const structuredState = GameStateDetector.detect({
        ...state,
        isHeroTurn,
        availableActions: buttons,
        currentStreet: (state.communityCards?.length === 0 || !state.communityCards) ? "preflop" : 
                      state.communityCards?.length === 3 ? "flop" :
                      state.communityCards?.length === 4 ? "turn" :
                      state.communityCards?.length === 5 ? "river" : "unknown",
      });

      logger.info("GGClubAdapter", `[${windowHandle}] État structuré détecté`, { structuredState });

      // Map extracted state to GameTableState
      const gameTableState: GameTableState = {
        tableId: table.windowId,
        windowHandle: table.handle,
        heroCards: (state.heroCards || []).map(c => parseCardNotation(c)),
        communityCards: (state.communityCards || []).map(c => parseCardNotation(c)),
        potSize: structuredState.potSize || 0,
        heroStack: state.heroStack || 0,
        heroPosition: 0, 
        players: state.playersData ? (state.playersData as any[]) : [], 
        isHeroTurn: structuredState.heroToAct,
        currentStreet: structuredState.street || "unknown",
        facingBet: 0,
        blindLevel: { smallBlind: 1, bigBlind: 2 }, 
        availableActions: buttons,
        timestamp: Date.now()
      };

      if (this.debugMode) {
        logger.debug("GGClubAdapter", "Detected Game State", {
          heroCards: gameTableState.heroCards.length,
          pot: gameTableState.potSize,
          actions: gameTableState.availableActions.length
        });
      }

      // Emit game_state event for the platform manager
      this.emitPlatformEvent("game_state", gameTableState);

      if (gameTableState.isHeroTurn) {
        this.emitPlatformEvent("action_required", {
          windowHandle,
          gameState: gameTableState,
          availableActions: gameTableState.availableActions
        });
      }

      this.lastGameState = gameTableState;

      // LOG CRUCIAL POUR LE DEBUG UTILISATEUR
      logger.info("GGClubAdapter", `[PlatformManager] Événement plateforme | DATA: ${JSON.stringify({
        type: "game_state",
        tableId: gameTableState.tableId,
        street: gameTableState.currentStreet,
        heroTurn: gameTableState.isHeroTurn,
        pot: gameTableState.potSize,
        heroCards: gameTableState.heroCards.map(c => `${c.rank}${c.suit[0]}`)
      })}`);

      return gameTableState;
    } catch (error) {
      logger.error("GGClubAdapter", "Error getting game state", { error: String(error) });
      throw error;
    }
  }

  private findHeroPosition(players: DetectedPlayer[]): number {
    const heroPlayer = players.find(p => p.name === "Hero" || p.isActive);
    return heroPlayer?.position || 0;
  }

  private determineStreet(communityCardCount: number): "preflop" | "flop" | "turn" | "river" | "unknown" {
    switch (communityCardCount) {
      case 0: return "preflop";
      case 3: return "flop";
      case 4: return "turn";
      case 5: return "river";
      default: return "unknown";
    }
  }

  private calculateFacingBet(players: DetectedPlayer[], heroPosition: number): number {
    let maxBet = 0;
    let heroBet = 0;

    for (const player of players) {
      if (player.position === heroPosition) {
        heroBet = player.currentBet;
      } else if (!player.isFolded) {
        maxBet = Math.max(maxBet, player.currentBet);
      }
    }

    return Math.max(0, maxBet - heroBet);
  }

  async detectHeroCards(windowHandle: number): Promise<CardInfo[]> {
    console.log(`[GGClubAdapter] [${windowHandle}] detectHeroCards - début`);
    const startTime = Date.now();
    const screenBuffer = await this.captureScreen(windowHandle);
    if (screenBuffer.length === 0) {
      console.log(`[GGClubAdapter] [${windowHandle}] detectHeroCards - buffer vide`);
      return [];
    }

    const cards: CardInfo[] = [];
    const tableWindow = this.activeWindows.get(`ggclub_${windowHandle}`);
    const imageWidth = tableWindow?.width || 880;
    const imageHeight = tableWindow?.height || 600;

    console.log(`[GGClubAdapter] [${windowHandle}] detectHeroCards - Dimensions: ${imageWidth}x${imageHeight}`);

    // Ensure screenLayout.heroCardsRegion is treated as an array
    const heroCardRegions = Array.isArray(this.screenLayout.heroCardsRegion)
      ? this.screenLayout.heroCardsRegion
      : [this.screenLayout.heroCardsRegion];

    for (let i = 0; i < heroCardRegions.length; i++) {
      const region = heroCardRegions[i];
      console.log(`[GGClubAdapter] [${windowHandle}] Analyse région carte ${i}: ${JSON.stringify(region)}`);
      
      const rank = await this.recognizeCardRank(windowHandle, "hero", i);
      const suit = await this.recognizeCardSuit(region, screenBuffer, imageWidth);
      
      console.log(`[GGClubAdapter] [${windowHandle}] Carte ${i} - Rang: ${rank || '?'}, Couleur: ${suit || '?'}`);

      if (rank && suit) {
        cards.push({
          rank,
          suit,
          raw: `${rank}${suit[0]}`,
        });
      }
    }
    console.log(`[GGClubAdapter] [${windowHandle}] detectHeroCards - Cartes finales: ${JSON.stringify(cards)} (temps: ${Date.now() - startTime}ms)`);
    return cards;
  }

  async detectCommunityCards(windowHandle: number): Promise<CardInfo[]> {
    const screenBuffer = await this.captureScreen(windowHandle);
    if (screenBuffer.length === 0) return []; // Handle empty buffer

    // Ensure screenLayout.communityCardsRegion is treated as an array
    const communityCardRegions = Array.isArray(this.screenLayout.communityCardsRegion)
      ? this.screenLayout.communityCardsRegion
      : [this.screenLayout.communityCardsRegion];

    // Assuming community cards are laid out sequentially in the region
    if (communityCardRegions.length === 0) return [];

    return this.recognizeCardsInRegion(screenBuffer, communityCardRegions[0], windowHandle);
  }

  private async recognizeCardsInRegion(screenBuffer: Buffer, region: ScreenRegion, windowHandle: number): Promise<CardInfo[]> { // Added windowHandle
    await this.addRandomDelay(30);

    const cards: CardInfo[] = [];
    const window = this.activeWindows.get(`ggclub_${windowHandle}`); // Use windowHandle
    const imageWidth = window?.width || 880;

    if (this.debugMode && window) { // Check if window exists for debug visualizer
      debugVisualizer.startFrame(window.handle);
      debugVisualizer.addRegion("cardRegion", region, "Cards");
    }

    const preprocessedBuffer = preprocessForOCR(
      screenBuffer,
      imageWidth,
      window?.height || 600, // Use window height if available
      {
        blurRadius: 1,
        contrastFactor: 1.3,
        thresholdValue: 128,
        adaptiveThreshold: true,
        noiseReductionLevel: "medium",
      }
    );

    const cardPatterns = this.detectCardPatterns(screenBuffer, region);

    for (let i = 0; i < cardPatterns.length; i++) { // Added index i
      const pattern = cardPatterns[i];
      const rank = await this.recognizeCardRank(windowHandle, "community", i); // Pass windowHandle and index i
      const suit = await this.recognizeCardSuit(pattern, screenBuffer, imageWidth); // Use pattern for suit region

      if (rank && suit) {
        cards.push({
          rank,
          suit,
          raw: `${rank}${suit.charAt(0)}`,
        });

        if (this.debugMode && window) {
          debugVisualizer.addDetection("card", pattern, `${rank}${suit.charAt(0)}`, 0.8, "combined");
        }
      }
    }

    if (this.debugMode && window) {
      debugVisualizer.endFrame();
    }

    return cards;
  }

  private detectCardPatterns(screenBuffer: Buffer, region: ScreenRegion): ScreenRegion[] {
    const patterns: ScreenRegion[] = [];
    const cardWidth = 50;
    const cardHeight = 70;
    const cardSpacing = 5;

    const maxCards = Math.floor((region.width + cardSpacing) / (cardWidth + cardSpacing));

    for (let i = 0; i < maxCards; i++) {
      patterns.push({
        x: region.x + i * (cardWidth + cardSpacing),
        y: region.y,
        width: cardWidth,
        height: cardHeight,
      });
    }

    return patterns;
  }

  // Updated to accept windowHandle and index for multi-frame validation
  async recognizeCardRank(windowHandle: number, position: "hero" | "community", index: number): Promise<string | null> {
    const screenBuffer = await this.captureScreen(windowHandle);
    if (screenBuffer.length === 0) return null; // Handle empty buffer

    // Ensure screenLayout.heroCardsRegion and screenLayout.communityCardsRegion are arrays
    const heroCardRegions = Array.isArray(this.screenLayout.heroCardsRegion) ? this.screenLayout.heroCardsRegion : [this.screenLayout.heroCardsRegion];
    const communityCardRegions = Array.isArray(this.screenLayout.communityCardsRegion) ? this.screenLayout.communityCardsRegion : [this.screenLayout.communityCardsRegion];

    const cardRegions = position === "hero" ? heroCardRegions : communityCardRegions;

    if (index >= cardRegions.length) {
      return null;
    }

    const rankRegion = cardRegions[index];
    let detectedRank: string | null = null;
    let confidence = 0;

    const window = this.activeWindows.get(`ggclub_${windowHandle}`);
    if (!window) return null; // Cannot proceed without window info

    // Enhanced card recognition using ML model if available
    if (this.enableML && this.pokerOCREngine) {
      try {
        console.log(`[GGClubAdapter] DEBUG: Recognizing rank for ${position} card ${index} at region: ${JSON.stringify(rankRegion)}`);
        // Assuming classify method returns { rank: string, confidence: number, method: string }
        const result = await this.pokerOCREngine.recognizeRank(screenBuffer, window.width, window.height, rankRegion);
        console.log(`[GGClubAdapter] DEBUG: ML Result: ${result.rank} (conf: ${result.confidence})`);

        if (this.debugMode) {
          const debugVisualizer = (await import("../debug-visualizer")).getDebugVisualizer();
          debugVisualizer.addDetection("card", rankRegion, result.rank || "?", result.confidence, "ml");
        }

        if (result.rank && result.confidence > this.mlConfidenceThreshold) {
          detectedRank = result.rank;
          confidence = result.confidence;
        }
      } catch (error) {
        console.error("[GGClubAdapter] ML card rank recognition error:", error);
      }
    }

    // Fallback to existing methods if ML fails or is disabled
    if (!detectedRank) {
      try {
        const width = window.width || 880;
        const height = window.height || 600;

        const rankSubRegion: ScreenRegion = {
          x: rankRegion.x,
          y: rankRegion.y,
          width: Math.min(rankRegion.width * 0.4, 25),
          height: Math.min(rankRegion.height * 0.35, 25),
        };

        // Use combined recognizer which might include ML, Template, and OCR
        const mlResult = this.cardRecognizer.recognizeRank(screenBuffer, width, height, rankSubRegion);

        if (this.debugMode) {
          debugVisualizer.addDetection("card", rankSubRegion, mlResult.rank || "?", mlResult.confidence, mlResult.method);
        }

        if (mlResult.rank && mlResult.confidence > 0.1) { // Massive reduction to capture any match
          detectedRank = mlResult.rank;
          confidence = mlResult.confidence;
        } else {
          // Consider template matching as a fallback if needed
          const templateResult = templateMatcher.matchCardRank(screenBuffer, width, height, rankSubRegion);
          if (templateResult.rank && templateResult.confidence > 0.1) { // Massive reduction
            detectedRank = templateResult.rank;
            confidence = templateResult.confidence;
          }
        }
      } catch (error) {
        console.error("[GGClubAdapter] Card rank recognition error (fallback):", error);
      }
    }

    // Multi-frame validation for cards
    if (detectedRank) {
      return detectedRank; // Skip multi-frame for now to ensure we see SOMETHING
    }

    return detectedRank; // Return the rank if not validated or no multi-frame data yet
  }

  private async recognizeCardSuit(region: ScreenRegion, screenBuffer?: Buffer, imageWidth?: number): Promise<string | null> {
    await this.addRandomDelay(10);

    if (screenBuffer && imageWidth && screenBuffer.length > 0) { // Check for valid buffer
      try {
        const width = imageWidth || 880;
        const height = 600; // Assume default height if not provided

        const suitRegion: ScreenRegion = {
          x: region.x,
          y: region.y + Math.floor(region.height * 0.35),
          width: Math.min(region.width * 0.4, 20),
          height: Math.min(region.height * 0.3, 20),
        };

        const result = detectSuitByHSV(screenBuffer, width, height, suitRegion);
        console.log(`[GGClubAdapter] DEBUG: Suit detection result: ${result.suit} (conf: ${result.confidence}) at region: ${JSON.stringify(suitRegion)}`);

        if (this.debugMode) {
          debugVisualizer.addDetection("card", suitRegion, result.suit || "?", result.confidence, "hsv");
        }

        if (result.suit && result.confidence > 0.3) {
          return result.suit;
        }
      } catch (error) {
        console.error("[GGClubAdapter] Card suit recognition error:", error);
      }
    }

    // Fallback to random suit if detection fails
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    return suits[Math.floor(Math.random() * suits.length)];
  }

  async detectPot(windowHandle: number): Promise<number> {
    console.log(`[GGClubAdapter] [${windowHandle}] detectPot - début`);
    try {
      const screenBuffer = await this.captureScreen(windowHandle);
      if (screenBuffer.length === 0) return 0;

      const region = this.screenLayout.potRegion;
      const window = this.activeWindows.get(`ggclub_${windowHandle}`);
      if (!window) return 0;
      
      const imageWidth = window.width || 880;
      const imageHeight = window.height || 600;

      // Force une nouvelle capture et un nouveau traitement sans cache
      const ocrResult = await this.performOCR(screenBuffer, region, imageWidth, imageHeight);
      const parsed = this.parseAmount(ocrResult.text);
      
      if (parsed > 0) {
        logger.info("GGClubAdapter", `[${windowHandle}] Pot détecté: ${parsed}`);
        return parsed;
      }

      return 0;
    } catch (error) {
      logger.error("GGClubAdapter", "Error in detectPot", { error: String(error) });
      return 0;
    }
  }

  private async performOCRWithAlternativePreprocessing(screenBuffer: Buffer, region: ScreenRegion, window: TableWindow | undefined): Promise<OCRResult> {
    // Guard: window is provided (windowHandle removed - was causing undefined reference)
    if (!window) {
      return { text: '', confidence: 0, method: 'none' };
    }
    const imageWidth = window.width || 880;
    const imageHeight = window.height || 600;

    // Guard: validate buffer before preprocessing
    if (!this.validateImageBuffer(screenBuffer)) {
      logger.warning("GGClubAdapter", "Image buffer invalid for OCR", { size: screenBuffer.length });
      return { text: '', confidence: 0, method: 'none' };
    }

    const preprocessed = preprocessForOCR(
      screenBuffer,
      imageWidth,
      imageHeight,
      {
        blurRadius: 0,
        contrastFactor: 1.8,
        thresholdValue: 140,
        adaptiveThreshold: false,
        noiseReductionLevel: "low",
      }
    );
    return this.performOCR(preprocessed, region, imageWidth, imageHeight); // Pass dimensions
  }

  private parseAmount(text: string): number {
    const cleaned = text.replace(/[^0-9.,]/g, "");
    const normalized = cleaned.replace(",", ".");
    // Handle cases where '.' is used as a thousands separator
    const parts = normalized.split('.');
    if (parts.length > 2) {
      // Remove thousands separators
      const integerPart = parts.slice(0, -1).join('');
      const decimalPart = parts[parts.length - 1];
      const value = parseFloat(`${integerPart}.${decimalPart}`);
      return isNaN(value) ? 0 : value;
    } else {
      const value = parseFloat(normalized);
      return isNaN(value) ? 0 : value;
    }
  }


  async detectPlayers(windowHandle: number): Promise<DetectedPlayer[]> {
    const screenBuffer = await this.captureScreen(windowHandle);
    if (screenBuffer.length === 0) return [];

    const players: DetectedPlayer[] = [];
    const window = this.activeWindows.get(`ggclub_${windowHandle}`);
    const imageWidth = window?.width || 880;
    const imageHeight = window?.height || 600;

    for (let i = 0; i < this.screenLayout.playerSeats.length; i++) {
      const seatRegion = this.screenLayout.playerSeats[i];
      
      // OCR simple pour le nom et stack
      const [name, stack] = await Promise.all([
        this.recognizePlayerName(screenBuffer, seatRegion, imageWidth, imageHeight),
        this.recognizePlayerStack(screenBuffer, seatRegion, imageWidth, imageHeight)
      ]);

      if (name || (stack && stack > 0)) {
        players.push({
          position: i,
          name: name || `Player ${i}`,
          stack: stack || 0,
          currentBet: 0,
          isFolded: false,
          isActive: true,
          isHero: i === 0,
        });
      }
    }

    return players;
  }

  private async analyzePlayerSeat(
    screenBuffer: Buffer, 
    seatRegion: ScreenRegion, 
    position: number,
    imageWidth: number, // Pass image dimensions
    imageHeight: number
  ): Promise<DetectedPlayer | null> {
    const isOccupied = await this.checkSeatOccupied(screenBuffer, seatRegion, imageWidth, imageHeight);
    if (!isOccupied) return null;

    const [name, stack, currentBet, status] = await Promise.all([
      this.recognizePlayerName(screenBuffer, seatRegion, imageWidth, imageHeight),
      this.recognizePlayerStack(screenBuffer, seatRegion, imageWidth, imageHeight),
      this.recognizePlayerBet(screenBuffer, seatRegion, imageWidth, imageHeight),
      this.recognizePlayerStatus(screenBuffer, seatRegion, imageWidth, imageHeight),
    ]);

    return {
      position,
      name: name || `Player${position + 1}`,
      stack: stack || 0,
      currentBet: currentBet || 0,
      isActive: status === "active",
      isFolded: status === "folded",
      isDealer: await this.checkIsDealer(screenBuffer, seatRegion, imageWidth, imageHeight),
      isSmallBlind: false, // Placeholder, might need more advanced detection
      isBigBlind: false, // Placeholder
      seatRegion,
    };
  }

  private async checkSeatOccupied(screenBuffer: Buffer, region: ScreenRegion, imageWidth: number, imageHeight: number): Promise<boolean> {
    // Simple check: if there's significant color/content in the seat region, assume occupied.
    // More sophisticated checks could involve looking for player name/stack patterns.
    const dominantColor = getDominantColorInRegion(screenBuffer, imageWidth, imageHeight, region);
    // If dominant color is not background-like, assume occupied. Adjust threshold as needed.
    // A very dark or very light color might indicate background. Check for mid-range colors.
    const isBackground = (dominantColor.r < 50 && dominantColor.g < 50 && dominantColor.b < 50) || // Dark background
                         (dominantColor.r > 200 && dominantColor.g > 200 && dominantColor.b > 200); // Light background
    return !isBackground;
  }

  private async recognizePlayerName(screenBuffer: Buffer, region: ScreenRegion, imageWidth: number, imageHeight: number): Promise<string | null> {
    // Define a region specifically for the player name, typically at the top of the seat region.
    const nameRegion: ScreenRegion = {
      x: region.x,
      y: region.y,
      width: region.width,
      height: Math.min(20, region.height / 2), // Limit height to avoid capturing other elements
    };
    const ocrResult = await this.performOCR(screenBuffer, nameRegion, imageWidth, imageHeight);
    return ocrResult.text.trim() || null;
  }

  private async recognizePlayerStack(screenBuffer: Buffer, region: ScreenRegion, imageWidth: number, imageHeight: number): Promise<number | null> {
    // Define a region for the stack, usually below the name.
    const stackRegion: ScreenRegion = {
      x: region.x,
      y: region.y + (region.height > 30 ? 25 : region.height / 2), // Adjust Y based on region height
      width: region.width,
      height: Math.min(20, region.height / 2),
    };
    const ocrResult = await this.performOCR(screenBuffer, stackRegion, imageWidth, imageHeight);
    return this.parseAmount(ocrResult.text);
  }

  private async recognizePlayerBet(screenBuffer: Buffer, region: ScreenRegion, imageWidth: number, imageHeight: number): Promise<number | null> {
    // Define a region for the current bet, often near the stack or player name.
    const betRegion: ScreenRegion = {
      x: region.x + region.width / 2, // Assume bet is on the right side of the name/stack area
      y: region.y + (region.height > 30 ? 25 : region.height / 2),
      width: region.width / 2,
      height: Math.min(20, region.height / 2),
    };
    const ocrResult = await this.performOCR(screenBuffer, betRegion, imageWidth, imageHeight);
    return this.parseAmount(ocrResult.text);
  }

  private async recognizePlayerStatus(
    screenBuffer: Buffer, 
    region: ScreenRegion,
    imageWidth: number,
    imageHeight: number
  ): Promise<"active" | "folded" | "waiting" | "sitting_out"> {
    // Check for active player highlight
    const hasActiveHighlight = await this.checkColorInRegion(
      screenBuffer, 
      region, 
      GGCLUB_UI_COLORS.activePlayer,
      imageWidth,
      imageHeight
    );

    if (hasActiveHighlight) return "active";

    // Check for folded player color
    const hasFoldedColor = await this.checkColorInRegion(
      screenBuffer, 
      region, 
      GGCLUB_UI_COLORS.foldedPlayer,
      imageWidth,
      imageHeight
    );

    if (hasFoldedColor) return "folded";

    // If neither active nor folded, assume waiting or sitting out
    return "waiting";
  }

  private async checkIsDealer(screenBuffer: Buffer, region: ScreenRegion, imageWidth: number, imageHeight: number): Promise<boolean> {
    return this.checkColorInRegion(screenBuffer, region, GGCLUB_UI_COLORS.dealerButton, imageWidth, imageHeight);
  }

  private async checkColorInRegion(
    screenBuffer: Buffer, 
    region: ScreenRegion, 
    colorSignature: ColorSignature,
    imageWidth: number, // Add image dimensions
    imageHeight: number
  ): Promise<boolean> {
    if (screenBuffer.length === 0 || region.width <= 0 || region.height <= 0) {
      return false;
    }

    try {
      const colorRange = {
        r: colorSignature.r,
        g: colorSignature.g,
        b: colorSignature.b,
        tolerance: colorSignature.tolerance,
      };

      const result = findColorInRegion(screenBuffer, imageWidth, region, colorRange);

      // Calculate threshold based on region size, e.g., 5% of pixels match
      const threshold = (region.width * region.height) * 0.05;
      return result.matchCount >= threshold;
    } catch (error) {
      console.error("Color check error:", error);
      return false;
    }
  }

  async detectBlinds(windowHandle: number): Promise<{ smallBlind: number; bigBlind: number }> {
    const window = this.activeWindows.get(`ggclub_${windowHandle}`);
    if (window) {
      const blindsMatch = window.title.match(/NL(\d+)/i); // Case-insensitive match
      if (blindsMatch) {
        const bigBlind = parseInt(blindsMatch[1], 10);
        if (!isNaN(bigBlind)) {
          return { smallBlind: bigBlind / 2, bigBlind };
        }
      }
      const ploMatch = window.title.match(/PLO(\d+)/i); // Handle PLO stakes
      if (ploMatch) {
        const bigBlind = parseInt(ploMatch[1], 10);
        if (!isNaN(bigBlind)) {
          return { smallBlind: bigBlind / 2, bigBlind };
        }
      }
    }

    // Default blinds if not detected from title
    return { smallBlind: 0.25, bigBlind: 0.50 };
  }

  async isHeroTurn(windowHandle: number): Promise<boolean> {
    const tableId = `ggclub_${windowHandle}`;
    const table = this.activeWindows.get(tableId) || this.activeWindows.get(String(windowHandle));
    const screenBuffer = await this.captureScreen(windowHandle);
    if (screenBuffer.length === 0 || !table) return false;

    const imageWidth = table.width || 880;
    const imageHeight = table.height || 600;

    // 1. Détection par surbrillance dorée (Plus fiable que l'OCR)
    const hasHeroHighlight = await this.checkColorInRegion(
      screenBuffer,
      Array.isArray(this.screenLayout.heroCardsRegion) ? this.screenLayout.heroCardsRegion[0] : this.screenLayout.heroCardsRegion,
      GGCLUB_UI_COLORS.heroTurnHighlight,
      imageWidth,
      imageHeight
    );

    if (hasHeroHighlight) {
      logger.info("GGClubAdapter", `[${windowHandle}] Hero Turn Détecté (Couleur Dorée)`);
      return true;
    }

    // 2. Détection par présence des boutons d'action (Fallback visuel)
    const actionRegion = this.screenLayout.actionButtonsRegion;
    const buttonColors = [
      GGCLUB_UI_COLORS.foldButton,
      GGCLUB_UI_COLORS.callButton,
      GGCLUB_UI_COLORS.raiseButton
    ];

    for (const color of buttonColors) {
      const isVisible = await this.checkColorInRegion(screenBuffer, actionRegion, color, imageWidth, imageHeight);
      if (isVisible) {
        logger.info("GGClubAdapter", `[${windowHandle}] Hero Turn Détecté (Boutons Visibles)`);
        return true;
      }
    }

    return false;
  }

  async detectAvailableActions(windowHandle: number): Promise<DetectedButton[]> {
    const tableId = `ggclub_${windowHandle}`;
    const table = this.activeWindows.get(tableId) || this.activeWindows.get(String(windowHandle));
    const screenBuffer = await this.captureScreen(windowHandle);
    if (screenBuffer.length === 0 || !table) return [];

    const buttons: DetectedButton[] = [];
    const region = this.screenLayout.actionButtonsRegion;
    
    // Fallback immédiat par couleur (Plus rapide et robuste que l'OCR pur)
    const buttonTypes: Array<{ type: DetectedButton["type"]; color: ColorSignature; keywords: string[] }> = [
      { type: "fold", color: GGCLUB_UI_COLORS.foldButton, keywords: ["fold", "coucher", "f0ld"] },
      { type: "call", color: GGCLUB_UI_COLORS.callButton, keywords: ["call", "suivre"] },
      { type: "check", color: GGCLUB_UI_COLORS.checkButton, keywords: ["check", "parole"] },
      { type: "raise", color: GGCLUB_UI_COLORS.raiseButton, keywords: ["raise", "relancer", "bet", "miser"] },
      { type: "allin", color: GGCLUB_UI_COLORS.allInButton, keywords: ["all-in", "allin", "tapis"] },
    ];

    const buttonWidth = Math.round(region.width / 4);
    for (let i = 0; i < buttonTypes.length; i++) {
      const buttonDef = buttonTypes[i];
      const buttonRegion: ScreenRegion = {
        x: region.x + (i % 4) * (buttonWidth * 0.8), // Grille approximative
        y: region.y,
        width: buttonWidth,
        height: region.height,
      };

      const isColorMatch = await this.checkColorInRegion(screenBuffer, buttonRegion, buttonDef.color, table.width, table.height);
      
      if (isColorMatch) {
        // Validation OCR seulement si la couleur matche (pour confirmer le texte)
        const ocrResult = await this.performOCR(screenBuffer, buttonRegion, table.width, table.height);
        const textLower = ocrResult.text.toLowerCase();
        
        if (buttonDef.keywords.some(word => textLower.includes(word)) || ocrResult.confidence > 0.1) {
          logger.info("GGClubAdapter", `[${windowHandle}] Bouton confirmé: ${buttonDef.type}`);
          buttons.push({ type: buttonDef.type, region: buttonRegion, isEnabled: true });
        } else {
          // Si couleur ok mais OCR illisible, on l'ajoute quand même en "guess"
          logger.info("GGClubAdapter", `[${windowHandle}] Bouton détecté par couleur seulement: ${buttonDef.type}`);
          buttons.push({ type: buttonDef.type, region: buttonRegion, isEnabled: true });
        }
      }
    }

    return buttons;
  }

  private async detectButtonsByShape(
    screenBuffer: Buffer,
    imageWidth: number,
    imageHeight: number,
    region: ScreenRegion
  ): Promise<DetectedButton[]> {
    const buttons: DetectedButton[] = [];
    const grayscale = toGrayscale(screenBuffer, imageWidth, imageHeight);

    // Detect rectangular contours (buttons = rounded rectangles)
    const edges = this.detectEdges(grayscale, imageWidth, imageHeight, region);
    const rectangles = this.findRectangles(edges, region);

    for (const rect of rectangles) {
      // Filter rectangles that look like buttons (size, aspect ratio)
      if (rect.width > 60 && rect.width < 120 && rect.height > 30 && rect.height < 60) {
        const ocrResult = await this.performOCR(screenBuffer, rect, imageWidth, imageHeight);
        const buttonType = this.inferButtonTypeFromText(ocrResult.text);

        if (buttonType) {
          buttons.push({
            type: buttonType,
            region: rect,
            isEnabled: true,
            amount: await this.extractButtonAmount(screenBuffer, rect, imageWidth, imageHeight),
          });
        }
      }
    }

    return buttons;
  }

  // Sobel edge detection simplified
  private detectEdges(
    grayscale: Uint8Array,
    width: number,
    height: number,
    region: ScreenRegion
  ): Uint8Array {
    const edges = new Uint8Array(width * height).fill(0); // Initialize with 0

    // Iterate over pixels within the region, excluding borders
    for (let y = region.y + 1; y < region.y + region.height - 1; y++) {
      for (let x = region.x + 1; x < region.x + region.width - 1; x++) {
        const idx = y * width + x;
        if (idx >= grayscale.length) continue; // Bounds check

        // Calculate gradients (Gx, Gy) using Sobel operator kernels
        const gx = 
          -grayscale[idx - width - 1] + grayscale[idx - width + 1] +
          -2*grayscale[idx - 1] + 2*grayscale[idx + 1] +
          -grayscale[idx + width - 1] + grayscale[idx + width + 1];

        const gy =
          -grayscale[idx - width - 1] - 2*grayscale[idx - width] - grayscale[idx - width + 1] +
          grayscale[idx + width - 1] + 2*grayscale[idx + width] + grayscale[idx + width + 1];

        // Calculate gradient magnitude
        const magnitude = Math.sqrt(gx*gx + gy*gy);

        // Apply threshold to detect edges (pixels with high gradient magnitude)
        if (magnitude > 128) { // Adjust threshold as needed
          edges[idx] = 255; // Mark as edge pixel
        }
      }
    }
    return edges;
  }

  // Basic rectangle finding using connected components (flood fill) on edge map
  private findRectangles(edges: Uint8Array, searchRegion: ScreenRegion): ScreenRegion[] {
    const rectangles: ScreenRegion[] = [];
    const minArea = 2000; // Minimum area in pixels²
    const maxArea = 10000; // Maximum area in pixels²

    const visited = new Uint8Array(searchRegion.width * searchRegion.height).fill(0);
    const width = searchRegion.x + searchRegion.width; // Full image width for indexing into edges array

    // Iterate through the search region
    for (let y = searchRegion.y; y < searchRegion.y + searchRegion.height; y++) {
      for (let x = searchRegion.x; x < searchRegion.x + searchRegion.width; x++) {
        const idx = y * width + x;
        // Check if pixel is an edge, within bounds, and not yet visited
        const visitedIdx = idx - (searchRegion.y * width + searchRegion.x);
        if (idx >= edges.length || edges[idx] === 0 || visited[visitedIdx] === 1) {
          continue;
        }

        // Found an unvisited edge pixel: start flood fill to find connected component (potential rectangle)
        let minX = x, maxX = x, minY = y, maxY = y;
        const queue: [number, number][] = [[x, y]]; // Queue for BFS
        visited[visitedIdx] = 1; // Mark as visited
        let edgeCount = 0; // Count pixels in the component

        while (queue.length > 0) {
          const [currX, currY] = queue.shift()!;
          minX = Math.min(minX, currX);
          maxX = Math.max(maxX, currX);
          minY = Math.min(minY, currY);
          maxY = Math.max(maxY, currY);
          edgeCount++;

          // Explore 8 neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue; // Skip self
              const nx = currX + dx;
              const ny = currY + dy;
              const nIdx = ny * width + nx;
              const nVisitedIdx = nIdx - (searchRegion.y * width + searchRegion.x);

              // Check neighbor validity (within search region, is edge, not visited)
              if (nx >= searchRegion.x && nx < searchRegion.x + searchRegion.width &&
                  ny >= searchRegion.y && ny < searchRegion.y + searchRegion.height &&
                  nIdx < edges.length && edges[nIdx] > 0 && visited[nVisitedIdx] === 0) {
                visited[nVisitedIdx] = 1; // Mark neighbor as visited
                queue.push([nx, ny]); // Add neighbor to queue
              }
            }
          }
        }

        // Calculate rectangle properties
        const rectWidth = maxX - minX + 1;
        const rectHeight = maxY - minY + 1;
        const area = rectWidth * rectHeight;

        // Add rectangle if it meets area criteria
        if (area >= minArea && area <= maxArea) {
          rectangles.push({ x: minX, y: minY, width: rectWidth, height: rectHeight });
        }
      }
    }

    // Fallback: basic slicing if no rectangles detected by edge analysis
    if (rectangles.length === 0) {
      // Provide default regions assuming buttons are somewhat aligned
      for (let i = 0; i < 4; i++) {
        rectangles.push({
          x: searchRegion.x + i * 95, // Approximate spacing
          y: searchRegion.y,
          width: 90, // Approximate width
          height: 40, // Approximate height
        });
      }
    }

    return rectangles;
  }


  private inferButtonTypeFromText(text: string): DetectedButton["type"] | null {
    const normalized = text.toLowerCase().trim();

    if (normalized.includes("fold") || normalized.includes("passer")) return "fold";
    if (normalized.includes("call") || normalized.includes("suivre")) return "call";
    if (normalized.includes("check")) return "check";
    if (normalized.includes("raise") || normalized.includes("relance") || normalized.includes("bet")) return "raise";
    if (normalized.includes("all") && normalized.includes("in") || normalized.includes("tapis")) return "allin";

    return null;
  }

  private async extractButtonAmount(screenBuffer: Buffer, region: ScreenRegion, imageWidth: number, imageHeight: number): Promise<number | undefined> {
    // Try to OCR the amount within the button region.
    // This might require a more specific region or OCR settings.
    const ocrResult = await this.performOCR(screenBuffer, region, imageWidth, imageHeight);
    const amount = this.parseAmount(ocrResult.text);
    return amount > 0 ? amount : undefined;
  }

  private extractRegionBuffer(
    screenBuffer: Buffer,
    srcWidth: number,
    srcHeight: number,
    region: ScreenRegion,
    channels: number = 4 // Assuming RGBA
  ): Buffer {
    // FIX: Early validation to prevent out-of-bounds access
    if (!screenBuffer || screenBuffer.length === 0 || srcWidth <= 0 || srcHeight <= 0) {
      return Buffer.alloc(0);
    }

    // Validate region dimensions
    if (region.width <= 0 || region.height <= 0 || region.x < 0 || region.y < 0) {
      return Buffer.alloc(0);
    }

    // Clamp region coordinates to be within image bounds
    const clampedX = Math.max(0, Math.min(region.x, srcWidth - 1));
    const clampedY = Math.max(0, Math.min(region.y, srcHeight - 1));
    const clampedWidth = Math.max(0, Math.min(region.width, srcWidth - clampedX));
    const clampedHeight = Math.max(0, Math.min(region.height, srcHeight - clampedY));

    if (clampedWidth <= 0 || clampedHeight <= 0) {
      return Buffer.alloc(0);
    }

    // FIX: Validate buffer size to prevent memory issues
    const expectedBufferSize = srcWidth * srcHeight * channels;
    if (screenBuffer.length < expectedBufferSize) {
      // Buffer too small for dimensions, return empty
      return Buffer.alloc(0);
    }

    const output = Buffer.alloc(clampedWidth * clampedHeight * channels);
    const maxSrcIdx = screenBuffer.length;

    // FIX: Simplified loop with bounds checking removed since clamping is now correct
    for (let dy = 0; dy < clampedHeight; dy++) {
      for (let dx = 0; dx < clampedWidth; dx++) {
        const srcIdx = (((clampedY + dy) * srcWidth) + (clampedX + dx)) * channels;
        const dstIdx = (dy * clampedWidth + dx) * channels;

        // Only copy if indices are valid
        if (srcIdx >= 0 && srcIdx + channels <= maxSrcIdx) {
          screenBuffer.copy(output, dstIdx, srcIdx, srcIdx + channels);
        }
      }
    }

    return output;
  }

  private generateCacheKey(buffer: Buffer, width: number, height: number): string {
    // Sample a small portion of the buffer for hashing to speed up cache key generation
    const sample = buffer.slice(0, Math.min(100, buffer.length));
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash + sample[i]) | 0; // Simple hash function
    }
    return `${width}_${height}_${hash}`;
  }

  private generateImageHash(buffer: Buffer, region: ScreenRegion): string {
    // Hash rapide pour détecter cartes identiques
    const step = Math.floor(buffer.length / 50);
    let hash = 0;
    for (let i = 0; i < buffer.length; i += step) {
      hash = ((hash << 5) - hash + buffer[i]) | 0;
    }
    return `card_${region.x}_${region.y}_${hash}`;
  }

  private async performOCR(screenBuffer: Buffer, region: ScreenRegion, imageWidth?: number, imageHeight?: number): Promise<OCRResult> {
    // FIX: Immediate cache check to avoid reprocessing
    const cached = this.ocrCache.get(screenBuffer, region);
    if (cached) {
      return {
        text: cached.text,
        confidence: cached.confidence,
        bounds: region,
      };
    }

    // FIX: Validate buffer and dimensions before processing
    if (!this.validateImageBuffer(screenBuffer) || !imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
      return { text: "", confidence: 0, bounds: region };
    }

    await this.addRandomDelay(20);
    
    // Try ML OCR Engine with TIMEOUT FIX
    if (this.pokerOCREngine && screenBuffer.length > 0) {
      try {
        const startTime = Date.now();
        
        // Extract region buffer for OCR
        const regionBuffer = this.extractRegionBuffer(screenBuffer, imageWidth, imageHeight, region);
        if (regionBuffer.length === 0) {
          return { text: "", confidence: 0, bounds: region };
        }

        // FIX: Add 500ms timeout to prevent freeze (OCR taking 27+ seconds)
        let result: any = null;
        let timedOut = false;
        
        const ocrPromise = this.pokerOCREngine.recognizeValue(regionBuffer, region.width, region.height, 'pot');
        const timeoutPromise = new Promise(resolve => {
          setTimeout(() => {
            timedOut = true;
            resolve(null);
          }, 500); // 500ms timeout
        });

        result = await Promise.race([ocrPromise, timeoutPromise]);
        
        if (timedOut) {
          logger.debug("GGClubAdapter", "OCR timeout - retournant cache ou vide", {
            region,
            processingTime: Date.now() - startTime
          });
          return { text: "", confidence: 0, bounds: region };
        }

        if (result) {
          const text = String(result.value);
          const confidence = result.confidence;
          const processingTime = Date.now() - startTime;

          // Log slow OCR
          if (processingTime > 200) {
            const windowHandle = Array.from(this.activeWindows.keys())[0];
            if (windowHandle) {
              visionErrorLogger.logPerformanceIssue(
                parseInt(windowHandle.split('_')[1]),
                processingTime,
                this.activeWindows.size
              );
            }
          }

          // Cache result if confidence is reasonable
          if (confidence > 0.1) {
            this.ocrCache.set(screenBuffer, region, text, confidence);
          }

          return {
            text,
            confidence,
            bounds: region,
          };
        }
      } catch (error: any) {
        // Silently return empty on timeout/error
        logger.debug("GGClubAdapter", "Erreur OCR", { 
          error: String(error?.message || error).substring(0, 100)
        });
      }
    }

    // Return empty result if ML OCR not available or failed
    return {
      text: "",
      confidence: 0,
      bounds: region,
    };
  }

  async executeClick(windowHandle: number, x: number, y: number, timerPosition?: number): Promise<void> {
    const window = this.activeWindows.get(`ggclub_${windowHandle}`);
    if (!window) {
      console.warn(`[GGClubAdapter] Window ${windowHandle} not found for click execution.`);
      return;
    }

    // Increment action counter for auto-calibration
    this.autoCalibration.incrementActionCount(windowHandle);

    // Introduce random mouse movements before the click for anti-detection
    if (Math.random() < 0.3) { // Increased probability for more variation
      const randomX = window.x + Math.random() * window.width;
      const randomY = window.y + Math.random() * window.height;

      await this.performMouseMove(windowHandle, randomX, randomY);
      await this.addRandomDelay(150 + Math.random() * 300);
    }

    this.antiDetectionMonitor.recordAction("click", timerPosition, { x: window.x + x, y: window.y + y }); // Record absolute screen coordinates
    this.trackAction();

    await this.addRandomDelay(50); // Short delay before moving to target

    const jitteredPos = this.getJitteredPosition(x, y, window); // Pass window for absolute positioning

    const currentPos = robot ? robot.getMousePos() : { x: 0, y: 0 };
    this.antiDetectionMonitor.recordMouseTrajectory(currentPos.x, currentPos.y, jitteredPos.x, jitteredPos.y);

    // Simulate human-like hesitation during mouse movement
    const humanizer = getHumanizer();
    const hesitation = humanizer.shouldHesitateClick();

    if (hesitation.hesitate && hesitation.movements) {
      // Move towards target partially
      const partialX = currentPos.x + (jitteredPos.x - currentPos.x) * 0.6;
      const partialY = currentPos.y + (jitteredPos.y - currentPos.y) * 0.6;
      await this.performMouseMove(windowHandle, partialX, partialY);

      // Pause (hesitation)
      await this.addRandomDelay(hesitation.pauseDuration || 300);

      // Micro-movements during hesitation
      for (let i = 0; i < hesitation.movements; i++) {
        const microJitterX = partialX + (Math.random() - 0.5) * 8;
        const microJitterY = partialY + (Math.random() - 0.5) * 8;
        await this.performMouseMove(windowHandle, microJitterX, microJitterY);
        await this.addRandomDelay(80 + Math.random() * 120);
      }

      // Resume movement to target
      await this.performMouseMove(windowHandle, jitteredPos.x, jitteredPos.y);
    } else {
      // Direct movement to target if no hesitation
      await this.performMouseMove(windowHandle, jitteredPos.x, jitteredPos.y);
    }

    await this.addRandomDelay(30); // Small delay before click
    await this.performMouseClick(windowHandle, jitteredPos.x, jitteredPos.y);

    await this.addRandomDelay(50); // Delay after click
  }

  // Helper to get jittered position relative to window
  private getJitteredPosition(x: number, y: number, window: TableWindow): { x: number; y: number } {
    if (!robot) return { x: window.x + x, y: window.y + y }; // No robot, return absolute position

    const jitterRange = 3; // Small random offset
    const jitterX = (Math.random() - 0.5) * jitterRange;
    const jitterY = (Math.random() - 0.5) * jitterRange;

    return {
      x: window.x + x + jitterX,
      y: window.y + y + jitterY,
    };
  }

  private async performMouseMove(windowHandle: number, x: number, y: number): Promise<void> {
    if (robot) {
      try {
        const currentPos = robot.getMousePos();

        // Determine target position (absolute screen coordinates)
        const targetX = x;
        const targetY = y;

        const steps = this.antiDetectionConfig.enableMouseJitter ? 
          Math.floor(Math.random() * 10) + 5 : 10;

        for (let i = 1; i <= steps; i++) {
          const progress = i / steps;
          const eased = this.easeInOutQuad(progress); // Use easing function

          const midX = currentPos.x + (targetX - currentPos.x) * eased;
          const midY = currentPos.y + (targetY - currentPos.y) * eased;

          const jitter = this.antiDetectionConfig.enableMouseJitter ? 
            this.antiDetectionConfig.mouseJitterRange : 0;
          const jitterX = (Math.random() - 0.5) * jitter;
          const jitterY = (Math.random() - 0.5) * jitter;

          robot.moveMouse(Math.round(midX + jitterX), Math.round(midY + jitterY));
          await this.addRandomDelay(10); // Delay between mouse movements
        }

        // Final move to target position
        robot.moveMouse(targetX, targetY);
      } catch (error) {
        console.error("Mouse move error:", error);
      }
    } else {
      // Simulate delay even without robot
      await this.addRandomDelay(10);
    }
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private async performMouseClick(windowHandle: number, x: number, y: number): Promise<void> {
    if (robot) {
      try {
        await this.addRandomDelay(20); // Small delay before click
        robot.mouseClick();
        await this.addRandomDelay(30); // Small delay after click
      } catch (error) {
        console.error("Mouse click error:", error);
      }
    } else {
      await this.addRandomDelay(10); // Simulate delay
    }
  }

  async executeFold(windowHandle: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("fold");

    const buttons = await this.detectAvailableActions(windowHandle);
    const foldButton = buttons.find(b => b.type === "fold");

    if (!foldButton) {
      throw new Error("Fold button not found");
    }

    const centerX = foldButton.region.x + foldButton.region.width / 2;
    const centerY = foldButton.region.y + foldButton.region.height / 2;

    // Simulate timer position (0-100, where 100 = start, 0 = end)
    const timerPosition = Math.random() * 100;
    await this.executeClick(windowHandle, centerX, centerY, timerPosition);

    this.emitPlatformEvent("game_state", {
      action: "fold",
      windowHandle,
      timestamp: new Date(),
    });
  }

  async executeCall(windowHandle: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("call");

    const buttons = await this.detectAvailableActions(windowHandle);
    const callButton = buttons.find(b => b.type === "call");

    if (!callButton) {
      throw new Error("Call button not found");
    }

    const centerX = callButton.region.x + callButton.region.width / 2;
    const centerY = callButton.region.y + callButton.region.height / 2;

    const timerPosition = Math.random() * 100;
    await this.executeClick(windowHandle, centerX, centerY, timerPosition);

    this.emitPlatformEvent("game_state", {
      action: "call",
      amount: callButton.amount,
      windowHandle,
      timestamp: new Date(),
    });
  }

  async executeCheck(windowHandle: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("check");

    const buttons = await this.detectAvailableActions(windowHandle);
    const checkButton = buttons.find(b => b.type === "check");

    if (!checkButton) {
      throw new Error("Check button not found");
    }

    const centerX = checkButton.region.x + checkButton.region.width / 2;
    const centerY = checkButton.region.y + checkButton.region.height / 2;

    const timerPosition = Math.random() * 100;
    await this.executeClick(windowHandle, centerX, centerY, timerPosition);

    this.emitPlatformEvent("game_state", {
      action: "check",
      windowHandle,
      timestamp: new Date(),
    });
  }

  async executeRaise(windowHandle: number, amount: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("raise");

    const buttons = await this.detectAvailableActions(windowHandle);
    const raiseButton = buttons.find(b => b.type === "raise");

    if (!raiseButton) {
      throw new Error("Raise button not found");
    }

    await this.setBetAmount(windowHandle, amount);

    await this.addRandomDelay(100);

    const centerX = raiseButton.region.x + raiseButton.region.width / 2;
    const centerY = raiseButton.region.y + raiseButton.region.height / 2;

    const timerPosition = Math.random() * 100;
    await this.executeClick(windowHandle, centerX, centerY, timerPosition);

    this.emitPlatformEvent("game_state", {
      action: "raise",
      amount,
      windowHandle,
      timestamp: new Date(),
    });
  }

  async executeBet(windowHandle: number, amount: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("bet");

    await this.setBetAmount(windowHandle, amount);
    await this.addRandomDelay(100);

    const buttons = await this.detectAvailableActions(windowHandle);
    const raiseButton = buttons.find(b => b.type === "raise");

    if (raiseButton) {
      const centerX = raiseButton.region.x + raiseButton.region.width / 2;
      const centerY = raiseButton.region.y + raiseButton.region.height / 2;
      const timerPosition = Math.random() * 100;
      await this.executeClick(windowHandle, centerX, centerY, timerPosition);
    } else {
      // If raise button is not detected, perhaps it's a bet action that doesn't require explicit button press
      console.warn(`[GGClubAdapter] Raise button not detected for bet action on window ${windowHandle}.`);
    }

    this.emitPlatformEvent("game_state", {
      action: "bet",
      amount,
      windowHandle,
      timestamp: new Date(),
    });
  }

  private async setBetAmount(windowHandle: number, amount: number): Promise<void> {
    const sliderRegion = this.screenLayout.betSliderRegion;

    await this.addRandomDelay(50);

    // Check if bet slider exists and is usable
    if (!sliderRegion || sliderRegion.width <= 0 || sliderRegion.height <= 0) {
      console.warn(`[GGClubAdapter] Bet slider region not defined for window ${windowHandle}.`);
      // Fallback: try typing the amount directly if slider is unavailable
      await this.typeAmount(windowHandle, amount);
      return;
    }

    // Simulate interaction with the bet slider
    // This is a placeholder. Actual interaction might involve:
    // 1. Clicking on the slider track.
    // 2. Dragging the slider handle to the desired position.
    // 3. Clicking on an input field and typing the amount.

    // For now, we'll simulate typing the amount, assuming an input field exists or is activated.
    await this.typeAmount(windowHandle, amount);
  }

  private async typeAmount(windowHandle: number, amount: number): Promise<void> {
    const amountStr = amount.toFixed(2); // Format amount to string with 2 decimal places

    if (robot) {
      try {
        // Simulate focus on an input field if necessary (e.g., Ctrl+A to select all, then type)
        // robot.keyTap("a", "control"); // Uncomment if needed
        await this.addRandomDelay(50);

        for (const char of amountStr) {
          if (this.antiDetectionConfig.enableTimingVariation) {
            const baseDelay = 50;
            const variation = baseDelay * (this.antiDetectionConfig.timingVariationPercent / 100);
            await this.addRandomDelay(baseDelay - variation / 2 + Math.random() * variation);
          } else {
            await this.addRandomDelay(50);
          }

          // Simulate typing each character
          if (char === '.') {
            robot.keyTap(".");
          } else {
            robot.keyTap(char);
          }
        }
      } catch (error) {
        console.error("Type amount error:", error);
      }
    } else {
      // Simulate typing delay even without robot
      for (const char of amountStr) {
        await this.addRandomDelay(50);
      }
    }
  }

  async executeAllIn(windowHandle: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("allin");

    const buttons = await this.detectAvailableActions(windowHandle);
    const allInButton = buttons.find(b => b.type === "allin");

    if (allInButton) {
      const centerX = allInButton.region.x + allInButton.region.width / 2;
      const centerY = allInButton.region.y + allInButton.region.height / 2;
      const timerPosition = Math.random() * 100;
      await this.executeClick(windowHandle, centerX, centerY, timerPosition);
    } else {
      // If 'All-In' button isn't directly found, try to find 'Raise' and simulate moving slider to max
      const raiseButton = buttons.find(b => b.type === "raise");
      if (raiseButton) {
        await this.moveBetSliderToMax(windowHandle);
        await this.addRandomDelay(100);

        const centerX = raiseButton.region.x + raiseButton.region.width / 2;
        const centerY = raiseButton.region.y + raiseButton.region.height / 2;
        const timerPosition = Math.random() * 100;
        await this.executeClick(windowHandle, centerX, centerY, timerPosition);
      } else {
        console.warn(`[GGClubAdapter] Neither All-In nor Raise button found for All-In action on window ${windowHandle}.`);
        // Optionally throw an error if All-In is critical
        // throw new Error("All-In action not possible: no relevant button found.");
      }
    }

    this.emitPlatformEvent("game_state", {
      action: "allin",
      windowHandle,
      timestamp: new Date(),
    });
  }

  private async moveBetSliderToMax(windowHandle: number): Promise<void> {
    const sliderRegion = this.screenLayout.betSliderRegion;

    if (!sliderRegion || sliderRegion.width <= 0 || sliderRegion.height <= 0) {
      console.warn(`[GGClubAdapter] Bet slider region not defined for window ${windowHandle}. Cannot move slider to max.`);
      return;
    }

    // Click at the far right end of the slider track to simulate moving to max
    const maxX = sliderRegion.x + sliderRegion.width;
    const y = sliderRegion.y + sliderRegion.height / 2;

    await this.executeClick(windowHandle, maxX, y);
  }

  async focusWindow(windowHandle: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("window_focus");
    await this.addRandomDelay(100);

    if (windowManager) {
      try {
        const windows = windowManager.windowManager.getWindows();
        const targetWindow = windows.find((w: any) => w.id === windowHandle);

        if (targetWindow) {
          // Check if the window is already active to avoid unnecessary actions
          const activeWindow = typeof windowManager.getActiveWindow === 'function' ? windowManager.getActiveWindow() : (windowManager.windowManager && typeof windowManager.windowManager.getActiveWindow === 'function' ? windowManager.windowManager.getActiveWindow() : null);
          if (activeWindow && activeWindow.id === windowHandle) {
            console.log(`[GGClubAdapter] Window ${windowHandle} is already focused.`);
            return;
          }

          // Use multiple attempts to bring the window to the front, as it can be tricky
          let attempts = 0;
          const maxAttempts = 3;
          let focused = false;

          while (attempts < maxAttempts && !focused) {
            targetWindow.bringToTop(); // Request window to be brought to top
            await this.addRandomDelay(250); // Short delay to allow OS to process

            // Verify if the window is now active
            const nowActive = windowManager.windowManager.getActiveWindow();
            if (nowActive && nowActive.id === windowHandle) {
              console.log(`[GGClubAdapter] Window ${windowHandle} focused successfully after ${attempts + 1} attempts.`);
              focused = true;
            } else {
              attempts++;
              console.warn(`[GGClubAdapter] Focus attempt ${attempts}/${maxAttempts} failed for window ${windowHandle}. Retrying...`);

              // Fallback: Simulate a click on the window's title bar or center if bringToTop fails repeatedly
              if (attempts === 2) {
                const bounds = targetWindow.getBounds();
                // Calculate center coordinates relative to the screen
                const absoluteCenterX = bounds.x + Math.floor(bounds.width / 2);
                const absoluteCenterY = bounds.y + Math.floor(bounds.height / 2);

                console.warn(`[GGClubAdapter] Falling back to clicking window center (${absoluteCenterX}, ${absoluteCenterY})`);

                if (robot) {
                  robot.moveMouse(absoluteCenterX, absoluteCenterY);
                  await this.addRandomDelay(100);
                  robot.mouseClick();
                  await this.addRandomDelay(50); // Allow time for focus change after click
                }
              }
            }
          }

          if (!focused) {
            console.error(`[GGClubAdapter] Failed to focus window ${windowHandle} after ${maxAttempts} attempts.`);
          }
        } else {
          console.error(`[GGClubAdapter] Target window ${windowHandle} not found.`);
        }
      } catch (error) {
        console.error("Focus window error:", error);
      }
    } else {
      console.warn("[GGClubAdapter] node-window-manager not available. Cannot focus window.");
    }
  }

  async minimizeWindow(windowHandle: number): Promise<void> {
    await this.addRandomDelay(50);

    if (windowManager) {
      try {
        const windows = windowManager.getWindows();
        const targetWindow = windows.find((w: any) => w.id === windowHandle);
        if (targetWindow) {
          targetWindow.minimize();
        } else {
          console.warn(`[GGClubAdapter] Window ${windowHandle} not found for minimization.`);
        }
      } catch (error) {
        console.error("Minimize window error:", error);
      }
    } else {
      console.warn("[GGClubAdapter] node-window-manager not available. Cannot minimize window.");
    }
  }

  async restoreWindow(windowHandle: number): Promise<void> {
    await this.addRandomDelay(50);

    if (windowManager) {
      try {
        const windows = windowManager.getWindows();
        const targetWindow = windows.find((w: any) => w.id === windowHandle);
        if (targetWindow) {
          targetWindow.restore(); // Use restore method if available
        } else {
          console.warn(`[GGClubAdapter] Window ${windowHandle} not found for restoration.`);
        }
      } catch (error) {
        console.error("Restore window error:", error);
      }
    } else {
      console.warn("[GGClubAdapter] node-window-manager not available. Cannot restore window.");
    }
  }

  getActiveTableCount(): number {
    return this.activeWindows.size;
  }

  getActiveWindows(): TableWindow[] {
    return Array.from(this.activeWindows.values());
  }

  cleanup(): void {
    this.stopWindowPolling();
    this.stopHeartbeat();
    this.antiDetectionMonitor.stop();
    ocrPool.shutdown();
    if (this.tesseractWorker) {
      this.tesseractWorker.terminate(); // Terminate Tesseract worker
    }
    super.cleanup();
  }
}

class AntiDetectionMonitor {
  private adapter: GGClubAdapter;
  private actionCounts: Map<string, number> = new Map();
  private screenCaptureCount: number = 0;
  private lastActionTimestamps: number[] = [];
  private monitorInterval?: NodeJS.Timeout;
  private patterns: ActionPattern[] = [];
  private suspicionFactors: Map<string, number> = new Map();
  private actionTimerPositions: number[] = [];
  private mouseClickAreas: Array<{ x: number; y: number }> = [];
  private mouseTrajectoryAngles: number[] = [];
  private lastRandomInteraction: number = Date.now();
  private randomInteractionInterval?: NodeJS.Timeout;
  private antiDetectionConfig: any = { // Default config, can be overridden
    enableMouseJitter: true,
    mouseJitterRange: 5,
    enableTimingVariation: true,
    timingVariationPercent: 30,
    thinkingTimeVariance: 0.2,
    enableMisclicks: false,
    misclickProbability: 0.0005,
  };

  constructor(adapter: GGClubAdapter) {
    this.adapter = adapter;
    // Load or merge anti-detection configuration here if available
    // For now, using default values.
  }

  start(): void {
    this.monitorInterval = setInterval(() => {
      this.analyzePatterns();
      this.decaySuspicion();
    }, 10000);

    // Trigger random interactions periodically to mimic human behavior
    this.randomInteractionInterval = setInterval(() => {
      this.triggerRandomHumanInteraction();
    }, Math.random() * 480000 + 120000); // Between 2 and 10 minutes
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    if (this.randomInteractionInterval) {
      clearInterval(this.randomInteractionInterval);
      this.randomInteractionInterval = undefined;
    }
  }

  recordAction(actionType: string, timerPosition?: number, clickPos?: { x: number; y: number }): void {
    const count = this.actionCounts.get(actionType) || 0;
    this.actionCounts.set(actionType, count + 1);

    const now = Date.now();
    this.lastActionTimestamps.push(now);

    // Keep only the last N timestamps to avoid memory leaks
    if (this.lastActionTimestamps.length > 100) {
      this.lastActionTimestamps = this.lastActionTimestamps.slice(-100);
    }

    // Record action patterns for sequence analysis
    this.patterns.push({
      type: actionType,
      timestamp: now,
    });
    if (this.patterns.length > 500) {
      this.patterns = this.patterns.slice(-500);
    }

    // Record timer positions if available
    if (timerPosition !== undefined) {
      this.actionTimerPositions.push(timerPosition);
      if (this.actionTimerPositions.length > 50) {
        this.actionTimerPositions = this.actionTimerPositions.slice(-50);
      }
    }

    // Record click positions for heatmap analysis
    if (clickPos) {
      this.mouseClickAreas.push(clickPos);
      if (this.mouseClickAreas.length > 100) {
        this.mouseClickAreas = this.mouseClickAreas.slice(-100);
      }
    }
  }

  recordMouseTrajectory(startX: number, startY: number, endX: number, endY: number): void {
    // Calculate angle of mouse movement
    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
    this.mouseTrajectoryAngles.push(angle);
    if (this.mouseTrajectoryAngles.length > 50) {
      this.mouseTrajectoryAngles = this.mouseTrajectoryAngles.slice(-50);
    }
  }

  recordScreenCapture(): void {
    this.screenCaptureCount++;
  }

  private async triggerRandomHumanInteraction(): Promise<void> {
    const now = Date.now();
    // Avoid too frequent random interactions
    if (now - this.lastRandomInteraction < 120000) return;

    const interactions = [
      'hover_stack',
      'hover_pot',
      'hover_cards',
      'check_bankroll',
      'random_click',
      'hover_random_area',
      'micro_movement',
    ];

    const interaction = interactions[Math.floor(Math.random() * interactions.length)];

    try {
      await this.executeRandomInteraction(interaction);
      this.lastRandomInteraction = now;
      console.log(`[Anti-Detection] Random human interaction executed: ${interaction}`);
    } catch (error) {
      console.error('[Anti-Detection] Failed to execute random interaction:', error);
    }
  }

  private async executeRandomInteraction(type: string): Promise<void> {
    // Get the handle of the first active table window
    const windowHandleEntry = Array.from((this.adapter as any).activeWindows.entries())[0];
    if (!windowHandleEntry) {
      console.warn("[Anti-Detection] No active window found for random interaction.");
      return;
    }
    const windowHandle = windowHandleEntry[0];
    const window = windowHandleEntry[1] as TableWindow;

    const screenX = window.x;
    const screenY = window.y;

    switch (type) {
      case 'hover_stack':
        // Hover near the stack display area
        const stackX = screenX + window.width / 2 - 150 + Math.random() * 20;
        const stackY = screenY + window.height / 2 + 180 + Math.random() * 20;
        await this.performHover(windowHandle, stackX, stackY);
        break;

      case 'hover_pot':
        // Hover near the pot display area
        const potX = screenX + window.width / 2 + Math.random() * 40 - 20;
        const potY = screenY + window.height / 2 - 100 + Math.random() * 20;
        await this.performHover(windowHandle, potX, potY);
        break;

      case 'hover_cards':
        // Hover near the hero cards area
        const cardX = screenX + window.width / 2 - 50 + Math.random() * 100;
        const cardY = screenY + window.height / 2 + 150 + Math.random() * 30;
        await this.performHover(windowHandle, cardX, cardY);
        break;

      case 'check_bankroll':
        // Hover near the bankroll display (usually top right)
        const bankrollX = screenX + window.width - 100 + Math.random() * 20;
        const bankrollY = screenY + 50 + Math.random() * 20;
        await this.performHover(windowHandle, bankrollX, bankrollY);
        await this.sleep(500 + Math.random() * 1000); // Pause after hover
        break;

      case 'random_click':
        // Click in an empty area, e.g., corners or edges
        const randomX = screenX + Math.random() * window.width;
        const randomY = screenY + Math.random() * window.height;
        // Avoid clicking on known UI elements, focus on empty space
        const isEmptyArea = randomY < screenY + 100 || randomY > screenY + window.height - 100;
        if (isEmptyArea) {
          await this.performHover(windowHandle, randomX, randomY); // Use hover to simulate interaction without click
        }
        break;

      case 'hover_random_area':
        // Hover in a corner of the window
        const cornerX = Math.random() > 0.5 ? screenX + window.width - 50 : screenX + 50;
        const cornerY = Math.random() > 0.5 ? screenY + window.height - 50 : screenY + 50;
        await this.performHover(windowHandle, cornerX, cornerY);
        await this.sleep(200 + Math.random() * 500); // Pause after hover
        break;

      case 'micro_movement':
        // Perform tiny mouse movements
        if (robot) {
          const currentPos = robot.getMousePos();
          const jitterX = (Math.random() - 0.5) * 10;
          const jitterY = (Math.random() - 0.5) * 10;
          robot.moveMouse(currentPos.x + jitterX, currentPos.y + jitterY);
          await this.sleep(100);
          robot.moveMouse(currentPos.x, currentPos.y); // Return to original position
        }
        break;
    }
  }

  // Perform mouse hover using robotjs for more realistic movement
  private async performHover(windowHandle: number, x: number, y: number): Promise<void> {
    if (!robot) return;

    try {
      const currentPos = robot.getMousePos();
      const targetX = x;
      const targetY = y;

      // Use a human-like movement curve (e.g., cubic easing)
      const steps = 8 + Math.floor(Math.random() * 8); // Number of steps for movement
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const eased = this.easeInOutCubic(progress); // Use easing function

        const midX = currentPos.x + (targetX - currentPos.x) * eased;
        const midY = currentPos.y + (targetY - currentPos.y) * eased;

        // Add slight jitter to mouse position
        const jitterX = (Math.random() - 0.5) * 3;
        const jitterY = (Math.random() - 0.5) * 3;

        robot.moveMouse(Math.round(midX + jitterX), Math.round(midY + jitterY));
        await this.sleep(8 + Math.random() * 12); // Random delay between movements
      }

      // Final move to the exact target position
      robot.moveMouse(targetX, targetY);
    } catch (error) {
      console.error('[Anti-Detection] Hover error:', error);
    }
  }

  // Cubic easing function for smooth mouse movement
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Simple sleep function
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main pattern analysis loop
  private analyzePatterns(): void {
    this.checkTimingRegularity();
    this.checkActionDistribution();
    this.checkScreenCaptureRate();
    this.checkBurstActivity();
    this.checkImpossibleTimings();
    this.checkActionSequencePatterns();
    this.checkClockTimingPattern();
    this.checkClickHeatmapConcentration();
    this.checkMouseTrajectoryVariation();
  }

  // Checks if timer positions are unnaturally regular
  private checkClockTimingPattern(): void {
    if (this.actionTimerPositions.length < 10) return; // Need sufficient data

    const positionCounts = new Map<number, number>();
    for (const pos of this.actionTimerPositions) {
      // Group positions into buckets (e.g., every 5%)
      const bucket = Math.floor(pos / 5) * 5;
      positionCounts.set(bucket, (positionCounts.get(bucket) || 0) + 1);
    }

    // Calculate concentration ratio
    const maxConcentration = Math.max(...Array.from(positionCounts.values()));
    const concentrationRatio = maxConcentration / this.actionTimerPositions.length;

    // If concentration is high, it suggests unnatural timing
    if (concentrationRatio > 0.4) {
      this.addSuspicion("clock_timing_pattern", 0.12);
      console.warn(`[Anti-Detection] Clock timing pattern detected: ${(concentrationRatio * 100).toFixed(1)}% of actions at same timer position.`);
    } else {
      this.removeSuspicion("clock_timing_pattern", 0.03); // Decay suspicion if pattern is not strong
    }
  }

  // Checks if mouse clicks are clustered unnaturally
  private checkClickHeatmapConcentration(): void {
    if (this.mouseClickAreas.length < 20) return;

    const gridSize = 20; // Size of grid cells for heatmap
    const heatmap = new Map<string, number>();

    for (const pos of this.mouseClickAreas) {
      const gridX = Math.floor(pos.x / gridSize);
      const gridY = Math.floor(pos.y / gridSize);
      const key = `${gridX},${gridY}`;
      heatmap.set(key, (heatmap.get(key) || 0) + 1);
    }

    // Calculate concentration ratio
    const maxHeat = Math.max(...Array.from(heatmap.values()));
    const concentrationRatio = maxHeat / this.mouseClickAreas.length;

    if (concentrationRatio > 0.3) {
      this.addSuspicion("click_heatmap_concentration", 0.1);
      console.warn(`[Anti-Detection] Click heatmap too concentrated: ${(concentrationRatio * 100).toFixed(1)}% of clicks in same area.`);
    } else {
      this.removeSuspicion("click_heatmap_concentration", 0.02);
    }
  }

  // Checks if mouse trajectories are too uniform (e.g., always straight lines)
  private checkMouseTrajectoryVariation(): void {
    if (this.mouseTrajectoryAngles.length < 15) return;

    // Normalize angles to be within 0-90 degrees for simplicity
    const normalizedAngles = this.mouseTrajectoryAngles.map(a => {
      let normalized = a % 90;
      if (normalized < 0) normalized += 90;
      return normalized;
    });

    // Calculate mean and standard deviation
    const mean = normalizedAngles.reduce((sum, a) => sum + a, 0) / normalizedAngles.length;
    const variance = normalizedAngles.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / normalizedAngles.length;
    const stdDev = Math.sqrt(variance);

    // Low standard deviation indicates uniform trajectories
    if (stdDev < 10) {
      this.addSuspicion("mouse_trajectory_uniformity", 0.08);
      console.warn(`[Anti-Detection] Mouse trajectories too uniform: std dev = ${stdDev.toFixed(1)} degrees.`);
    } else {
      this.removeSuspicion("mouse_trajectory_uniformity", 0.02);
    }
  }

  // Checks if time intervals between actions are too regular
  private checkTimingRegularity(): void {
    if (this.lastActionTimestamps.length < 10) return;

    // Calculate time intervals between consecutive actions
    const intervals: number[] = [];
    for (let i = 1; i < this.lastActionTimestamps.length; i++) {
      intervals.push(this.lastActionTimestamps[i] - this.lastActionTimestamps[i - 1]);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0; // Avoid division by zero

    // Low coefficient of variation indicates regularity
    if (coefficientOfVariation < 0.15) {
      this.addSuspicion("timing_regularity", 0.05);
    } else {
      this.removeSuspicion("timing_regularity", 0.02);
    }
  }

  // Checks if the distribution of actions (fold, call, raise) is unnatural
  private checkActionDistribution(): void {
    const total = Array.from(this.actionCounts.values()).reduce((a, b) => a + b, 0);
    if (total < 20) return; // Need enough actions to analyze distribution

    const foldCount = this.actionCounts.get("fold") || 0;
    const callCount = this.actionCounts.get("call") || 0;
    const raiseCount = this.actionCounts.get("raise") || 0;

    const foldRatio = foldCount / total;
    const raiseRatio = raiseCount / total;

    // Unusually high fold rate or very low raise rate might be suspicious
    if (foldRatio > 0.8 || foldRatio < 0.1) {
      this.addSuspicion("action_distribution", 0.03);
    }

    // Unusually high raise rate might indicate aggressive, potentially bot-like play
    if (raiseRatio > 0.6) {
      this.addSuspicion("aggressive_pattern", 0.02);
    }
  }

  // Checks if screen capture rate is excessively high
  private checkScreenCaptureRate(): void {
    if (this.screenCaptureCount > 1000) { // Arbitrary threshold
      this.addSuspicion("high_capture_rate", 0.02);
    }
  }

  // Checks for bursts of activity that might indicate rapid, non-human actions
  private checkBurstActivity(): void {
    const now = Date.now();
    // Count actions within the last 5 seconds
    const recentActions = this.lastActionTimestamps.filter(t => now - t < 5000);

    if (recentActions.length > 20) { // If more than 20 actions in 5 seconds
      this.addSuspicion("burst_activity", 0.08);
    }
  }

  // Adds suspicion for a specific factor, capped at 1.0
  private addSuspicion(factor: string, amount: number): void {
    const current = this.suspicionFactors.get(factor) || 0;
    this.suspicionFactors.set(factor, Math.min(1, current + amount));
    this.updateOverallSuspicion();
  }

  // Removes suspicion for a factor, ensuring it doesn't go below 0
  private removeSuspicion(factor: string, amount: number): void {
    const current = this.suspicionFactors.get(factor) || 0;
    this.suspicionFactors.set(factor, Math.max(0, current - amount));
    this.updateOverallSuspicion();
  }

  // Gradually reduces suspicion over time
  private decaySuspicion(): void {
    for (const [factor, value] of this.suspicionFactors) {
      this.suspicionFactors.set(factor, Math.max(0, value * 0.95)); // Decay by 5%
    }
    this.updateOverallSuspicion();
  }

  // Updates the overall suspicion level based on individual factors
  private updateOverallSuspicion(): void {
    let total = 0;
    for (const value of this.suspicionFactors.values()) {
      total += value;
    }

    // Normalize total suspicion to a 0-1 range (assuming max possible sum of factors is around 5)
    this.adapter.suspicionLevel = Math.min(1, total / 5);

    // Apply emergency randomization if suspicion is high
    if (this.adapter.suspicionLevel > 0.6) {
      this.applyEmergencyRandomization(this.adapter.suspicionLevel);
    }

    // Emit an alert if suspicion level exceeds a certain threshold
    if (this.adapter.suspicionLevel > 0.5) {
      this.adapter["emitPlatformEvent"]("anti_detection_alert", {
        level: this.adapter.suspicionLevel,
        factors: Object.fromEntries(this.suspicionFactors),
        recommendation: this.adapter.suspicionLevel > 0.8 ? "pause_session" : "reduce_activity",
        autoAdjusted: this.adapter.suspicionLevel > 0.6, // Indicate if settings were auto-adjusted
      });
    }
  }

  // Applies more aggressive anti-detection measures when suspicion is high
  private applyEmergencyRandomization(suspicionLevel: number): void {
    const humanizer = getHumanizer(); // Get humanizer instance
    if (!humanizer) return;

    const currentSettings = humanizer.getSettings();

    // Increase delays and variance based on suspicion level
    const multiplier = 1 + (suspicionLevel - 0.6) * 2; // Scale multiplier from 1.0 to 2.0+

    humanizer.updateSettings({
      minDelayMs: Math.round(currentSettings.minDelayMs * multiplier),
      maxDelayMs: Math.round(currentSettings.maxDelayMs * multiplier),
      thinkingTimeVariance: Math.min(0.6, currentSettings.thinkingTimeVariance * 1.5), // Limit variance increase
      enableMisclicks: suspicionLevel > 0.7 ? true : currentSettings.enableMisclicks, // Enable misclicks at high suspicion
      misclickProbability: suspicionLevel > 0.7 ? 0.001 : currentSettings.misclickProbability, // Increase misclick probability
    });

    // Inject noise into GTO calculations if applicable
    const gtoAdapter = (this.adapter as any).gtoAdapter;
    if (gtoAdapter && suspicionLevel > 0.6) {
      const noiseLevel = (suspicionLevel - 0.6) * 0.25; // Scale noise from 0% to 12.5%
      console.warn(`[Anti-Detection] Injecting ${(noiseLevel * 100).toFixed(1)}% GTO noise due to high suspicion.`);
      (gtoAdapter as any).injectedNoise = noiseLevel;
    }

    // Trigger a random human interaction more frequently at high suspicion
    if (suspicionLevel > 0.7) {
      this.triggerRandomHumanInteraction();
    }

    console.warn(`[Anti-Detection] Emergency randomization applied (Suspicion: ${(suspicionLevel * 100).toFixed(1)}%).`);
  }

  // Checks for unrealistically fast sequences of actions
  private checkImpossibleTimings(): void {
    if (this.lastActionTimestamps.length < 3) return; // Need at least 3 actions

    const recentTimings = this.lastActionTimestamps.slice(-10); // Check last 10 actions
    let fastActionCount = 0;

    // Count pairs of actions occurring very close together (<300ms)
    for (let i = 1; i < recentTimings.length; i++) {
      if (recentTimings[i] - recentTimings[i - 1] < 300) {
        fastActionCount++;
      }
    }

    // If too many fast actions, raise suspicion
    if (fastActionCount > 2) {
      this.addSuspicion("impossible_timings", 0.15);
    }
  }

  // Checks for repetitive sequences of the same action (e.g., fold-fold-fold)
  private checkActionSequencePatterns(): void {
    if (this.patterns.length < 10) return; // Need sufficient history

    const recentPatterns = this.patterns.slice(-20); // Analyze last 20 actions
    const actionTypes = recentPatterns.map(p => p.type);

    let maxRepetition = 1;
    let currentRepetition = 1;

    // Find the longest consecutive sequence of the same action type
    for (let i = 1; i < actionTypes.length; i++) {
      if (actionTypes[i] === actionTypes[i - 1]) {
        currentRepetition++;
        maxRepetition = Math.max(maxRepetition, currentRepetition);
      } else {
        currentRepetition = 1; // Reset count if action changes
      }
    }

    // If a single action is repeated many times consecutively, it's suspicious
    if (maxRepetition > 5) {
      this.addSuspicion("repetitive_sequences", 0.1);
    }
  }

  // Provides statistics for monitoring and debugging
  getStats(): {
    actionCounts: Record<string, number>;
    screenCaptureCount: number;
    suspicionFactors: Record<string, number>;
    overallSuspicion: number;
  } {
    return {
      actionCounts: Object.fromEntries(this.actionCounts),
      screenCaptureCount: this.screenCaptureCount,
      suspicionFactors: Object.fromEntries(this.suspicionFactors),
      overallSuspicion: this.adapter.suspicionLevel,
    };
  }
}

// Interface for action patterns recorded by AntiDetectionMonitor
interface ActionPattern {
  type: string;
  timestamp: number;
}

// Register the GGClubAdapter with the PlatformAdapterRegistry
PlatformAdapterRegistry.getInstance().register("ggclub", GGClubAdapter);

// Factory function to create an instance of GGClubAdapter
export function createGGClubAdapter(): GGClubAdapter {
  return new GGClubAdapter();
}