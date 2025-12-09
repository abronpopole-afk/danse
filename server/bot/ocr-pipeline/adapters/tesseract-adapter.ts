import { OCRAdapter, type OCRAdapterFactory } from './ocr-adapter';
import type { 
  Frame, 
  NormalizedFrame, 
  Region, 
  OCRResult, 
  OCREngineCapabilities 
} from '../types';

export class TesseractAdapter extends OCRAdapter {
  private worker: any = null;
  private tesseractModule: any = null;

  constructor() {
    super('tesseract');
  }

  async initialize(): Promise<void> {
    console.log('[TesseractAdapter] ====== INITIALISATION TESSERACT ======');
    try {
      console.log('[TesseractAdapter] Import tesseract.js...');
      this.tesseractModule = await import('tesseract.js');
      console.log('[TesseractAdapter] Création worker OCR (langue: eng)...');
      this.worker = await this.tesseractModule.createWorker('eng');
      console.log('[TesseractAdapter] Configuration whitelist caractères...');
      await this.worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,$ ',
      });
      this.isInitialized = true;
      console.log('[TesseractAdapter] ✅ Tesseract initialisé avec succès');
    } catch (error) {
      console.error('[TesseractAdapter] ❌ ERREUR initialisation:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
  }

  getCapabilities(): OCREngineCapabilities {
    return {
      supportsGPU: false,
      supportsBatching: false,
      maxBatchSize: 1,
      supportedFormats: ['png', 'jpg', 'bmp', 'raw'],
      estimatedSpeedMs: 500,
    };
  }

  async processRegion(
    frame: Frame | NormalizedFrame,
    region: Region
  ): Promise<OCRResult> {
    if (!this.isInitialized || !this.worker) {
      console.error('[TesseractAdapter] ❌ Worker non initialisé!');
      throw new Error('TesseractAdapter not initialized');
    }

    const startTime = Date.now();
    console.debug(`[TesseractAdapter] OCR region: ${region.id} (${region.bounds.width}x${region.bounds.height})`);
    
    try {
      const croppedBuffer = this.cropRegion(frame, region);
      console.debug(`[TesseractAdapter] Buffer cropped: ${croppedBuffer.length} bytes`);
      
      const result = await this.worker.recognize(croppedBuffer);
      const processingTime = Date.now() - startTime;
      
      const ocrResult: OCRResult = {
        text: result.data.text.trim(),
        confidence: result.data.confidence / 100,
        processingTimeMs: processingTime,
        engine: this.name,
        alternatives: result.data.words?.slice(1, 4).map((w: any) => ({
          text: w.text,
          confidence: w.confidence / 100,
        })),
      };

      console.log(`[TesseractAdapter] ✅ OCR "${ocrResult.text}" (conf: ${(ocrResult.confidence * 100).toFixed(1)}%, ${processingTime}ms)`);
      this.updateStats(true, processingTime, ocrResult.confidence);
      return ocrResult;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`[TesseractAdapter] ❌ OCR ÉCHEC region ${region.id}:`, error);
      this.updateStats(false, processingTime, 0);
      this.recordError(String(error));
      throw error;
    }
  }

  async processFrame(
    frame: Frame | NormalizedFrame,
    regions: Region[]
  ): Promise<Map<string, OCRResult>> {
    const results = new Map<string, OCRResult>();
    
    for (const region of regions) {
      try {
        const result = await this.processRegion(frame, region);
        results.set(region.id, result);
      } catch (error) {
        console.warn(`[TesseractAdapter] Failed to process region ${region.id}:`, error);
      }
    }
    
    return results;
  }

  private cropRegion(frame: Frame | NormalizedFrame, region: Region): Buffer {
    const { x, y, width, height } = region.bounds;
    const bytesPerPixel = frame.format === 'rgba' ? 4 : frame.format === 'rgb' ? 3 : 1;
    const rowStride = frame.width * bytesPerPixel;
    
    const croppedBuffer = Buffer.alloc(width * height * bytesPerPixel);
    
    for (let row = 0; row < height; row++) {
      const srcOffset = (y + row) * rowStride + x * bytesPerPixel;
      const dstOffset = row * width * bytesPerPixel;
      frame.data.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + width * bytesPerPixel);
    }
    
    return croppedBuffer;
  }
}

export class TesseractAdapterFactory implements OCRAdapterFactory {
  create(): OCRAdapter {
    return new TesseractAdapter();
  }

  async isAvailable(): Promise<boolean> {
    try {
      await import('tesseract.js');
      return true;
    } catch {
      return false;
    }
  }

  getPriority(): number {
    return 50;
  }
}
