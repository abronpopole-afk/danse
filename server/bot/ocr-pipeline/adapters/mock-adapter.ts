import { OCRAdapter, type OCRAdapterFactory } from './ocr-adapter';
import type { 
  Frame, 
  NormalizedFrame, 
  Region, 
  OCRResult, 
  OCREngineCapabilities 
} from '../types';

export class MockAdapter extends OCRAdapter {
  private mockResponses: Map<string, OCRResult> = new Map();

  constructor() {
    super('mock');
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
    console.log('[MockAdapter] Initialized (for testing/fallback)');
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }

  getCapabilities(): OCREngineCapabilities {
    return {
      supportsGPU: false,
      supportsBatching: true,
      maxBatchSize: 100,
      supportedFormats: ['any'],
      estimatedSpeedMs: 1,
    };
  }

  setMockResponse(regionId: string, result: OCRResult): void {
    this.mockResponses.set(regionId, result);
  }

  clearMockResponses(): void {
    this.mockResponses.clear();
  }

  async processRegion(
    frame: Frame | NormalizedFrame,
    region: Region
  ): Promise<OCRResult> {
    const startTime = Date.now();
    
    const mockResult = this.mockResponses.get(region.id);
    
    if (mockResult) {
      const processingTime = Date.now() - startTime;
      this.updateStats(true, processingTime, mockResult.confidence);
      return { ...mockResult, processingTimeMs: processingTime };
    }

    const defaultResult: OCRResult = {
      text: this.generateDefaultText(region),
      confidence: 0.95,
      processingTimeMs: Date.now() - startTime,
      engine: this.name,
    };

    this.updateStats(true, defaultResult.processingTimeMs, defaultResult.confidence);
    return defaultResult;
  }

  async processFrame(
    frame: Frame | NormalizedFrame,
    regions: Region[]
  ): Promise<Map<string, OCRResult>> {
    const results = new Map<string, OCRResult>();
    
    for (const region of regions) {
      const result = await this.processRegion(frame, region);
      results.set(region.id, result);
    }
    
    return results;
  }

  private generateDefaultText(region: Region): string {
    switch (region.type) {
      case 'cards':
        return 'As Kh';
      case 'community_cards':
        return 'Ah Kd Qc';
      case 'pot':
        return '$100';
      case 'player_stack':
        return '$500';
      case 'bet_amount':
        return '$25';
      case 'player_name':
        return 'Player1';
      case 'action_buttons':
        return 'Fold Call Raise';
      case 'timer':
        return '15';
      default:
        return '';
    }
  }
}

export class MockAdapterFactory implements OCRAdapterFactory {
  create(): OCRAdapter {
    return new MockAdapter();
  }

  async isAvailable(): Promise<boolean> {
    return false; // Désactivé pour forcer les vrais adaptateurs
  }

  getPriority(): number {
    return 1;
  }
}
