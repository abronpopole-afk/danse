import {
  PlatformAdapter,
  PlatformCapabilities,
  ConnectionConfig,
  PlatformCredentials,
  TableWindow,
  GameTableState,
  CardInfo,
  DetectedPlayer,
  DetectedButton,
  ScreenRegion,
  ConnectionStatus,
  PlatformAdapterRegistry,
  parseCardNotation,
} from "../platform-adapter";
import { getCalibrationManager, colorMatch, findColorInRegion, getDominantColorInRegion, CalibrationProfile, TableRegions } from "../calibration";

let Tesseract: any = null;
let screenshotDesktop: any = null;
let robot: any = null;
let windowManager: any = null;

async function loadNativeModules(): Promise<void> {
  try {
    Tesseract = await import("tesseract.js");
  } catch (e) {
    console.warn("tesseract.js not available:", e);
  }
  
  try {
    screenshotDesktop = (await import("screenshot-desktop")).default;
  } catch (e) {
    console.warn("screenshot-desktop not available:", e);
  }
  
  try {
    robot = (await import("robotjs")).default;
  } catch (e) {
    console.warn("robotjs not available:", e);
  }
  
  try {
    windowManager = await import("node-window-manager");
  } catch (e) {
    console.warn("node-window-manager not available:", e);
  }
}

loadNativeModules();

