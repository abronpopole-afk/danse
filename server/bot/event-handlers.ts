
import { EventBus, BusEvent } from "./event-bus";
import { getGtoAdapter } from "./gto-engine";
import { getHumanizer } from "./humanizer";
import { getPlatformManager } from "./platform-manager";
import { getTableManager } from "./table-manager";

export async function registerEventHandlers(bus: EventBus): Promise<void> {
  
  // Vision Events
  bus.on("vision.state_detected", async (event: BusEvent) => {
    const { windowHandle, state } = event.payload;
    const tableManager = getTableManager();
    
    // Mettre à jour l'état de la table
    const table = tableManager.getTableByWindowHandle(windowHandle);
    if (table) {
      table.updateFromDetectedState(state);
    }
    
    // Publier un événement UI update
    await bus.publish("ui.update", {
      type: "table_state",
      tableId: event.metadata?.tableId,
      state,
    }, event.metadata);
  });

  bus.on("vision.ocr_completed", async (event: BusEvent) => {
    const { windowHandle, ocrResults } = event.payload;
    
    // Traiter les résultats OCR et publier un événement de détection d'état
    if (ocrResults.heroCards || ocrResults.potSize) {
      await bus.publish("vision.state_detected", {
        windowHandle,
        state: ocrResults,
      }, event.metadata);
    }
  });

  // GTO Events
  bus.on("gto.request", async (event: BusEvent) => {
    const { situation } = event.payload;
    const gtoAdapter = getGtoAdapter();
    
    try {
      const recommendation = await gtoAdapter.getRecommendation(situation);
      
      // Publier la réponse GTO
      await bus.publish("gto.response", {
        tableId: event.metadata?.tableId,
        recommendation,
        situation,
      }, {
        ...event.metadata,
        priority: 8,
      });
    } catch (error) {
      console.error("[EventHandler] GTO request failed:", error);
    }
  });

  bus.on("gto.response", async (event: BusEvent) => {
    const { tableId, recommendation } = event.payload;
    const humanizer = getHumanizer();
    
    // Humaniser l'action
    const humanizedAction = humanizer.humanizeAction(
      recommendation.bestAction,
      recommendation.actionFrequencies[recommendation.bestAction] || 0.5,
      recommendation.confidence < 0.7
    );
    
    // Mettre en file d'attente l'action
    await bus.publish("action.queued", {
      tableId,
      action: humanizedAction.action,
      amount: humanizedAction.amount,
      delay: humanizedAction.delay,
    }, event.metadata);
  });

  // Action Events
  bus.on("action.queued", async (event: BusEvent) => {
    const { tableId, action, amount, delay } = event.payload;
    const platformManager = getPlatformManager();
    
    // Attendre le délai humanisé
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Exécuter l'action via le platform manager
    const table = platformManager.getTableByTableId(tableId);
    if (table) {
      try {
        await platformManager.manualAction(table.windowHandle, action, amount);
        
        await bus.publish("action.executed", {
          tableId,
          action,
          amount,
          timestamp: Date.now(),
        }, event.metadata);
      } catch (error) {
        console.error("[EventHandler] Action execution failed:", error);
      }
    }
  });

  bus.on("action.executed", async (event: BusEvent) => {
    const { tableId, action } = event.payload;
    
    // Publier mise à jour UI
    await bus.publish("ui.update", {
      type: "action_completed",
      tableId,
      action,
    }, event.metadata);
  });

  // Platform Events
  bus.on("platform.window_detected", async (event: BusEvent) => {
    const { windowHandle, windowInfo } = event.payload;
    
    // Démarrer le scan de cette table
    await bus.publish("vision.ocr_completed", {
      windowHandle,
      ocrResults: {},
    }, {
      windowHandle,
      priority: 5,
    });
  });

  bus.on("platform.connection_change", async (event: BusEvent) => {
    const { status, platformName } = event.payload;
    
    await bus.publish("ui.update", {
      type: "platform_status",
      status,
      platformName,
    }, event.metadata);
  });

  console.log("[EventHandlers] All event handlers registered");
}
