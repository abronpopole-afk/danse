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
import os from 'os';
import { createRequire } from 'module';

// Polyfill pour require dans les deux environnements (ESM/CJS)
const getRequire = () => {
  try {
    // @ts-ignore
    if (typeof require !== 'undefined') return require;
    // @ts-ignore
    return createRequire(import.meta.url);
  } catch (e) {
    // Fallback pour le build CJS où import.meta n'existe pas
    return createRequire('file://' + process.cwd() + '/index.cjs');
  }
};

const _require = getRequire();

// Helper pour charger onnxruntime-node depuis app.asar.unpacked en production
async function loadOnnxRuntime(): Promise<any> {
  const IS_PACKAGED = (process as any).resourcesPath !== undefined 
    && !(process as any).resourcesPath?.includes('node_modules');
  
  if (IS_PACKAGED) {
    const resourcesPath = (process as any).resourcesPath as string;
    // Sur Windows, resourcesPath pointe vers le dossier 'resources' de l'installation
    const unpackedPath = path.join(
      resourcesPath, 
      'app.asar.unpacked', 
      'node_modules', 
      'onnxruntime-node'
    );
    
    console.log(`[OnnxAdapter] Loading onnxruntime-node from: ${unpackedPath}`);
    
    if (!fs.existsSync(unpackedPath)) {
      console.warn(`[OnnxAdapter] unpackedPath not found: ${unpackedPath}. Falling back to normal import.`);
    } else {
      // Charger depuis le chemin absolu
      try {
        // Pointer directement vers le binaire si possible ou l'index
        const modulePath = path.join(unpackedPath, 'dist', 'index.js');
        if (fs.existsSync(modulePath)) {
          const mod = _require(modulePath);
          return mod.default || mod;
        }
        const mod = _require(unpackedPath);
        return mod.default || mod;
      } catch (e) {
        console.warn(`[OnnxAdapter] Failed to load from absolute path: ${unpackedPath}. Error: ${e}`);
      }
    }
  }
  
  // En développement ou fallback production, utiliser l'import normal
  try {
    const mod = await import('onnxruntime-node');
    return mod.default || mod;
  } catch (e) {
    console.error('[OnnxAdapter] CRITICAL: Failed to import onnxruntime-node:', e);
    throw e;
  }
}

// Helper pour obtenir le chemin des modèles dans Electron packagé ou dev
function getModelPaths(): { det: string, rec: string, keys: string } {
  // Electron-specific resourcesPath (may not exist in Node.js)
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  
  // Liste des chemins possibles à vérifier
  const possibleRoots = [
    // process.resourcesPath pour Electron packagé
    resourcesPath ? path.join(resourcesPath) : '',
    // process.cwd() pour le développement
    process.cwd(),
    // AppData/Roaming (userData d'Electron) - à utiliser en dernier
    path.join(os.homedir(), 'AppData', 'Roaming', 'GTO Poker Bot'),
  ].filter(Boolean);

  for (const root of possibleRoots) {
    const detPath = path.join(root, 'models', 'det', 'det.onnx');
    const recPath = path.join(root, 'models', 'rec', 'rec.onnx');
    const keysPath = path.join(root, 'models', 'rec', 'ppocr_keys_v1.txt');
    
    if (fs.existsSync(detPath) && fs.existsSync(recPath)) {
      console.log(`[OnnxAdapter] Models found in: ${root}/models`);
      return { det: detPath, rec: recPath, keys: keysPath };
    }
  }

  // Fallback - retourner le premier chemin même s'il n'existe pas (pour le message d'erreur)
  const fallbackRoot = possibleRoots[0] || process.cwd();
  return {
    det: path.join(fallbackRoot, 'models', 'det', 'det.onnx'),
    rec: path.join(fallbackRoot, 'models', 'rec', 'rec.onnx'),
    keys: path.join(fallbackRoot, 'models', 'rec', 'ppocr_keys_v1.txt'),
  };
}

