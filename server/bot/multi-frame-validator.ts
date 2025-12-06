
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

interface TimestampedValue<T> {
  value: T;
  timestamp: number;
}

export class MultiFrameValidator {
  private frameHistory: Map<string, FrameCapture[]> = new Map();
  private valueHistory: Map<string, TimestampedValue<any>[]> = new Map();
  private maxFrames = 3;
  private minConsistency = 1.0; // All 3 frames must agree (100% consistency)
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
    const now = Date.now();

    const existingHistory = this.valueHistory.get(key) || [];
    const validHistory = existingHistory.filter(
      (item) => now - item.timestamp < this.frameTimeout
    );

    validHistory.push({ value: currentValue, timestamp: now });

    if (validHistory.length > this.maxFrames) {
      validHistory.shift();
    }

    this.valueHistory.set(key, validHistory);

    const totalFrames = validHistory.length;

    let consistentCount = 0;
    for (const item of validHistory) {
      if (compareFunc(currentValue, item.value)) {
        consistentCount++;
      }
    }

    const consistency = totalFrames > 0 ? consistentCount / totalFrames : 0;
    const validated = consistency >= this.minConsistency && totalFrames >= 3;

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
      this.valueHistory.delete(key);
    } else {
      this.frameHistory.clear();
      this.valueHistory.clear();
    }
  }

  /**
   * Get validation statistics
   */
  getStats(key: string): { frameCount: number; oldestFrame: number } | null {
    const history = this.valueHistory.get(key);
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
