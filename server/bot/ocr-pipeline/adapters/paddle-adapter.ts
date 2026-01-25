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
      
      const log = (msg: string) => {
        console.log(`[PaddleOCRAdapter] [${region.id}] ${msg}`);
      };

      // SECURISATION : Vérification des bornes
      const safeX = Math.max(0, Math.min(x, frame.width - 1));
      const safeY = Math.max(0, Math.min(y, frame.height - 1));
      const safeWidth = Math.max(1, Math.min(width, frame.width - safeX));
      const safeHeight = Math.max(1, Math.min(height, frame.height - safeY));

      if (safeWidth !== width || safeHeight !== height || safeX !== x || safeY !== y) {
        log(`⚠️ Correction dimensions: (${x},${y},${width},${height}) -> (${safeX},${safeY},${safeWidth},${safeHeight})`);
      }

      // Extraction de la région d'intérêt
      const croppedBuffer = Buffer.alloc(safeWidth * safeHeight * channels);
      for (let row = 0; row < safeHeight; row++) {
        const srcOffset = ((safeY + row) * frame.width + safeX) * channels;
        const dstOffset = row * safeWidth * channels;
        frame.data.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + safeWidth * channels);
      }

      // ENCODAGE PNG
      log(`Encoding ${safeWidth}x${safeHeight} to PNG...`);
      const pngBuffer = await sharp(croppedBuffer, {
        raw: {
          width: safeWidth,
          height: safeHeight,
          channels: channels as 3 | 4
        }
      }).png().toBuffer();
      log(`PNG size: ${pngBuffer.length} bytes`);

      const formData = new FormData();
      const blob = new Blob([pngBuffer], { type: 'image/png' });
      formData.append('file', blob, 'region.png');

      const response = await axios.post(this.apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 5000
      });

      const text = response.data.results?.map((r: any) => r.text).join(' ') || '';
      const confidence = response.data.results?.[0]?.confidence || 0;
      
      log(`Result: "${text}" (conf: ${confidence})`);

      return {
        text,
        confidence,
        processingTimeMs: Date.now() - startTime,
        engine: this.name,
      };
    } catch (error) {
      console.error(`[PaddleOCRAdapter] [${region.id}] Error processing:`, error);
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
