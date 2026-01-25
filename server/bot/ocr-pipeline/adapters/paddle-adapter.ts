import { OCRAdapter, type OCRAdapterFactory } from './ocr-adapter';
import type { 
  Frame, 
  NormalizedFrame, 
  Region, 
  OCRResult, 
  OCREngineCapabilities 
} from '../types';
import axios from 'axios';
import sharp from 'sharp';

export class PaddleOCRAdapter extends OCRAdapter {
  private apiUrl = 'http://localhost:8000/ocr';

  constructor() {
    super('paddle');
  }

  async initialize(): Promise<void> {
    try {
      const response = await axios.get('http://localhost:8000/health', { timeout: 1000 });
      if (response.data.status === 'ok') {
        this.isInitialized = true;
        console.log('[PaddleOCRAdapter] Initialized and connected to Python service');
      }
    } catch (error) {
      console.warn('[PaddleOCRAdapter] Python OCR service not reachable at startup');
      // On marque comme initialisé car le service peut démarrer plus tard
      this.isInitialized = true;
    }
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }

  getCapabilities(): OCREngineCapabilities {
    return {
      supportsGPU: false,
      supportsBatching: false,
      maxBatchSize: 1,
      supportedFormats: ['rgba', 'rgb'],
      estimatedSpeedMs: 200,
    };
  }

  async processRegion(
    frame: Frame | NormalizedFrame,
    region: Region
  ): Promise<OCRResult> {
    const startTime = Date.now();
    try {
      const { x, y, width, height } = region.bounds;
      const channels = frame.format === 'rgba' ? 4 : 3;
      
      // Extraction de la région d'intérêt
      const croppedBuffer = Buffer.alloc(width * height * channels);
      for (let row = 0; row < height; row++) {
        const srcOffset = ((y + row) * frame.width + x) * channels;
        const dstOffset = row * width * channels;
        frame.data.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + width * channels);
      }

      // ENCODAGE PNG : Crucial pour que le service Python puisse décoder l'image
      console.log(`[PaddleOCRAdapter] Encoding region ${region.id} (${width}x${height}) to PNG...`);
      const pngBuffer = await sharp(croppedBuffer, {
        raw: {
          width: width,
          height: height,
          channels: channels as 3 | 4
        }
      }).png().toBuffer();
      console.log(`[PaddleOCRAdapter] PNG encoded for ${region.id}: ${pngBuffer.length} bytes`);

      const formData = new FormData();
      const blob = new Blob([pngBuffer], { type: 'image/png' });
      formData.append('file', blob, 'region.png');

      console.log(`[PaddleOCRAdapter] Sending request to Python service: ${this.apiUrl}`);
      const response = await axios.post(this.apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 5000 // Augmentation du timeout car l'OCR peut être lent
      });

      const text = response.data.results?.map((r: any) => r.text).join(' ') || '';
      const confidence = response.data.results?.[0]?.confidence || 0;
      
      console.log(`[PaddleOCRAdapter] Response received for ${region.id}: "${text}" (conf: ${confidence})`);

      return {
        text,
        confidence,
        processingTimeMs: Date.now() - startTime,
        engine: this.name,
      };
    } catch (error) {
      console.error('[PaddleOCRAdapter] Error processing region:', error);
      return {
        text: '',
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        engine: this.name
      };
    }
  }

  async processFrame(
    frame: Frame | NormalizedFrame,
    regions: Region[]
  ): Promise<Map<string, OCRResult>> {
    const results = new Map<string, OCRResult>();
    for (const region of regions) {
      const result = await this.processRegion(frame, region);
      results.set(region.id, result);
    }
    return results;
  }
}

export class PaddleOCRAdapterFactory implements OCRAdapterFactory {
  create(): OCRAdapter {
    return new PaddleOCRAdapter();
  }

  async isAvailable(): Promise<boolean> {
    return true; // Toujours disponible car c'est un client HTTP
  }

  getPriority(): number {
    return 200; // Priorité supérieure à Tesseract
  }
}
