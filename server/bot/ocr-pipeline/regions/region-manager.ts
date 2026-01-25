import { logger } from "../../../logger";
import type { Region, RegionType, Bounds, ProcessingHints } from '../types';

export interface RegionTemplate {
  name: string;
  type: RegionType;
  relativeBounds: RelativeBounds;
  priority: number;
  processingHints?: ProcessingHints;
}

export interface RelativeBounds {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export class RegionManager {
  private regions: Map<string, Region> = new Map();
  private templates: Map<string, RegionTemplate> = new Map();
  private frameWidth: number = 0;
  private frameHeight: number = 0;

  constructor() {
    this.initializeDefaultTemplates();
  }

  private initializeDefaultTemplates(): void {
    const defaultTemplates: RegionTemplate[] = [
      {
        name: 'hero_cards',
        type: 'cards',
        relativeBounds: { xPercent: 0.40, yPercent: 0.73, widthPercent: 0.20, heightPercent: 0.15 },
        priority: 100,
        processingHints: { expectedCharset: 'cards', minConfidence: 0.8 },
      },
      {
        name: 'community_cards',
        type: 'community_cards',
        relativeBounds: { xPercent: 0.25, yPercent: 0.38, widthPercent: 0.50, heightPercent: 0.15 },
        priority: 95,
        processingHints: { expectedCharset: 'cards', minConfidence: 0.8 },
      },
      {
        name: 'pot_total',
        type: 'pot',
        relativeBounds: { xPercent: 0.35, yPercent: 0.28, widthPercent: 0.30, heightPercent: 0.10 },
        priority: 90,
        processingHints: { expectedCharset: 'currency', preprocessing: ['contrast_enhance'] },
      },
      {
        name: 'hero_stack',
        type: 'player_stack',
        relativeBounds: { xPercent: 0.38, yPercent: 0.84, widthPercent: 0.24, heightPercent: 0.08 },
        priority: 85,
        processingHints: { expectedCharset: 'currency' },
      },
      {
        name: 'action_buttons',
        type: 'action_buttons',
        relativeBounds: { xPercent: 0.55, yPercent: 0.83, widthPercent: 0.43, heightPercent: 0.12 },
        priority: 80,
        processingHints: { expectedCharset: 'alphanumeric' },
      },
      {
        name: 'bet_amount_input',
        type: 'bet_amount',
        relativeBounds: { xPercent: 0.63, yPercent: 0.78, widthPercent: 0.18, heightPercent: 0.06 },
        priority: 75,
        processingHints: { expectedCharset: 'numeric' },
      },
      {
        name: 'timer',
        type: 'timer',
        relativeBounds: { xPercent: 0.46, yPercent: 0.66, widthPercent: 0.08, heightPercent: 0.06 },
        priority: 70,
        processingHints: { expectedCharset: 'numeric' },
      },
    ];

    for (let i = 0; i < 6; i++) {
      const angle = (i * 60 - 90) * (Math.PI / 180);
      const radius = 0.35;
      const centerX = 0.5 + radius * Math.cos(angle);
      const centerY = 0.5 + radius * Math.sin(angle);

      defaultTemplates.push({
        name: `player_${i}_stack`,
        type: 'player_stack',
        relativeBounds: { 
          xPercent: centerX - 0.08, 
          yPercent: centerY + 0.04, 
          widthPercent: 0.16, 
          heightPercent: 0.05 
        },
        priority: 60 - i,
        processingHints: { expectedCharset: 'currency' },
      });

      defaultTemplates.push({
        name: `player_${i}_name`,
        type: 'player_name',
        relativeBounds: { 
          xPercent: centerX - 0.10, 
          yPercent: centerY - 0.03, 
          widthPercent: 0.20, 
          heightPercent: 0.05 
        },
        priority: 50 - i,
        processingHints: { expectedCharset: 'alphanumeric' },
      });
    }

    for (const template of defaultTemplates) {
      this.templates.set(template.name, template);
    }
  }

