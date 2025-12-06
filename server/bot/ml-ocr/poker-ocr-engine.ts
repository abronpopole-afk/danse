/**
 * Poker OCR Engine
 * High-performance OCR specifically optimized for poker UI elements
 * Uses multi-layer approach: HSV → ML → Tesseract → Template Matching
 * Enhanced with multi-frame validation for stability
 */

import { CardClassifier, getCardClassifier, CardClassificationResult } from './card-classifier-ml';
import { DataCollector, getDataCollector } from './data-collector';
import { ocrCache } from '../ocr-cache';
import { ocrErrorCorrector } from '../ocr-error-correction';
import { getMultiFrameValidator } from '../multi-frame-validator';

export interface OCRConfig {
  useMLPrimary: boolean;
  useTesseractFallback: boolean;
  confidenceThreshold: number;
  collectTrainingData: boolean;
  maxRetries: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  method: 'ml' | 'tesseract' | 'hybrid' | 'cache';
  latencyMs: number;
  corrected: boolean;
}

export interface CardOCRResult {
  cards: Array<{
    rank: string;
    suit: string;
    combined: string;
    confidence: number;
  }>;
  method: 'ml' | 'tesseract' | 'hybrid';
  latencyMs: number;
}

export interface ValueOCRResult {
  value: number;
  rawText: string;
  confidence: number;
  method: 'ml' | 'tesseract' | 'hybrid';
  latencyMs: number;
}

const DEFAULT_CONFIG: OCRConfig = {
  useMLPrimary: true,
  useTesseractFallback: true,
  confidenceThreshold: 0.75,
  collectTrainingData: true,
  maxRetries: 2
};

export class PokerOCREngine {
  private config: OCRConfig;
  private cardClassifier: CardClassifier;
  private dataCollector: DataCollector | null = null;
  private tesseractWorker: any = null;
  private initialized: boolean = false;
  private stats = {
    mlCalls: 0,
    tesseractCalls: 0,
    cacheHits: 0,
    avgMlLatency: 0,
    avgTesseractLatency: 0
  };

  constructor(config: Partial<OCRConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cardClassifier = getCardClassifier();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.cardClassifier.initialize();
    } catch (e) {
      console.warn('[PokerOCREngine] CardClassifier initialization failed:', e);
    }

    if (this.config.collectTrainingData) {
      try {
        this.dataCollector = await getDataCollector();
      } catch (e) {
        console.warn('[PokerOCREngine] DataCollector not available:', e);
        this.dataCollector = null;
      }
    }

    if (this.config.useTesseractFallback) {
      try {
        const Tesseract = await import('tesseract.js');
        if (Tesseract.createWorker) {
          this.tesseractWorker = await Tesseract.createWorker('eng');
          console.log('[PokerOCREngine] Tesseract fallback initialized');
        }
      } catch (e) {
        console.warn('[PokerOCREngine] Tesseract not available:', e);
      }
    }

