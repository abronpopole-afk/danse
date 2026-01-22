import { FrameBuffer, FrameDiffDetector, KeyframeDetector } from './frames';
import { FrameNormalizer, type NormalizationConfig } from './normalization';
import { RegionManager } from './regions';
import { FallbackManager, type FallbackConfig } from './fallback-manager';
import { 
  OnnxAdapterFactory, 
  MockAdapterFactory 
} from './adapters';
import type { 
  Frame, 
  NormalizedFrame, 
  Region, 
  OCRResult, 
  OCRBatchResult,
  PokerTableState,
  RegionType
} from './types';

export interface OCRPipelineConfig {
  frameBufferSize?: number;
  diffThreshold?: number;
  normalization?: NormalizationConfig;
  fallback?: Partial<FallbackConfig>;
  useMockAdapter?: boolean;
  enableCaching?: boolean;
  cacheMaxSize?: number;
  cacheTTLMs?: number;
}

const DEFAULT_CONFIG: OCRPipelineConfig = {
  frameBufferSize: 30,
  diffThreshold: 0.05,
  useMockAdapter: false,
  enableCaching: true,
  cacheMaxSize: 100,
  cacheTTLMs: 5000,
};

export class OCRPipeline {
  private frameBuffer: FrameBuffer;
  private diffDetector: FrameDiffDetector;
  private keyframeDetector: KeyframeDetector;
  private normalizer: FrameNormalizer;
  private regionManager: RegionManager;
  private fallbackManager: FallbackManager;
  private config: OCRPipelineConfig;
  private cache: Map<string, { result: OCRResult; timestamp: number }> = new Map();
  private initialized: boolean = false;

  constructor(config: Partial<OCRPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.frameBuffer = new FrameBuffer(this.config.frameBufferSize);
    this.diffDetector = new FrameDiffDetector(this.config.diffThreshold);
    this.keyframeDetector = new KeyframeDetector();
    this.normalizer = new FrameNormalizer(this.config.normalization);
    this.regionManager = new RegionManager();
    this.fallbackManager = new FallbackManager(this.config.fallback);
  }

  async initialize(): Promise<void> {
    console.log('[OCRPipeline] ====== INITIALISATION OCR ======');
    console.log('[OCRPipeline] Config:', JSON.stringify(this.config, null, 2));

    try {
      if (this.config.useMockAdapter) {
        console.log('[OCRPipeline] Mode MOCK activé');
        this.fallbackManager.registerFactory(new MockAdapterFactory());
      } else {
        console.log('[OCRPipeline] Enregistrement des adaptateurs OCR...');
        console.log('[OCRPipeline] - OnnxAdapterFactory');
        this.fallbackManager.registerFactory(new OnnxAdapterFactory());
        console.log('[OCRPipeline] - MockAdapterFactory (fallback)');
        this.fallbackManager.registerFactory(new MockAdapterFactory());
      }

      console.log('[OCRPipeline] Initialisation du FallbackManager...');
      await this.fallbackManager.initialize();
      this.initialized = true;
      console.log('[OCRPipeline] ✅ OCR Pipeline initialisé avec succès');
    } catch (error) {
      console.error('[OCRPipeline] ❌ ERREUR initialisation:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await this.fallbackManager.shutdown();
    this.cache.clear();
    this.initialized = false;
  }

  setFrameSize(width: number, height: number): void {
    this.regionManager.setFrameSize(width, height);
  }

  pushFrame(
    data: Buffer,
    width: number,
    height: number,
    format: Frame['format'] = 'rgba'
  ): Frame {
    const frame = this.frameBuffer.push(data, width, height, format);
    
    if (this.regionManager.getAllRegions().length === 0) {
      this.regionManager.setFrameSize(width, height);
    }

    const hasChange = this.diffDetector.hasSignificantChange(frame);
    if (this.keyframeDetector.shouldBeKeyframe(frame, hasChange ? 0.2 : 0)) {
      this.keyframeDetector.markAsKeyframe(frame);
    }

    return frame;
  }

  normalizeFrame(frame: Frame): NormalizedFrame {
    return this.normalizer.normalize(frame);
  }

  async processRegion(
    frame: Frame | NormalizedFrame,
    regionId: string
  ): Promise<OCRResult | null> {
    if (!this.initialized) {
      console.error('[OCRPipeline] ❌ Pipeline non initialisé!');
      throw new Error('OCRPipeline not initialized');
    }

    const region = this.regionManager.getRegion(regionId);
    if (!region) {
      console.warn(`[OCRPipeline] ⚠️ Region ${regionId} non trouvée`);
      return null;
    }

    const cacheKey = this.getCacheKey(frame, region);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.debug(`[OCRPipeline] Cache hit pour region ${regionId}`);
      return cached;
    }

    const normalizedFrame = 'normalized' in frame ? frame : this.normalizeFrame(frame);
    
    try {
      console.debug(`[OCRPipeline] Processing region: ${regionId} (${region.type})`);
      const startTime = Date.now();
      const result = await this.fallbackManager.processRegion(normalizedFrame, region);
      const duration = Date.now() - startTime;
      
      console.log(`[OCRPipeline] ✅ Region ${regionId}: "${result.text}" (conf: ${(result.confidence * 100).toFixed(1)}%, ${duration}ms)`);
      this.addToCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`[OCRPipeline] ❌ Échec region ${regionId}:`, error);
      return null;
    }
  }

