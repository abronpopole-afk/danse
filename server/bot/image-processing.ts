import { ScreenRegion } from "./platform-adapter";

export interface RGBPixel {
  r: number;
  g: number;
  b: number;
}

export interface HSVPixel {
  h: number;
  s: number;
  v: number;
}

export interface ProcessedImage {
  width: number;
  height: number;
  data: Buffer;
  grayscale?: Buffer;
  hsv?: Float32Array;
}

export interface ImageProcessingConfig {
  blurRadius: number;
  contrastFactor: number;
  thresholdValue: number;
  adaptiveThreshold: boolean;
  noiseReductionLevel: "low" | "medium" | "high";
  useOtsuThreshold: boolean;
  useCLAHE: boolean;
  sharpenAmount: number;
}

export const DEFAULT_PROCESSING_CONFIG: ImageProcessingConfig = {
  blurRadius: 1,
  contrastFactor: 1.2,
  thresholdValue: 128,
  adaptiveThreshold: true,
  noiseReductionLevel: "medium",
  useOtsuThreshold: false,
  useCLAHE: false,
  sharpenAmount: 1.2,
};

export const OCR_OPTIMIZED_CONFIG: ImageProcessingConfig = {
  blurRadius: 0,
  contrastFactor: 1.5,
  thresholdValue: 0,
  adaptiveThreshold: false,
  noiseReductionLevel: "medium",
  useOtsuThreshold: true,
  useCLAHE: false,
  sharpenAmount: 1.5,
};

export const CARD_TEXT_CONFIG: ImageProcessingConfig = {
  blurRadius: 0,
  contrastFactor: 1.3,
  thresholdValue: 0,
  adaptiveThreshold: true,
  noiseReductionLevel: "medium",
  useOtsuThreshold: false,
  useCLAHE: false,
  sharpenAmount: 1.0,
};

export function rgbToHsv(r: number, g: number, b: number): HSVPixel {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const v = max;

  if (delta !== 0) {
    s = delta / max;

    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, v };
}

export function hsvToRgb(h: number, s: number, v: number): RGBPixel {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function extractRegion(
  imageBuffer: Buffer,
  imageWidth: number,
  region: ScreenRegion,
  channels: number = 4,
  imageHeight?: number
): Buffer {
  // Calcul de la hauteur de l'image source si non fournie
  const srcHeight = imageHeight ?? Math.floor(imageBuffer.length / (imageWidth * channels));
  
  // VALIDATION DES BORNES - Correction des coordonnées hors limites
  const safeX = Math.max(0, Math.min(region.x, imageWidth - 1));
  const safeY = Math.max(0, Math.min(region.y, srcHeight - 1));
  const safeWidth = Math.max(1, Math.min(region.width, imageWidth - safeX));
  const safeHeight = Math.max(1, Math.min(region.height, srcHeight - safeY));
  
  // Log si correction appliquée
  if (safeX !== region.x || safeY !== region.y || safeWidth !== region.width || safeHeight !== region.height) {
    console.warn(`[extractRegion] Correction bornes: (${region.x},${region.y},${region.width},${region.height}) -> (${safeX},${safeY},${safeWidth},${safeHeight}) [image: ${imageWidth}x${srcHeight}]`);
  }
  
  // Vérification si région valide
  if (safeWidth <= 0 || safeHeight <= 0) {
    console.error(`[extractRegion] Région invalide après correction: ${safeWidth}x${safeHeight}`);
    return Buffer.alloc(channels); // Retourne un pixel transparent
  }
  
  const regionBuffer = Buffer.alloc(safeWidth * safeHeight * channels);

  for (let y = 0; y < safeHeight; y++) {
    for (let x = 0; x < safeWidth; x++) {
      const srcOffset = ((safeY + y) * imageWidth + (safeX + x)) * channels;
      const dstOffset = (y * safeWidth + x) * channels;

      // Vérification que srcOffset est dans les limites du buffer
      if (srcOffset >= 0 && srcOffset + channels <= imageBuffer.length) {
        for (let c = 0; c < channels; c++) {
          regionBuffer[dstOffset + c] = imageBuffer[srcOffset + c] || 0;
        }
      }
    }
  }

  return regionBuffer;
}

export function applyGaussianBlur(
  imageBuffer: Buffer,
  width: number,
  height: number,
  radius: number = 1,
  channels: number = 4
): Buffer {
  if (radius <= 0) return Buffer.from(imageBuffer);

  const kernelSize = radius * 2 + 1;
  const kernel = generateGaussianKernel(kernelSize);
  const result = Buffer.alloc(imageBuffer.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < Math.min(channels, 3); c++) {
        let sum = 0;
        let weightSum = 0;

        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const px = Math.min(Math.max(x + kx, 0), width - 1);
            const py = Math.min(Math.max(y + ky, 0), height - 1);
            const weight = kernel[(ky + radius) * kernelSize + (kx + radius)];
            const offset = (py * width + px) * channels + c;
            sum += imageBuffer[offset] * weight;
            weightSum += weight;
          }
        }

        const dstOffset = (y * width + x) * channels + c;
        result[dstOffset] = Math.round(sum / weightSum);
      }

      if (channels === 4) {
        const alphaOffset = (y * width + x) * channels + 3;
        result[alphaOffset] = imageBuffer[alphaOffset];
      }
    }
  }

  return result;
}

