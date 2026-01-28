import { invoke } from "@tauri-apps/api/tauri";

// Mock Tauri IPC for browser environment
if (typeof window !== 'undefined' && !window.__TAURI_METADATA__ && !window.__TAURI_IPC__) {
  console.warn("Tauri IPC not found, initializing browser mock bridge");
  
  window.__TAURI_METADATA__ = {
    __windows: [],
    __currentWindow: { label: "main" }
  };

window.__TAURI_IPC__ = (message) => {
      const { cmd, callback, error, ...data } = message;
      // Filter out noisy tauri events logs
      if (cmd !== 'tauri') {
        console.log(`[Tauri Mock IPC] Command: ${cmd}`, data);
      }
      
      const trigger = (id, result) => {
        if (typeof id === 'function') {
          id(result);
          return;
        }

        const handler = window[id] || window[`_${id}`];
        if (typeof handler === 'function') {
          handler(result);
        }
      };
    
    // Simulate responses for common commands
    const responses = {
      "get_current_session": { session: null, stats: { totalTables: 0, activeTables: 0, totalHandsPlayed: 0, totalProfit: 0 }, tables: [] },
      "get_global_stats": { session: null, tableStats: { totalTables: 0, activeTables: 0, totalHandsPlayed: 0, totalProfit: 0 }, dbStats: null, humanizerSettings: { minDelayMs: 1500, maxDelayMs: 4200, enableBezierMouse: true, enableMisclicks: false, misclickProbability: 0.0001, enableRandomFolds: false, randomFoldProbability: 0.001, thinkingTimeVariance: 0.3, preActionDelay: 500, postActionDelay: 300, stealthModeEnabled: true }, gtoConnected: false },
      "get_recent_logs": { logs: [] },
      "get_player_profile": { personality: "TAG" },
      "get_all_tables": { tables: [] },
      "get_humanizer_config": { config: { minDelayMs: 1500, maxDelayMs: 4200 }, currentSettings: { minDelayMs: 1500, maxDelayMs: 4200 } },
      "get_gto_config": { config: { enabled: true }, connected: true, usingSimulation: false },
      "get_platform_config": { config: { platformName: "GGClub", enabled: true, connectionStatus: "disconnected" } },
      "get_platform_accounts": { configs: [] },
      "connect_platform": { success: true, accountId: "mock-account-id" },
      "start_session": { success: true, session: { id: "mock-session-id", status: "active", startedAt: new Date().toISOString() } },
      "stop_session": { success: true, stats: { totalTables: 0, activeTables: 0, totalHandsPlayed: 0, totalProfit: 0 } },
      "force_stop_session": { success: true, forced: true },
      "pause_platform": { success: true },
      "delete_platform_account": { success: true }
    };

    const result = responses[cmd] || { success: true };
    
    // Tauri invoke uses callback/error functions passed as indices into window
    setTimeout(() => {
      if (callback !== undefined) {
        trigger(callback, result);
      }
    }, 0);
  };

  window.__TAURI__ = {
    invoke: function(cmd, args) {
      return new Promise((resolve, reject) => {
        window.__TAURI_IPC__({
          cmd: cmd,
          callback: (res) => resolve(res),
          error: (err) => reject(err),
          ...args
        });
      });
    }
  };
}