    this.initialized = true;
    console.log('[PokerOCREngine] Initialized with ML primary, Tesseract fallback');
  }

  async recognizeCards(
    imageBuffer: Buffer,
    width: number,
    height: number,
    cardCount: number = 2,
    validationKey: string = 'cards'
  ): Promise<CardOCRResult> {
    const startTime = Date.now();
    const cards: CardOCRResult['cards'] = [];
    const validator = getMultiFrameValidator();

    const cardWidth = Math.floor(width / cardCount);
    
    for (let i = 0; i < cardCount; i++) {
      const cardStart = i * cardWidth;
      const cardBuffer = this.extractRegion(
        imageBuffer, 
        width, 
        height, 
        cardStart, 
        0, 
        cardWidth, 
        height
      );

      const rankRegion = this.extractRegion(
        cardBuffer,
        cardWidth,
        height,
        2,
        2,
        Math.floor(cardWidth * 0.4),
        Math.floor(height * 0.3)
      );

      const suitRegion = this.extractRegion(
        cardBuffer,
        cardWidth,
        height,
        2,
        Math.floor(height * 0.25),
        Math.floor(cardWidth * 0.4),
        Math.floor(height * 0.3)
      );

      if (this.config.useMLPrimary) {
        const result = this.cardClassifier.classifyCard(
          rankRegion,
          suitRegion,
          Math.floor(cardWidth * 0.4),
          Math.floor(height * 0.3),
          true
        );

        const validationResult = validator.validateCard(
          `${validationKey}_card_${i}`,
          result.combined,
          result.overallConfidence
        );

        if (validationResult.validated && validationResult.confidence >= this.config.confidenceThreshold) {
          cards.push({
            rank: result.rank.class,
            suit: result.suit.class,
            combined: validationResult.value,
            confidence: validationResult.confidence
          });

          if (this.config.collectTrainingData && this.dataCollector) {
            await this.dataCollector.addSample(
              rankRegion,
              Math.floor(cardWidth * 0.4),
              Math.floor(height * 0.3),
              result.rank.class,
              'rank',
              result.rank.confidence,
              'ml-recognition'
            );
          }

          this.stats.mlCalls++;
          continue;
        } else if (result.overallConfidence >= this.config.confidenceThreshold) {
          cards.push({
            rank: result.rank.class,
            suit: result.suit.class,
            combined: result.combined,
            confidence: result.overallConfidence
          });
          this.stats.mlCalls++;
          continue;
        }
      }

      if (this.config.useTesseractFallback && this.tesseractWorker) {
        const tesseractResult = await this.recognizeWithTesseract(cardBuffer);
        const parsed = this.parseCardFromText(tesseractResult.text);
        
        if (parsed) {
          cards.push({
            rank: parsed.rank,
            suit: parsed.suit,
            combined: parsed.rank + parsed.suit,
            confidence: tesseractResult.confidence * 0.8
          });
        }
        
        this.stats.tesseractCalls++;
      }
    }

    return {
      cards,
      method: this.config.useMLPrimary ? 'ml' : 'tesseract',
      latencyMs: Date.now() - startTime
    };
  }

  async recognizeValue(
    imageBuffer: Buffer,
    width: number,
    height: number,
    type: 'pot' | 'stack' | 'bet' = 'pot',
    validationKey?: string
  ): Promise<ValueOCRResult> {
    const startTime = Date.now();
    const validator = getMultiFrameValidator();
    
    const cacheKey = this.generateCacheKey(imageBuffer, width, height);
    const cached = ocrCache.get(imageBuffer, { x: 0, y: 0, width, height });
    
    if (cached) {
      this.stats.cacheHits++;
      return {
        value: this.parseNumericValue(cached.text),
        rawText: cached.text,
        confidence: cached.confidence,
        method: 'hybrid',
        latencyMs: Date.now() - startTime
      };
    }

    let text = '';
    let confidence = 0;
    let method: 'ml' | 'tesseract' | 'hybrid' = 'ml';

    if (this.config.useMLPrimary) {
      const mlResult = this.recognizeDigitsML(imageBuffer, width, height);
      text = mlResult.text;
      confidence = mlResult.confidence;
      this.stats.mlCalls++;

      if (confidence < this.config.confidenceThreshold && this.tesseractWorker) {
        const tesseractResult = await this.recognizeWithTesseract(imageBuffer);
        
        if (tesseractResult.confidence > confidence) {
          text = tesseractResult.text;
          confidence = tesseractResult.confidence;
          method = 'tesseract';
        } else {
          method = 'hybrid';
        }
        this.stats.tesseractCalls++;
      }
    } else if (this.tesseractWorker) {
      const tesseractResult = await this.recognizeWithTesseract(imageBuffer);
      text = tesseractResult.text;
      confidence = tesseractResult.confidence;
      method = 'tesseract';
      this.stats.tesseractCalls++;
    }

    const correctionResult = ocrErrorCorrector.correctPotValue(text);
    const finalText = correctionResult.corrected;
    let finalValue = this.parseNumericValue(finalText);

    if (validationKey) {
      const validationResult = validator.validateNumber(
        validationKey,
        finalValue,
        confidence,
        0.05
      );
      if (validationResult.validated) {
        finalValue = validationResult.value;
        confidence = validationResult.confidence;
      }
    }

    ocrCache.set(imageBuffer, { x: 0, y: 0, width, height }, finalText, confidence);

    if (this.config.collectTrainingData && this.dataCollector && confidence > 0.9) {
      await this.dataCollector.addSample(
        imageBuffer,
        width,
        height,
        finalText,
        type,
        confidence,
        `${method}-recognition`
      );
    }

    return {
      value: finalValue,
      rawText: finalText,
      confidence,
      method,
      latencyMs: Date.now() - startTime
    };
  }

  private recognizeDigitsML(
    imageBuffer: Buffer,
    width: number,
    height: number
  ): { text: string; confidence: number } {
    const charWidth = Math.min(32, Math.floor(width / 4));
    const numChars = Math.floor(width / charWidth);
    
    let text = '';
    let totalConfidence = 0;
    let validChars = 0;

    for (let i = 0; i < numChars; i++) {
      const charBuffer = this.extractRegion(
        imageBuffer,
        width,
        height,
        i * charWidth,
        0,
        charWidth,
        height
      );

      const result = this.cardClassifier.classifyDigit(charBuffer, charWidth, height);
      
      if (result.confidence > 0.5) {
        text += result.class;
        totalConfidence += result.confidence;
        validChars++;
      }
    }

    return {
      text,
      confidence: validChars > 0 ? totalConfidence / validChars : 0
    };
  }

  private async recognizeWithTesseract(
    imageBuffer: Buffer
  ): Promise<{ text: string; confidence: number }> {
    if (!this.tesseractWorker) {
      return { text: '', confidence: 0 };
    }

    try {
      const result = await this.tesseractWorker.recognize(imageBuffer);
      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence / 100
      };
    } catch (e) {
      console.error('[PokerOCREngine] Tesseract error:', e);
      return { text: '', confidence: 0 };
    }
  }

  private extractRegion(
    buffer: Buffer,
    srcWidth: number,
    srcHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
    channels: number = 4
  ): Buffer {
    const output = Buffer.alloc(width * height * channels);
    
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const srcX = Math.min(x + dx, srcWidth - 1);
        const srcY = Math.min(y + dy, srcHeight - 1);
        const srcIdx = (srcY * srcWidth + srcX) * channels;
        const dstIdx = (dy * width + dx) * channels;
        
        for (let c = 0; c < channels; c++) {
          output[dstIdx + c] = buffer[srcIdx + c] || 0;
        }
      }
    }
    
    return output;
  }

  private parseCardFromText(text: string): { rank: string; suit: string } | null {
    const rankMap: Record<string, string> = {
      'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', 'T': 'T', '10': 'T',
      '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2'
    };
    
    const suitMap: Record<string, string> = {
      's': 's', 'spade': 's', 'spades': 's', '♠': 's',
      'h': 'h', 'heart': 'h', 'hearts': 'h', '♥': 'h',
      'd': 'd', 'diamond': 'd', 'diamonds': 'd', '♦': 'd',
      'c': 'c', 'club': 'c', 'clubs': 'c', '♣': 'c'
    };

    const cleaned = text.toLowerCase().trim();
    
    for (const [key, rank] of Object.entries(rankMap)) {
      if (cleaned.includes(key.toLowerCase())) {
        for (const [suitKey, suit] of Object.entries(suitMap)) {
          if (cleaned.includes(suitKey)) {
            return { rank, suit };
          }
        }
      }
    }
    
    return null;
  }

  private parseNumericValue(text: string): number {
    const cleaned = text
      .replace(/[^0-9.,KMBkmb]/g, '')
      .replace(',', '.');
    
    let value = parseFloat(cleaned) || 0;
    
    if (text.toLowerCase().includes('k')) value *= 1000;
    if (text.toLowerCase().includes('m')) value *= 1000000;
    if (text.toLowerCase().includes('b')) value *= 1000000000;
    
    return value;
  }

  private generateCacheKey(buffer: Buffer, width: number, height: number): string {
    const sample = buffer.slice(0, Math.min(100, buffer.length));
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash + sample[i]) | 0;
    }
    return `${width}_${height}_${hash}`;
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  async shutdown(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
    }
    if (this.dataCollector) {
      await this.dataCollector.saveIndex();
    }
  }
}

let engineInstance: PokerOCREngine | null = null;
let initializationFailed: boolean = false;

export async function getPokerOCREngine(config?: Partial<OCRConfig>): Promise<PokerOCREngine | null> {
  if (initializationFailed) {
    return null;
  }
  
  if (!engineInstance) {
    try {
      engineInstance = new PokerOCREngine(config);
      await engineInstance.initialize();
    } catch (error) {
      console.error('[PokerOCREngine] Factory initialization failed:', error);
      initializationFailed = true;
      engineInstance = null;
      return null;
    }
  }
  return engineInstance;
}
