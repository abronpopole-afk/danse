import { EventEmitter } from "events";
import { PlayerData } from "@shared/schema";

export interface CardInfo {
  rank: string;
  suit: string;
  raw: string;
}

export interface TableWindow {
  windowId: string;
  handle: number;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
  isMinimized: boolean;
}

export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedButton {
  type: "fold" | "call" | "check" | "raise" | "bet" | "allin";
  region: ScreenRegion;
  isEnabled: boolean;
  amount?: number;
}

export interface GameTableState {
  tableId: string;
  windowHandle: number;
  heroCards: CardInfo[];
  communityCards: CardInfo[];
  potSize: number;
  heroStack: number;
  heroPosition: number;
  players: DetectedPlayer[];
  isHeroTurn: boolean;
  currentStreet: "preflop" | "flop" | "turn" | "river" | "unknown";
  facingBet: number;
  blindLevel: { smallBlind: number; bigBlind: number };
  availableActions: DetectedButton[];
  betSliderRegion?: ScreenRegion;
  timestamp: number;
}

export interface DetectedPlayer {
  position: number;
  name: string;
  stack: number;
  currentBet: number;
  isActive: boolean;
  isFolded: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  cards?: CardInfo[];
  seatRegion: ScreenRegion;
}

export interface PlatformCredentials {
  username: string;
  password: string;
  twoFactorCode?: string;
}

export interface ConnectionConfig {
  credentials: PlatformCredentials;
  autoReconnect: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
}

export interface AntiDetectionConfig {
  enableMouseJitter: boolean;
  mouseJitterRange: number;
  enableRandomPauses: boolean;
  pauseMinMs: number;
  pauseMaxMs: number;
  enableWindowFocusSwitching: boolean;
  focusSwitchIntervalMs: number;
  enableProcessMasking: boolean;
  enableTimingVariation: boolean;
  timingVariationPercent: number;
  enableMemoryPatternRandomization: boolean;
  enableApiCallObfuscation: boolean;
  maxActionsPerMinute: number;
  actionPatternVariation: number;
}

export interface PlatformCapabilities {
  supportsMultiTable: boolean;
  maxTables: number;
  supportsHandHistory: boolean;
  supportsPlayerNotes: boolean;
  supportsTableStatistics: boolean;
  requiresWindowCapture: boolean;
  requiresApiAccess: boolean;
  supportsOverlay: boolean;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "authenticated" | "error" | "banned";

export interface PlatformEvent {
  type: "connection_status" | "table_detected" | "table_closed" | "game_state" | "action_required" | "error" | "warning" | "anti_detection_alert";
  data: any;
  timestamp: Date;
}

export abstract class PlatformAdapter extends EventEmitter {
  protected platformName: string;
  protected connectionStatus: ConnectionStatus = "disconnected";
  protected capabilities: PlatformCapabilities;
  protected antiDetectionConfig: AntiDetectionConfig;
  protected activeWindows: Map<string, TableWindow> = new Map();
  protected lastActivityTime: number = 0;
  protected actionCount: number = 0;
  protected actionResetInterval?: NodeJS.Timeout;
  protected suspicionLevel: number = 0;

  constructor(platformName: string, capabilities: PlatformCapabilities) {
    super();
    this.platformName = platformName;
    this.capabilities = capabilities;
    this.antiDetectionConfig = this.getDefaultAntiDetectionConfig();
  }

  protected getDefaultAntiDetectionConfig(): AntiDetectionConfig {
    return {
      enableMouseJitter: true,
      mouseJitterRange: 3,
      enableRandomPauses: true,
      pauseMinMs: 50,
      pauseMaxMs: 200,
      enableWindowFocusSwitching: true,
      focusSwitchIntervalMs: 30000,
      enableProcessMasking: true,
      enableTimingVariation: true,
      timingVariationPercent: 15,
      enableMemoryPatternRandomization: true,
      enableApiCallObfuscation: true,
      maxActionsPerMinute: 30,
      actionPatternVariation: 0.25,
    };
  }

