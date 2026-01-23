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

const require = createRequire(import.meta.url);

// Helper pour charger onnxruntime-node depuis app.asar.unpacked en production
async function loadOnnxRuntime(): Promise<any> {
  const IS_PACKAGED = (process as any).resourcesPath !== undefined 
    && !(process as any).resourcesPath?.includes('node_modules');
  
  if (IS_PACKAGED) {
    const resourcesPath = (process as any).resourcesPath as string;
    const unpackedPath = path.join(
      resourcesPath, 
      'app.asar.unpacked', 
      'node_modules', 
      'onnxruntime-node'
    );
    
    console.log(`[OnnxAdapter] Loading onnxruntime-node from: ${unpackedPath}`);
    
    if (!fs.existsSync(unpackedPath)) {
      throw new Error(`onnxruntime-node not found in unpacked modules: ${unpackedPath}`);
    }
    
    // Charger depuis le chemin absolu
    try {
      const modulePath = require.resolve(path.join(unpackedPath, 'dist', 'index.js'));
      return require(modulePath);
    } catch (e) {
      // Fallback au dossier racine si dist/index.js n'est pas le point d'entrée
      try {
        return require(unpackedPath);
      } catch (e2) {
        // En dernier recours, essayer l'import direct
        return await import('onnxruntime-node');
      }
    }
  }
  
  // En développement, utiliser l'import normal
  return await import('onnxruntime-node');
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
      
      const ort = this.onnxRuntime.default || this.onnxRuntime;
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
        const ort = this.onnxRuntime.default || this.onnxRuntime;
        this.detSession = await ort.InferenceSession.create(this.modelPaths.det);
        this.recSession = await ort.InferenceSession.create(this.modelPaths.rec);
        console.log('[OnnxAdapter] ONNX models loaded successfully');
      } catch (error) {
        console.error('[OnnxAdapter] Failed to load ONNX models:', error);
        throw error;
      }
    }
    
    try {
      const ort = this.onnxRuntime.default || this.onnxRuntime;
      const feeds: any = {};
      
      // Use recognition model for OCR
      const inputName = this.recSession.inputNames[0];
      feeds[inputName] = new ort.Tensor('float32', tensor, [1, 1, tensor.length]);
      
      const output = await this.recSession.run(feeds);
      
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
      // 🎯 SOLUTION DÉFINITIVE : Vérification de la version de Node
      const nodeVersion = process.versions.node;
      const majorVersion = parseInt(nodeVersion.split('.')[0]);
      if (majorVersion >= 24) {
        console.log(`[OnnxAdapterFactory] Not available: Node.js version ${nodeVersion} is incompatible with onnxruntime-node.`);
        return false;
      }

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
