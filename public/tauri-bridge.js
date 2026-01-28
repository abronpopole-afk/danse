(function() {
  if (typeof window !== 'undefined' && !window.__TAURI_IPC__) {
    console.warn("Tauri IPC not found, initializing browser mock bridge");
    
    window.__TAURI_METADATA__ = {
      __windows: [],
      __currentWindow: { label: "main" }
    };

    const trigger = (id, result) => {
      if (id === undefined || id === null) return;

      // The bundle might be looking for window[id] or window["_" + id]
      const handlers = [id, `_${id}`, `__tauri_cb_${id}`];
      for (const h of handlers) {
        if (typeof window[h] === 'function') {
          window[h](result);
          return;
        }
      }

      // If id is a direct function reference (happens in some mock scenarios)
      if (typeof id === 'function') {
        id(result);
        return;
      }

      console.debug(`[Mock IPC] Handler not found for ${id}`);
    };

    const callApi = async (path, method = 'GET', body = null) => {
      try {
        const res = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : null
        });
        if (!res.ok) return { success: false, error: res.statusText };
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    };

    window.__TAURI_IPC__ = async (message) => {
      const { cmd, callback, error, ...data } = message;
      if (cmd !== 'tauri') console.log(`[IPC] ${cmd}`, data);

      let result;
      try {
        switch (cmd) {
          case "get_platform_accounts":
            result = await callApi("/api/platform-accounts");
            break;
          case "create_platform_account":
          case "connect_platform":
            // Handle both structure types (direct or wrapped in config)
            const accountData = data.config || data;
            result = await callApi("/api/platform-accounts", "POST", accountData);
            break;
          case "get_current_session":
            result = await callApi("/api/session/current");
            break;
          case "start_session":
            result = await callApi("/api/session/start", "POST", data);
            break;
          case "stop_session":
            const s = await callApi("/api/session/current");
            result = (s && s.id) ? await callApi(`/api/session/stop/${s.id}`, "POST") : { success: true };
            break;
          case "force_stop_session":
            const fs = await callApi("/api/session/current");
            if (fs && fs.id) await callApi(`/api/session/stop/${fs.id}`, "POST");
            result = { success: true, forced: true };
            break;
          case "log_from_frontend":
            result = await callApi("/api/logs", "POST", {
              logType: data.level || "INFO",
              message: data.message,
              metadata: data.metadata || {}
            });
            break;
          default:
            const mocks = {
              "get_global_stats": { totalHands: 0, totalProfit: 0 },
              "get_recent_logs": [],
              "get_player_profile": { personality: "TAG" },
              "get_all_tables": { tables: [] },
              "get_humanizer_config": { enabled: true },
              "get_gto_config": { enabled: true },
              "get_platform_config": { platformName: "GGClub" },
              "tauri": (d) => (d.__tauriModule === "Event" ? "mock-event" : { success: true })
            };
            result = mocks[cmd] || { success: true };
            if (typeof result === 'function') result = result(data);
        }
        
        if (cmd !== 'tauri') console.log(`[IPC RES] ${cmd}`, result);
        
        // Use setImmediate or setTimeout to ensure we don't block the loop
        setTimeout(() => trigger(callback, result), 0);
      } catch (e) {
        console.error(`[IPC ERR] ${cmd}`, e);
        setTimeout(() => trigger(error, { error: e.message, success: false }), 0);
      }
    };

    // Main Tauri entry points
    window.__TAURI__ = {
      invoke: (cmd, args) => new Promise((rs, rj) => {
        window.__TAURI_IPC__({ cmd, callback: rs, error: rj, ...args });
      })
    };
    window.__TAURI_INVOKE__ = window.__TAURI__.invoke;
    window.tauri = window.__TAURI__;
    
    // Ensure we handle the event listener system
    if (!window.__TAURI_METADATA__.__event_listeners) {
      window.__TAURI_METADATA__.__event_listeners = {};
    }
  }
})();
