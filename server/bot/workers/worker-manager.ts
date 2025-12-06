
import { WorkerPool } from './worker-pool.js';

export class WorkerManager {
  private visionPool: WorkerPool | null = null;
  private gtoPool: WorkerPool | null = null;
  private humanizerPool: WorkerPool | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Utiliser les workers compilés dans dist/workers
      const workerDir = process.env.NODE_ENV === 'production' 
        ? 'dist/workers' 
        : 'dist/workers';

      // Initialize Vision Worker Pool
      this.visionPool = new WorkerPool(
        `${workerDir}/vision-worker-thread.js`,
        3 // 3 workers pour vision (CPU intensive)
      );
      await this.visionPool.initialize();

      // Initialize GTO Worker Pool
      this.gtoPool = new WorkerPool(
        `${workerDir}/gto-worker-thread.js`,
        2 // 2 workers pour GTO
      );
      await this.gtoPool.initialize();

      // Initialize Humanizer Worker Pool
      this.humanizerPool = new WorkerPool(
        `${workerDir}/humanizer-worker-thread.js`,
        2 // 2 workers pour humanizer
      );
      await this.humanizerPool.initialize();

      this.initialized = true;
      console.log('[WorkerManager] All worker pools initialized');
    } catch (error) {
      console.error('[WorkerManager] Failed to initialize:', error);
      throw error;
    }
  }

  async processVisionTask(task: any): Promise<any> {
    if (!this.visionPool) {
      throw new Error('Vision worker pool not initialized');
    }
    return this.visionPool.executeTask(task);
  }

  async processGtoTask(task: any): Promise<any> {
    if (!this.gtoPool) {
      throw new Error('GTO worker pool not initialized');
    }
    return this.gtoPool.executeTask(task);
  }

  async processHumanizerTask(task: any): Promise<any> {
    if (!this.humanizerPool) {
      throw new Error('Humanizer worker pool not initialized');
    }
    return this.humanizerPool.executeTask(task);
  }

  getStats(): {
    vision: any;
    gto: any;
    humanizer: any;
  } {
    return {
      vision: this.visionPool?.getStats() || null,
      gto: this.gtoPool?.getStats() || null,
      humanizer: this.humanizerPool?.getStats() || null,
    };
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.visionPool?.shutdown(),
      this.gtoPool?.shutdown(),
      this.humanizerPool?.shutdown(),
    ]);
    this.initialized = false;
    console.log('[WorkerManager] All worker pools shut down');
  }
}

let workerManagerInstance: WorkerManager | null = null;

export function getWorkerManager(): WorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new WorkerManager();
  }
  return workerManagerInstance;
}