  abstract connect(config: ConnectionConfig): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract authenticate(credentials: PlatformCredentials): Promise<boolean>;
  
  abstract detectTableWindows(): Promise<TableWindow[]>;
  abstract captureScreen(windowHandle: number): Promise<Buffer>;
  abstract getGameState(windowHandle: number): Promise<GameTableState>;
  
  abstract detectHeroCards(windowHandle: number): Promise<CardInfo[]>;
  abstract detectCommunityCards(windowHandle: number): Promise<CardInfo[]>;
  abstract detectPot(windowHandle: number): Promise<number>;
  abstract detectPlayers(windowHandle: number): Promise<DetectedPlayer[]>;
  abstract detectBlinds(windowHandle: number): Promise<{ smallBlind: number; bigBlind: number }>;
  
  abstract isHeroTurn(windowHandle: number): Promise<boolean>;
  abstract detectAvailableActions(windowHandle: number): Promise<DetectedButton[]>;
  
  abstract executeClick(windowHandle: number, x: number, y: number): Promise<void>;
  abstract executeFold(windowHandle: number): Promise<void>;
  abstract executeCall(windowHandle: number): Promise<void>;
  abstract executeCheck(windowHandle: number): Promise<void>;
  abstract executeRaise(windowHandle: number, amount: number): Promise<void>;
  abstract executeBet(windowHandle: number, amount: number): Promise<void>;
  abstract executeAllIn(windowHandle: number): Promise<void>;
  
  abstract focusWindow(windowHandle: number): Promise<void>;
  abstract minimizeWindow(windowHandle: number): Promise<void>;
  abstract restoreWindow(windowHandle: number): Promise<void>;

  getPlatformName(): string {
    return this.platformName;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getCapabilities(): PlatformCapabilities {
    return { ...this.capabilities };
  }

  getAntiDetectionConfig(): AntiDetectionConfig {
    return { ...this.antiDetectionConfig };
  }

  updateAntiDetectionConfig(config: Partial<AntiDetectionConfig>): void {
    this.antiDetectionConfig = { ...this.antiDetectionConfig, ...config };
    this.emit("configUpdated", { antiDetection: this.antiDetectionConfig });
  }

  getSuspicionLevel(): number {
    return this.suspicionLevel;
  }

  protected updateConnectionStatus(status: ConnectionStatus): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = status;
    this.emitPlatformEvent("connection_status", { 
      previous: previousStatus, 
      current: status 
    });
  }

  protected emitPlatformEvent(type: PlatformEvent["type"], data: any): void {
    const event: PlatformEvent = {
      type,
      data,
      timestamp: new Date(),
    };
    this.emit("platformEvent", event);
  }

  protected async addRandomDelay(baseDelayMs: number = 100): Promise<void> {
    if (!this.antiDetectionConfig.enableRandomPauses) {
      return;
    }

    const { pauseMinMs, pauseMaxMs, timingVariationPercent } = this.antiDetectionConfig;
    const variation = baseDelayMs * (timingVariationPercent / 100);
    const delay = baseDelayMs + Math.random() * variation - variation / 2;
    const clampedDelay = Math.max(pauseMinMs, Math.min(pauseMaxMs, delay));

    await new Promise(resolve => setTimeout(resolve, clampedDelay));
  }

  protected getJitteredPosition(x: number, y: number): { x: number; y: number } {
    if (!this.antiDetectionConfig.enableMouseJitter) {
      return { x, y };
    }

    const { mouseJitterRange } = this.antiDetectionConfig;
    const jitterX = (Math.random() - 0.5) * 2 * mouseJitterRange;
    const jitterY = (Math.random() - 0.5) * 2 * mouseJitterRange;

    return {
      x: Math.round(x + jitterX),
      y: Math.round(y + jitterY),
    };
  }