function generateGaussianKernel(size: number): number[] {
  const kernel: number[] = [];
  const sigma = size / 6;
  const center = Math.floor(size / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      kernel.push(weight);
    }
  }

  return kernel;
}

export function applyContrastStretching(
  imageBuffer: Buffer,
  width: number,
  height: number,
  factor: number = 1.5,
  channels: number = 4
): Buffer {
  const result = Buffer.alloc(imageBuffer.length);

  let minVal = 255;
  let maxVal = 0;
  for (let i = 0; i < imageBuffer.length; i += channels) {
    for (let c = 0; c < Math.min(channels, 3); c++) {
      const val = imageBuffer[i + c];
      minVal = Math.min(minVal, val);
      maxVal = Math.max(maxVal, val);
    }
  }

  const range = maxVal - minVal || 1;
  const midpoint = 128;

  for (let i = 0; i < imageBuffer.length; i += channels) {
    for (let c = 0; c < Math.min(channels, 3); c++) {
      const normalized = (imageBuffer[i + c] - minVal) / range;
      const stretched = (normalized - 0.5) * factor + 0.5;
      result[i + c] = Math.round(Math.min(255, Math.max(0, stretched * 255)));
    }
    if (channels === 4) {
      result[i + 3] = imageBuffer[i + 3];
    }
  }

  return result;
}

export function applyUnsharpMask(
  imageBuffer: Buffer,
  width: number,
  height: number,
  amount: number = 1.5,
  radius: number = 1,
  channels: number = 4
): Buffer {
  const blurred = applyGaussianBlur(imageBuffer, width, height, radius, channels);
  const result = Buffer.alloc(imageBuffer.length);

  for (let i = 0; i < imageBuffer.length; i += channels) {
    for (let c = 0; c < Math.min(channels, 3); c++) {
      const original = imageBuffer[i + c];
      const blur = blurred[i + c];
      const sharpened = original + amount * (original - blur);
      result[i + c] = Math.round(Math.min(255, Math.max(0, sharpened)));
    }
    if (channels === 4) {
      result[i + 3] = imageBuffer[i + 3];
    }
  }

  return result;
}

