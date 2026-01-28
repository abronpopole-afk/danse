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
  
  // Utilisation directe de window.__TAURI__.invoke ou import
  const invokePromise = (window as any).__TAURI_IPC__ ? Promise.resolve({ invoke: (window as any).__TAURI__.invoke }) : import("@tauri-apps/api/tauri");
  
  invokePromise.then(({ invoke }) => {
    invoke("log_from_frontend", { level, message }).catch(() => {
      // Fallback console si le backend n'est pas prêt
      originalLog("[LOG-FALLBACK]", level, message);
    });
  }).catch(() => {
    originalLog("[IMPORT-FALLBACK]", level, message);
  });
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