  protected trackAction(): void {
    this.actionCount++;
    this.lastActivityTime = Date.now();

    if (!this.actionResetInterval) {
      this.actionResetInterval = setInterval(() => {
        this.actionCount = 0;
      }, 60000);
    }

    if (this.actionCount > this.antiDetectionConfig.maxActionsPerMinute) {
      this.suspicionLevel += 0.1;
      this.emitPlatformEvent("anti_detection_alert", {
        reason: "action_rate_exceeded",
        actionCount: this.actionCount,
        maxAllowed: this.antiDetectionConfig.maxActionsPerMinute,
        suspicionLevel: this.suspicionLevel,
      });
    }
  }

  protected updateSuspicionLevel(delta: number, reason: string): void {
    const previousLevel = this.suspicionLevel;
    this.suspicionLevel = Math.max(0, Math.min(1, this.suspicionLevel + delta));

    if (this.suspicionLevel !== previousLevel) {
      this.emitPlatformEvent("anti_detection_alert", {
        reason,
        previousLevel,
        currentLevel: this.suspicionLevel,
      });

      if (this.suspicionLevel >= 0.8) {
        this.emitPlatformEvent("warning", {
          message: "Niveau de suspicion critique - Recommandation: pause de session",
          suspicionLevel: this.suspicionLevel,
        });
      }
    }
  }

  cleanup(): void {
    if (this.actionResetInterval) {
      clearInterval(this.actionResetInterval);
      this.actionResetInterval = undefined;
    }
    this.activeWindows.clear();
    this.removeAllListeners();
  }
}

export interface PlatformAdapterFactory {
  create(platformName: string): PlatformAdapter;
  getSupportedPlatforms(): string[];
}

export class PlatformAdapterRegistry {
  private static instance: PlatformAdapterRegistry;
  private adapters: Map<string, new () => PlatformAdapter> = new Map();

  private constructor() {}

  static getInstance(): PlatformAdapterRegistry {
    if (!PlatformAdapterRegistry.instance) {
      PlatformAdapterRegistry.instance = new PlatformAdapterRegistry();
    }
    return PlatformAdapterRegistry.instance;
  }

  register(platformName: string, adapterClass: new () => PlatformAdapter): void {
    this.adapters.set(platformName.toLowerCase(), adapterClass);
  }

  create(platformName: string): PlatformAdapter | null {
    const AdapterClass = this.adapters.get(platformName.toLowerCase());
    if (!AdapterClass) {
      return null;
    }
    return new AdapterClass();
  }

  getSupportedPlatforms(): string[] {
    return Array.from(this.adapters.keys());
  }

  isSupported(platformName: string): boolean {
    return this.adapters.has(platformName.toLowerCase());
  }
}

export function parseCardNotation(notation: string): CardInfo {
  const rankMap: Record<string, string> = {
    "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    "T": "10", "10": "10", "J": "J", "Q": "Q", "K": "K", "A": "A",
  };

  const suitMap: Record<string, string> = {
    "h": "hearts", "d": "diamonds", "c": "clubs", "s": "spades",
    "♥": "hearts", "♦": "diamonds", "♣": "clubs", "♠": "spades",
  };

  const rank = notation.slice(0, -1);
  const suit = notation.slice(-1);

  return {
    rank: rankMap[rank] || rank,
    suit: suitMap[suit.toLowerCase()] || suit,
    raw: notation,
  };
}

export function cardInfoToNotation(card: CardInfo): string {
  const rankMap: Record<string, string> = {
    "10": "T", "J": "J", "Q": "Q", "K": "K", "A": "A",
  };

  const suitMap: Record<string, string> = {
    "hearts": "h", "diamonds": "d", "clubs": "c", "spades": "s",
  };

  const rank = rankMap[card.rank] || card.rank;
  const suit = suitMap[card.suit] || card.suit.charAt(0).toLowerCase();

  return rank + suit;
}

export function gameStateToPlayerData(detectedPlayers: DetectedPlayer[]): PlayerData[] {
  return detectedPlayers.map(player => ({
    position: player.position,
    name: player.name,
    stack: player.stack,
    cards: player.cards?.map(c => cardInfoToNotation(c)),
    isActive: player.isActive,
    isFolded: player.isFolded,
    currentBet: player.currentBet,
  }));
}