  setFrameSize(width: number, height: number): void {
    this.frameWidth = width;
    this.frameHeight = height;
    this.recalculateRegions();
  }

  private recalculateRegions(): void {
    this.regions.clear();

    for (const [name, template] of this.templates) {
      const bounds = this.relativeToBounds(template.relativeBounds);
      const region: Region = {
        id: name,
        name: template.name,
        type: template.type,
        bounds,
        priority: template.priority,
        processingHints: template.processingHints,
      };
      this.regions.set(name, region);
    }
  }

  private relativeToBounds(relative: RelativeBounds): Bounds {
    const x = Math.round(relative.xPercent * this.frameWidth);
    const y = Math.round(relative.yPercent * this.frameHeight);
    const width = Math.round(relative.widthPercent * this.frameWidth);
    const height = Math.round(relative.heightPercent * this.frameHeight);
    
    // Log pour debug renforcé
    logger.info('RegionManager', `📐 Calcul bounds: rel(${relative.xPercent}, ${relative.yPercent}, ${relative.widthPercent}, ${relative.heightPercent}) * frame(${this.frameWidth}x${this.frameHeight}) => abs(${x}, ${y}, ${width}, ${height})`);

    if (width < 20 || height < 20) {
      logger.warning('RegionManager', `⚠️ Region calculée minuscule: ${width}x${height} (frame: ${this.frameWidth}x${this.frameHeight})`);
    }

    return { x, y, width, height };
  }

  getRegion(id: string): Region | undefined {
    return this.regions.get(id);
  }

  getRegionsByType(type: RegionType): Region[] {
    return Array.from(this.regions.values()).filter(r => r.type === type);
  }

  getRegionsByPriority(minPriority: number = 0): Region[] {
    return Array.from(this.regions.values())
      .filter(r => r.priority >= minPriority)
      .sort((a, b) => b.priority - a.priority);
  }

  getAllRegions(): Region[] {
    return Array.from(this.regions.values());
  }

  addCustomRegion(region: Region): void {
    this.regions.set(region.id, region);
  }

  addCustomTemplate(template: RegionTemplate): void {
    this.templates.set(template.name, template);
    if (this.frameWidth > 0 && this.frameHeight > 0) {
      const bounds = this.relativeToBounds(template.relativeBounds);
      const region: Region = {
        id: template.name,
        name: template.name,
        type: template.type,
        bounds,
        priority: template.priority,
        processingHints: template.processingHints,
      };
      this.regions.set(template.name, region);
    }
  }

  removeRegion(id: string): boolean {
    this.templates.delete(id);
    return this.regions.delete(id);
  }

  updateRegionBounds(id: string, bounds: Partial<Bounds>): void {
    const region = this.regions.get(id);
    if (region) {
      region.bounds = { ...region.bounds, ...bounds };
    }
  }

  cropRegionFromFrame(frame: Buffer, region: Region, bytesPerPixel: number = 4): Buffer {
    const { x, y, width, height } = region.bounds;
    const rowStride = this.frameWidth * bytesPerPixel;
    const croppedBuffer = Buffer.alloc(width * height * bytesPerPixel);

    for (let row = 0; row < height; row++) {
      const srcOffset = (y + row) * rowStride + x * bytesPerPixel;
      const dstOffset = row * width * bytesPerPixel;
      frame.copy(croppedBuffer, dstOffset, srcOffset, srcOffset + width * bytesPerPixel);
    }

    return croppedBuffer;
  }

  exportTemplates(): RegionTemplate[] {
    return Array.from(this.templates.values());
  }

  importTemplates(templates: RegionTemplate[]): void {
    for (const template of templates) {
      this.templates.set(template.name, template);
    }
    if (this.frameWidth > 0 && this.frameHeight > 0) {
      this.recalculateRegions();
    }
  }
}
