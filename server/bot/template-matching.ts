import { ScreenRegion } from "./platform-adapter";
import { toGrayscale, applyGaussianBlur, applyContrastStretching } from "./image-processing";

export interface TemplateMatchResult {
  x: number;
  y: number;
  score: number;
  template: string;
  region: ScreenRegion;
}

export interface Template {
  name: string;
  width: number;
  height: number;
  data: Uint8Array;
  variants?: Template[];
}

const CARD_RANK_PATTERNS: Record<string, number[][]> = {
  "A": [
    [0,0,1,1,0,0],
    [0,1,0,0,1,0],
    [1,0,0,0,0,1],
    [1,1,1,1,1,1],
    [1,0,0,0,0,1],
    [1,0,0,0,0,1],
    [1,0,0,0,0,1],
  ],
  "K": [
    [1,0,0,0,1,0],
    [1,0,0,1,0,0],
    [1,0,1,0,0,0],
    [1,1,0,0,0,0],
    [1,0,1,0,0,0],
    [1,0,0,1,0,0],
    [1,0,0,0,1,0],
  ],
  "Q": [
    [0,1,1,1,0,0],
    [1,0,0,0,1,0],
    [1,0,0,0,1,0],
    [1,0,0,0,1,0],
    [1,0,1,0,1,0],
    [1,0,0,1,0,0],
    [0,1,1,0,1,0],
  ],
  "J": [
    [0,0,0,0,1,0],
    [0,0,0,0,1,0],
    [0,0,0,0,1,0],
    [0,0,0,0,1,0],
    [1,0,0,0,1,0],
    [1,0,0,0,1,0],
    [0,1,1,1,0,0],
  ],
  "T": [
    [1,1,1,1,1,1],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
  ],
  "9": [
    [0,1,1,1,0,0],
    [1,0,0,0,1,0],
    [1,0,0,0,1,0],
    [0,1,1,1,1,0],
    [0,0,0,0,1,0],
    [0,0,0,0,1,0],
    [0,1,1,1,0,0],
  ],
  "8": [
    [0,1,1,1,0,0],
    [1,0,0,0,1,0],
    [1,0,0,0,1,0],
    [0,1,1,1,0,0],
    [1,0,0,0,1,0],
    [1,0,0,0,1,0],
    [0,1,1,1,0,0],
  ],
  "7": [
    [1,1,1,1,1,0],
    [0,0,0,0,1,0],
    [0,0,0,1,0,0],
    [0,0,1,0,0,0],
    [0,0,1,0,0,0],
    [0,1,0,0,0,0],
    [0,1,0,0,0,0],
  ],
  "6": [
    [0,1,1,1,0,0],
    [1,0,0,0,0,0],
    [1,0,0,0,0,0],
    [1,1,1,1,0,0],
    [1,0,0,0,1,0],
    [1,0,0,0,1,0],
    [0,1,1,1,0,0],
  ],
  "5": [
    [1,1,1,1,1,0],
    [1,0,0,0,0,0],
    [1,0,0,0,0,0],
    [1,1,1,1,0,0],
    [0,0,0,0,1,0],
    [0,0,0,0,1,0],
    [1,1,1,1,0,0],
  ],
  "4": [
    [0,0,0,1,0,0],
    [0,0,1,1,0,0],
    [0,1,0,1,0,0],
    [1,0,0,1,0,0],
    [1,1,1,1,1,0],
    [0,0,0,1,0,0],
    [0,0,0,1,0,0],
  ],
  "3": [
    [0,1,1,1,0,0],
    [1,0,0,0,1,0],
    [0,0,0,0,1,0],
    [0,0,1,1,0,0],
    [0,0,0,0,1,0],
    [1,0,0,0,1,0],
    [0,1,1,1,0,0],
  ],
  "2": [
    [0,1,1,1,0,0],
    [1,0,0,0,1,0],
    [0,0,0,0,1,0],
    [0,0,0,1,0,0],
    [0,0,1,0,0,0],
    [0,1,0,0,0,0],
    [1,1,1,1,1,0],
  ],
};

