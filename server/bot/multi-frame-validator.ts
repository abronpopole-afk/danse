
import { ScreenRegion } from "./platform-adapter";

export interface FrameCapture {
  timestamp: number;
  data: Buffer;
  width: number;
  height: number;
}

export interface ValidationResult<T> {
  value: T;
  confidence: number;
  consistency: number;
  frameCount: number;
  validated: boolean;
}

export class MultiFrameValidator {
  private frameHistory: Map<string, FrameCapture[]> = new Map();
  private maxFrames = 3;
  private minConsistency = 0.66; // 2/3 frames must agree
  private frameTimeout = 500; // ms

  /**
   * Validate a detection across multiple frames
   */
  validateDetection<T>(
    key: string,
    currentValue: T,
    confidence: number,
    compareFunc: (a: T, b: T) => boolean
  ): ValidationResult<T> {
    const history = this.frameHistory.get(key) || [];
    const now = Date.now();

    // Clean old frames
    const validHistory = history.filter(f => now - f.timestamp < this.frameTimeout);

    // Count consistent detections
    let consistentCount = 1; // Current frame
    const recentValues: T[] = [currentValue];

    // Extract values from history (need to store them separately)
    const valueHistory = (this as any)[`${key}_values`] || [];
    for (const value of valueHistory) {
      if (compareFunc(currentValue, value)) {
        consistentCount++;
      }
      recentValues.push(value);
    }

    // Update history
    (this as any)[`${key}_values`] = recentValues.slice(-this.maxFrames);

    const totalFrames = Math.min(recentValues.length, this.maxFrames);
    const consistency = consistentCount / totalFrames;
    const validated = consistency >= this.minConsistency && totalFrames >= 2;

    return {
      value: currentValue,
      confidence: validated ? Math.min(confidence * 1.2, 0.99) : confidence,
      consistency,
      frameCount: totalFrames,
      validated,
    };
  }

  /**
   * Store frame data for multi-frame comparison
   */
  addFrame(key: string, frameData: Buffer, width: number, height: number): void {
    const history = this.frameHistory.get(key) || [];
    history.push({
      timestamp: Date.now(),
      data: frameData,
      width,
      height,
    });

    // Keep only recent frames
    if (history.length > this.maxFrames) {
      history.shift();
    }

    this.frameHistory.set(key, history);
  }

  /**
   * Validate card detection across frames
   */
  validateCard(key: string, card: string, confidence: number): ValidationResult<string> {
    return this.validateDetection(
      key,
      card,
      confidence,
      (a, b) => a === b
    );
  }

  /**
   * Validate numeric value with tolerance
   */
  validateNumber(key: string, value: number, confidence: number, tolerance: number = 0.1): ValidationResult<number> {
    return this.validateDetection(
      key,
      value,
      confidence,
      (a, b) => Math.abs(a - b) / Math.max(a, b, 1) < tolerance
    );
  }

  /**
   * Clear validation history
   */
  clear(key?: string): void {
    if (key) {
      this.frameHistory.delete(key);
      delete (this as any)[`${key}_values`];
    } else {
      this.frameHistory.clear();
      Object.keys(this).forEach(k => {
        if (k.endsWith('_values')) {
          delete (this as any)[k];
        }
      });
    }
  }

  /**
   * Get validation statistics
   */
  getStats(key: string): { frameCount: number; oldestFrame: number } | null {
    const history = this.frameHistory.get(key);
    if (!history || history.length === 0) return null;

    return {
      frameCount: history.length,
      oldestFrame: Date.now() - history[0].timestamp,
    };
  }
}

let validatorInstance: MultiFrameValidator | null = null;

export function getMultiFrameValidator(): MultiFrameValidator {
  if (!validatorInstance) {
    validatorInstance = new MultiFrameValidator();
  }
  return validatorInstance;
}
