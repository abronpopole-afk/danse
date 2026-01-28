(function() {
  if (typeof window !== 'undefined' && !window.__TAURI_IPC__) {
    console.warn("Tauri IPC not found, initializing browser mock bridge");
    
    window.__TAURI_METADATA__ = {
      __windows: [],
      __currentWindow: { label: "main" }
    };

    const trigger = (id, result) => {
      if (typeof id === 'function') {
        id(result);
      } else if (typeof window[id] === 'function') {
        window[id](result);
      } else if (typeof window[`_${id}`] === 'function') {
        window[`_${id}`](result);
      }
    };

    window.__TAURI_IPC__ = (message) => {
      const { cmd, callback, error, ...data } = message;
      console.log(`[Tauri Mock IPC] Command: ${cmd}`, data);
      
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
})();
