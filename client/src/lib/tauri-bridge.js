import { invoke } from "@tauri-apps/api/tauri";

// Mock Tauri IPC for browser environment
if (typeof window !== 'undefined' && !window.__TAURI_METADATA__ && !window.__TAURI_IPC__) {
  console.warn("Tauri IPC not found, initializing browser mock bridge");
  
  // Use a stable property name for the bridge to avoid issues with randomized callback names
  window.__TAURI_IPC__ = async (message) => {
    console.log("[Tauri Mock IPC] Command:", message.cmd, message.data);
    
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

    const result = responses[message.cmd] || { success: true };
    
    // Tauri invoke uses callback/error functions passed as indices into window
    if (message.callback !== undefined && typeof window[message.callback] === 'function') {
      window[message.callback](result);
    }
    return result;
  };
}
