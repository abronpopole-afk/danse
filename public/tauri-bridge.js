(function() {
  if (typeof window !== 'undefined' && !window.__TAURI_IPC__) {
    console.warn("Tauri IPC not found, initializing browser mock bridge");
    
    window.__TAURI_METADATA__ = {
      __windows: [],
      __currentWindow: { label: "main" }
    };

    const trigger = (id, result) => {
      // Numerical IDs are usually callback/error indices
      if (typeof id === 'number') {
        const callbackName = `_${id}`;
        if (typeof window[callbackName] === 'function') {
          window[callbackName](result);
          return;
        }
        // Fallback for some assets that might not prefix with underscore
        if (typeof window[id] === 'function') {
          window[id](result);
          return;
        }
      }
      
      // Some Tauri builds use direct function references
      if (typeof id === 'function') {
        id(result);
        return;
      }
      
      // Some use string identifiers that map to window properties
      if (typeof id === 'string') {
        const handler = window[id] || window[`_${id}`];
        if (typeof handler === 'function') {
          handler(result);
          return;
        }
      }
      
      console.debug(`Callback handler not found for ID: ${id}`);
    };

    const callApi = async (path, method = 'GET', body = null) => {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(path, options);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return await res.json();
    };

    window.__TAURI_IPC__ = async (message) => {
      const { cmd, callback, error, ...data } = message;
      if (cmd !== 'tauri') console.log(`[IPC Request] ${cmd}`, data);

      try {
        let result;
        switch (cmd) {
          case "get_platform_accounts":
            result = await callApi("/api/platform-accounts");
            break;
          case "create_platform_account":
          case "connect_platform":
            result = await callApi("/api/platform-accounts", "POST", data.config || data);
            break;
          case "get_current_session":
            result = await callApi("/api/session/current");
            break;
          case "start_session":
            result = await callApi("/api/session/start", "POST", data);
            break;
          case "stop_session":
            const s = await callApi("/api/session/current");
            result = s?.id ? await callApi(`/api/session/stop/${s.id}`, "POST") : { success: true };
            break;
          case "log_from_frontend":
            result = await callApi("/api/logs", "POST", {
              logType: data.level || "INFO",
              message: data.message,
              metadata: data.metadata || {}
            });
            break;
          default:
            const staticRes = {
              "get_global_stats": { totalHands: 0, totalProfit: 0 },
              "get_recent_logs": [],
              "get_player_profile": { personality: "TAG" },
              "get_all_tables": { tables: [] },
              "get_humanizer_config": { enabled: true },
              "get_gto_config": { enabled: true },
              "get_platform_config": { platformName: "GGClub" },
              "tauri": (d) => (d.__tauriModule === "Event" ? "mock-event-id" : { success: true })
            };
            result = staticRes[cmd] || { success: true };
            if (typeof result === 'function') result = result(data);
        }
        
        if (cmd !== 'tauri') console.log(`[IPC Response] ${cmd}`, result);
        trigger(callback, result);
      } catch (e) {
        console.error("IPC Execution Error:", e);
        trigger(error, { error: e.message, success: false });
      }
    };

    window.__TAURI__ = {
      invoke: (cmd, args) => new Promise((rs, rj) => {
        window.__TAURI_IPC__({ cmd, callback: rs, error: rj, ...args });
      })
    };
    
    // Polyfill window.__TAURI_INVOKE__ for older assets
    window.__TAURI_INVOKE__ = window.__TAURI__.invoke;
    
    // Handle global function calls from older tauri assets
    window.tauri = window.__TAURI__;
  }
})();
