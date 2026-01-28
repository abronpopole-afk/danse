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
        // Handle numerical IDs which are indices into window
        if (typeof id === 'number') {
          const callbackName = `_${id}`;
          if (typeof window[callbackName] === 'function') {
            window[callbackName](result);
            return;
          }
        }

        // Handle direct function callback
        if (typeof id === 'function') {
          id(result);
          return;
        }
        
        // Find the callback handler - check window and prefixed versions
        const handlerName = typeof id === 'string' ? id : `_${id}`;
        let handler = (window[handlerName] ? window[handlerName] : 
                        (window[id] ? window[id] : null));
        
        if (handler) {
          handler(result);
        } else {
          console.debug(`Callback handler not found for ID: ${id}`);
        }
      };

      const callApi = async (path, method = 'GET', body = null) => {
        const options = {
          method,
          headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        try {
          const res = await fetch(path, options);
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          return await res.json();
        } catch (e) {
          console.error(`Fetch error for ${path}:`, e);
          throw e;
        }
      };

      const handleCommand = async () => {
        try {
          switch (cmd) {
            case "get_platform_accounts":
              return await callApi("/api/platform-accounts");
            case "create_platform_account":
            case "connect_platform": // Map connect_platform to persistence
              return await callApi("/api/platform-accounts", "POST", data.config || data);
            case "get_current_session":
              return await callApi("/api/session/current");
            case "start_session":
              return await callApi("/api/session/start", "POST", data);
            case "stop_session":
              const session = await callApi("/api/session/current");
              if (session && session.id) {
                return await callApi(`/api/session/stop/${session.id}`, "POST");
              }
              return { success: true };
            case "force_stop_session":
              const staleSession = await callApi("/api/session/current");
              if (staleSession && staleSession.id) {
                await callApi(`/api/session/stop/${staleSession.id}`, "POST");
              }
              return { success: true, forced: true };
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
          return { error: e.message, success: false };
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
