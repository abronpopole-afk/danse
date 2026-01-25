import { OCRAdapter, type OCRAdapterFactory } from './ocr-adapter';
import type { 
  Frame, 
  NormalizedFrame, 
  Region, 
  OCRResult, 
  OCREngineCapabilities 
} from '../types';
import axios from 'axios';

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
      const bytesPerPixel = frame.format === 'rgba' ? 4 : 3;
      const croppedBuffer = Buffer.alloc(width * height * bytesPerPixel);
      
      for (let row = 0; row < height; row++) {
        const srcOffset = ((y + row) * frame.width + x) * bytesPerPixel;
        const dstOffset = row * width * bytesPerPixel;
        frame.data.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + width * bytesPerPixel);
      }

      const formData = new FormData();
      const blob = new Blob([croppedBuffer], { type: 'image/png' });
      formData.append('file', blob, 'region.png');

      const response = await axios.post(this.apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 2000
      });

      const text = response.data.results?.map((r: any) => r.text).join(' ') || '';
      const confidence = response.data.results?.[0]?.confidence || 0;

      return {
        text,
        confidence,
        processingTimeMs: Date.now() - startTime,
        engine: this.name,
      };
    } catch (error) {
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