  async processRegions(
    frame: Frame,
    regionIds?: string[]
  ): Promise<OCRBatchResult[]> {
    if (!this.initialized) {
      throw new Error('OCRPipeline not initialized');
    }

    const normalizedFrame = this.normalizeFrame(frame);
    
    let regions: Region[];
    if (regionIds) {
      regions = regionIds
        .map(id => this.regionManager.getRegion(id))
        .filter((r): r is Region => r !== undefined);
    } else {
      regions = this.regionManager.getRegionsByPriority();
    }

    return this.fallbackManager.processFrame(normalizedFrame, regions);
  }

  async processRegionsByType(
    frame: Frame,
    types: RegionType[]
  ): Promise<OCRBatchResult[]> {
    const regions = types.flatMap(type => this.regionManager.getRegionsByType(type));
    const normalizedFrame = this.normalizeFrame(frame);
    return this.fallbackManager.processFrame(normalizedFrame, regions);
  }

  async extractTableState(frame: Frame): Promise<Partial<PokerTableState>> {
    console.log('[OCRPipeline] ====== EXTRACTION ÉTAT TABLE ======');
    console.log(`[OCRPipeline] Frame: ${frame.width}x${frame.height}, id: ${frame.id}`);
    
    try {
      const startTime = Date.now();
      const results = await this.processRegions(frame);
      console.log(`[OCRPipeline] ${results.length} régions traitées en ${Date.now() - startTime}ms`);
      
      const state: Partial<PokerTableState> = {
        timestamp: Date.now(),
      };

      for (const result of results) {
        if (!result.result) continue;

        try {
          switch (result.regionType) {
            case 'cards':
              state.heroCards = this.parseCards(result.result.text);
              break;
            case 'community_cards':
              state.communityCards = this.parseCards(result.result.text);
              break;
            case 'pot':
              state.potSize = this.parseCurrency(result.result.text);
              break;
            case 'player_stack':
              if (result.regionId === 'hero_stack') {
                state.heroStack = this.parseCurrency(result.result.text);
              }
              break;
            case 'action_buttons':
              state.availableActions = this.parseActions(result.result.text);
              break;
          }
        } catch (innerError) {
          console.error(`[OCRPipeline] Error parsing result for ${result.regionId}:`, innerError);
        }
      }

      return state;
    } catch (criticalError) {
      console.error('[OCRPipeline] ❌ CRITICAL ERROR in extractTableState:', criticalError);
      return { timestamp: Date.now() };
    }
  }

  private parseCards(text: string): string[] {
    const cardPattern = /([2-9TJQKA][shdc])/gi;
    const matches = text.match(cardPattern);
    return matches ? matches.map(c => c.charAt(0).toUpperCase() + c.charAt(1).toLowerCase()) : [];
  }

  private parseCurrency(text: string): number {
    const cleaned = text.replace(/[^0-9.,]/g, '');
    const normalized = cleaned.replace(',', '.');
    return parseFloat(normalized) || 0;
  }

  private parseActions(text: string): string[] {
    const actionKeywords = ['fold', 'check', 'call', 'bet', 'raise', 'all-in', 'allin'];
    const textLower = text.toLowerCase();
    return actionKeywords.filter(action => textLower.includes(action));
  }

  private getCacheKey(frame: Frame, region: Region): string {
    return `${frame.id}_${region.id}`;
  }

  private getFromCache(key: string): OCRResult | null {
    if (!this.config.enableCaching) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > (this.config.cacheTTLMs || 5000)) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  private addToCache(key: string, result: OCRResult): void {
    if (!this.config.enableCaching) return;

    if (this.cache.size >= (this.config.cacheMaxSize || 100)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clearCache(): void {
    this.cache.clear();
  }

  getRegionManager(): RegionManager {
    return this.regionManager;
  }

  getFrameBuffer(): FrameBuffer {
    return this.frameBuffer;
  }

  getNormalizer(): FrameNormalizer {
    return this.normalizer;
  }

  getStats(): {
    adapters: Map<string, ReturnType<import('./adapters').OCRAdapter['getStats']>>;
    cacheSize: number;
    frameBufferSize: number;
  } {
    return {
      adapters: this.fallbackManager.getAdapterStats(),
      cacheSize: this.cache.size,
      frameBufferSize: this.frameBuffer.size(),
    };
  }
}

let pipelineInstance: OCRPipeline | null = null;

export function getOCRPipeline(config?: Partial<OCRPipelineConfig>): OCRPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new OCRPipeline(config);
  }
  return pipelineInstance;
}

export async function initializeOCRPipeline(config?: Partial<OCRPipelineConfig>): Promise<OCRPipeline> {
  const pipeline = getOCRPipeline(config);
  if (!pipeline['initialized']) {
    await pipeline.initialize();
  }
  return pipeline;
}