const SUIT_PATTERNS: Record<string, number[][]> = {
  hearts: [
    [0,1,0,1,0],
    [1,1,1,1,1],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ],
  diamonds: [
    [0,0,1,0,0],
    [0,1,1,1,0],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ],
  clubs: [
    [0,0,1,0,0],
    [0,1,1,1,0],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ],
  spades: [
    [0,0,1,0,0],
    [0,1,1,1,0],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ],
};

const BUTTON_PATTERNS: Record<string, { colors: { r: number; g: number; b: number; tolerance: number }; textPattern: string[] }> = {
  fold: {
    colors: { r: 180, g: 60, b: 60, tolerance: 40 },
    textPattern: ["FOLD", "Fold", "fold", "PASSER"],
  },
  call: {
    colors: { r: 60, g: 150, b: 60, tolerance: 40 },
    textPattern: ["CALL", "Call", "call", "SUIVRE", "CHECK", "Check", "check"],
  },
  raise: {
    colors: { r: 60, g: 100, b: 180, tolerance: 40 },
    textPattern: ["RAISE", "Raise", "raise", "RELANCER", "BET", "Bet", "bet"],
  },
  allIn: {
    colors: { r: 200, g: 80, b: 200, tolerance: 40 },
    textPattern: ["ALL IN", "All In", "all in", "ALLIN", "TAPIS"],
  },
};

function patternToTemplate(pattern: number[][], scale: number = 1): Uint8Array {
  const height = pattern.length * scale;
  const width = pattern[0].length * scale;
  const data = new Uint8Array(width * height);

  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y].length; x++) {
      const value = pattern[y][x] === 1 ? 255 : 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const idx = (y * scale + sy) * width + (x * scale + sx);
          data[idx] = value;
        }
      }
    }
  }

  return data;
}

function generateRankTemplates(): Map<string, Template[]> {
  const templates = new Map<string, Template[]>();
  const scales = [2, 3, 4, 5];

  for (const [rank, pattern] of Object.entries(CARD_RANK_PATTERNS)) {
    const variants: Template[] = [];
    
    for (const scale of scales) {
      variants.push({
        name: `${rank}_scale${scale}`,
        width: pattern[0].length * scale,
        height: pattern.length * scale,
        data: patternToTemplate(pattern, scale),
      });
    }

    templates.set(rank, variants);
  }

  return templates;
}

export function normalizedCrossCorrelation(
  image: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  template: Uint8Array,
  templateWidth: number,
  templateHeight: number,
  startX: number,
  startY: number
): number {
  let sumImage = 0;
  let sumTemplate = 0;
  let sumImageSq = 0;
  let sumTemplateSq = 0;
  let sumProduct = 0;
  let count = 0;

  for (let ty = 0; ty < templateHeight; ty++) {
    for (let tx = 0; tx < templateWidth; tx++) {
      const ix = startX + tx;
      const iy = startY + ty;

      if (ix < 0 || ix >= imageWidth || iy < 0 || iy >= imageHeight) {
        continue;
      }

      const imageVal = image[iy * imageWidth + ix];
      const templateVal = template[ty * templateWidth + tx];

      sumImage += imageVal;
      sumTemplate += templateVal;
      sumImageSq += imageVal * imageVal;
      sumTemplateSq += templateVal * templateVal;
      sumProduct += imageVal * templateVal;
      count++;
    }
  }

  if (count === 0) return -1;

  const meanImage = sumImage / count;
  const meanTemplate = sumTemplate / count;

  const varImage = sumImageSq / count - meanImage * meanImage;
  const varTemplate = sumTemplateSq / count - meanTemplate * meanTemplate;

  if (varImage <= 0 || varTemplate <= 0) return 0;

  const covariance = sumProduct / count - meanImage * meanTemplate;
  const correlation = covariance / (Math.sqrt(varImage) * Math.sqrt(varTemplate));

  return correlation;
}

