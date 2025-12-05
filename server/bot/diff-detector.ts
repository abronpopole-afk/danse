
import crypto from 'crypto';

export interface RegionHash {
  region: string;
  hash: string;
  timestamp: number;
}

export interface DiffResult {
  hasChanged: boolean;
  changedRegions: string[];
  unchangedRegions: string[];
}

export class DiffDetector {
  private hashes: Map<string, Map<string, RegionHash>> = new Map();
  private hashAlgorithm: 'md5' | 'xxhash' = 'md5';

  constructor(private threshold: number = 0.05) {}

  /**
   * Hash rapide d'une région d'image
   */
  private hashRegion(buffer: Buffer, width: number, region: { x: number; y: number; width: number; height: number }): string {
    const pixels: number[] = [];
    const step = Math.max(1, Math.floor(region.width / 20)); // Échantillonnage

    for (let y = region.y; y < region.y + region.height; y += step) {
      for (let x = region.x; x < region.x + region.width; x += step) {
        const offset = (y * width + x) * 4;
        pixels.push(buffer[offset], buffer[offset + 1], buffer[offset + 2]);
      }
    }

    return crypto
      .createHash('md5')
      .update(Buffer.from(pixels))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Détecte les régions qui ont changé depuis la dernière capture
   */
  detectChanges(
    windowHandle: number,
    buffer: Buffer,
    width: number,
    regions: Record<string, { x: number; y: number; width: number; height: number }>
  ): DiffResult {
    const windowKey = `window_${windowHandle}`;
    if (!this.hashes.has(windowKey)) {
      this.hashes.set(windowKey, new Map());
    }

    const windowHashes = this.hashes.get(windowKey)!;
    const changedRegions: string[] = [];
    const unchangedRegions: string[] = [];
    const now = Date.now();

    for (const [regionName, region] of Object.entries(regions)) {
      const currentHash = this.hashRegion(buffer, width, region);
      const stored = windowHashes.get(regionName);

      if (!stored || stored.hash !== currentHash) {
        changedRegions.push(regionName);
        windowHashes.set(regionName, { region: regionName, hash: currentHash, timestamp: now });
      } else {
        unchangedRegions.push(regionName);
      }
    }

    // Nettoyage des vieux hash (>30s)
    for (const [key, value] of windowHashes) {
      if (now - value.timestamp > 30000) {
        windowHashes.delete(key);
      }
    }

    return {
      hasChanged: changedRegions.length > 0,
      changedRegions,
      unchangedRegions,
    };
  }

  /**
   * Force le recalcul d'une région
   */
  invalidateRegion(windowHandle: number, regionName: string): void {
    const windowKey = `window_${windowHandle}`;
    const windowHashes = this.hashes.get(windowKey);
    if (windowHashes) {
      windowHashes.delete(regionName);
    }
  }

  /**
   * Nettoie les données d'une fenêtre fermée
   */
  clearWindow(windowHandle: number): void {
    this.hashes.delete(`window_${windowHandle}`);
  }
}

export const diffDetector = new DiffDetector();
