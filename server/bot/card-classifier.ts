import { ScreenRegion } from "./platform-adapter";
import { toGrayscale, extractRegion, preprocessForOCR, ImageProcessingConfig, DEFAULT_PROCESSING_CONFIG } from "./image-processing";

export interface NeuralNetworkLayer {
  type: "conv" | "pool" | "dense" | "flatten" | "relu" | "softmax";
  weights?: Float32Array;
  biases?: Float32Array;
  inputSize?: number;
  outputSize?: number;
  kernelSize?: number;
  stride?: number;
  filters?: number;
}

export interface CardClassifierConfig {
  inputWidth: number;
  inputHeight: number;
  ranks: string[];
  confidenceThreshold: number;
}

const DEFAULT_CLASSIFIER_CONFIG: CardClassifierConfig = {
  inputWidth: 20,
  inputHeight: 28,
  ranks: ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"],
  confidenceThreshold: 0.6,
};

const RANK_FEATURE_VECTORS: Record<string, number[]> = {
  "A": [1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
  "K": [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1],
  "Q": [0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1],
  "J": [0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0],
  "T": [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  "9": [0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0],
  "8": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  "7": [1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  "6": [0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0],
  "5": [1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0],
  "4": [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
  "3": [1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0],
  "2": [0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1],
};

export function extractFeatures(
  imageBuffer: Buffer,
  width: number,
  height: number,
  region: ScreenRegion,
  config: CardClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
  channels: number = 4
): Float32Array {
  const extracted = extractRegion(imageBuffer, width, region, channels);
  const grayscale = toGrayscale(extracted, region.width, region.height, channels);

  const resized = resizeImage(grayscale, region.width, region.height, config.inputWidth, config.inputHeight);

  const normalized = new Float32Array(resized.length);
  for (let i = 0; i < resized.length; i++) {
    normalized[i] = resized[i] / 255.0;
  }

  const features = new Float32Array(15 + config.inputWidth * config.inputHeight);

  features.set(normalized, 0);

  const gridFeatures = extractGridFeatures(normalized, config.inputWidth, config.inputHeight);
  features.set(gridFeatures, normalized.length);

  return features;
}

function resizeImage(
  input: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8Array {
  const output = new Uint8Array(dstWidth * dstHeight);

  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcX1 = Math.min(srcX + 1, srcWidth - 1);
      const srcY1 = Math.min(srcY + 1, srcHeight - 1);

      const xFrac = (x * xRatio) - srcX;
      const yFrac = (y * yRatio) - srcY;

      const topLeft = input[srcY * srcWidth + srcX];
      const topRight = input[srcY * srcWidth + srcX1];
      const bottomLeft = input[srcY1 * srcWidth + srcX];
      const bottomRight = input[srcY1 * srcWidth + srcX1];

      const top = topLeft + (topRight - topLeft) * xFrac;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * xFrac;
      const value = top + (bottom - top) * yFrac;

      output[y * dstWidth + x] = Math.round(value);
    }
  }

  return output;
}

function extractGridFeatures(
  normalized: Float32Array,
  width: number,
  height: number
): Float32Array {
  const gridRows = 5;
  const gridCols = 3;
  const features = new Float32Array(gridRows * gridCols);

  const cellWidth = Math.floor(width / gridCols);
  const cellHeight = Math.floor(height / gridRows);

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let sum = 0;
      let count = 0;

      for (let y = gy * cellHeight; y < (gy + 1) * cellHeight && y < height; y++) {
        for (let x = gx * cellWidth; x < (gx + 1) * cellWidth && x < width; x++) {
          sum += normalized[y * width + x];
          count++;
        }
      }

      features[gy * gridCols + gx] = count > 0 ? (sum / count > 0.5 ? 1 : 0) : 0;
    }
  }

  return features;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

export class CardRankClassifier {
  private config: CardClassifierConfig;
  private rankVectors: Map<string, number[]>;
  private trainedWeights: Float32Array | null = null;
  private debugMode: boolean = false;
  private lastFeatures: Float32Array | null = null;
  private lastScores: Map<string, number> | null = null;

  constructor(config: CardClassifierConfig = DEFAULT_CLASSIFIER_CONFIG) {
    this.config = config;
    this.rankVectors = new Map(Object.entries(RANK_FEATURE_VECTORS));
  }

  enableDebugMode(enabled: boolean = true): void {
    this.debugMode = enabled;
  }

  getDebugInfo(): { features: Float32Array | null; scores: Map<string, number> | null } {
    return {
      features: this.lastFeatures,
      scores: this.lastScores,
    };
  }

  classify(
    imageBuffer: Buffer,
    width: number,
    height: number,
    region: ScreenRegion,
    channels: number = 4
  ): { rank: string | null; confidence: number; allScores: Map<string, number> } {
    const features = extractFeatures(imageBuffer, width, height, region, this.config, channels);

    if (this.debugMode) {
      this.lastFeatures = features;
    }

    const gridFeatures = Array.from(features.slice(features.length - 15));

    const scores = new Map<string, number>();

    for (const [rank, vector] of this.rankVectors) {
      const similarity = cosineSimilarity(gridFeatures, vector);
      scores.set(rank, similarity);
    }

    if (this.debugMode) {
      this.lastScores = scores;
    }

    let bestRank: string | null = null;
    let bestScore = -1;

    for (const [rank, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestRank = rank;
      }
    }

    if (bestScore < this.config.confidenceThreshold) {
      const templateResult = this.classifyByTemplateMatching(features);
      if (templateResult.confidence > bestScore) {
        return {
          rank: templateResult.rank,
          confidence: templateResult.confidence,
          allScores: scores,
        };
      }
    }

    return {
      rank: bestRank,
      confidence: Math.max(0, Math.min(1, bestScore)),
      allScores: scores,
    };
  }

  private classifyByTemplateMatching(features: Float32Array): { rank: string | null; confidence: number } {
    const pixelFeatures = Array.from(features.slice(0, this.config.inputWidth * this.config.inputHeight));

    const aspectRatio = this.config.inputWidth / this.config.inputHeight;
    const verticalBalance = this.calculateVerticalBalance(pixelFeatures);
    const horizontalBalance = this.calculateHorizontalBalance(pixelFeatures);
    const density = this.calculateDensity(pixelFeatures);

    const characteristics = {
      density,
      verticalBalance,
      horizontalBalance,
      hasHole: this.detectHoles(pixelFeatures),
      topHeavy: verticalBalance > 0.55,
      bottomHeavy: verticalBalance < 0.45,
    };

    if (density > 0.5 && characteristics.hasHole && characteristics.topHeavy) {
      return { rank: "A", confidence: 0.7 };
    }
    if (density > 0.45 && !characteristics.hasHole && characteristics.topHeavy) {
      return { rank: "K", confidence: 0.65 };
    }
    if (density > 0.45 && characteristics.hasHole && characteristics.bottomHeavy) {
      return { rank: "Q", confidence: 0.65 };
    }
    if (density < 0.35 && characteristics.bottomHeavy) {
      return { rank: "J", confidence: 0.6 };
    }
    if (density > 0.4 && !characteristics.hasHole) {
      return { rank: "T", confidence: 0.55 };
    }

    return { rank: null, confidence: 0 };
  }

  private calculateVerticalBalance(pixels: number[]): number {
    const width = this.config.inputWidth;
    const height = this.config.inputHeight;
    const midY = Math.floor(height / 2);

    let topSum = 0;
    let bottomSum = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = pixels[y * width + x];
        if (y < midY) {
          topSum += val;
        } else {
          bottomSum += val;
        }
      }
    }

    const total = topSum + bottomSum;
    return total > 0 ? topSum / total : 0.5;
  }

  private calculateHorizontalBalance(pixels: number[]): number {
    const width = this.config.inputWidth;
    const height = this.config.inputHeight;
    const midX = Math.floor(width / 2);

    let leftSum = 0;
    let rightSum = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = pixels[y * width + x];
        if (x < midX) {
          leftSum += val;
        } else {
          rightSum += val;
        }
      }
    }

    const total = leftSum + rightSum;
    return total > 0 ? leftSum / total : 0.5;
  }

  private calculateDensity(pixels: number[]): number {
    const threshold = 0.5;
    let count = 0;

    for (const p of pixels) {
      if (p > threshold) count++;
    }

    return count / pixels.length;
  }

  private detectHoles(pixels: number[]): boolean {
    const width = this.config.inputWidth;
    const height = this.config.inputHeight;

    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const radius = Math.min(width, height) / 4;

    let darkPixels = 0;
    let totalChecked = 0;

    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const val = pixels[Math.floor(y) * width + Math.floor(x)];
          if (val < 0.3) darkPixels++;
          totalChecked++;
        }
      }
    }

    return totalChecked > 0 && (darkPixels / totalChecked) > 0.3;
  }

  trainFromSamples(samples: Array<{ image: Buffer; width: number; height: number; region: ScreenRegion; rank: string; channels?: number }>): void {
    console.log(`[CardClassifier] Training with ${samples.length} samples...`);

    const rankFeatures = new Map<string, number[][]>();

    for (const sample of samples) {
      const features = extractFeatures(
        sample.image, 
        sample.width, 
        sample.height, 
        sample.region, 
        this.config, 
        sample.channels || 4
      );

      const gridFeatures = Array.from(features.slice(features.length - 15));

      if (!rankFeatures.has(sample.rank)) {
        rankFeatures.set(sample.rank, []);
      }
      rankFeatures.get(sample.rank)!.push(gridFeatures);
    }

    for (const [rank, featuresList] of rankFeatures) {
      if (featuresList.length === 0) continue;

      const avgFeatures = new Array(15).fill(0);
      for (const features of featuresList) {
        for (let i = 0; i < features.length; i++) {
          avgFeatures[i] += features[i];
        }
      }

      for (let i = 0; i < avgFeatures.length; i++) {
        avgFeatures[i] = avgFeatures[i] / featuresList.length > 0.5 ? 1 : 0;
      }

      this.rankVectors.set(rank, avgFeatures);
    }

    console.log(`[CardClassifier] Training complete. Updated ${rankFeatures.size} rank vectors.`);
  }

  exportModel(): string {
    const model = {
      config: this.config,
      rankVectors: Object.fromEntries(this.rankVectors),
    };
    return JSON.stringify(model);
  }

  importModel(jsonData: string): void {
    try {
      const model = JSON.parse(jsonData);
      this.config = { ...this.config, ...model.config };
      this.rankVectors = new Map(Object.entries(model.rankVectors));
      console.log(`[CardClassifier] Model imported successfully.`);
    } catch (error) {
      console.error(`[CardClassifier] Failed to import model:`, error);
    }
  }
}

