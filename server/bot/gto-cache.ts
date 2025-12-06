
import { GtoRecommendation } from "@shared/schema";
import { HandContext } from "./gto-engine";

interface CacheEntry {
  recommendation: GtoRecommendation;
  timestamp: number;
  hitCount: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number;
  avgSavingsMs: number;
}

export class GtoCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private stats = {
    hits: 0,
    misses: 0,
    totalSavingsMs: 0,
  };

  constructor(maxSize: number = 10000, ttlMinutes: number = 60) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMinutes * 60 * 1000;
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private generateKey(context: HandContext): string {
    // Create a deterministic key from the hand context
    const cards = [...context.heroCards].sort().join('');
    const board = [...context.communityCards].sort().join('');
    const position = context.heroPosition;
    const street = context.street;
    
    // Normalize pot and stack sizes to avoid cache misses due to minor variations
    const potBucket = Math.floor(context.potSize / 10) * 10;
    const stackBucket = Math.floor(context.heroStack / 100) * 100;
    const betBucket = Math.floor(context.facingBet / 5) * 5;
    
    return `${street}|${cards}|${board}|${position}|${potBucket}|${stackBucket}|${betBucket}|${context.numPlayers}|${context.isInPosition}`;
  }

  get(context: HandContext): GtoRecommendation | null {
    const key = this.generateKey(context);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Cache hit
    this.stats.hits++;
    this.stats.totalSavingsMs += 300; // Average API call time
    entry.hitCount++;
    entry.timestamp = Date.now(); // Refresh timestamp on access
    
    // Déchiffrer la recommandation si elle est chiffrée
    try {
      const { decryptData, isEncrypted } = await import("./db-encryption");
      if (typeof entry.recommendation === "string" && isEncrypted(entry.recommendation)) {
        return decryptData<GtoRecommendation>(entry.recommendation);
      }
    } catch (error) {
      console.warn("[GtoCache] Decryption failed, returning raw data:", error);
    }
    
    return entry.recommendation;
  }

  set(context: HandContext, recommendation: GtoRecommendation): void {
    const key = this.generateKey(context);

    // If cache is full, remove least recently used entries
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // Chiffrer la recommandation avant mise en cache
    try {
      const { encryptData } = await import("./db-encryption");
      const encryptedRec = encryptData(recommendation);
      
      this.cache.set(key, {
        recommendation: encryptedRec as any, // Stocké chiffré
        timestamp: Date.now(),
        hitCount: 0,
      });
    } catch (error) {
      // Fallback sans chiffrement si erreur
      console.warn("[GtoCache] Encryption failed, storing unencrypted:", error);
      this.cache.set(key, {
        recommendation,
        timestamp: Date.now(),
        hitCount: 0,
      });
    }
  }

  private evictLRU(): void {
    // Remove 10% of least recently used entries
    const entriesToRemove = Math.floor(this.maxSize * 0.1);
    const entries = Array.from(this.cache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }

    if (toDelete.length > 0) {
      console.log(`[GtoCache] Cleaned up ${toDelete.length} expired entries`);
    }
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      avgSavingsMs: this.stats.hits > 0 ? this.stats.totalSavingsMs / this.stats.hits : 0,
    };
  }

  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      totalSavingsMs: 0,
    };
  }

  // Pre-calculate and cache common situations
  async warmup(commonSituations: HandContext[]): Promise<void> {
    console.log(`[GtoCache] Warming up cache with ${commonSituations.length} common situations...`);
    
    const { getGtoAdapter } = await import("./gto-engine");
    const adapter = getGtoAdapter();

    for (const situation of commonSituations) {
      try {
        const recommendation = await adapter.getRecommendation(situation);
        this.set(situation, recommendation);
      } catch (error) {
        console.error(`[GtoCache] Warmup failed for situation:`, error);
      }
    }

    console.log(`[GtoCache] Warmup complete. Cache size: ${this.cache.size}`);
  }
}

// Common preflop situations for warmup
export function getCommonPreflopSituations(): HandContext[] {
  const situations: HandContext[] = [];
  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const commonHands = [
    ['Ah', 'As'], ['Kh', 'Ks'], ['Qh', 'Qs'], ['Jh', 'Js'], ['Th', 'Ts'],
    ['Ah', 'Kh'], ['Ah', 'Qh'], ['Ah', 'Jh'], ['Kh', 'Qh'],
    ['Ah', 'Kd'], ['Ah', 'Qd'], ['Kh', 'Qd'],
  ];

  for (const position of positions) {
    for (const hand of commonHands) {
      // RFI situation
      situations.push({
        heroCards: hand,
        communityCards: [],
        street: 'preflop',
        heroPosition: position,
        potSize: 1.5,
        heroStack: 100,
        facingBet: 0,
        numPlayers: 9,
        isInPosition: ['CO', 'BTN'].includes(position),
      });

      // Facing raise
      situations.push({
        heroCards: hand,
        communityCards: [],
        street: 'preflop',
        heroPosition: position,
        potSize: 4.5,
        heroStack: 100,
        facingBet: 3,
        numPlayers: 9,
        isInPosition: ['CO', 'BTN'].includes(position),
      });
    }
  }

  return situations;
}

// Singleton instance
let gtoCacheInstance: GtoCache | null = null;

export function getGtoCache(): GtoCache {
  if (!gtoCacheInstance) {
    gtoCacheInstance = new GtoCache(10000, 60);
  }
  return gtoCacheInstance;
}

export function resetGtoCache(): void {
  gtoCacheInstance = null;
}