export function applyCLAHE(
  imageBuffer: Buffer,
  width: number,
  height: number,
  tileSize: number = 8,
  clipLimit: number = 2.0,
  channels: number = 4
): Buffer {
  const grayscale = toGrayscale(imageBuffer, width, height, channels);
  const result = Buffer.alloc(imageBuffer.length);
  
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  
  const tileCDFs: Float32Array[][] = [];
  
  for (let ty = 0; ty < tilesY; ty++) {
    tileCDFs[ty] = [];
    
    for (let tx = 0; tx < tilesX; tx++) {
      const histogram = new Uint32Array(256);
      let pixelCount = 0;
      
      const startX = tx * tileSize;
      const startY = ty * tileSize;
      const endX = Math.min(startX + tileSize, width);
      const endY = Math.min(startY + tileSize, height);
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          histogram[grayscale[y * width + x]]++;
          pixelCount++;
        }
      }
      
      if (pixelCount === 0) {
        tileCDFs[ty][tx] = new Float32Array(256).fill(0);
        continue;
      }
      
      const clipValue = Math.floor(clipLimit * pixelCount / 256);
      let excess = 0;
      
      for (let i = 0; i < 256; i++) {
        if (histogram[i] > clipValue) {
          excess += histogram[i] - clipValue;
          histogram[i] = clipValue;
        }
      }
      
      const redistribute = Math.floor(excess / 256);
      for (let i = 0; i < 256; i++) {
        histogram[i] += redistribute;
      }
      
      const cdf = new Float32Array(256);
      cdf[0] = histogram[0] / pixelCount;
      for (let i = 1; i < 256; i++) {
        cdf[i] = cdf[i - 1] + histogram[i] / pixelCount;
      }
      
      tileCDFs[ty][tx] = cdf;
    }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * channels;
      const grayVal = grayscale[y * width + x];
      
      const txCenter = (x + 0.5) / tileSize - 0.5;
      const tyCenter = (y + 0.5) / tileSize - 0.5;
      
      const tx0 = Math.max(0, Math.floor(txCenter));
      const ty0 = Math.max(0, Math.floor(tyCenter));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const ty1 = Math.min(tilesY - 1, ty0 + 1);
      
      const xRatio = Math.max(0, Math.min(1, txCenter - tx0));
      const yRatio = Math.max(0, Math.min(1, tyCenter - ty0));
      
      const v00 = tileCDFs[ty0][tx0][grayVal];
      const v10 = tileCDFs[ty0][tx1][grayVal];
      const v01 = tileCDFs[ty1][tx0][grayVal];
      const v11 = tileCDFs[ty1][tx1][grayVal];
      
      const top = v00 * (1 - xRatio) + v10 * xRatio;
      const bottom = v01 * (1 - xRatio) + v11 * xRatio;
      const interpolated = top * (1 - yRatio) + bottom * yRatio;
      
      const enhanced = Math.round(interpolated * 255);
      
      result[srcOffset] = enhanced;
      result[srcOffset + 1] = enhanced;
      result[srcOffset + 2] = enhanced;
      
      if (channels === 4) {
        result[srcOffset + 3] = imageBuffer[srcOffset + 3];
      }
    }
  }
  
  return result;
}

export function applyOtsuThreshold(
  imageBuffer: Buffer,
  width: number,
  height: number,
  channels: number = 4
): Buffer {
  const grayscale = toGrayscale(imageBuffer, width, height, channels);
  
  const histogram = new Uint32Array(256);
  for (let i = 0; i < grayscale.length; i++) {
    histogram[grayscale[i]]++;
  }
  
  const threshold = calculateOtsuThreshold(histogram);
  
  return applyThreshold(imageBuffer, width, height, threshold, channels);
}

export function applyThreshold(
  imageBuffer: Buffer,
  width: number,
  height: number,
  threshold: number = 128,
  channels: number = 4
): Buffer {
  const result = Buffer.alloc(imageBuffer.length);

  for (let i = 0; i < imageBuffer.length; i += channels) {
    const r = imageBuffer[i];
    const g = imageBuffer[i + 1];
    const b = imageBuffer[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const binary = gray > threshold ? 255 : 0;

    result[i] = binary;
    result[i + 1] = binary;
    result[i + 2] = binary;
    if (channels === 4) {
      result[i + 3] = imageBuffer[i + 3];
    }
  }

  return result;
}

export function applyAdaptiveThreshold(
  imageBuffer: Buffer,
  width: number,
  height: number,
  blockSize: number = 11,
  c: number = 2,
  channels: number = 4
): Buffer {
  const grayscale = toGrayscale(imageBuffer, width, height, channels);
  const result = Buffer.alloc(imageBuffer.length);
  const halfBlock = Math.floor(blockSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let ky = -halfBlock; ky <= halfBlock; ky++) {
        for (let kx = -halfBlock; kx <= halfBlock; kx++) {
          const px = Math.min(Math.max(x + kx, 0), width - 1);
          const py = Math.min(Math.max(y + ky, 0), height - 1);
          sum += grayscale[py * width + px];
          count++;
        }
      }

      const mean = sum / count;
      const threshold = mean - c;
      const pixelGray = grayscale[y * width + x];
      const binary = pixelGray > threshold ? 255 : 0;

      const dstOffset = (y * width + x) * channels;
      result[dstOffset] = binary;
      result[dstOffset + 1] = binary;
      result[dstOffset + 2] = binary;
      if (channels === 4) {
        result[dstOffset + 3] = imageBuffer[dstOffset + 3];
      }
    }
  }

  return result;
}