interface GGClubScreenLayout {
  heroCardsRegion: ScreenRegion;
  communityCardsRegion: ScreenRegion;
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
    this.initializeTesseract();
  }
  
  private async initializeTesseract(): Promise<void> {
    try {
      if (Tesseract && Tesseract.createWorker) {
        this.tesseractWorker = await Tesseract.createWorker('eng');
        console.log("Tesseract OCR worker initialized");
      } else {
        console.warn("Tesseract not available, OCR will be limited");
      }
    } catch (error) {
      console.error("Failed to initialize Tesseract:", error);
    }
  }

  private getDefaultScreenLayout(): GGClubScreenLayout {
    return {
      heroCardsRegion: { x: 380, y: 450, width: 120, height: 80 },
      communityCardsRegion: { x: 280, y: 280, width: 320, height: 90 },
      potRegion: { x: 380, y: 230, width: 120, height: 40 },
      actionButtonsRegion: { x: 500, y: 520, width: 380, height: 80 },
      betSliderRegion: { x: 500, y: 480, width: 300, height: 30 },
      playerSeats: this.generatePlayerSeatRegions(9),
      dealerButtonRegion: { x: 0, y: 0, width: 30, height: 30 },
      chatRegion: { x: 10, y: 400, width: 200, height: 150 },
      timerRegion: { x: 400, y: 200, width: 80, height: 30 },
    };
  }

  private generatePlayerSeatRegions(maxPlayers: number): ScreenRegion[] {
    const regions: ScreenRegion[] = [];
    const centerX = 440;
    const centerY = 300;
    const radiusX = 350;
    const radiusY = 200;

    for (let i = 0; i < maxPlayers; i++) {
      const angle = (2 * Math.PI * i) / maxPlayers - Math.PI / 2;
      const x = centerX + radiusX * Math.cos(angle) - 60;
      const y = centerY + radiusY * Math.sin(angle) - 40;
      regions.push({ x: Math.round(x), y: Math.round(y), width: 120, height: 80 });
    }

    return regions;
  }

  async connect(config: ConnectionConfig): Promise<boolean> {
    this.updateConnectionStatus("connecting");

    try {
      const isAuthenticated = await this.authenticate(config.credentials);
      if (!isAuthenticated) {
        this.updateConnectionStatus("error");
        return false;
      }

      this.startWindowPolling();
      this.startHeartbeat();
      this.antiDetectionMonitor.start();

      this.updateConnectionStatus("connected");
      this.reconnectAttempts = 0;

      this.emitPlatformEvent("connection_status", {
        status: "connected",
        platform: this.platformName,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      console.error("GGClub connection error:", error);
      this.updateConnectionStatus("error");

      if (config.autoReconnect && this.reconnectAttempts < config.maxReconnectAttempts) {
        this.reconnectAttempts++;
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
    await this.addRandomDelay(500);

    try {
      const loginResult = await this.performLogin(credentials);
      
      if (!loginResult.success) {
        if (loginResult.reason === "banned") {
          this.updateConnectionStatus("banned");
        }
        return false;
      }

      this.sessionToken = loginResult.sessionToken ?? null;
      this.updateConnectionStatus("authenticated");

      await this.addRandomDelay(1000);

      return true;
    } catch (error) {
      console.error("GGClub authentication error:", error);
      return false;
    }
  }

  private async performLogin(credentials: PlatformCredentials): Promise<{ 
    success: boolean; 
    sessionToken?: string; 
    reason?: string 
  }> {
    await this.addRandomDelay(800);

    this.trackAction();

    return {
      success: true,
      sessionToken: `ggclub_session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
  }

  private startWindowPolling(): void {
    this.windowPollingInterval = setInterval(async () => {
      try {
        const windows = await this.detectTableWindows();
        
        for (const [windowId, existingWindow] of this.activeWindows) {
          const stillExists = windows.some(w => w.windowId === windowId);
          if (!stillExists) {
            this.activeWindows.delete(windowId);
            this.emitPlatformEvent("table_closed", { windowId, handle: existingWindow.handle });
          }
        }

        for (const window of windows) {
          if (!this.activeWindows.has(window.windowId)) {
            this.activeWindows.set(window.windowId, window);
            this.emitPlatformEvent("table_detected", { window });
          }
        }
      } catch (error) {
        console.error("Window polling error:", error);
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
    const windows: TableWindow[] = [];

    const detectedWindows = await this.scanForGGClubWindows();

    for (const windowInfo of detectedWindows) {
      const tableWindow: TableWindow = {
        windowId: `ggclub_${windowInfo.handle}`,
        handle: windowInfo.handle,
        title: windowInfo.title,
        x: windowInfo.x,
        y: windowInfo.y,
        width: windowInfo.width,
        height: windowInfo.height,
        isActive: windowInfo.isActive,
        isMinimized: windowInfo.isMinimized,
      };
      windows.push(tableWindow);
    }

    return windows;
  }

  private async scanForGGClubWindows(): Promise<Array<{
    handle: number;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isActive: boolean;
    isMinimized: boolean;
  }>> {
    const results: Array<{
      handle: number;
      title: string;
      x: number;
      y: number;
      width: number;
      height: number;
      isActive: boolean;
      isMinimized: boolean;
    }> = [];

    if (windowManager) {
      try {
        const windows = windowManager.windowManager.getWindows();
        const activeWindow = windowManager.windowManager.getActiveWindow();
        
        for (const win of windows) {
          const title = win.getTitle();
          if (title && (
            title.includes("GGClub") || 
            title.includes("GGPoker") || 
            title.includes("NL") ||
            title.includes("PLO") ||
            title.match(/Table\s*\d+/i)
          )) {
            const bounds = win.getBounds();
            results.push({
              handle: win.id,
              title,
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              isActive: activeWindow && activeWindow.id === win.id,
              isMinimized: bounds.width === 0 && bounds.height === 0,
            });
          }
        }
      } catch (error) {
        console.error("Error scanning windows:", error);
      }
    }

    if (results.length === 0) {
      results.push({
        handle: 1001,
        title: "GGClub - NL50 - Table 1 (Simulation)",
        x: 0,
        y: 0,
        width: 880,
        height: 600,
        isActive: true,
        isMinimized: false,
      });
    }

    return results;
  }

  async captureScreen(windowHandle: number): Promise<Buffer> {
    const cachedCapture = this.lastScreenCaptures.get(windowHandle);
    const now = Date.now();

    if (cachedCapture && (now - cachedCapture.timestamp) < this.screenCaptureInterval) {
      return cachedCapture.buffer;
    }

    const buffer = await this.performScreenCapture(windowHandle);

    this.lastScreenCaptures.set(windowHandle, { buffer, timestamp: now });
    this.antiDetectionMonitor.recordScreenCapture();

    return buffer;
  }

  private async performScreenCapture(windowHandle: number): Promise<Buffer> {
    await this.addRandomDelay(20);
    
    if (screenshotDesktop) {
      try {
        const window = this.activeWindows.get(`ggclub_${windowHandle}`);
        if (window) {
          const imgBuffer = await screenshotDesktop({
            screen: window.title,
            format: 'png',
          });
          return imgBuffer;
        }
        
        const imgBuffer = await screenshotDesktop({ format: 'png' });
        return imgBuffer;
      } catch (error) {
        console.error("Screen capture error:", error);
      }
    }
    
    return Buffer.alloc(880 * 600 * 4);
  }

  async getGameState(windowHandle: number): Promise<GameTableState> {
    const screenBuffer = await this.captureScreen(windowHandle);

    const [
      heroCards,
      communityCards,
      potSize,
      players,
      blinds,
      isHeroTurn,
      availableActions,
    ] = await Promise.all([
      this.detectHeroCards(windowHandle),
      this.detectCommunityCards(windowHandle),
      this.detectPot(windowHandle),
      this.detectPlayers(windowHandle),
      this.detectBlinds(windowHandle),
      this.isHeroTurn(windowHandle),
      this.detectAvailableActions(windowHandle),
    ]);

    const heroPlayer = players.find(p => p.position === this.findHeroPosition(players));
    const currentStreet = this.determineStreet(communityCards.length);
    const facingBet = this.calculateFacingBet(players, heroPlayer?.position || 0);

    const gameState: GameTableState = {
      tableId: `ggclub_${windowHandle}`,
      windowHandle,
      heroCards,
      communityCards,
      potSize,
      heroStack: heroPlayer?.stack || 0,
      heroPosition: heroPlayer?.position || 0,
      players,
      isHeroTurn,
      currentStreet,
      facingBet,
      blindLevel: blinds,
      availableActions,
      betSliderRegion: this.screenLayout.betSliderRegion,
      timestamp: Date.now(),
    };

    this.emitPlatformEvent("game_state", { gameState });

    if (isHeroTurn) {
      this.emitPlatformEvent("action_required", { 
        windowHandle, 
        gameState,
        availableActions,
      });
    }

    return gameState;
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
    const cacheKey = `hero_${windowHandle}_${Date.now() - (Date.now() % 1000)}`;
    const cached = this.cardRecognitionCache.get(cacheKey);
    if (cached) return cached;

    const screenBuffer = await this.captureScreen(windowHandle);
    const region = this.screenLayout.heroCardsRegion;

    const cards = await this.recognizeCardsInRegion(screenBuffer, region);

    if (cards.length === 2) {
      this.cardRecognitionCache.set(cacheKey, cards);
    }

    return cards;
  }

  async detectCommunityCards(windowHandle: number): Promise<CardInfo[]> {
    const screenBuffer = await this.captureScreen(windowHandle);
    const region = this.screenLayout.communityCardsRegion;

    return this.recognizeCardsInRegion(screenBuffer, region);
  }

  private async recognizeCardsInRegion(screenBuffer: Buffer, region: ScreenRegion): Promise<CardInfo[]> {
    await this.addRandomDelay(30);

    const cards: CardInfo[] = [];

    const cardPatterns = this.detectCardPatterns(screenBuffer, region);

    for (const pattern of cardPatterns) {
      const rank = await this.recognizeCardRank(pattern);
      const suit = await this.recognizeCardSuit(pattern);

      if (rank && suit) {
        cards.push({
          rank,
          suit,
          raw: `${rank}${suit.charAt(0)}`,
        });
      }
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

  private async recognizeCardRank(region: ScreenRegion): Promise<string | null> {
    await this.addRandomDelay(10);

    const ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
    return ranks[Math.floor(Math.random() * ranks.length)] || null;
  }

  private async recognizeCardSuit(region: ScreenRegion): Promise<string | null> {
    await this.addRandomDelay(10);

    const suits = ["hearts", "diamonds", "clubs", "spades"];
    return suits[Math.floor(Math.random() * suits.length)] || null;
  }

  async detectPot(windowHandle: number): Promise<number> {
    const screenBuffer = await this.captureScreen(windowHandle);
    const region = this.screenLayout.potRegion;

    const ocrResult = await this.performOCR(screenBuffer, region);
    const potValue = this.parseMoneyValue(ocrResult.text);

    return potValue;
  }

  private parseMoneyValue(text: string): number {
    const cleaned = text.replace(/[^0-9.,]/g, "");
    const normalized = cleaned.replace(",", ".");
    const value = parseFloat(normalized);
    return isNaN(value) ? 0 : value;
  }

  async detectPlayers(windowHandle: number): Promise<DetectedPlayer[]> {
    const screenBuffer = await this.captureScreen(windowHandle);
    const players: DetectedPlayer[] = [];

    for (let i = 0; i < this.screenLayout.playerSeats.length; i++) {
      const seatRegion = this.screenLayout.playerSeats[i];
      const playerInfo = await this.analyzePlayerSeat(screenBuffer, seatRegion, i);

      if (playerInfo) {
        players.push(playerInfo);
      }
    }

    return players;
  }

  private async analyzePlayerSeat(
    screenBuffer: Buffer, 
    seatRegion: ScreenRegion, 
    position: number
  ): Promise<DetectedPlayer | null> {
    const isOccupied = await this.checkSeatOccupied(screenBuffer, seatRegion);
    if (!isOccupied) return null;

    const [name, stack, currentBet, status] = await Promise.all([
      this.recognizePlayerName(screenBuffer, seatRegion),
      this.recognizePlayerStack(screenBuffer, seatRegion),
      this.recognizePlayerBet(screenBuffer, seatRegion),
      this.recognizePlayerStatus(screenBuffer, seatRegion),
    ]);

    return {
      position,
      name: name || `Player${position + 1}`,
      stack: stack || 0,
      currentBet: currentBet || 0,
      isActive: status === "active",
      isFolded: status === "folded",
      isDealer: await this.checkIsDealer(screenBuffer, seatRegion),
      isSmallBlind: false,
      isBigBlind: false,
      seatRegion,
    };
  }

  private async checkSeatOccupied(screenBuffer: Buffer, region: ScreenRegion): Promise<boolean> {
    return true;
  }

  private async recognizePlayerName(screenBuffer: Buffer, region: ScreenRegion): Promise<string | null> {
    const nameRegion = { ...region, height: 20 };
    const ocrResult = await this.performOCR(screenBuffer, nameRegion);
    return ocrResult.text.trim() || null;
  }

  private async recognizePlayerStack(screenBuffer: Buffer, region: ScreenRegion): Promise<number | null> {
    const stackRegion = { ...region, y: region.y + 20, height: 20 };
    const ocrResult = await this.performOCR(screenBuffer, stackRegion);
    return this.parseMoneyValue(ocrResult.text);
  }

  private async recognizePlayerBet(screenBuffer: Buffer, region: ScreenRegion): Promise<number | null> {
    const betRegion = { ...region, y: region.y + 40, height: 20 };
    const ocrResult = await this.performOCR(screenBuffer, betRegion);
    return this.parseMoneyValue(ocrResult.text);
  }

  private async recognizePlayerStatus(
    screenBuffer: Buffer, 
    region: ScreenRegion
  ): Promise<"active" | "folded" | "waiting" | "sitting_out"> {
    const hasActiveHighlight = await this.checkColorInRegion(
      screenBuffer, 
      region, 
      GGCLUB_UI_COLORS.activePlayer
    );

    if (hasActiveHighlight) return "active";

    const hasFoldedColor = await this.checkColorInRegion(
      screenBuffer, 
      region, 
      GGCLUB_UI_COLORS.foldedPlayer
    );

    if (hasFoldedColor) return "folded";

    return "waiting";
  }

  private async checkIsDealer(screenBuffer: Buffer, region: ScreenRegion): Promise<boolean> {
    return this.checkColorInRegion(screenBuffer, region, GGCLUB_UI_COLORS.dealerButton);
  }

  private async checkColorInRegion(
    screenBuffer: Buffer, 
    region: ScreenRegion, 
    colorSignature: ColorSignature
  ): Promise<boolean> {
    if (screenBuffer.length === 0) {
      return false;
    }
    
    try {
      const window = Array.from(this.activeWindows.values())[0];
      const imageWidth = window?.width || 880;
      
      const colorRange = {
        r: colorSignature.r,
        g: colorSignature.g,
        b: colorSignature.b,
        tolerance: colorSignature.tolerance,
      };
      
      const result = findColorInRegion(screenBuffer, imageWidth, region, colorRange);
      
      const threshold = (region.width * region.height) * 0.05;
      return result.matchCount > threshold;
    } catch (error) {
      console.error("Color check error:", error);
      return false;
    }
  }

  async detectBlinds(windowHandle: number): Promise<{ smallBlind: number; bigBlind: number }> {
    const window = this.activeWindows.get(`ggclub_${windowHandle}`);
    if (window) {
      const blindsMatch = window.title.match(/NL(\d+)/);
      if (blindsMatch) {
        const bigBlind = parseInt(blindsMatch[1]);
        return { smallBlind: bigBlind / 2, bigBlind };
      }
    }

    return { smallBlind: 0.25, bigBlind: 0.50 };
  }

  async isHeroTurn(windowHandle: number): Promise<boolean> {
    const screenBuffer = await this.captureScreen(windowHandle);

    const hasHeroHighlight = await this.checkColorInRegion(
      screenBuffer,
      this.screenLayout.heroCardsRegion,
      GGCLUB_UI_COLORS.heroTurnHighlight
    );

    const hasActionButtons = await this.checkActionButtonsVisible(screenBuffer);

    const hasTimer = await this.checkTimerActive(screenBuffer);

    return hasHeroHighlight || (hasActionButtons && hasTimer);
  }

  private async checkActionButtonsVisible(screenBuffer: Buffer): Promise<boolean> {
    const region = this.screenLayout.actionButtonsRegion;

    const hasFoldButton = await this.checkColorInRegion(
      screenBuffer, 
      region, 
      GGCLUB_UI_COLORS.foldButton
    );

    return hasFoldButton;
  }

  private async checkTimerActive(screenBuffer: Buffer): Promise<boolean> {
    return true;
  }

  async detectAvailableActions(windowHandle: number): Promise<DetectedButton[]> {
    const screenBuffer = await this.captureScreen(windowHandle);
    const buttons: DetectedButton[] = [];
    const region = this.screenLayout.actionButtonsRegion;

    const buttonWidth = 90;
    const buttonHeight = 40;
    const buttonSpacing = 10;

    const buttonTypes: Array<{ type: DetectedButton["type"]; color: ColorSignature }> = [
      { type: "fold", color: GGCLUB_UI_COLORS.foldButton },
      { type: "call", color: GGCLUB_UI_COLORS.callButton },
      { type: "check", color: GGCLUB_UI_COLORS.checkButton },
      { type: "raise", color: GGCLUB_UI_COLORS.raiseButton },
      { type: "allin", color: GGCLUB_UI_COLORS.allInButton },
    ];

    let xOffset = 0;
    for (const buttonDef of buttonTypes) {
      const buttonRegion: ScreenRegion = {
        x: region.x + xOffset,
        y: region.y,
        width: buttonWidth,
        height: buttonHeight,
      };

      const isVisible = await this.checkColorInRegion(screenBuffer, buttonRegion, buttonDef.color);

      if (isVisible) {
        const amount = await this.extractButtonAmount(screenBuffer, buttonRegion);
        buttons.push({
          type: buttonDef.type,
          region: buttonRegion,
          isEnabled: true,
          amount,
        });
      }

      xOffset += buttonWidth + buttonSpacing;
    }

    return buttons;
  }

  private async extractButtonAmount(screenBuffer: Buffer, region: ScreenRegion): Promise<number | undefined> {
    const ocrResult = await this.performOCR(screenBuffer, region);
    const amount = this.parseMoneyValue(ocrResult.text);
    return amount > 0 ? amount : undefined;
  }

  private async performOCR(screenBuffer: Buffer, region: ScreenRegion): Promise<OCRResult> {
    await this.addRandomDelay(20);

    if (this.tesseractWorker && screenBuffer.length > 0) {
      try {
        const result = await this.tesseractWorker.recognize(screenBuffer, {
          rectangle: {
            left: region.x,
            top: region.y,
            width: region.width,
            height: region.height,
          },
        });
        
        return {
          text: result.data.text.trim(),
          confidence: result.data.confidence / 100,
          bounds: region,
        };
      } catch (error) {
        console.error("OCR error:", error);
      }
    }

    return {
      text: "",
      confidence: 0,
      bounds: region,
    };
  }

  async executeClick(windowHandle: number, x: number, y: number): Promise<void> {
    this.antiDetectionMonitor.recordAction("click");
    this.trackAction();

    await this.addRandomDelay(50);

    const jitteredPos = this.getJitteredPosition(x, y);

    await this.performMouseMove(windowHandle, jitteredPos.x, jitteredPos.y);
    await this.addRandomDelay(30);
    await this.performMouseClick(windowHandle, jitteredPos.x, jitteredPos.y);

    await this.addRandomDelay(50);
  }

  private async performMouseMove(windowHandle: number, x: number, y: number): Promise<void> {
    if (robot) {
      try {
        const window = this.activeWindows.get(`ggclub_${windowHandle}`);
        const offsetX = window ? window.x : 0;
        const offsetY = window ? window.y : 0;
        
        const currentPos = robot.getMousePos();
        const targetX = offsetX + x;
        const targetY = offsetY + y;
        
        const steps = this.antiDetectionConfig.enableMouseJitter ? 
          Math.floor(Math.random() * 10) + 5 : 10;
        
        for (let i = 1; i <= steps; i++) {
          const progress = i / steps;
          const eased = this.easeInOutQuad(progress);
          
          const midX = currentPos.x + (targetX - currentPos.x) * eased;
          const midY = currentPos.y + (targetY - currentPos.y) * eased;
          
          const jitter = this.antiDetectionConfig.enableMouseJitter ? 
            this.antiDetectionConfig.mouseJitterRange : 0;
          const jitterX = (Math.random() - 0.5) * jitter;
          const jitterY = (Math.random() - 0.5) * jitter;
          
          robot.moveMouse(Math.round(midX + jitterX), Math.round(midY + jitterY));
          await this.addRandomDelay(10);
        }
        
        robot.moveMouse(targetX, targetY);
      } catch (error) {
        console.error("Mouse move error:", error);
      }
    } else {
      await this.addRandomDelay(10);
    }
  }
  
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private async performMouseClick(windowHandle: number, x: number, y: number): Promise<void> {
    if (robot) {
      try {
        await this.addRandomDelay(20);
        robot.mouseClick();
        await this.addRandomDelay(30);
      } catch (error) {
        console.error("Mouse click error:", error);
      }
    } else {
      await this.addRandomDelay(10);
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

    await this.executeClick(windowHandle, centerX, centerY);

    this.emitPlatformEvent("game_state", {
      action: "fold",
      windowHandle,
      timestamp: Date.now(),
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

    await this.executeClick(windowHandle, centerX, centerY);

    this.emitPlatformEvent("game_state", {
      action: "call",
      amount: callButton.amount,
      windowHandle,
      timestamp: Date.now(),
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

    await this.executeClick(windowHandle, centerX, centerY);

    this.emitPlatformEvent("game_state", {
      action: "check",
      windowHandle,
      timestamp: Date.now(),
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

    await this.executeClick(windowHandle, centerX, centerY);

    this.emitPlatformEvent("game_state", {
      action: "raise",
      amount,
      windowHandle,
      timestamp: Date.now(),
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
      await this.executeClick(windowHandle, centerX, centerY);
    }

    this.emitPlatformEvent("game_state", {
      action: "bet",
      amount,
      windowHandle,
      timestamp: Date.now(),
    });
  }

  private async setBetAmount(windowHandle: number, amount: number): Promise<void> {
    const sliderRegion = this.screenLayout.betSliderRegion;

    await this.addRandomDelay(50);

    await this.typeAmount(windowHandle, amount);
  }

  private async typeAmount(windowHandle: number, amount: number): Promise<void> {
    const amountStr = amount.toFixed(2);

    if (robot) {
      try {
        robot.keyTap("a", "control");
        await this.addRandomDelay(30);
        
        for (const char of amountStr) {
          if (this.antiDetectionConfig.enableTimingVariation) {
            const baseDelay = 50;
            const variation = baseDelay * (this.antiDetectionConfig.timingVariationPercent / 100);
            await this.addRandomDelay(baseDelay - variation / 2 + Math.random() * variation);
          } else {
            await this.addRandomDelay(50);
          }
          
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
      await this.executeClick(windowHandle, centerX, centerY);
    } else {
      const raiseButton = buttons.find(b => b.type === "raise");
      if (raiseButton) {
        await this.moveBetSliderToMax(windowHandle);
        await this.addRandomDelay(100);

        const centerX = raiseButton.region.x + raiseButton.region.width / 2;
        const centerY = raiseButton.region.y + raiseButton.region.height / 2;
        await this.executeClick(windowHandle, centerX, centerY);
      }
    }

    this.emitPlatformEvent("game_state", {
      action: "allin",
      windowHandle,
      timestamp: Date.now(),
    });
  }

  private async moveBetSliderToMax(windowHandle: number): Promise<void> {
    const sliderRegion = this.screenLayout.betSliderRegion;
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
          targetWindow.bringToTop();
        }
      } catch (error) {
        console.error("Focus window error:", error);
      }
    }
  }

  async minimizeWindow(windowHandle: number): Promise<void> {
    await this.addRandomDelay(50);
    
    if (windowManager) {
      try {
        const windows = windowManager.windowManager.getWindows();
        const targetWindow = windows.find((w: any) => w.id === windowHandle);
        if (targetWindow) {
          targetWindow.minimize();
        }
      } catch (error) {
        console.error("Minimize window error:", error);
      }
    }
  }

  async restoreWindow(windowHandle: number): Promise<void> {
    await this.addRandomDelay(50);
    
    if (windowManager) {
      try {
        const windows = windowManager.windowManager.getWindows();
        const targetWindow = windows.find((w: any) => w.id === windowHandle);
        if (targetWindow) {
          targetWindow.restore();
        }
      } catch (error) {
        console.error("Restore window error:", error);
      }
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

  constructor(adapter: GGClubAdapter) {
    this.adapter = adapter;
  }

  start(): void {
    this.monitorInterval = setInterval(() => {
      this.analyzePatterns();
      this.decaySuspicion();
    }, 10000);
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  recordAction(actionType: string): void {
    const count = this.actionCounts.get(actionType) || 0;
    this.actionCounts.set(actionType, count + 1);

    this.lastActionTimestamps.push(Date.now());

    if (this.lastActionTimestamps.length > 100) {
      this.lastActionTimestamps = this.lastActionTimestamps.slice(-100);
    }

    this.patterns.push({
      type: actionType,
      timestamp: Date.now(),
    });

    if (this.patterns.length > 500) {
      this.patterns = this.patterns.slice(-500);
    }
  }

  recordScreenCapture(): void {
    this.screenCaptureCount++;
  }

  private analyzePatterns(): void {
    this.checkTimingRegularity();
    this.checkActionDistribution();
    this.checkScreenCaptureRate();
    this.checkBurstActivity();
    this.checkImpossibleTimings();
    this.checkActionSequencePatterns();
  }

  private checkTimingRegularity(): void {
    if (this.lastActionTimestamps.length < 10) return;

    const intervals: number[] = [];
    for (let i = 1; i < this.lastActionTimestamps.length; i++) {
      intervals.push(this.lastActionTimestamps[i] - this.lastActionTimestamps[i - 1]);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    if (coefficientOfVariation < 0.15) {
      this.addSuspicion("timing_regularity", 0.05);
    } else {
      this.removeSuspicion("timing_regularity", 0.02);
    }
  }

  private checkActionDistribution(): void {
    const total = Array.from(this.actionCounts.values()).reduce((a, b) => a + b, 0);
    if (total < 20) return;

    const foldCount = this.actionCounts.get("fold") || 0;
    const callCount = this.actionCounts.get("call") || 0;
    const raiseCount = this.actionCounts.get("raise") || 0;

    const foldRatio = foldCount / total;
    const raiseRatio = raiseCount / total;

    if (foldRatio > 0.8 || foldRatio < 0.1) {
      this.addSuspicion("action_distribution", 0.03);
    }

    if (raiseRatio > 0.6) {
      this.addSuspicion("aggressive_pattern", 0.02);
    }
  }

  private checkScreenCaptureRate(): void {
    if (this.screenCaptureCount > 1000) {
      this.addSuspicion("high_capture_rate", 0.02);
    }
  }

  private checkBurstActivity(): void {
    const now = Date.now();
    const recentActions = this.lastActionTimestamps.filter(t => now - t < 5000);

    if (recentActions.length > 20) {
      this.addSuspicion("burst_activity", 0.08);
    }
  }

  private addSuspicion(factor: string, amount: number): void {
    const current = this.suspicionFactors.get(factor) || 0;
    this.suspicionFactors.set(factor, Math.min(1, current + amount));
    this.updateOverallSuspicion();
  }

  private removeSuspicion(factor: string, amount: number): void {
    const current = this.suspicionFactors.get(factor) || 0;
    this.suspicionFactors.set(factor, Math.max(0, current - amount));
    this.updateOverallSuspicion();
  }

  private decaySuspicion(): void {
    for (const [factor, value] of this.suspicionFactors) {
      this.suspicionFactors.set(factor, Math.max(0, value * 0.95));
    }
    this.updateOverallSuspicion();
  }

  private updateOverallSuspicion(): void {
    let total = 0;
    for (const value of this.suspicionFactors.values()) {
      total += value;
    }

    const normalizedSuspicion = Math.min(1, total / 5);
    (this.adapter as any).suspicionLevel = normalizedSuspicion;

    // Auto-ajustement des délais si suspicion élevée
    if (normalizedSuspicion > 0.6) {
      this.applyEmergencyRandomization(normalizedSuspicion);
    }

    if (normalizedSuspicion > 0.5) {
      this.adapter["emitPlatformEvent"]("anti_detection_alert", {
        level: normalizedSuspicion,
        factors: Object.fromEntries(this.suspicionFactors),
        recommendation: normalizedSuspicion > 0.8 ? "pause_session" : "reduce_activity",
        autoAdjusted: normalizedSuspicion > 0.6,
      });
    }
  }

  private applyEmergencyRandomization(suspicionLevel: number): void {
    const humanizer = (this.adapter as any).getHumanizer?.();
    if (!humanizer) return;

    const currentSettings = humanizer.getSettings();
    
    // Augmenter les délais et la variance proportionnellement à la suspicion
    const multiplier = 1 + (suspicionLevel - 0.6) * 2; // 1.0x à 1.8x
    
    humanizer.updateSettings({
      minDelayMs: Math.round(currentSettings.minDelayMs * multiplier),
      maxDelayMs: Math.round(currentSettings.maxDelayMs * multiplier),
      thinkingTimeVariance: Math.min(0.6, currentSettings.thinkingTimeVariance * 1.5),
      enableMisclicks: suspicionLevel > 0.7 ? true : currentSettings.enableMisclicks,
      misclickProbability: suspicionLevel > 0.7 ? 0.001 : currentSettings.misclickProbability,
    });

    console.warn(`[Anti-Detection] Emergency randomization applied (${Math.round(suspicionLevel * 100)}%)`);
  }

  private checkImpossibleTimings(): void {
    if (this.lastActionTimestamps.length < 3) return;

    const recentTimings = this.lastActionTimestamps.slice(-10);
    const veryFastActions = recentTimings.filter((timestamp, i) => {
      if (i === 0) return false;
      return timestamp - recentTimings[i - 1] < 300; // <300ms = suspect
    });

    if (veryFastActions.length > 2) {
      this.addSuspicion("impossible_timings", 0.15);
    }
  }

  private checkActionSequencePatterns(): void {
    if (this.patterns.length < 10) return;

    const recentPatterns = this.patterns.slice(-20);
    const actionTypes = recentPatterns.map(p => p.type);

    // Détecter les séquences répétitives (fold-fold-fold ou call-call-call)
    let maxRepetition = 1;
    let currentRepetition = 1;
    
    for (let i = 1; i < actionTypes.length; i++) {
      if (actionTypes[i] === actionTypes[i - 1]) {
        currentRepetition++;
        maxRepetition = Math.max(maxRepetition, currentRepetition);
      } else {
        currentRepetition = 1;
      }
    }

    if (maxRepetition > 5) {
      this.addSuspicion("repetitive_sequences", 0.1);
    }
  }

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
      overallSuspicion: (this.adapter as any).suspicionLevel,
    };
  }
}

interface ActionPattern {
  type: string;
  timestamp: number;
}

PlatformAdapterRegistry.getInstance().register("ggclub", GGClubAdapter);

export function createGGClubAdapter(): GGClubAdapter {
  return new GGClubAdapter();
}
