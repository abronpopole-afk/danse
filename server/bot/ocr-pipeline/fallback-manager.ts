import type { OCRAdapter, OCRAdapterFactory } from './adapters';
import type { Frame, NormalizedFrame, Region, OCRResult, OCRBatchResult } from './types';

export interface FallbackConfig {
  maxRetries: number;
  retryDelayMs: number;
  minConfidenceThreshold: number;
  enableParallelFallback: boolean;
  timeoutMs: number;
}

const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  maxRetries: 1,
  retryDelayMs: 200,
  minConfidenceThreshold: 0.5,
  enableParallelFallback: true,
  timeoutMs: 10000,
};

export class FallbackManager {
  private adapters: OCRAdapter[] = [];
  private factories: OCRAdapterFactory[] = [];
  private config: FallbackConfig;
  private initialized: boolean = false;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
  }

  registerFactory(factory: OCRAdapterFactory): void {
    this.factories.push(factory);
    this.factories.sort((a, b) => b.getPriority() - a.getPriority());
  }

  async initialize(): Promise<void> {
    console.log('[FallbackManager] Initializing adapters...');
    
    for (const factory of this.factories) {
      try {
        const isAvailable = await factory.isAvailable();
        if (isAvailable) {
          const adapter = factory.create();
          await adapter.initialize();
          this.adapters.push(adapter);
          console.log(`[FallbackManager] Adapter ${adapter.getName()} initialized (priority: ${factory.getPriority()})`);
        }
      } catch (error) {
        console.warn(`[FallbackManager] Failed to initialize adapter:`, error);
      }
    }

    if (this.adapters.length === 0) {
      console.warn('[FallbackManager] No OCR adapters available!');
    } else {
      console.log(`[FallbackManager] ${this.adapters.length} adapter(s) ready`);
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        await adapter.shutdown();
      } catch (error) {
        console.warn(`[FallbackManager] Error shutting down ${adapter.getName()}:`, error);
      }
    }
    this.adapters = [];
    this.initialized = false;
  }

  async processRegion(
    frame: Frame | NormalizedFrame,
    region: Region
  ): Promise<OCRResult> {
    if (!this.initialized || this.adapters.length === 0) {
      throw new Error('FallbackManager not initialized or no adapters available');
    }

    let lastError: Error | null = null;

    for (const adapter of this.adapters) {
      for (let retry = 0; retry <= this.config.maxRetries; retry++) {
        try {
          const result = await this.withTimeout(
            adapter.processRegion(frame, region),
            this.config.timeoutMs
          );

          if (result.confidence >= this.config.minConfidenceThreshold) {
            return result;
          }

          if (retry === this.config.maxRetries) {
            break;
          }
        } catch (error) {
          lastError = error as Error;
          console.error(
            `[FallbackManager] ❌ ${adapter.getName()} failed (attempt ${retry + 1}):`,
            error instanceof Error ? { message: error.message, stack: error.stack } : error
          );

          if (retry < this.config.maxRetries) {
            await this.delay(this.config.retryDelayMs);
          }
        }
      }
    }

    throw lastError || new Error('All OCR adapters failed');
  }

  async processFrame(
    frame: Frame | NormalizedFrame,
    regions: Region[]
  ): Promise<OCRBatchResult[]> {
    if (!this.initialized || this.adapters.length === 0) {
      throw new Error('FallbackManager not initialized or no adapters available');
    }

    const results: OCRBatchResult[] = [];

    if (this.config.enableParallelFallback) {
      const promises = regions.map(region =>
        this.processRegion(frame, region)
          .then(result => ({
            regionId: region.id,
            regionType: region.type,
            result,
          }))
          .catch(error => ({
            regionId: region.id,
            regionType: region.type,
            result: null,
            error: String(error),
          }))
      );
      results.push(...await Promise.all(promises));
    } else {
      for (const region of regions) {
        try {
          const result = await this.processRegion(frame, region);
          results.push({
            regionId: region.id,
            regionType: region.type,
            result,
          });
        } catch (error) {
          results.push({
            regionId: region.id,
            regionType: region.type,
            result: null,
            error: String(error),
          });
        }
      }
    }

    return results;
  }

  async processWithSpecificAdapter(
    adapterName: string,
    frame: Frame | NormalizedFrame,
    region: Region
  ): Promise<OCRResult> {
    const adapter = this.adapters.find(a => a.getName() === adapterName);
    if (!adapter) {
      throw new Error(`Adapter ${adapterName} not found`);
    }
    return adapter.processRegion(frame, region);
  }

  getAvailableAdapters(): string[] {
    return this.adapters.map(a => a.getName());
  }

  getPrimaryAdapter(): OCRAdapter | null {
    return this.adapters.length > 0 ? this.adapters[0] : null;
  }

  getAdapterStats(): Map<string, ReturnType<OCRAdapter['getStats']>> {
    const stats = new Map();
    for (const adapter of this.adapters) {
      stats.set(adapter.getName(), adapter.getStats());
    }
    return stats;
  }

  updateConfig(config: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
