/**
 * ML-based Card Classifier
 * Uses custom neural network for fast, accurate poker card recognition
 * Enhanced with HSV color detection for reliable suit recognition
 */

import { NeuralNetwork, createTensor, Tensor } from './neural-network';
import { detectSuitByHSV } from '../image-processing';

export interface ClassificationResult {
  class: string;
  confidence: number;
  allProbabilities: Map<string, number>;
}

export interface CardClassificationResult {
  rank: ClassificationResult;
  suit: ClassificationResult;
  combined: string;
  overallConfidence: number;
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',', 'K', 'M', 'B', '$', '€'];

export class CardClassifier {
  private rankNetwork: NeuralNetwork | null = null;
  private suitNetwork: NeuralNetwork | null = null;
  private digitNetwork: NeuralNetwork | null = null;
  private initialized: boolean = false;
  private inputSize: number = 32;

  constructor() {
    // Lazy initialization - networks created in initialize()
  }

  private createRankNetwork(): NeuralNetwork {
    const nn = new NeuralNetwork();
    nn.addConv(16, 3, 1, 1);
    nn.addMaxPool(2, 2);
    nn.addConv(32, 3, 16, 1);
    nn.addMaxPool(2, 2);
    nn.addDense(32 * 6 * 6, 64, 'relu');
    nn.addDense(64, RANKS.length, 'softmax');
    return nn;
  }

  private createSuitNetwork(): NeuralNetwork {
    const nn = new NeuralNetwork();
    nn.addConv(8, 5, 3, 1);
    nn.addMaxPool(2, 2);
    nn.addConv(16, 3, 8, 1);
    nn.addMaxPool(2, 2);
    nn.addDense(16 * 5 * 5, 32, 'relu');
    nn.addDense(32, SUITS.length, 'softmax');
    return nn;
  }

