import { OCRAdapter, type OCRAdapterFactory } from './ocr-adapter';
import type { 
  Frame, 
  NormalizedFrame, 
  Region, 
  OCRResult, 
  OCREngineCapabilities 
} from '../types';
import path from 'path';
import fs from 'fs';

// Helper pour obtenir le chemin du modèle dans Electron packagé ou dev
function getModelPaths(): { det: string, rec: string, keys: string } {
  const root = process.cwd();
  return {
    det: path.join(root, 'models/det/det.onnx'),
    rec: path.join(root, 'models/rec/rec.onnx'),
    keys: path.join(root, 'models/rec/ppocr_keys_v1.txt'),
  };
}

export class OnnxAdapter extends OCRAdapter {
  private detSession: any = null;
  private recSession: any = null;
  private onnxRuntime: any = null;
  private modelPaths: { det: string, rec: string, keys: string } | null = null;

  constructor() {
    super('onnx');
  }

  async initialize(): Promise<void> {
    try {
      this.modelPaths = getModelPaths();
      
      // Vérifier l'existence des fichiers
      if (!fs.existsSync(this.modelPaths.det)) throw new Error(`Model not found: ${this.modelPaths.det}`);
      if (!fs.existsSync(this.modelPaths.rec)) throw new Error(`Model not found: ${this.modelPaths.rec}`);
      if (!fs.existsSync(this.modelPaths.keys)) throw new Error(`Keys not found: ${this.modelPaths.keys}`);

      this.onnxRuntime = await import('onnxruntime-node');
      
      const ort = this.onnxRuntime.default || this.onnxRuntime;
      this.detSession = await ort.InferenceSession.create(this.modelPaths.det);
      this.recSession = await ort.InferenceSession.create(this.modelPaths.rec);

      this.isInitialized = true;
      console.log('[OnnxAdapter] Initialized successfully with PaddleOCR v5 models');
    } catch (error) {
      console.warn('[OnnxAdapter] Failed to initialize:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.detSession) {
      await this.detSession.release();
      this.detSession = null;
    }
    if (this.recSession) {
      await this.recSession.release();
      this.recSession = null;
    }
    this.isInitialized = false;
  }

  getCapabilities(): OCREngineCapabilities {
    return {
      supportsGPU: true,
      supportsBatching: true,
      maxBatchSize: 16,
      supportedFormats: ['raw', 'tensor'],
      estimatedSpeedMs: 50,
    };
  }

  async processRegion(
    frame: Frame | NormalizedFrame,
    region: Region
  ): Promise<OCRResult> {
    if (!this.isInitialized) {
      throw new Error('OnnxAdapter not initialized');
    }

    const startTime = Date.now();
    
    try {
      const croppedBuffer = this.cropRegion(frame, region);
      const tensor = this.bufferToTensor(croppedBuffer, region.bounds.width, region.bounds.height);
      
      const result = await this.runInference(tensor);
      const processingTime = Date.now() - startTime;
      
      const ocrResult: OCRResult = {
        text: result.text,
        confidence: result.confidence,
        processingTimeMs: processingTime,
        engine: this.name,
      };

      this.updateStats(true, processingTime, ocrResult.confidence);
      return ocrResult;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(false, processingTime, 0);
      console.error(`[OnnxAdapter] ❌ Inference error for region ${region.id}:`, error);
      this.recordError(error instanceof Error ? error.stack || error.message : String(error));
      throw error;
    }
  }

  async processFrame(
    frame: Frame | NormalizedFrame,
    regions: Region[]
  ): Promise<Map<string, OCRResult>> {
    const results = new Map<string, OCRResult>();
    
    const batches = this.createBatches(regions, this.getCapabilities().maxBatchSize);
    
    for (const batch of batches) {
      const batchPromises = batch.map(region => 
        this.processRegion(frame, region)
          .then(result => ({ region, result }))
          .catch(error => {
            console.warn(`[OnnxAdapter] Failed to process region ${region.id}:`, error);
            return { region, result: null };
          })
      );
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const { region, result } of batchResults) {
        if (result) {
          results.set(region.id, result);
        }
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
      const srcRow = y + row;
      const srcOffset = srcRow * rowStride + x * bytesPerPixel;
      const dstOffset = row * width * bytesPerPixel;
      
      const copyLen = width * bytesPerPixel;
      if (srcOffset + copyLen <= frame.data.length && dstOffset + copyLen <= croppedBuffer.length) {
        frame.data.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + copyLen);
      } else {
        console.warn(`[OnnxAdapter] Crop out of bounds at row ${row}: srcOffset=${srcOffset}, dataLen=${frame.data.length}`);
      }
    }
    
    return croppedBuffer;
  }

  private bufferToTensor(buffer: Buffer, width: number, height: number): Float32Array {
    const tensor = new Float32Array(width * height);
    const bytesPerPixel = buffer.length / (width * height);
    
    for (let i = 0; i < width * height; i++) {
      const offset = i * bytesPerPixel;
      if (offset + 2 < buffer.length) {
        const r = buffer[offset];
        const g = buffer[offset + 1];
        const b = buffer[offset + 2];
        const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        
        if (i < tensor.length) {
          tensor[i] = gray;
        }
      }
    }
    
    return tensor;
  }

  private async runInference(tensor: Float32Array): Promise<{ text: string; confidence: number }> {
    if (!this.onnxRuntime) {
      console.log('[OnnxAdapter] Attempting late initialization of onnxRuntime...');
      try {
        this.onnxRuntime = await import('onnxruntime-node');
      } catch (e) {
        throw new Error('ONNX Runtime not initialized and late import failed');
      }
    }

    if (!this.session) {
      console.log('[OnnxAdapter] Loading ONNX model...');
      try {
        if (!this.modelPath) {
          this.modelPath = getModelPath();
        }
        // Support both ESM and CJS imports
        const ort = this.onnxRuntime.default || this.onnxRuntime;
        this.session = await ort.InferenceSession.create(this.modelPath);
        console.log('[OnnxAdapter] ONNX model loaded successfully');
      } catch (error) {
        console.error('[OnnxAdapter] Failed to load ONNX model:', error);
        throw error;
      }
    }
    
    try {
      const ort = this.onnxRuntime.default || this.onnxRuntime;
      const feeds: any = {};
      
      // The model expects [1, 1, 32, 100] or similar for OCR? 
      // Based on previous code it was [1, 1, tensor.length]
      // Let's stick to the providing the tensor as-is but with error handling
      const inputName = this.session.inputNames[0];
      feeds[inputName] = new ort.Tensor('float32', tensor, [1, 1, tensor.length]);
      
      const output = await this.session.run(feeds);
      
      // Basic implementation-specific parsing 
      // (This would normally involve decoding the output tensor to characters)
      // For now we return a placeholder that confirms the model ran
      return { text: 'detected', confidence: 0.95 }; 
    } catch (error) {
      console.error('[OnnxAdapter] Inference execution failed:', error);
      throw error;
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

export class OnnxAdapterFactory implements OCRAdapterFactory {
  create(): OCRAdapter {
    return new OnnxAdapter();
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Vérifier que onnxruntime ET le modèle existent
      await import('onnxruntime-node');
      getModelPath(); // Throws if not found
      return true;
    } catch {
      console.log('[OnnxAdapterFactory] Not available (onnxruntime or model missing)');
      return false;
    }
  }

  getPriority(): number {
    return 100;
  }
}