// Alias pour compatibilité (utilisé par isAvailable)
function getModelPath(): string {
  const paths = getModelPaths();
  if (!fs.existsSync(paths.det)) {
    throw new Error(`Model not found: ${paths.det}`);
  }
  return paths.det;
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

      // ✅ CORRECTION: Utiliser le loader spécialisé pour Electron packagé
      this.onnxRuntime = await loadOnnxRuntime();
      
      const ort = this.onnxRuntime;
      if (!ort || typeof ort.InferenceSession === 'undefined') {
        console.error('[OnnxAdapter] InferenceSession not found in loaded module', {
          keys: Object.keys(this.onnxRuntime)
        });
        throw new Error('onnxruntime-node module structure invalid (InferenceSession missing)');
      }
      this.detSession = await ort.InferenceSession.create(this.modelPaths.det);
      this.recSession = await ort.InferenceSession.create(this.modelPaths.rec);

      this.isInitialized = true;
      console.log('[OnnxAdapter] Initialized successfully with PaddleOCR v5 models');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.warn(`[OnnxAdapter] Failed to initialize: ${errorMessage}`);
      if (errorStack) console.warn(`[OnnxAdapter] Stack: ${errorStack}`);
      this.isInitialized = false;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.detSession = null;
    this.recSession = null;
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
      const tensorData = this.bufferToTensor(croppedBuffer, region.bounds.width, region.bounds.height);
      
      const result = await this.runInference(tensorData);
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

  private bufferToTensor(buffer: Buffer, width: number, height: number): { data: Float32Array, width: number, height: number } {
    // PP-OCRv4 expects RGB input with shape [batch, channels, height, width]
    // We need 3 channels (RGB), not grayscale
    const channels = 3;
    const tensor = new Float32Array(channels * height * width);
    const bytesPerPixel = buffer.length / (width * height);
    
    // PP-OCR preprocessing: normalize to [0, 1] and arrange as CHW (channel, height, width)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIdx = y * width + x;
        const offset = pixelIdx * bytesPerPixel;
        
        if (offset + 2 < buffer.length) {
          const r = buffer[offset] / 255.0;
          const g = buffer[offset + 1] / 255.0;
          const b = buffer[offset + 2] / 255.0;
          
          // CHW format: all R values, then all G values, then all B values
          tensor[0 * height * width + pixelIdx] = r;  // R channel
          tensor[1 * height * width + pixelIdx] = g;  // G channel
          tensor[2 * height * width + pixelIdx] = b;  // B channel
        }
      }
    }
    
    return { data: tensor, width, height };
  }

  private async runInference(tensorData: { data: Float32Array, width: number, height: number }): Promise<{ text: string; confidence: number }> {
    if (!this.onnxRuntime) {
      console.log('[OnnxAdapter] Attempting late initialization of onnxRuntime...');
      try {
        this.onnxRuntime = await loadOnnxRuntime();
      } catch (e) {
        throw new Error('ONNX Runtime not initialized and late import failed');
      }
    }

    if (!this.recSession) {
      console.log('[OnnxAdapter] Loading ONNX models...');
      try {
        if (!this.modelPaths) {
          this.modelPaths = getModelPaths();
        }
        // Support both ESM and CJS imports
        const ort = this.onnxRuntime;
        this.detSession = await ort.InferenceSession.create(this.modelPaths.det);
        this.recSession = await ort.InferenceSession.create(this.modelPaths.rec);
        console.log('[OnnxAdapter] ONNX models loaded successfully');
      } catch (error) {
        console.error('[OnnxAdapter] Failed to load ONNX models:', error);
        throw error;
      }
    }
    
    try {
      const ort = this.onnxRuntime;
      const feeds: any = {};
      
      // PP-OCRv4 recognition model expects shape [batch, channels, height, width]
      // Channels = 3 (RGB), batch = 1
      const inputName = this.recSession.inputNames[0];
      const { data, width, height } = tensorData;
      const channels = 3;
      
      // Create tensor with correct 4D shape: [batch=1, channels=3, height, width]
      feeds[inputName] = new ort.Tensor('float32', data, [1, channels, height, width]);
      
      console.log(`[OnnxAdapter] Running inference with shape [1, ${channels}, ${height}, ${width}]`);
      
      const output = await this.recSession.run(feeds);
      
      // Get output tensor and decode
      const outputNames = this.recSession.outputNames;
      const outputTensor = output[outputNames[0]];
      
      // For PP-OCRv4, output is typically [batch, seq_len, num_classes]
      // We need to decode using CTC decoding and the character dictionary
      const text = this.decodeOutput(outputTensor);
      const confidence = this.calculateConfidence(outputTensor);
      
      console.log(`[OnnxAdapter] Inference result: "${text}" (confidence: ${confidence.toFixed(2)})`);
      
      return { text, confidence }; 
    } catch (error) {
      console.error('[OnnxAdapter] Inference execution failed:', error);
      throw error;
    }
  }
  
  private decodeOutput(outputTensor: any): string {
    // Simple CTC greedy decoding
    // Output shape is typically [batch, seq_len, num_classes]
    const data = outputTensor.data as Float32Array;
    const dims = outputTensor.dims;
    
    if (dims.length < 2) {
      return '';
    }
    
    const seqLen = dims[1];
    const numClasses = dims.length > 2 ? dims[2] : data.length / seqLen;
    
    const indices: number[] = [];
    let lastIdx = -1;
    
    for (let t = 0; t < seqLen; t++) {
      let maxIdx = 0;
      let maxVal = -Infinity;
      
      for (let c = 0; c < numClasses; c++) {
        const val = data[t * numClasses + c];
        if (val > maxVal) {
          maxVal = val;
          maxIdx = c;
        }
      }
      
      // CTC blank token is usually index 0, skip it and repeats
      if (maxIdx !== 0 && maxIdx !== lastIdx) {
        indices.push(maxIdx);
      }
      lastIdx = maxIdx;
    }
    
    // For poker OCR, we mainly care about simple characters
    // Map indices to characters (simplified - full impl would load ppocr_keys_v1.txt)
    const basicChars = '0123456789AaKkQqJjTt♠♥♦♣shdcSHDC$.';
    let text = '';
    for (const idx of indices) {
      if (idx > 0 && idx <= basicChars.length) {
        text += basicChars[idx - 1];
      }
    }
    
    return text;
  }
  
  private calculateConfidence(outputTensor: any): number {
    const data = outputTensor.data as Float32Array;
    const dims = outputTensor.dims;
    
    if (dims.length < 2 || data.length === 0) {
      return 0;
    }
    
    const seqLen = dims[1];
    const numClasses = dims.length > 2 ? dims[2] : data.length / seqLen;
    
    let totalConf = 0;
    let count = 0;
    
    for (let t = 0; t < seqLen; t++) {
      let maxVal = -Infinity;
      for (let c = 0; c < numClasses; c++) {
        const val = data[t * numClasses + c];
        if (val > maxVal) maxVal = val;
      }
      // Softmax approximation for confidence
      if (maxVal > 0) {
        totalConf += Math.min(1, maxVal);
        count++;
      }
    }
    
    return count > 0 ? totalConf / count : 0;
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
      // 🎯 SOLUTION DÉFINITIVE : Vérification de la version de Node
      const nodeVersion = process.versions.node;
      const majorVersion = parseInt(nodeVersion.split('.')[0]);
      if (majorVersion >= 24) {
        console.log(`[OnnxAdapterFactory] Not available: Node.js version ${nodeVersion} is incompatible with onnxruntime-node.`);
        return false;
      }

      // Vérifier que onnxruntime ET le modèle existent
      const ort = await loadOnnxRuntime();
      if (!ort || typeof ort.InferenceSession === 'undefined') {
        throw new Error('onnxruntime-node module structure invalid');
      }
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
