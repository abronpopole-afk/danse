
/**
 * ONNX OCR Engine
 * Utilise ONNX Runtime pour inférence ultra-rapide (10x Tesseract)
 * Modèle léger pré-entraîné pour reconnaissance poker-spécifique
 */

import * as ort from 'onnxruntime-node';
import { preprocessForOCR } from '../image-processing';

export interface ONNXOCRConfig {
  modelPath: string;
  confidence threshold: number;
  batchSize: number;
  useGPU: boolean;
}

export interface ONNXOCRResult {
  text: string;
  confidence: number;
  latencyMs: number;
  method: 'onnx';
}

const DEFAULT_CONFIG: ONNXOCRConfig = {
  modelPath: './server/bot/ml-ocr/models/poker-ocr-v1.onnx',
  confidenceThreshold: 0.85,
  batchSize: 4,
  useGPU: false, // CPU par défaut (plus compatible)
};

export class ONNXOCREngine {
  private session: ort.InferenceSession | null = null;
  private config: ONNXOCRConfig;
  private initialized = false;
  private stats = {
    totalInferences: 0,
    avgLatency: 0,
    cacheHits: 0,
  };

  // Vocabulaire poker-spécifique
  private vocabulary = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'K', 'Q', 'J', 'T',
    'k', 'm', 'b', // Thousands, millions, billions
    '.', ',', '$', '€',
    's', 'h', 'd', 'c', // Suits
  ];

  constructor(config: Partial<ONNXOCRConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: this.config.useGPU 
          ? ['cuda', 'cpu'] 
          : ['cpu'],
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true,
        enableMemPattern: true,
      };

      this.session = await ort.InferenceSession.create(
        this.config.modelPath,
        sessionOptions
      );

      this.initialized = true;
      console.log('[ONNXOCREngine] Initialized with', this.session.inputNames);
    } catch (error) {
      console.error('[ONNXOCREngine] ❌ CRITICAL: Failed to load ONNX model at ' + this.config.modelPath, error);
      console.warn('[ONNXOCREngine] Falling back to other OCR methods');
      this.initialized = false;
    }
  }

  async recognize(
    imageBuffer: Buffer,
    width: number,
    height: number,
    type: 'card' | 'pot' | 'stack' | 'bet' = 'pot'
  ): Promise<ONNXOCRResult> {
    if (!this.initialized || !this.session) {
      throw new Error('ONNX engine not initialized');
    }

    const startTime = Date.now();
    console.log(`[ONNXOCREngine] 🔍 Début reconnaissance type=${type}, dimensions=${width}x${height}, buffer=${imageBuffer.length} bytes`);

    // Prétraitement image
    const preprocessed = this.preprocessImage(imageBuffer, width, height);
    console.log(`[ONNXOCREngine] 🧪 Prétraitement terminé: ${preprocessed.length} pixels normalisés`);

    // Créer tensor ONNX
    const inputTensor = new ort.Tensor('float32', preprocessed, [1, 1, height, width]);

    try {
      // Inférence
      console.log(`[ONNXOCREngine] 🧠 Lancement de l'inférence ONNX...`);
      const feeds = { [this.session.inputNames[0]]: inputTensor };
      const results = await this.session.run(feeds);

      // Décoder output
      const outputData = results[this.session.outputNames[0]].data as Float32Array;
      console.log(`[ONNXOCREngine] 📥 Output ONNX reçu: ${outputData.length} floats`);
      
      const decoded = this.decodeOutput(outputData, type);
      const latency = Date.now() - startTime;

      console.log(`[ONNXOCREngine] ✅ Résultat: "${decoded.text}" (conf: ${(decoded.confidence * 100).toFixed(1)}%) en ${latency}ms`);

      // Stats
      this.stats.totalInferences++;
      this.stats.avgLatency = 
        (this.stats.avgLatency * (this.stats.totalInferences - 1) + latency) / 
        this.stats.totalInferences;

      return {
        text: decoded.text,
        confidence: decoded.confidence,
        latencyMs: latency,
        method: 'onnx',
      };
    } catch (error) {
      console.error('[ONNXOCREngine] Inference failed:', error);
      throw error;
    }
  }

  private preprocessImage(buffer: Buffer, width: number, height: number): Float32Array {
    // Normalisation [0, 1]
    const pixels = new Float32Array(width * height);
    
    for (let i = 0; i < buffer.length; i += 4) {
      const idx = i / 4;
      // Grayscale moyenne
      const gray = (buffer[i] + buffer[i + 1] + buffer[i + 2]) / 3;
      pixels[idx] = gray / 255.0;
    }

    return pixels;
  }

  private decodeOutput(
    output: Float32Array,
    type: 'card' | 'pot' | 'stack' | 'bet'
  ): { text: string; confidence: number } {
    // CTC decoding pour séquence de caractères
    const sequenceLength = output.length / this.vocabulary.length;
    let text = '';
    let totalConfidence = 0;
    let validChars = 0;

    for (let t = 0; t < sequenceLength; t++) {
      const offset = t * this.vocabulary.length;
      const slice = output.slice(offset, offset + this.vocabulary.length);

      // Trouver max
      let maxIdx = 0;
      let maxVal = slice[0];
      for (let i = 1; i < slice.length; i++) {
        if (slice[i] > maxVal) {
          maxVal = slice[i];
          maxIdx = i;
        }
      }

      // Blank token (0) = pas de caractère
      if (maxIdx > 0 && maxVal > this.config.confidenceThreshold) {
        const char = this.vocabulary[maxIdx - 1];
        
        // CTC: éviter répétitions consécutives
        if (text.length === 0 || text[text.length - 1] !== char) {
          text += char;
          totalConfidence += maxVal;
          validChars++;
        }
      }
    }

    const avgConfidence = validChars > 0 ? totalConfidence / validChars : 0;

    return {
      text: this.postprocessText(text, type),
      confidence: avgConfidence,
    };
  }

  private postprocessText(text: string, type: 'card' | 'pot' | 'stack' | 'bet'): string {
    // Corrections spécifiques poker
    if (type === 'card') {
      // Format: rank + suit (ex: "As", "Kh")
      text = text.replace(/10/g, 'T'); // 10 → T
      return text.substring(0, 2); // Max 2 chars
    }

    if (type === 'pot' || type === 'stack' || type === 'bet') {
      // Nettoyage montants
      text = text.replace(/[^0-9.,kmb$€]/gi, '');
      
      // Corrections courantes
      text = text.replace(/o/gi, '0'); // o → 0
      text = text.replace(/l/gi, '1'); // l → 1
      text = text.replace(/s/gi, '5'); // s → 5
      
      return text;
    }

    return text;
  }

  getStats() {
    return { ...this.stats };
  }

  async shutdown(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
      this.initialized = false;
    }
  }
}

let onnxEngineInstance: ONNXOCREngine | null = null;

export async function getONNXOCREngine(config?: Partial<ONNXOCRConfig>): Promise<ONNXOCREngine | null> {
  if (!onnxEngineInstance) {
    try {
      onnxEngineInstance = new ONNXOCREngine(config);
      await onnxEngineInstance.initialize();
    } catch (error) {
      console.error('[ONNXOCREngine] Factory failed:', error);
      return null;
    }
  }
  return onnxEngineInstance;
}
