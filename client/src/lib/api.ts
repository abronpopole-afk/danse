import { invoke } from "@tauri-apps/api/tauri";
import { 
  BotSession, PokerTable, HumanizerConfig, GtoConfig, 
  PlatformConfig, ActionLog, BotStats, HandHistory, GtoRecommendation 
} from "@shared/schema";

export interface TableState {
  id: string;
  tableIdentifier: string;
  tableName: string;
  stakes: string;
  status: string;
  heroPosition: number;
  heroStack: number;
  heroCards: string[];
  communityCards: string[];
  currentStreet: string;
  currentPot: number;
  players: any[];
  isHeroTurn: boolean;
  facingBet: number;
  lastGtoRecommendation?: GtoRecommendation;
  handsPlayed: number;
  sessionProfit: number;
}

export interface TableStats {
  totalTables: number;
  activeTables: number;
  totalHandsPlayed: number;
  totalProfit: number;
}

export interface HumanizerSettings {
  minDelayMs: number;
  maxDelayMs: number;
  enableBezierMouse: boolean;
  enableMisclicks: boolean;
  misclickProbability: number;
  enableRandomFolds: boolean;
  randomFoldProbability: number;
  thinkingTimeVariance: number;
  preActionDelay: number;
  postActionDelay: number;
  stealthModeEnabled: boolean;
}

export const api = {
  session: {
    async start(): Promise<{ success: boolean; session: BotSession }> {
      return invoke("start_session");
    },
    async stop(): Promise<{ success: boolean; stats: TableStats }> {
      return invoke("stop_session");
    },
    async forceStop(): Promise<{ success: boolean; forced: boolean }> {
      return invoke("force_stop_session");
    },
    async cleanupStale(): Promise<{ success: boolean; cleaned: boolean; sessionId?: string }> {
      return invoke("cleanup_stale_sessions");
    },
    async getCurrent(): Promise<{ session: BotSession | null; stats: TableStats; tables: TableState[] }> {
      return invoke("get_current_session");
    },
  },

  tables: {
    async getAll(): Promise<{ tables: TableState[] }> {
      return invoke("get_all_tables");
    },
    async add(config: { tableIdentifier: string; tableName: string; stakes: string }): Promise<{ success: boolean; table: TableState }> {
      return invoke("add_table", { config });
    },
    async remove(tableId: string): Promise<{ success: boolean }> {
      return invoke("remove_table", { tableId });
    },
    async start(tableId: string): Promise<{ success: boolean; state: TableState }> {
      return invoke("start_table", { tableId });
    },
    async pause(tableId: string): Promise<{ success: boolean; state: TableState }> {
      return invoke("pause_table", { tableId });
    },
    async startAll(): Promise<{ success: boolean; stats: TableStats }> {
      return invoke("start_all_tables");
    },
    async stopAll(): Promise<{ success: boolean; stats: TableStats }> {
      return invoke("stop_all_tables");
    },
  },

  humanizer: {
    async get(): Promise<{ config: HumanizerConfig; currentSettings: HumanizerSettings }> {
      return invoke("get_humanizer_config");
    },
    async update(updates: Partial<HumanizerConfig>): Promise<{ success: boolean; config: HumanizerConfig }> {
      return invoke("update_humanizer_config", { updates });
    },
  },

  gtoConfig: {
    async get(): Promise<{ config: GtoConfig; connected: boolean; usingSimulation: boolean }> {
      return invoke("get_gto_config");
    },
    async update(updates: Partial<GtoConfig>): Promise<{ success: boolean; config: GtoConfig }> {
      return invoke("update_gto_config", { updates });
    },
    async test(): Promise<{ success: boolean; error?: string }> {
      return invoke("test_gto_connection");
    },
  },

  platform: {
    async get(): Promise<{ config: PlatformConfig | null }> {
      return invoke("get_platform_config");
    },
    async update(updates: Partial<PlatformConfig>): Promise<{ success: boolean; config: PlatformConfig }> {
      return invoke("update_platform_config", { updates });
    },
    async connect(config: any): Promise<{ success: boolean; accountId?: string }> {
      return invoke("connect_platform", { config });
    },
    async disconnect(accountId: string): Promise<{ success: boolean }> {
      return invoke("disconnect_platform", { accountId });
    },
  },

  logs: {
    async getRecent(limit: number = 50): Promise<{ logs: ActionLog[] }> {
      return invoke("get_recent_logs", { limit });
    },
  },

  stats: {
    async get(): Promise<{
      session: BotSession | null;
      tableStats: TableStats;
      dbStats: BotStats | null;
      humanizerSettings: HumanizerSettings;
      gtoConnected: boolean;
    }> {
      return invoke("get_global_stats");
    },
  },

  handHistories: {
    async getRecent(limit: number = 20): Promise<{ histories: HandHistory[] }> {
      return invoke("get_recent_histories", { limit });
    },
  },

  simulate: {
    async hand(params: any): Promise<any> {
      return invoke("simulate_hand", { params });
    },
  },

  windows: {
    async list(): Promise<any[]> {
      return invoke("list_windows");
    },
    async findPoker(): Promise<any[]> {
      return invoke("find_poker_windows");
    },
    async capture(hwnd: number): Promise<string> {
      return invoke("capture_window", { hwnd });
    },
    async focus(hwnd: number): Promise<void> {
      return invoke("focus_window", { hwnd });
    },
    async resize(hwnd: number, width: number, height: number): Promise<void> {
      return invoke("resize_window", { hwnd, width, height });
    },
    async streamFrames(hwnd: number): Promise<void> {
      return invoke("stream_window_frames", { hwnd });
    },
  }
};

export function createWebSocketConnection(
  onMessage: (message: any) => void,
  onOpen?: () => void,
  onClose?: () => void,
  onError?: (error: any) => void
): any {
  // En mode Tauri, on utilise l'API listen pour les événements
  import("@tauri-apps/api/event").then(({ listen }) => {
    listen("poker-event", (event) => {
      onMessage(event.payload);
    });
    onOpen?.();
  }).catch(err => {
    console.error("Erreur d'écoute Tauri:", err);
    onError?.(err);
  });

  return {
    close: () => {},
    send: (data: string) => {
      const msg = JSON.parse(data);
      invoke("send_ws_message", { message: msg });
    }
  };
}

export interface PlayerProfileState {
  personality: string;
  currentAggression: number;
  currentPatience: number;
  currentFocus: number;
  tiltLevel: number;
  fatigueLevel: number;
  sessionDuration: number;
  recentBadBeats: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  timeOfDay: number;
}

export interface PlayerProfileData {
  state: PlayerProfileState;
  config: any;
  modifiers: any;
}

export async function getPlayerProfile(): Promise<PlayerProfileData> {
  return invoke("get_player_profile");
}

export async function updatePlayerPersonality(personality: string): Promise<PlayerProfileData> {
  return invoke("update_player_personality", { personality });
}

export async function resetPlayerProfile(): Promise<{ state: PlayerProfileState; message: string }> {
  return invoke("reset_player_profile");
}