export function toGrayscale(
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

export function toHSV(
  imageBuffer: Buffer,
  width: number,
  height: number,
  channels: number = 4
): Float32Array {
  const hsv = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * channels;
      const r = imageBuffer[srcOffset];
      const g = imageBuffer[srcOffset + 1];
      const b = imageBuffer[srcOffset + 2];
      const pixel = rgbToHsv(r, g, b);

      const dstOffset = (y * width + x) * 3;
      hsv[dstOffset] = pixel.h;
      hsv[dstOffset + 1] = pixel.s;
      hsv[dstOffset + 2] = pixel.v;
    }
  }

  return hsv;
}

export function applyMorphologicalOperation(
  imageBuffer: Buffer,
  width: number,
  height: number,
  operation: "dilate" | "erode" | "open" | "close",
  kernelSize: number = 3,
  channels: number = 4
): Buffer {
  const grayscale = toGrayscale(imageBuffer, width, height, channels);
  let result = new Uint8Array(grayscale);
  const halfKernel = Math.floor(kernelSize / 2);

  const erode = (input: Uint8Array): Uint8Array => {
    const output = new Uint8Array(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minVal = 255;
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const px = Math.min(Math.max(x + kx, 0), width - 1);
            const py = Math.min(Math.max(y + ky, 0), height - 1);
            minVal = Math.min(minVal, input[py * width + px]);
          }
        }
        output[y * width + x] = minVal;
      }
    }
    return output;
  };

  const dilate = (input: Uint8Array): Uint8Array => {
    const output = new Uint8Array(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxVal = 0;
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const px = Math.min(Math.max(x + kx, 0), width - 1);
            const py = Math.min(Math.max(y + ky, 0), height - 1);
            maxVal = Math.max(maxVal, input[py * width + px]);
          }
        }
        output[y * width + x] = maxVal;
      }
    }
    return output;
  };

  switch (operation) {
    case "erode":
      result = erode(result);
      break;
    case "dilate":
      result = dilate(result);
      break;
    case "open":
      result = dilate(erode(result));
      break;
    case "close":
      result = erode(dilate(result));
      break;
  }

  const outputBuffer = Buffer.alloc(imageBuffer.length);
  for (let i = 0; i < width * height; i++) {
    const srcOffset = i * channels;
    outputBuffer[srcOffset] = result[i];
    outputBuffer[srcOffset + 1] = result[i];
    outputBuffer[srcOffset + 2] = result[i];
    if (channels === 4) {
      outputBuffer[srcOffset + 3] = imageBuffer[srcOffset + 3];
    }
  }

  return outputBuffer;
}

export function preprocessForOCR(
  imageBuffer: Buffer,
  width: number,
  height: number,
  config: ImageProcessingConfig = DEFAULT_PROCESSING_CONFIG,
  channels: number = 4
): Buffer {
  let processed = Buffer.from(imageBuffer);

  if (config.sharpenAmount > 0) {
    processed = applyUnsharpMask(processed, width, height, config.sharpenAmount, 1, channels);
  }

  if (config.useCLAHE) {
    processed = applyCLAHE(processed, width, height, 8, 2.5, channels);
  } else if (config.contrastFactor !== 1.0) {
    processed = applyContrastStretching(processed, width, height, config.contrastFactor, channels);
  }

  if (config.blurRadius > 0) {
    processed = applyGaussianBlur(processed, width, height, config.blurRadius, channels);
  }

  if (config.adaptiveThreshold) {
    const blockSize = config.noiseReductionLevel === "high" ? 15 : 
                      config.noiseReductionLevel === "medium" ? 11 : 7;
    processed = applyAdaptiveThreshold(processed, width, height, blockSize, 2, channels);
  } else if (config.useOtsuThreshold) {
    processed = applyOtsuThreshold(processed, width, height, channels);
  } else {
    processed = applyThreshold(processed, width, height, config.thresholdValue, channels);
  }

  if (config.noiseReductionLevel !== "low") {
    processed = applyMorphologicalOperation(processed, width, height, "close", 3, channels);
    processed = applyMorphologicalOperation(processed, width, height, "open", 3, channels);
  }

  return processed;
}

