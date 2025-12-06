
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import path from 'path';

export interface WorkerTask {
  id: string;
  data: any;
}

export interface WorkerResult {
  id: string;
  data: any;
  error?: string;
  processingTime: number;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: Array<{
    task: WorkerTask;
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private workerPath: string;
  private maxWorkers: number;
  private taskMap: Map<string, { resolve: Function; reject: Function }> = new Map();

  constructor(workerPath: string, maxWorkers?: number) {
    this.workerPath = workerPath;
    this.maxWorkers = maxWorkers || Math.max(2, Math.floor(cpus().length / 2));
  }

  async initialize(): Promise<void> {
    for (let i = 0; i < this.maxWorkers; i++) {
      await this.createWorker();
    }
    console.log(`[WorkerPool] Initialized ${this.maxWorkers} workers for ${path.basename(this.workerPath)}`);
  }

  private async createWorker(): Promise<void> {
    try {
      const worker = new Worker(this.workerPath);
      
      worker.on('message', (result: WorkerResult) => {
        const pending = this.taskMap.get(result.id);
        if (pending) {
          if (result.error) {
            pending.reject(new Error(result.error));
          } else {
            pending.resolve(result);
          }
          this.taskMap.delete(result.id);
        }
        
        // Worker is now available
        this.availableWorkers.push(worker);
        this.processNextTask();
      });
      
      worker.on('error', (error) => {
        console.error(`[WorkerPool] Worker error for ${path.basename(this.workerPath)}:`, error);
        // Remove from available workers
        this.availableWorkers = this.availableWorkers.filter(w => w !== worker);
        // Recreate worker
        this.createWorker();
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[WorkerPool] Worker exited with code ${code} for ${path.basename(this.workerPath)}`);
          this.workers = this.workers.filter(w => w !== worker);
          this.availableWorkers = this.availableWorkers.filter(w => w !== worker);
        }
      });
      
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    } catch (error) {
      console.error(`[WorkerPool] Failed to create worker for ${this.workerPath}:`, error);
      throw error;
    }
  }

  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ task, resolve, reject });
      this.processNextTask();
    });
  }

  private processNextTask(): void {
    if (this.availableWorkers.length === 0 || this.taskQueue.length === 0) {
      return;
    }
    
    const worker = this.availableWorkers.shift()!;
    const { task, resolve, reject } = this.taskQueue.shift()!;
    
    this.taskMap.set(task.id, { resolve, reject });
    worker.postMessage(task.data);
  }

  getStats(): {
    totalWorkers: number;
    availableWorkers: number;
    queuedTasks: number;
    activeTasks: number;
  } {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      queuedTasks: this.taskQueue.length,
      activeTasks: this.taskMap.size,
    };
  }

  async shutdown(): Promise<void> {
    for (const worker of this.workers) {
      await worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.taskMap.clear();
  }
}