export function sumOfAbsoluteDifferences(
  image: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  template: Uint8Array,
  templateWidth: number,
  templateHeight: number,
  startX: number,
  startY: number
): number {
  let sad = 0;
  let count = 0;

  for (let ty = 0; ty < templateHeight; ty++) {
    for (let tx = 0; tx < templateWidth; tx++) {
      const ix = startX + tx;
      const iy = startY + ty;

      if (ix < 0 || ix >= imageWidth || iy < 0 || iy >= imageHeight) {
        sad += 255;
        count++;
        continue;
      }

      const imageVal = image[iy * imageWidth + ix];
      const templateVal = template[ty * templateWidth + tx];
      sad += Math.abs(imageVal - templateVal);
      count++;
    }
  }

  return count > 0 ? sad / count : 255;
}

export function findTemplateInRegion(
  grayscale: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  region: ScreenRegion,
  template: Template,
  method: "ncc" | "sad" = "ncc",
  threshold: number = 0.7
): TemplateMatchResult | null {
  let bestScore = method === "ncc" ? -1 : 255;
  let bestX = -1;
  let bestY = -1;

  const stepX = Math.max(1, Math.floor(template.width / 4));
  const stepY = Math.max(1, Math.floor(template.height / 4));

  for (let y = region.y; y <= region.y + region.height - template.height; y += stepY) {
    for (let x = region.x; x <= region.x + region.width - template.width; x += stepX) {
      let score: number;

      if (method === "ncc") {
        score = normalizedCrossCorrelation(
          grayscale, imageWidth, imageHeight,
          template.data, template.width, template.height,
          x, y
        );

        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      } else {
        score = sumOfAbsoluteDifferences(
          grayscale, imageWidth, imageHeight,
          template.data, template.width, template.height,
          x, y
        );

        if (score < bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }
  }

  if (bestX >= 0) {
    for (let y = Math.max(region.y, bestY - stepY); y <= Math.min(region.y + region.height - template.height, bestY + stepY); y++) {
      for (let x = Math.max(region.x, bestX - stepX); x <= Math.min(region.x + region.width - template.width, bestX + stepX); x++) {
        let score: number;

        if (method === "ncc") {
          score = normalizedCrossCorrelation(
            grayscale, imageWidth, imageHeight,
            template.data, template.width, template.height,
            x, y
          );

          if (score > bestScore) {
            bestScore = score;
            bestX = x;
            bestY = y;
          }
        } else {
          score = sumOfAbsoluteDifferences(
            grayscale, imageWidth, imageHeight,
            template.data, template.width, template.height,
            x, y
          );

          if (score < bestScore) {
            bestScore = score;
            bestX = x;
            bestY = y;
          }
        }
      }
    }
  }

  const isMatch = method === "ncc" 
    ? bestScore >= threshold 
    : bestScore <= (1 - threshold) * 255;

  if (!isMatch || bestX < 0) {
    return null;
  }

  return {
    x: bestX,
    y: bestY,
    score: bestScore,
    template: template.name,
    region: {
      x: bestX,
      y: bestY,
      width: template.width,
      height: template.height,
    },
  };
}

export class TemplateMatcher {
  private rankTemplates: Map<string, Template[]>;
  private customTemplates: Map<string, Template> = new Map();
  private debugMode: boolean = false;

  constructor() {
    this.rankTemplates = generateRankTemplates();
  }

  enableDebugMode(enabled: boolean = true): void {
    this.debugMode = enabled;
  }

  addCustomTemplate(name: string, template: Template): void {
    this.customTemplates.set(name, template);
  }

  matchCardRank(
    imageBuffer: Buffer,
    imageWidth: number,
    imageHeight: number,
    region: ScreenRegion,
    channels: number = 4
  ): { rank: string | null; confidence: number; position?: { x: number; y: number } } {
    const grayscale = toGrayscale(imageBuffer, imageWidth, imageHeight, channels);

    const results: Array<{ rank: string; score: number; x: number; y: number }> = [];

    for (const [rank, templates] of this.rankTemplates) {
      for (const template of templates) {
        const match = findTemplateInRegion(
          grayscale, imageWidth, imageHeight,
          region, template, "ncc", 0.5
        );

        if (match) {
          results.push({ rank, score: match.score, x: match.x, y: match.y });
        }
      }
    }

    if (results.length === 0) {
      return { rank: null, confidence: 0 };
    }

    results.sort((a, b) => b.score - a.score);
    const best = results[0];

    return {
      rank: best.rank,
      confidence: Math.min(best.score, 1.0),
      position: { x: best.x, y: best.y },
    };
  }

  matchButton(
    imageBuffer: Buffer,
    imageWidth: number,
    imageHeight: number,
    region: ScreenRegion,
    buttonType: keyof typeof BUTTON_PATTERNS,
    channels: number = 4
  ): { found: boolean; confidence: number; region?: ScreenRegion } {
    const pattern = BUTTON_PATTERNS[buttonType];
    if (!pattern) {
      return { found: false, confidence: 0 };
    }

    let matchCount = 0;
    const totalPixels = region.width * region.height;
    const { r: targetR, g: targetG, b: targetB, tolerance } = pattern.colors;

    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        if (x < 0 || x >= imageWidth || y < 0 || y >= imageHeight) continue;

        const offset = (y * imageWidth + x) * channels;
        const r = imageBuffer[offset];
        const g = imageBuffer[offset + 1];
        const b = imageBuffer[offset + 2];

        if (Math.abs(r - targetR) <= tolerance &&
            Math.abs(g - targetG) <= tolerance &&
            Math.abs(b - targetB) <= tolerance) {
          matchCount++;
        }
      }
    }

    const percentage = (matchCount / totalPixels) * 100;
    const threshold = 10;

    return {
      found: percentage > threshold,
      confidence: Math.min(percentage / 50, 1.0),
      region: percentage > threshold ? region : undefined,
    };
  }

  detectAllButtons(
    imageBuffer: Buffer,
    imageWidth: number,
    imageHeight: number,
    searchRegion: ScreenRegion,
    channels: number = 4
  ): Array<{ type: string; confidence: number; region: ScreenRegion }> {
    const buttons: Array<{ type: string; confidence: number; region: ScreenRegion }> = [];

    const buttonWidth = Math.floor(searchRegion.width / 4);
    const buttonHeight = Math.floor(searchRegion.height);

    for (let i = 0; i < 4; i++) {
      const buttonRegion: ScreenRegion = {
        x: searchRegion.x + i * buttonWidth,
        y: searchRegion.y,
        width: buttonWidth,
        height: buttonHeight,
      };

      for (const buttonType of Object.keys(BUTTON_PATTERNS) as Array<keyof typeof BUTTON_PATTERNS>) {
        const result = this.matchButton(imageBuffer, imageWidth, imageHeight, buttonRegion, buttonType, channels);
        
        if (result.found && result.confidence > 0.3) {
          buttons.push({
            type: buttonType,
            confidence: result.confidence,
            region: buttonRegion,
          });
          break;
        }
      }
    }

    return buttons;
  }

  createTemplateFromImage(
    imageBuffer: Buffer,
    imageWidth: number,
    imageHeight: number,
    region: ScreenRegion,
    name: string,
    channels: number = 4
  ): Template {
    const grayscale = new Uint8Array(region.width * region.height);

    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const srcX = region.x + x;
        const srcY = region.y + y;
        
        if (srcX >= 0 && srcX < imageWidth && srcY >= 0 && srcY < imageHeight) {
          const offset = (srcY * imageWidth + srcX) * channels;
          const r = imageBuffer[offset];
          const g = imageBuffer[offset + 1];
          const b = imageBuffer[offset + 2];
          grayscale[y * region.width + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        }
      }
    }

    return {
      name,
      width: region.width,
      height: region.height,
      data: grayscale,
    };
  }
}

function toGrayscale(
  imageBuffer: Buffer,
  width: number,
  height: number,
  channels: number = 4
): Uint8Array {
  const grayscale = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * channels;
      const r = imageBuffer[srcOffset];
      const g = imageBuffer[srcOffset + 1];
      const b = imageBuffer[srcOffset + 2];
      grayscale[y * width + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  return grayscale;
}

export const templateMatcher = new TemplateMatcher();