export interface HSVColorRange {
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
}

export const POKER_SUIT_HSV_RANGES: Record<string, HSVColorRange> = {
  hearts: {
    hMin: 340, hMax: 360,
    sMin: 0.4, sMax: 1.0,
    vMin: 0.3, vMax: 1.0,
  },
  hearts_alt: {
    hMin: 0, hMax: 20,
    sMin: 0.4, sMax: 1.0,
    vMin: 0.3, vMax: 1.0,
  },
  diamonds: {
    hMin: 340, hMax: 360,
    sMin: 0.4, sMax: 1.0,
    vMin: 0.3, vMax: 1.0,
  },
  diamonds_alt: {
    hMin: 0, hMax: 25,
    sMin: 0.4, sMax: 1.0,
    vMin: 0.3, vMax: 1.0,
  },
  clubs: {
    hMin: 0, hMax: 360,
    sMin: 0, sMax: 0.15,
    vMin: 0, vMax: 0.35,
  },
  spades: {
    hMin: 0, hMax: 360,
    sMin: 0, sMax: 0.15,
    vMin: 0, vMax: 0.35,
  },
};

export function detectColorHSV(
  imageBuffer: Buffer,
  width: number,
  height: number,
  region: ScreenRegion,
  colorRange: HSVColorRange,
  channels: number = 4
): { matchCount: number; percentage: number; centroid: { x: number; y: number } } {
  let matchCount = 0;
  let sumX = 0;
  let sumY = 0;
  const totalPixels = region.width * region.height;

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const offset = (y * width + x) * channels;
      const r = imageBuffer[offset];
      const g = imageBuffer[offset + 1];
      const b = imageBuffer[offset + 2];
      const hsv = rgbToHsv(r, g, b);

      let hMatch = false;
      if (colorRange.hMin <= colorRange.hMax) {
        hMatch = hsv.h >= colorRange.hMin && hsv.h <= colorRange.hMax;
      } else {
        hMatch = hsv.h >= colorRange.hMin || hsv.h <= colorRange.hMax;
      }

      const sMatch = hsv.s >= colorRange.sMin && hsv.s <= colorRange.sMax;
      const vMatch = hsv.v >= colorRange.vMin && hsv.v <= colorRange.vMax;

      if (hMatch && sMatch && vMatch) {
        matchCount++;
        sumX += x - region.x;
        sumY += y - region.y;
      }
    }
  }

  return {
    matchCount,
    percentage: (matchCount / totalPixels) * 100,
    centroid: matchCount > 0 
      ? { x: sumX / matchCount, y: sumY / matchCount }
      : { x: region.width / 2, y: region.height / 2 },
  };
}

