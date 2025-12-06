
import { getEventBus } from "./event-bus";
import { getPlatformManager } from "./platform-manager";

export class VisionWorker {
  private isRunning = false;
  private scanIntervalMs = 200;

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log("[VisionWorker] Started");
    
    while (this.isRunning) {
      try {
        await this.scanTables();
      } catch (error) {
        console.error("[VisionWorker] Scan error:", error);
      }
      
      await new Promise(resolve => setTimeout(resolve, this.scanIntervalMs));
    }
  }

  private async scanTables(): Promise<void> {
    const platformManager = getPlatformManager();
    const managedTables = platformManager.getManagedTables();
    const eventBus = getEventBus();
    
    for (const table of managedTables) {
      try {
        // Simuler la détection d'état (à remplacer par vraie OCR)
        const detectedState = await this.detectTableState(table.windowHandle);
        
        if (detectedState) {
          await eventBus.publish("vision.state_detected", {
            windowHandle: table.windowHandle,
            state: detectedState,
          }, {
            tableId: table.tableSession.getId(),
            windowHandle: table.windowHandle,
            priority: 7,
          });
        }
      } catch (error) {
        console.error(`[VisionWorker] Error scanning table ${table.windowHandle}:`, error);
      }
    }
  }

  private async detectTableState(windowHandle: number): Promise<any | null> {
    // Cette méthode sera implémentée avec votre vraie logique OCR
    // Pour l'instant, retourne null
    return null;
  }

  stop(): void {
    this.isRunning = false;
    console.log("[VisionWorker] Stopped");
  }
}

let visionWorkerInstance: VisionWorker | null = null;

export function getVisionWorker(): VisionWorker {
  if (!visionWorkerInstance) {
    visionWorkerInstance = new VisionWorker();
  }
  return visionWorkerInstance;
}
