import { useState, useEffect, useCallback, useRef } from "react";
import { api, createWebSocketConnection, WebSocketMessage, TableState, TableStats, HumanizerSettings } from "@/lib/api";
import { BotSession, ActionLog } from "@shared/schema";

export interface BotState {
  session: BotSession | null;
  tables: TableState[];
  stats: TableStats;
  logs: ActionLog[];
  humanizerSettings: HumanizerSettings | null;
  gtoConnected: boolean;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

const defaultStats: TableStats = {
  totalTables: 0,
  activeTables: 0,
  totalHandsPlayed: 0,
  totalProfit: 0,
};

const defaultHumanizerSettings: HumanizerSettings = {
  minDelayMs: 1500,
  maxDelayMs: 4200,
  enableBezierMouse: true,
  enableMisclicks: false,
  misclickProbability: 0.0001,
  enableRandomFolds: false,
  randomFoldProbability: 0.001,
  thinkingTimeVariance: 0.3,
  preActionDelay: 500,
  postActionDelay: 300,
  stealthModeEnabled: true,
};

export function useBotState() {
  const [state, setState] = useState<BotState>({
    session: null,
    tables: [],
    stats: defaultStats,
    logs: [],
    humanizerSettings: defaultHumanizerSettings,
    gtoConnected: false,
    isLoading: true,
    isConnected: false,
    error: null,
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const loadInitialState = useCallback(async () => {
    try {
      console.log("[FRONTEND] [STATE] Starting initial state load...");
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const [sessionData, statsData, logsData] = await Promise.all([
        api.session.getCurrent().catch(e => { console.error("Session load error:", e); return null; }),
        api.stats.get().catch(e => { console.error("Stats load error:", e); return null; }),
        api.logs.getRecent(50).catch(e => { console.error("Logs load error:", e); return { logs: [] }; }),
      ]);
      
      console.log("[FRONTEND] [STATE] Data received:", { 
        hasSession: !!sessionData?.session, 
        stats: !!statsData, 
        logCount: logsData.logs.length 
      });

      setState(prev => ({
        ...prev,
        session: sessionData?.session || null,
        tables: sessionData?.tables || [],
        stats: sessionData?.stats || defaultStats,
        logs: logsData.logs || [],
        humanizerSettings: statsData?.humanizerSettings || defaultHumanizerSettings,
        gtoConnected: statsData?.gtoConnected || false,
        isLoading: false,
      }));
    } catch (error: any) {
      console.error("[FRONTEND] [STATE_ERROR] Critical load failure:", error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message 
      }));
    }
  }, []);
  
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case "connected":
        setState(prev => ({ ...prev, isConnected: true }));
        break;
        
      case "initial_state":
        setState(prev => ({
          ...prev,
          tables: message.payload.tables || prev.tables,
          stats: message.payload.stats || prev.stats,
          humanizerSettings: message.payload.humanizerSettings || prev.humanizerSettings,
        }));
        break;
        
      case "session_started":
        loadInitialState();
        break;
        
      case "session_stopped":
        setState(prev => ({
          ...prev,
          session: null,
          stats: message.payload.stats || defaultStats,
        }));
        break;
        
      case "table_added":
        setState(prev => ({
          ...prev,
          stats: { ...prev.stats, totalTables: prev.stats.totalTables + 1 },
        }));
        loadInitialState();
        break;
        
      case "table_removed":
        setState(prev => ({
          ...prev,
          tables: prev.tables.filter(t => t.id !== message.payload.tableId),
          stats: { ...prev.stats, totalTables: Math.max(0, prev.stats.totalTables - 1) },
        }));
        break;
        
      case "table_state_change":
        setState(prev => ({
          ...prev,
          tables: prev.tables.map(t =>
            t.id === message.payload.tableId ? message.payload.state : t
          ),
        }));
        break;
        
      case "table_event":
        const event = message.payload;
        if (event.type === "state_update") {
          setState(prev => ({
            ...prev,
            tables: prev.tables.map(t =>
              t.id === event.tableId ? { ...t, ...event.data } : t
            ),
          }));
        }
        break;
        
      case "humanizer_updated":
        setState(prev => ({
          ...prev,
          humanizerSettings: message.payload.settings || prev.humanizerSettings,
        }));
        break;
        
      case "gto_config_updated":
        loadInitialState();
        break;
        
      case "pong":
        break;
        
      default:
        console.log("Message WebSocket non géré:", message.type);
    }
  }, [loadInitialState]);
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    wsRef.current = createWebSocketConnection(
      handleWebSocketMessage,
      () => setState(prev => ({ ...prev, isConnected: true })),
      () => {
        setState(prev => ({ ...prev, isConnected: false }));
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      },
      () => setState(prev => ({ ...prev, error: "Erreur WebSocket" }))
    );
  }, [handleWebSocketMessage]);
  
  useEffect(() => {
    loadInitialState();
    connectWebSocket();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [loadInitialState, connectWebSocket]);
  
  const startSession = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      const response = await api.session.start();
      console.log("Session start response:", response);
      await loadInitialState();
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, [loadInitialState]);
  
  const stopSession = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await api.session.stop();
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, []);

  const forceStopSession = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await api.session.forceStop();
      setState(prev => ({ ...prev, session: null }));
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, []);
  
  const addTable = useCallback(async (config: { tableIdentifier: string; tableName: string; stakes: string }) => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await api.tables.add(config);
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, []);
  
  const removeTable = useCallback(async (tableId: string) => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await api.tables.remove(tableId);
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, []);
  
  const updateHumanizer = useCallback(async (updates: Partial<HumanizerSettings>) => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await api.humanizer.update(updates);
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, []);
  
  const refreshLogs = useCallback(async () => {
    try {
      const { logs } = await api.logs.getRecent(50);
      setState(prev => ({ ...prev, logs }));
    } catch (error: any) {
      console.error("Erreur refresh logs:", error);
    }
  }, []);
  
  return {
    ...state,
    startSession,
    stopSession,
    forceStopSession,
    addTable,
    removeTable,
    updateHumanizer,
    refreshLogs,
    reload: loadInitialState,
  };
}