export function detectSuitByHSV(
  imageBuffer: Buffer,
  width: number,
  height: number,
  region: ScreenRegion,
  channels: number = 4,
  useMultiMethod: boolean = true
): { suit: string | null; confidence: number; methods: string[] } {
  const results: Array<{ suit: string; score: number; method: string }> = [];
  const methodsUsed: string[] = [];

  const processedImageBuffer = preprocessForOCR(imageBuffer, width, height, {
    blurRadius: 1,
    contrastFactor: 1.5,
    thresholdValue: 128,
    adaptiveThreshold: true,
    noiseReductionLevel: "medium",
    useOtsuThreshold: false,
    useCLAHE: false,
    sharpenAmount: 1.0,
  }, channels);

  const heartsResult = detectColorHSV(processedImageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.hearts, channels);
  const heartsAltResult = detectColorHSV(processedImageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.hearts_alt, channels);
  const heartsTotal = heartsResult.percentage + heartsAltResult.percentage;

  const diamondsResult = detectColorHSV(processedImageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.diamonds, channels);
  const diamondsAltResult = detectColorHSV(processedImageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.diamonds_alt, channels);
  const diamondsTotal = diamondsResult.percentage + diamondsAltResult.percentage;

  const clubsResult = detectColorHSV(processedImageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.clubs, channels);
  const spadesResult = detectColorHSV(processedImageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.spades, channels);

  const redThreshold = 5;
  const blackThreshold = 10;

  if (heartsTotal > redThreshold) {
    results.push({ suit: "hearts", score: heartsTotal });
  }
  if (diamondsTotal > redThreshold) {
    results.push({ suit: "diamonds", score: diamondsTotal });
  }
  if (clubsResult.percentage > blackThreshold) {
    results.push({ suit: "clubs", score: clubsResult.percentage });
  }
  if (spadesResult.percentage > blackThreshold) {
    results.push({ suit: "spades", score: spadesResult.percentage });
  }

  if (results.length === 0) {
    return { suit: null, confidence: 0 };
  }

  results.sort((a, b) => b.score - a.score);

  if (results.length >= 2 && 
      (results[0].suit === "hearts" || results[0].suit === "diamonds") &&
      (results[1].suit === "hearts" || results[1].suit === "diamonds")) {
    const shapeScore = analyzeShapeForSuit(imageBuffer, width, height, region, channels);
    if (shapeScore.preferredSuit) {
      return { suit: shapeScore.preferredSuit, confidence: shapeScore.confidence };
    }
  }

  if (results.length >= 2 && 
      (results[0].suit === "clubs" || results[0].suit === "spades") &&
      (results[1].suit === "clubs" || results[1].suit === "spades")) {
    const shapeScore = analyzeShapeForSuit(imageBuffer, width, height, region, channels);
    if (shapeScore.preferredSuit) {
      return { suit: shapeScore.preferredSuit, confidence: shapeScore.confidence };
    }
  }

  methodsUsed.push('hsv_primary');
  
  // Fallback: Raw color matching (no preprocessing)
  if (useMultiMethod && (results.length === 0 || results[0].score < 15)) {
    methodsUsed.push('raw_color_fallback');
    
    const rawRed = detectColorHSV(imageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.hearts, channels);
    const rawRedAlt = detectColorHSV(imageBuffer, width, height, region, POKER_SUIT_HSV_RANGES.hearts_alt, channels);
    const totalRed = rawRed.percentage + rawRedAlt.percentage;
    
    if (totalRed > 8) {
      results.push({ suit: "hearts", score: totalRed, method: "raw_color" });
    }
  }
  
  if (results.length === 0) {
    return { suit: null, confidence: 0, methods: methodsUsed };
  }
  
  // Sort by score
  results.sort((a, b) => b.score - a.score);
  
  return { 
    suit: results[0].suit, 
    confidence: Math.min(results[0].score / 20, 1.0),
    methods: methodsUsed
  };
}

function analyzeShapeForSuit(
  imageBuffer: Buffer,
  width: number,
  height: number,
  region: ScreenRegion,
  channels: number
): { preferredSuit: string | null; confidence: number } {
  const grayscale = toGrayscale(
    extractRegion(imageBuffer, width, region, channels),
    region.width,
    region.height,
    channels
  );

  const threshold = 128;
  let topPixels = 0;
  let bottomPixels = 0;
  const midY = Math.floor(region.height / 2);

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      if (grayscale[y * region.width + x] < threshold) {
        if (y < midY) topPixels++;
        else bottomPixels++;
      }
    }
  }

  const ratio = topPixels / (bottomPixels || 1);

  if (ratio > 1.5) {
    return { preferredSuit: "spades", confidence: 0.7 };
  } else if (ratio < 0.7) {
    return { preferredSuit: "hearts", confidence: 0.7 };
  }

  return { preferredSuit: null, confidence: 0 };
}

