
import { getEventBus } from "./event-bus";
import { getPlatformManager } from "./platform-manager";
import { getWorkerManager } from "./workers/worker-manager";

export class VisionWorker {
  private isRunning = false;
  private scanIntervalMs = 200;
  private taskCounter = 0;

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log("[VisionWorker] Started with worker threads");
    
    // Initialize worker manager
    const workerManager = getWorkerManager();
    await workerManager.initialize();
    
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
    const workerManager = getWorkerManager();
    
    // Process tables in parallel using workers
    const scanPromises = managedTables.map(async (table) => {
      try {
        const detectedState = await this.detectTableState(table.windowHandle, workerManager);
        
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
    });
    
    await Promise.all(scanPromises);
  }

  private async detectTableState(windowHandle: number, workerManager: any): Promise<any | null> {
    const platformManager = getPlatformManager();
    const adapter = platformManager.getAdapter();
    if (!adapter) return null;

    try {
      console.log(`[VisionWorker] [${windowHandle}] Appel de adapter.getGameState...`);
      const state = await adapter.getGameState(windowHandle);
      if (state) {
        console.log(`[VisionWorker] [${windowHandle}] SUCCESS: Game state detected`);
      } else {
        console.log(`[VisionWorker] [${windowHandle}] WARNING: No game state returned`);
      }
      return state;
    } catch (error) {
      console.error(`[VisionWorker] [${windowHandle}] Error detecting table state:`, error);
      return null;
    }
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
