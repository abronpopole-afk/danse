import { 
  BotSession, PokerTable, HumanizerConfig, GtoConfig, 
  PlatformConfig, ActionLog, BotStats, HandHistory, GtoRecommendation 
} from "@shared/schema";

const API_BASE = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur réseau" }));
    throw new Error(error.error || `Erreur HTTP: ${response.status}`);
  }

  return response.json();
}

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
      return fetchJson(`${API_BASE}/session/start`, { method: "POST" });
    },

    async stop(): Promise<{ success: boolean; stats: TableStats }> {
      return fetchJson(`${API_BASE}/session/stop`, { method: "POST" });
    },

    async getCurrent(): Promise<{ session: BotSession | null; stats: TableStats; tables: TableState[] }> {
      return fetchJson(`${API_BASE}/session/current`);
    },
  },

  tables: {
    async getAll(): Promise<{ tables: TableState[] }> {
      return fetchJson(`${API_BASE}/tables`);
    },

    async add(config: { tableIdentifier: string; tableName: string; stakes: string }): Promise<{ success: boolean; table: TableState }> {
      return fetchJson(`${API_BASE}/tables`, {
        method: "POST",
        body: JSON.stringify(config),
      });
    },

    async remove(tableId: string): Promise<{ success: boolean }> {
      return fetchJson(`${API_BASE}/tables/${tableId}`, { method: "DELETE" });
    },

    async start(tableId: string): Promise<{ success: boolean; state: TableState }> {
      return fetchJson(`${API_BASE}/tables/${tableId}/start`, { method: "POST" });
    },

    async pause(tableId: string): Promise<{ success: boolean; state: TableState }> {
      return fetchJson(`${API_BASE}/tables/${tableId}/pause`, { method: "POST" });
    },

    async startAll(): Promise<{ success: boolean; stats: TableStats }> {
      return fetchJson(`${API_BASE}/tables/start-all`, { method: "POST" });
    },

    async stopAll(): Promise<{ success: boolean; stats: TableStats }> {
      return fetchJson(`${API_BASE}/tables/stop-all`, { method: "POST" });
    },
  },

  humanizer: {
    async get(): Promise<{ config: HumanizerConfig; currentSettings: HumanizerSettings }> {
      return fetchJson(`${API_BASE}/humanizer`);
    },

    async update(updates: Partial<HumanizerConfig>): Promise<{ success: boolean; config: HumanizerConfig }> {
      return fetchJson(`${API_BASE}/humanizer`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },
  },

  gtoConfig: {
    async get(): Promise<{ config: GtoConfig; connected: boolean; usingSimulation: boolean }> {
      return fetchJson(`${API_BASE}/gto-config`);
    },

    async update(updates: Partial<GtoConfig>): Promise<{ success: boolean; config: GtoConfig }> {
      return fetchJson(`${API_BASE}/gto-config`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },

    async test(): Promise<{ success: boolean; error?: string }> {
      return fetchJson(`${API_BASE}/gto-config/test`, { method: "POST" });
    },
  },

  platform: {
    async get(): Promise<{ config: PlatformConfig | null }> {
      return fetchJson(`${API_BASE}/platform-config`);
    },

    async update(updates: Partial<PlatformConfig>): Promise<{ success: boolean; config: PlatformConfig }> {
      return fetchJson(`${API_BASE}/platform-config`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },

    async getStats(): Promise<{ accounts: any[] }> {
      return fetchJson(`${API_BASE}/platform-config/stats`);
    },

    async getActive(): Promise<{ configs: any[] }> {
      return fetchJson(`${API_BASE}/platform-config/active`);
    },

    async connect(config: any): Promise<{ success: boolean; accountId?: string }> {
      return fetchJson(`${API_BASE}/platform-config/connect`, {
        method: "POST",
        body: JSON.stringify(config),
      });
    },

    async disconnect(accountId: string): Promise<{ success: boolean }> {
      return fetchJson(`${API_BASE}/platform-config/disconnect/${accountId}`, {
        method: "POST",
      });
    },

    async pause(accountId: string): Promise<{ success: boolean }> {
      return fetchJson(`${API_BASE}/platform-config/pause/${accountId}`, {
        method: "POST",
      });
    },

    async delete(accountId: string): Promise<{ success: boolean }> {
      return fetchJson(`${API_BASE}/platform-config/${accountId}`, {
        method: "DELETE",
      });
    },
  },

  logs: {
    async getRecent(limit: number = 50): Promise<{ logs: ActionLog[] }> {
      return fetchJson(`${API_BASE}/logs?limit=${limit}`);
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
      return fetchJson(`${API_BASE}/stats`);
    },
  },

  handHistories: {
    async getRecent(limit: number = 20): Promise<{ histories: HandHistory[] }> {
      return fetchJson(`${API_BASE}/hand-histories?limit=${limit}`);
    },
  },

  simulate: {
    async hand(params: {
      heroCards?: string[];
      communityCards?: string[];
      position?: string;
      potSize?: number;
      facingBet?: number;
      numPlayers?: number;
    }): Promise<{
      recommendation: GtoRecommendation;
      humanizedAction: any;
      simulatedDelay: number;
    }> {
      return fetchJson(`${API_BASE}/simulate/hand`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  },
};

export type WebSocketMessage = {
  type: string;
  payload?: any;
};

export function createWebSocketConnection(
  onMessage: (message: WebSocketMessage) => void,
  onOpen?: () => void,
  onClose?: () => void,
  onError?: (error: Event) => void
): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    console.log("WebSocket connecté");
    onOpen?.();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;
      onMessage(message);
    } catch (error) {
      console.error("Erreur parsing WebSocket:", error);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket déconnecté");
    onClose?.();
  };

  ws.onerror = (error) => {
    console.error("Erreur WebSocket:", error);
    onError?.(error);
  };

  return ws;
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
  return fetchJson<PlayerProfileData>(`${API_BASE}/player-profile`);
}

export async function updatePlayerPersonality(personality: string): Promise<PlayerProfileData> {
  return fetchJson<PlayerProfileData>(`${API_BASE}/player-profile/personality`, {
    method: "POST",
    body: JSON.stringify({ personality }),
  });
}

export async function resetPlayerProfile(): Promise<{ state: PlayerProfileState; message: string }> {
  return fetchJson<{ state: PlayerProfileState; message: string }>(`${API_BASE}/player-profile/reset`, {
    method: "POST",
  });
}