export function getHistogram(
  imageBuffer: Buffer,
  width: number,
  height: number,
  region: ScreenRegion,
  channel: "r" | "g" | "b" | "gray" = "gray",
  channels: number = 4
): Uint32Array {
  const histogram = new Uint32Array(256);

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const offset = (y * width + x) * channels;
      let value: number;

      switch (channel) {
        case "r":
          value = imageBuffer[offset];
          break;
        case "g":
          value = imageBuffer[offset + 1];
          break;
        case "b":
          value = imageBuffer[offset + 2];
          break;
        default:
          value = Math.round(
            0.299 * imageBuffer[offset] +
            0.587 * imageBuffer[offset + 1] +
            0.114 * imageBuffer[offset + 2]
          );
      }

      histogram[value]++;
    }
  }

  return histogram;
}

export function calculateOtsuThreshold(histogram: Uint32Array): number {
  const total = histogram.reduce((sum, val) => sum + val, 0);

  let sumB = 0;
  let wB = 0;
  let maximum = 0;
  let level = 0;
  let sum1 = 0;

  for (let i = 0; i < 256; i++) {
    sum1 += i * histogram[i];
  }

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];

    const mB = sumB / wB;
    const mF = (sum1 - sumB) / wF;

    const between = wB * wF * (mB - mF) * (mB - mF);

    if (between > maximum) {
      maximum = between;
      level = i;
    }
  }

  return level;
}

export class ImageProcessor {
  private config: ImageProcessingConfig;
  private debugMode: boolean = false;
  private debugBuffer: Array<{ name: string; data: Buffer; width: number; height: number }> = [];

  constructor(config: ImageProcessingConfig = DEFAULT_PROCESSING_CONFIG) {
    this.config = config;
  }

  setConfig(config: Partial<ImageProcessingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  enableDebugMode(enabled: boolean = true): void {
    this.debugMode = enabled;
    if (!enabled) {
      this.debugBuffer = [];
    }
  }

  getDebugImages(): Array<{ name: string; data: Buffer; width: number; height: number }> {
    return this.debugBuffer;
  }

  clearDebugBuffer(): void {
    this.debugBuffer = [];
  }

  processForCardRecognition(
    imageBuffer: Buffer,
    width: number,
    height: number,
    region: ScreenRegion,
    channels: number = 4
  ): ProcessedImage {
    const extracted = extractRegion(imageBuffer, width, region, channels);

    if (this.debugMode) {
      this.debugBuffer.push({ 
        name: "01_extracted", 
        data: Buffer.from(extracted), 
        width: region.width, 
        height: region.height 
      });
    }

    let processed = applyGaussianBlur(extracted, region.width, region.height, 1, channels);

    if (this.debugMode) {
      this.debugBuffer.push({ 
        name: "02_blurred", 
        data: Buffer.from(processed), 
        width: region.width, 
        height: region.height 
      });
    }

    processed = applyContrastStretching(processed, region.width, region.height, 1.3, channels);

    if (this.debugMode) {
      this.debugBuffer.push({ 
        name: "03_contrast", 
        data: Buffer.from(processed), 
        width: region.width, 
        height: region.height 
      });
    }

    const grayscale = toGrayscale(processed, region.width, region.height, channels);
    const histogram = getHistogram(processed, region.width, region.height, 
      { x: 0, y: 0, width: region.width, height: region.height }, "gray", channels);
    const optimalThreshold = calculateOtsuThreshold(histogram);

    processed = applyThreshold(processed, region.width, region.height, optimalThreshold, channels);

    if (this.debugMode) {
      this.debugBuffer.push({ 
        name: "04_threshold", 
        data: Buffer.from(processed), 
        width: region.width, 
        height: region.height 
      });
    }

    processed = applyMorphologicalOperation(processed, region.width, region.height, "close", 3, channels);

    if (this.debugMode) {
      this.debugBuffer.push({ 
        name: "05_morphology", 
        data: Buffer.from(processed), 
        width: region.width, 
        height: region.height 
      });
    }

    const hsv = toHSV(extracted, region.width, region.height, channels);

    return {
      width: region.width,
      height: region.height,
      data: processed,
      grayscale: Buffer.from(grayscale),
      hsv,
    };
  }

  detectSuit(
    imageBuffer: Buffer,
    width: number,
    height: number,
    region: ScreenRegion,
    channels: number = 4
  ): { suit: string | null; confidence: number } {
    return detectSuitByHSV(imageBuffer, width, height, region, channels);
  }
}

export const imageProcessor = new ImageProcessor();