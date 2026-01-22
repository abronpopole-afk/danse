import { OCRAdapter, type OCRAdapterFactory } from './ocr-adapter';
import type { 
  Frame, 
  NormalizedFrame, 
  Region, 
  OCRResult, 
  OCREngineCapabilities 
} from '../types';

export class OnnxAdapter extends OCRAdapter {
  private session: any = null;
  private onnxRuntime: any = null;

  constructor() {
    super('onnx');
  }

  async initialize(): Promise<void> {
    try {
      this.onnxRuntime = await import('onnxruntime-node');
      this.isInitialized = true;
      console.log('[OnnxAdapter] Initialized successfully');
    } catch (error) {
      console.warn('[OnnxAdapter] Failed to initialize:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
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
      const srcOffset = (y + row) * rowStride + x * bytesPerPixel;
      const dstOffset = row * width * bytesPerPixel;
      frame.data.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + width * bytesPerPixel);
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
    if (!this.session) {
      console.log('[OnnxAdapter] Loading ONNX model...');
      try {
        this.session = await this.onnxRuntime.InferenceSession.create('./attached_assets/poker_ocr_model.onnx');
        console.log('[OnnxAdapter] ONNX model loaded successfully');
      } catch (error) {
        console.error('[OnnxAdapter] Failed to load ONNX model:', error);
        throw error;
      }
    }
    
    try {
      const feeds: any = {};
      feeds[this.session.inputNames[0]] = new this.onnxRuntime.Tensor('float32', tensor, [1, 1, tensor.length]);
      const output = await this.session.run(feeds);
      // Implementation-specific parsing would go here
      return { text: 'parsed_result', confidence: 0.9 }; 
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
      await import('onnxruntime-node');
      return true;
    } catch {
      return false;
    }
  }

  getPriority(): number {
    return 100;
  }
}
