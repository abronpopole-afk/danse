(function() {
  if (typeof window !== 'undefined' && !window.__TAURI_IPC__) {
    console.warn('Tauri IPC not found, initializing browser mock bridge');
    
    window.__TAURI_METADATA__ = {
      __windows: [],
      __currentWindow: { label: 'main' }
    };

    window.__TAURI_IPC__ = function(message) {
      const { cmd, callback, error, ...payload } = message;
      console.log(`[Tauri Mock IPC] Command: ${cmd}`, payload);
      
      // Handle known commands with mock data
      setTimeout(() => {
        if (cmd === 'list_windows' || cmd === 'find_poker_windows') {
          window[callback]([]);
        } else if (cmd.startsWith('get_') || cmd.startsWith('start_') || cmd.startsWith('stop_')) {
          window[callback]({ success: true, mock: true });
        } else if (cmd === 'listen') {
          window[callback]('mock-unlisten-id');
        } else {
          window[callback]({ message: 'Command not implemented in browser mock' });
        }
      }, 0);
    };

    // Mock internal __TAURI__ object for some APIs
    window.__TAURI__ = {
      invoke: function(cmd, args) {
        return new Promise((resolve) => {
          window.__TAURI_IPC__({
            cmd,
            callback: (res) => resolve(res),
            error: (err) => console.error(err),
            ...args
          });
        });
      }
    };
  }
})();
