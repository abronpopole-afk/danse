
export interface CachedOCRResult {
  text: string;
  confidence: number;
  timestamp: number;
  hits: number;
}

export class OCRCache {
  private cache: Map<string, CachedOCRResult> = new Map();
  private maxSize: number = 500;
  private ttl: number = 5000; // 5 secondes

  /**
   * Génère une clé de cache basée sur le hash du buffer
   */
  private getCacheKey(buffer: Buffer, region: { x: number; y: number; width: number; height: number }): string {
    // Hash simplifié pour performance
    const sample = buffer.slice(0, Math.min(1000, buffer.length));
    const hash = sample.reduce((acc, byte, i) => ((acc << 5) - acc + byte) | 0, 0);
    return `${region.x}_${region.y}_${region.width}_${region.height}_${hash}`;
  }

  get(buffer: Buffer, region: { x: number; y: number; width: number; height: number }): CachedOCRResult | null {
    const key = this.getCacheKey(buffer, region);
    const cached = this.cache.get(key);

    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    cached.hits++;
    return cached;
  }

  set(buffer: Buffer, region: { x: number; y: number; width: number; height: number }, text: string, confidence: number): void {
    const key = this.getCacheKey(buffer, region);

    // Éviction LRU si cache plein
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      text,
      confidence,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  getStats(): { size: number; hitRate: number } {
    const totalHits = Array.from(this.cache.values()).reduce((sum, v) => sum + v.hits, 0);
    return {
      size: this.cache.size,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
    };
  }

  clear(): void {
    this.cache.clear();
  }
}

export const ocrCache = new OCRCache();
