import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Système de capture de logs global pour débogage en production
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function sendToBackend(level: string, args: any[]) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  // Utilisation directe de window.__TAURI_IPC__ si disponible
  if (window.__TAURI_IPC__ || window.__TAURI_METADATA__) {
    import("@tauri-apps/api/tauri").then(({ invoke }) => {
      invoke("log_from_frontend", { level, message }).catch(() => {
        // Fallback
      });
    }).catch(() => {});
  }
}

console.log = (...args) => {
  originalLog(...args);
  sendToBackend("INFO", args);
};

console.error = (...args) => {
  originalError(...args);
  sendToBackend("ERROR", args);
};

console.warn = (...args) => {
  originalWarn(...args);
  sendToBackend("WARN", args);
};

window.onerror = (message, source, lineno, colno, error) => {
  const errorMsg = `Global Error: ${message} at ${source}:${lineno}:${colno}`;
  console.error(errorMsg, error);
};

window.onunhandledrejection = (event) => {
  console.error("Unhandled Promise Rejection:", event.reason);
};

console.log("Frontend: Bootstrapping application...");
try {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root container not found in DOM");
  }
  const root = createRoot(container);
  root.render(<App />);
  console.log("Frontend: Render call completed");
} catch (e) {
  console.error("Frontend: Fatal initialization error", e);
}

