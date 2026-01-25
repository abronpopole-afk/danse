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

      // LOG des dimensions originales pour debug
      log(`Input: region(${x},${y},${width},${height}) frame(${frame.width}x${frame.height}) bufferLen=${frame.data.length}`);

      // VALIDATION: Vérifier que les dimensions sont positives
      if (width <= 0 || height <= 0) {
        log(`❌ Dimensions invalides: ${width}x${height}`);
        return {
          text: '',
          confidence: 0,
          processingTimeMs: Date.now() - startTime,
          engine: this.name,
        };
      }

      // SECURISATION : Vérification des bornes avec clamping
      const safeX = Math.max(0, Math.min(x, frame.width - 1));
      const safeY = Math.max(0, Math.min(y, frame.height - 1));
      const safeWidth = Math.max(1, Math.min(width, frame.width - safeX));
      const safeHeight = Math.max(1, Math.min(height, frame.height - safeY));

      // Vérification si la région est trop petite pour l'OCR
      if (safeWidth < 5 || safeHeight < 5) {
        log(`⚠️ Région trop petite pour OCR: ${safeWidth}x${safeHeight}`);
        return {
          text: '',
          confidence: 0,
          processingTimeMs: Date.now() - startTime,
          engine: this.name,
        };
      }

      if (safeWidth !== width || safeHeight !== height || safeX !== x || safeY !== y) {
        log(`⚠️ Correction dimensions: (${x},${y},${width},${height}) -> (${safeX},${safeY},${safeWidth},${safeHeight})`);
      }

      // Vérification que le buffer source est assez grand
      const requiredSize = (safeY + safeHeight) * frame.width * channels;
      if (frame.data.length < requiredSize) {
        log(`❌ Buffer trop petit: ${frame.data.length} < ${requiredSize} requis`);
        return {
          text: '',
          confidence: 0,
          processingTimeMs: Date.now() - startTime,
          engine: this.name,
        };
      }

      // Extraction de la région d'intérêt avec vérification des offsets
      // On ajoute une marge de 2 pixels pour éviter de couper les bords des caractères
      const margin = 2;
      const extractX = Math.max(0, safeX - margin);
      const extractY = Math.max(0, safeY - margin);
      const extractW = Math.min(frame.width - extractX, safeWidth + margin * 2);
      const extractH = Math.min(frame.height - extractY, safeHeight + margin * 2);

      const croppedBuffer = Buffer.alloc(extractW * extractH * channels);
      for (let row = 0; row < extractH; row++) {
        const srcOffset = ((extractY + row) * frame.width + extractX) * channels;
        const dstOffset = row * extractW * channels;
        const copyLen = extractW * channels;
        
        if (srcOffset >= 0 && srcOffset + copyLen <= frame.data.length) {
          frame.data.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + copyLen);
        }
      }

      // UPSCALING pour améliorer l'OCR
      const MIN_OCR_DIMENSION = 80; // Augmenté de 50 à 80
      let finalWidth = extractW;
      let finalHeight = extractH;
      let scaleFactor = 1;
      
      if (extractW < MIN_OCR_DIMENSION || extractH < MIN_OCR_DIMENSION) {
        scaleFactor = Math.max(
          Math.ceil(MIN_OCR_DIMENSION / extractW),
          Math.ceil(MIN_OCR_DIMENSION / extractH)
        );
        scaleFactor = Math.min(scaleFactor, 4);
        finalWidth = extractW * scaleFactor;
        finalHeight = extractH * scaleFactor;
        log(`📈 Upscaling ${extractW}x${extractH} -> ${finalWidth}x${finalHeight} (${scaleFactor}x)`);
      }

      // ENCODAGE PNG
      log(`Encoding ${extractW}x${extractH} to PNG (output: ${finalWidth}x${finalHeight})...`);
      let sharpPipeline = sharp(croppedBuffer, {
        raw: {
          width: extractW,
          height: extractH,
          channels: channels as 3 | 4
        }
      });
      
      // Amélioration de l'image avant l'OCR
      sharpPipeline = sharpPipeline
        .modulate({ brightness: 1.1, contrast: 1.2 }) // Augmenter légèrement luminosité et contraste
        .sharpen(); // Accentuer les bords

      if (scaleFactor > 1) {
        sharpPipeline = sharpPipeline.resize(finalWidth, finalHeight, {
          kernel: sharp.kernel.lanczos3,
          fit: 'fill'
        });
      }
      
      const pngBuffer = await sharpPipeline.png().toBuffer();
      log(`PNG size: ${pngBuffer.length} bytes`);

      const formData = new FormData();
      const blob = new Blob([pngBuffer], { type: 'image/png' });
      formData.append('file', blob, 'region.png');

      const response = await axios.post(this.apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10000
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
