
import { Worker } from 'worker_threads';
import { cpus } from 'os';

export interface OCRTask {
  id: string;
  imageBuffer: Buffer;
  region: { x: number; y: number; width: number; height: number };
  imageWidth: number;
  imageHeight: number;
}

export interface OCRResult {
  id: string;
  text: string;
  confidence: number;
  error?: string;
}

export class OCRWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: Array<{ task: OCRTask; resolve: (result: OCRResult) => void; reject: (error: Error) => void }> = [];
  private workerPath: string = './server/bot/ocr-worker.js';
  private maxWorkers: number;

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers || Math.max(2, Math.floor(cpus().length / 2));
  }

  async initialize(): Promise<void> {
    // Note: Workers nécessitent compilation du worker en .js
    // Pour l'instant, on simule avec Promise.resolve
    console.log(`[OCRPool] Initializing ${this.maxWorkers} workers (simulated)`);
  }

  async processOCR(task: OCRTask): Promise<OCRResult> {
    // Fallback synchrone si workers non disponibles
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: task.id,
          text: '',
          confidence: 0,
        });
      }, 10); // Simule un traitement rapide
    });
  }

  async shutdown(): Promise<void> {
    for (const worker of this.workers) {
      await worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
  }
}

export const ocrPool = new OCRWorkerPool();