export class CombinedCardRecognizer {
  private classifier: CardRankClassifier;
  private processingConfig: ImageProcessingConfig;
  private debugMode: boolean = false;
  private debugLogs: string[] = [];

  constructor(
    classifierConfig: CardClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
    processingConfig: ImageProcessingConfig = DEFAULT_PROCESSING_CONFIG
  ) {
    this.classifier = new CardRankClassifier(classifierConfig);
    this.processingConfig = processingConfig;
  }

  enableDebugMode(enabled: boolean = true): void {
    this.debugMode = enabled;
    this.classifier.enableDebugMode(enabled);
    if (!enabled) {
      this.debugLogs = [];
    }
  }

  getDebugLogs(): string[] {
    return this.debugLogs;
  }

  clearDebugLogs(): void {
    this.debugLogs = [];
  }

  private log(message: string): void {
    if (this.debugMode) {
      const timestamp = new Date().toISOString();
      this.debugLogs.push(`[${timestamp}] ${message}`);
      console.log(`[CardRecognizer] ${message}`);
    }
  }

  recognizeRank(
    imageBuffer: Buffer,
    width: number,
    height: number,
    region: ScreenRegion,
    channels: number = 4
  ): { rank: string | null; confidence: number; method: string } {
    this.log(`Recognizing rank in region: x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height}`);

    const preprocessed = preprocessForOCR(
      imageBuffer,
      width,
      height,
      this.processingConfig,
      channels
    );

    this.log(`Preprocessing complete`);

    const result = this.classifier.classify(preprocessed, width, height, region, channels);

    this.log(`Classification result: rank=${result.rank}, confidence=${result.confidence.toFixed(3)}`);

    if (this.debugMode) {
      const topScores = Array.from(result.allScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([rank, score]) => `${rank}:${score.toFixed(3)}`)
        .join(", ");
      this.log(`Top scores: ${topScores}`);
    }

    return {
      rank: result.rank,
      confidence: result.confidence,
      method: result.confidence >= 0.6 ? "feature_matching" : "heuristic",
    };
  }

  recognizeMultipleCards(
    imageBuffer: Buffer,
    width: number,
    height: number,
    cardRegions: ScreenRegion[],
    channels: number = 4
  ): Array<{ rank: string | null; confidence: number; region: ScreenRegion }> {
    const results: Array<{ rank: string | null; confidence: number; region: ScreenRegion }> = [];

    for (const region of cardRegions) {
      const result = this.recognizeRank(imageBuffer, width, height, region, channels);
      results.push({
        rank: result.rank,
        confidence: result.confidence,
        region,
      });
    }

    return results;
  }
}

export const cardClassifier = new CardRankClassifier();
export const combinedRecognizer = new CombinedCardRecognizer();
