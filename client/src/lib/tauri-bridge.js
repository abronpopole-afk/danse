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
        // Handle direct function callback
        if (typeof id === 'function') {
          id(result);
          return;
        }
        
        // Find the callback handler - check window and prefixed versions
        const handler = (window[id] ? window[id] : 
                        (window[`_${id}`] ? window[`_${id}`] : null));
        
        if (handler) {
          handler(result);
        }
      };
    
    // Simulate responses for common commands
    const responses = {
      "get_current_session": { session: null, stats: { totalTables: 0, activeTables: 0, totalHandsPlayed: 0, totalProfit: 0 } },
      "get_global_stats": { totalHands: 0, totalProfit: 0 },
      "get_recent_logs": [],
      "get_player_profile": { personality: "TAG" },
      "get_all_tables": { tables: [] },
      "get_humanizer_config": { enabled: true },
      "get_gto_config": { enabled: true },
      "get_platform_config": { platformName: "GGClub" }
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
