import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite } from "./vite";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const { initializePlayerProfile } = await import("./bot/player-profile");
    await initializePlayerProfile();
    log("Player profile initialized from database");
  } catch (error) {
    log(`Warning: Could not initialize player profile: ${error}`);
  }

  // Initialize Event Bus
  try {
    const { initializeEventBus } = await import("./bot/event-bus");
    const { registerEventHandlers } = await import("./bot/event-handlers");

    const eventBus = await initializeEventBus();
    await registerEventHandlers(eventBus);

    // Start consuming events in background
    eventBus.startConsuming().catch(error => {
      log(`Event bus consumer error: ${error}`);
    });

    log("Event bus initialized and consuming events");
  } catch (error) {
    log(`Warning: Could not initialize event bus: ${error}`);
  }

  const { gtoConfig } = await import("./config");
  const { initializeGtoAdapter } = await import("./bot/gto-adapter");

  // Initialize GTO adapter
  await initializeGtoAdapter({
    apiEndpoint: gtoConfig?.apiEndpoint,
    apiKey: gtoConfig?.apiKey,
    useSimulation: !gtoConfig?.enabled || !gtoConfig?.apiKey,
    useAdvanced: true,
  });

  // Initialize and warmup GTO cache
  if (gtoConfig?.cacheEnabled !== false) {
    try {
      const { getGtoCache, getCommonPreflopSituations } = await import("./bot/gto-cache");
      const cache = getGtoCache();
      const situations = getCommonPreflopSituations();

      // Warmup in background
      cache.warmup(situations).catch(err => {
        console.error("[Server] GTO cache warmup failed:", err);
      });
    } catch (error) {
      console.error("[Server] Failed to initialize GTO cache:", error);
    }
  }

  await registerRoutes(httpServer, app);

  if (process.env.NODE_ENV === "development") {
    await setupVite(httpServer, app);
  } else {
    serveStatic(app);
  }

  const PORT = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";
  httpServer.listen(PORT, host, async () => {
    console.log(`✓ Server running on http://${host}:${PORT}`);

    // Initialize range updater
    const { getRangeUpdater } = await import("./bot/range-updater");
    const rangeUpdater = getRangeUpdater();

    // Add default GTO Wizard source
    rangeUpdater.addSource({
      name: "GTO Wizard",
      updateFrequency: "weekly",
      enabled: false, // User must enable and configure
    });

    // Add solver-based source (always available)
    rangeUpdater.addSource({
      name: "Solver Simulation",
      updateFrequency: "weekly",
      enabled: true,
    });

    await rangeUpdater.startAutoUpdate();
    console.log("✓ Range auto-updater started");
  });
})().catch(error => {
  console.error("Fatal error during server startup:", error);
  process.exit(1);
});