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
        } else {
          // If no handler found, it might be a race condition or internal Tauri logic
          // In some cases window[a] is expected but not yet defined
          // We can try to wait a bit or just log it
          console.debug(`Callback handler not found for ID: ${id}`);
        }
      };

      const callApi = async (path, method = 'GET', body = null) => {
        const options = {
          method,
          headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(path, options);
        return await res.json();
      };

      const handleCommand = async () => {
        try {
          switch (cmd) {
            case "get_platform_accounts":
              return await callApi("/api/platform-accounts");
            case "create_platform_account":
              return await callApi("/api/platform-accounts", "POST", data);
            case "get_current_session":
              return await callApi("/api/session/current");
            case "start_session":
              return await callApi("/api/session/start", "POST", data);
            case "stop_session":
              return await callApi(`/api/session/stop/${data.id}`, "POST");
            case "log_from_frontend":
              return await callApi("/api/logs", "POST", {
                logType: data.level || "INFO",
                message: data.message,
                metadata: data.metadata || {}
              });
            default:
              const responses = {
                "get_global_stats": { totalHands: 0, totalProfit: 0 },
                "get_recent_logs": [],
                "get_player_profile": { personality: "TAG" },
                "get_all_tables": { tables: [] },
                "get_humanizer_config": { enabled: true },
                "get_gto_config": { enabled: true },
                "get_platform_config": { platformName: "GGClub" },
                "tauri": (data) => {
                  if (data.__tauriModule === "Event" && data.message && data.message.cmd === "listen") {
                    return "mock-unlisten-id";
                  }
                  return { success: true };
                }
              };
              let res = responses[cmd] || { success: true };
              return (typeof res === 'function') ? res(data) : res;
          }
        } catch (e) {
          console.error("IPC Command Error:", e);
          return { error: e.message };
        }
      };

      handleCommand().then(result => {
        if (callback !== undefined) {
          trigger(callback, result);
        }
      });
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
