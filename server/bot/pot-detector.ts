
import { ScreenRegion } from "./platform-adapter";
import { getHistogram, rgbToHsv } from "./image-processing";

export interface PotDetectionResult {
  value: number;
  confidence: number;
  method: "ocr" | "histogram" | "hybrid";
  rawOcrText?: string;
}

export class PotDetector {
  /**
   * Detect pot value using multiple methods with fallback
   */
  async detectPot(
    imageBuffer: Buffer,
    width: number,
    height: number,
    potRegion: ScreenRegion,
    ocrFunc: (buffer: Buffer, region: ScreenRegion) => Promise<{ text: string; confidence: number }>,
    channels: number = 4
  ): Promise<PotDetectionResult> {
    // Method 1: OCR (primary)
    const ocrResult = await ocrFunc(imageBuffer, potRegion);
    const ocrValue = this.parseMoneyValue(ocrResult.text);
    
    if (ocrValue > 0 && ocrResult.confidence > 0.7) {
      // Validate with histogram
      const histogramValid = this.validatePotWithHistogram(
        imageBuffer,
        width,
        height,
        potRegion,
        ocrValue,
        channels
      );
      
      if (histogramValid) {
        return {
          value: ocrValue,
          confidence: Math.min(ocrResult.confidence * 1.1, 0.95),
          method: "hybrid",
          rawOcrText: ocrResult.text,
        };
      }
    }
    
    // Method 2: Histogram-based estimation (fallback)
    if (ocrValue === 0 || ocrResult.confidence < 0.5) {
      const histogramResult = this.estimatePotFromHistogram(
        imageBuffer,
        width,
        height,
        potRegion,
        channels
      );
      
      if (histogramResult.confidence > 0.6) {
        return histogramResult;
      }
    }
    
    // Return OCR result even if low confidence
    return {
      value: ocrValue,
      confidence: ocrResult.confidence,
      method: "ocr",
      rawOcrText: ocrResult.text,
    };
  }

  /**
   * Parse money value from OCR text
   */
  private parseMoneyValue(text: string): number {
    const cleaned = text.replace(/[^\d.,]/g, "");
    const normalized = cleaned.replace(/,/g, ".");
    const value = parseFloat(normalized);
    return isNaN(value) ? 0 : value;
  }

  /**
   * Validate pot value using color histogram analysis
   */
  private validatePotWithHistogram(
    imageBuffer: Buffer,
    width: number,
    height: number,
    region: ScreenRegion,
    expectedValue: number,
    channels: number
  ): boolean {
    // Analyze text color distribution
    const histogram = getHistogram(imageBuffer, width, height, region, "gray", channels);
    
    // Pot text is usually white/yellow on dark background
    const brightPixels = histogram.slice(200, 256).reduce((a, b) => a + b, 0);
    const darkPixels = histogram.slice(0, 100).reduce((a, b) => a + b, 0);
    const totalPixels = region.width * region.height;
    
    const brightRatio = brightPixels / totalPixels;
    const darkRatio = darkPixels / totalPixels;
    
    // Valid pot display should have:
    // - 10-40% bright pixels (text)
    // - 40-80% dark pixels (background)
    const isValidDistribution = 
      brightRatio > 0.1 && brightRatio < 0.4 &&
      darkRatio > 0.4 && darkRatio < 0.8;
    
    return isValidDistribution;
  }

  /**
   * Estimate pot value from histogram when OCR fails
   */
  private estimatePotFromHistogram(
    imageBuffer: Buffer,
    width: number,
    height: number,
    region: ScreenRegion,
    channels: number
  ): PotDetectionResult {
    // Analyze color characteristics
    const rHist = getHistogram(imageBuffer, width, height, region, "r", channels);
    const gHist = getHistogram(imageBuffer, width, height, region, "g", channels);
    const bHist = getHistogram(imageBuffer, width, height, region, "b", channels);
    
    // Check for yellow/gold text (high R&G, low B)
    const yellowishPixels = this.countColorRange(
      imageBuffer,
      width,
      height,
      region,
      { rMin: 200, gMin: 200, bMax: 100 },
      channels
    );
    
    const totalPixels = region.width * region.height;
    const yellowRatio = yellowishPixels / totalPixels;
    
    // Estimate based on text presence
    if (yellowRatio > 0.15 && yellowRatio < 0.35) {
      // Likely has pot text, but OCR failed
      // Return a flag value to indicate detection without reading
      return {
        value: -1, // Flag: pot exists but value unknown
        confidence: 0.7,
        method: "histogram",
      };
    }
    
    // No pot text detected
    return {
      value: 0,
      confidence: yellowRatio < 0.05 ? 0.9 : 0.5,
      method: "histogram",
    };
  }

  /**
   * Count pixels within RGB range
   */
  private countColorRange(
    imageBuffer: Buffer,
    width: number,
    height: number,
    region: ScreenRegion,
    range: { rMin?: number; rMax?: number; gMin?: number; gMax?: number; bMin?: number; bMax?: number },
    channels: number
  ): number {
    let count = 0;
    
    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const offset = (y * width + x) * channels;
        const r = imageBuffer[offset];
        const g = imageBuffer[offset + 1];
        const b = imageBuffer[offset + 2];
        
        const rMatch = (!range.rMin || r >= range.rMin) && (!range.rMax || r <= range.rMax);
        const gMatch = (!range.gMin || g >= range.gMin) && (!range.gMax || g <= range.gMax);
        const bMatch = (!range.bMin || b >= range.bMin) && (!range.bMax || b <= range.bMax);
        
        if (rMatch && gMatch && bMatch) {
          count++;
        }
      }
    }
    
    return count;
  }
}

let potDetectorInstance: PotDetector | null = null;

export function getPotDetector(): PotDetector {
  if (!potDetectorInstance) {
    potDetectorInstance = new PotDetector();
  }
  return potDetectorInstance;
}