  private createDigitNetwork(): NeuralNetwork {
    const nn = new NeuralNetwork();
    nn.addConv(16, 3, 1, 1);
    nn.addMaxPool(2, 2);
    nn.addConv(32, 3, 16, 1);
    nn.addMaxPool(2, 2);
    nn.addDense(32 * 6 * 6, 64, 'relu');
    nn.addDense(64, DIGITS.length, 'softmax');
    return nn;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Lazy create networks
      console.log('[CardClassifier] Creating neural network architectures...');
      this.rankNetwork = this.createRankNetwork();
      this.suitNetwork = this.createSuitNetwork();
      this.digitNetwork = this.createDigitNetwork();
      console.log('[CardClassifier] Network architectures created');
      
      const { promises: fs } = await import('fs');
      const path = await import('path');
      
      const weightsPath = path.join(process.cwd(), 'server/bot/ml-ocr/weights');
      console.log('[CardClassifier] Loading weights from:', weightsPath);
      
      try {
        const rankWeights = await fs.readFile(path.join(weightsPath, 'rank-weights.json'), 'utf-8');
        this.rankNetwork.importWeights(rankWeights);
        console.log('[CardClassifier] ✓ Rank weights loaded successfully');
      } catch {
        console.warn('[CardClassifier] No rank weights found, using random initialization');
      }
      
      try {
        const suitWeights = await fs.readFile(path.join(weightsPath, 'suit-weights.json'), 'utf-8');
        this.suitNetwork.importWeights(suitWeights);
        console.log('[CardClassifier] ✓ Suit weights loaded successfully');
      } catch {
        console.warn('[CardClassifier] No suit weights found, using random initialization');
      }
      
      try {
        const digitWeights = await fs.readFile(path.join(weightsPath, 'digit-weights.json'), 'utf-8');
        this.digitNetwork.importWeights(digitWeights);
        console.log('[CardClassifier] ✓ Digit weights loaded successfully');
      } catch {
        console.warn('[CardClassifier] No digit weights found, using random initialization');
      }
      
      this.initialized = true;
      console.log('[CardClassifier] ✓ ML Card Classifier fully initialized with models ready');
    } catch (error) {
      console.error('[CardClassifier] Initialization error:', error);
      this.initialized = true;
    }
  }

  preprocessImage(imageData: Buffer | Uint8Array, width: number, height: number, channels: number = 4): Tensor {
    const targetSize = this.inputSize;
    const output = createTensor([targetSize, targetSize, 1]);
    
    const scaleX = width / targetSize;
    const scaleY = height / targetSize;
    
    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        const srcX = Math.floor(x * scaleX);
        const srcY = Math.floor(y * scaleY);
        const srcIdx = (srcY * width + srcX) * channels;
        
        const r = imageData[srcIdx] || 0;
        const g = imageData[srcIdx + 1] || 0;
        const b = imageData[srcIdx + 2] || 0;
        const gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        output.data[y * targetSize + x] = gray;
      }
    }
    
    return output;
  }

  preprocessForSuit(imageData: Buffer | Uint8Array, width: number, height: number, channels: number = 4): Tensor {
    const targetSize = this.inputSize;
    const output = createTensor([targetSize, targetSize, 3]);
    
    const scaleX = width / targetSize;
    const scaleY = height / targetSize;
    
    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        const srcX = Math.floor(x * scaleX);
        const srcY = Math.floor(y * scaleY);
        const srcIdx = (srcY * width + srcX) * channels;
        const outIdx = (y * targetSize + x) * 3;
        
        output.data[outIdx] = (imageData[srcIdx] || 0) / 255;
        output.data[outIdx + 1] = (imageData[srcIdx + 1] || 0) / 255;
        output.data[outIdx + 2] = (imageData[srcIdx + 2] || 0) / 255;
      }
    }
    
    return output;
  }

  classifyRank(imageData: Buffer | Uint8Array, width: number, height: number): ClassificationResult {
    if (!this.rankNetwork) {
      return { class: '?', confidence: 0, allProbabilities: new Map() };
    }
    
    const input = this.preprocessImage(imageData, width, height);
    const probabilities = this.rankNetwork.predict(input);
    
    let maxIdx = 0;
    let maxProb = probabilities[0];
    const allProbs = new Map<string, number>();
    
    for (let i = 0; i < probabilities.length; i++) {
      allProbs.set(RANKS[i], probabilities[i]);
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIdx = i;
      }
    }
    
    return {
      class: RANKS[maxIdx],
      confidence: maxProb,
      allProbabilities: allProbs
    };
  }

  classifySuit(imageData: Buffer | Uint8Array, width: number, height: number): ClassificationResult {
    if (!this.suitNetwork) {
      return { class: '?', confidence: 0, allProbabilities: new Map() };
    }
    
    const input = this.preprocessForSuit(imageData, width, height);
    const probabilities = this.suitNetwork.predict(input);
    
    let maxIdx = 0;
    let maxProb = probabilities[0];
    const allProbs = new Map<string, number>();
    
    for (let i = 0; i < probabilities.length; i++) {
      allProbs.set(SUITS[i], probabilities[i]);
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIdx = i;
      }
    }
    
    return {
      class: SUITS[maxIdx],
      confidence: maxProb,
      allProbabilities: allProbs
    };
  }

  classifySuitWithHSV(imageData: Buffer | Uint8Array, width: number, height: number, channels: number = 4): ClassificationResult {
    const imageBuffer = Buffer.isBuffer(imageData) ? imageData : Buffer.from(imageData);
    const region = { x: 0, y: 0, width, height };
    const hsvResult = detectSuitByHSV(imageBuffer, width, height, region, channels, true);
    
    const suitMap: Record<string, string> = {
      'hearts': 'h',
      'diamonds': 'd',
      'clubs': 'c',
      'spades': 's'
    };

    if (hsvResult.suit && hsvResult.confidence >= 0.7) {
      const suitChar = suitMap[hsvResult.suit] || '?';
      const allProbs = new Map<string, number>();
      for (const s of SUITS) {
        allProbs.set(s, s === suitChar ? hsvResult.confidence : (1 - hsvResult.confidence) / 3);
      }
      return {
        class: suitChar,
        confidence: hsvResult.confidence,
        allProbabilities: allProbs
      };
    }

    const mlResult = this.classifySuit(imageData, width, height);

    if (hsvResult.suit && hsvResult.confidence >= 0.5) {
      const hsvSuitChar = suitMap[hsvResult.suit] || '?';
      if (mlResult.class === hsvSuitChar) {
        const boostedConfidence = Math.min(0.99, (mlResult.confidence + hsvResult.confidence) / 2 * 1.2);
        return {
          class: mlResult.class,
          confidence: boostedConfidence,
          allProbabilities: mlResult.allProbabilities
        };
      }
      
      if (hsvResult.confidence > mlResult.confidence) {
        const allProbs = new Map<string, number>();
        for (const s of SUITS) {
          allProbs.set(s, s === hsvSuitChar ? hsvResult.confidence : (1 - hsvResult.confidence) / 3);
        }
        return {
          class: hsvSuitChar,
          confidence: hsvResult.confidence,
          allProbabilities: allProbs
        };
      }
    }

    return mlResult;
  }

  classifyDigit(imageData: Buffer | Uint8Array, width: number, height: number): ClassificationResult {
    if (!this.digitNetwork) {
      return { class: '?', confidence: 0, allProbabilities: new Map() };
    }
    
    const input = this.preprocessImage(imageData, width, height);
    const probabilities = this.digitNetwork.predict(input);
    
    let maxIdx = 0;
    let maxProb = probabilities[0];
    const allProbs = new Map<string, number>();
    
    for (let i = 0; i < probabilities.length; i++) {
      allProbs.set(DIGITS[i], probabilities[i]);
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIdx = i;
      }
    }
    
    return {
      class: DIGITS[maxIdx],
      confidence: maxProb,
      allProbabilities: allProbs
    };
  }

  classifyCard(
    rankImageData: Buffer | Uint8Array,
    suitImageData: Buffer | Uint8Array,
    width: number,
    height: number,
    useHSV: boolean = true
  ): CardClassificationResult {
    const rank = this.classifyRank(rankImageData, width, height);
    const suit = useHSV 
      ? this.classifySuitWithHSV(suitImageData, width, height)
      : this.classifySuit(suitImageData, width, height);
    
    return {
      rank,
      suit,
      combined: rank.class + suit.class,
      overallConfidence: Math.sqrt(rank.confidence * suit.confidence)
    };
  }

  async saveWeights(path: string): Promise<void> {
    if (!this.rankNetwork || !this.suitNetwork || !this.digitNetwork) {
      console.warn('[CardClassifier] Cannot save weights - networks not initialized');
      return;
    }
    
    const { promises: fs } = await import('fs');
    const pathModule = await import('path');
    
    await fs.mkdir(path, { recursive: true });
    await fs.writeFile(
      pathModule.join(path, 'rank-weights.json'),
      this.rankNetwork.exportWeights()
    );
    await fs.writeFile(
      pathModule.join(path, 'suit-weights.json'),
      this.suitNetwork.exportWeights()
    );
    await fs.writeFile(
      pathModule.join(path, 'digit-weights.json'),
      this.digitNetwork.exportWeights()
    );
    
    console.log('[CardClassifier] Weights saved to', path);
  }
}

let cardClassifierInstance: CardClassifier | null = null;

export function getCardClassifier(): CardClassifier {
  if (!cardClassifierInstance) {
    cardClassifierInstance = new CardClassifier();
  }
  return cardClassifierInstance;
}
