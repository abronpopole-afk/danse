
import { GGClubAdapter } from "../platforms/ggclub";
import fs from "fs/promises";
import path from "path";

interface CaptureTestResult {
  timestamp: number;
  windowHandle: number;
  detectionResults: {
    heroCards: { success: boolean; confidence: number; cards: string[] };
    communityCards: { success: boolean; confidence: number; cards: string[] };
    pot: { success: boolean; confidence: number; amount: number };
    buttons: { success: boolean; confidence: number; detected: string[] };
  };
  performance: {
    captureTime: number;
    ocrTime: number;
    totalTime: number;
  };
}

export class GGClubCaptureTest {
  private adapter: GGClubAdapter;
  private testResultsDir = "./test-results/captures";
  private results: CaptureTestResult[] = [];

  constructor() {
    this.adapter = new GGClubAdapter();
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.testResultsDir, { recursive: true });
    this.adapter.enableDebugMode(true);
    console.log("[CaptureTest] Initialized");
  }

  async runSingleCapture(windowHandle: number): Promise<CaptureTestResult> {
    const startTime = Date.now();
    
    // Capture d'écran
    const captureStart = Date.now();
    const screenshot = await this.adapter.captureScreen(windowHandle);
    const captureTime = Date.now() - captureStart;

    // Détection OCR
    const ocrStart = Date.now();
    const [heroCards, communityCards, pot, buttons] = await Promise.all([
      this.testHeroCards(windowHandle),
      this.testCommunityCards(windowHandle),
      this.testPot(windowHandle),
      this.testButtons(windowHandle),
    ]);
    const ocrTime = Date.now() - ocrStart;

    const result: CaptureTestResult = {
      timestamp: Date.now(),
      windowHandle,
      detectionResults: {
        heroCards,
        communityCards,
        pot,
        buttons,
      },
      performance: {
        captureTime,
        ocrTime,
        totalTime: Date.now() - startTime,
      },
    };

    this.results.push(result);
    await this.saveResult(result);
    return result;
  }

  private async testHeroCards(windowHandle: number) {
    try {
      const startTime = Date.now();
      const cards = await this.adapter.detectHeroCards(windowHandle);
      const elapsed = Date.now() - startTime;
      
      // Validate card format (rank + suit)
      const validCards = cards.filter(c => /^[AKQJT98765432][hdcs]$/i.test(c.raw));
      const isValid = validCards.length === cards.length;
      
      return {
        success: cards.length === 2 && isValid,
        confidence: cards.length === 2 && isValid ? 0.9 : (cards.length > 0 ? 0.5 : 0),
        cards: cards.map(c => c.raw),
        elapsed,
        errors: !isValid ? [`Invalid card format detected`] : [],
      };
    } catch (error) {
      return { 
        success: false, 
        confidence: 0, 
        cards: [], 
        elapsed: 0,
        errors: [String(error)],
      };
    }
  }

  private async testCommunityCards(windowHandle: number) {
    try {
      const cards = await this.adapter.detectCommunityCards(windowHandle);
      return {
        success: cards.length >= 0 && cards.length <= 5,
        confidence: cards.length > 0 ? 0.7 : 0,
        cards: cards.map(c => c.raw),
      };
    } catch (error) {
      return { success: false, confidence: 0, cards: [] };
    }
  }

  private async testPot(windowHandle: number) {
    try {
      const amount = await this.adapter.detectPot(windowHandle);
      return {
        success: amount >= 0,
        confidence: amount > 0 ? 0.6 : 0.3,
        amount,
      };
    } catch (error) {
      return { success: false, confidence: 0, amount: 0 };
    }
  }

  private async testButtons(windowHandle: number) {
    try {
      const buttons = await this.adapter.detectAvailableActions(windowHandle);
      return {
        success: buttons.length > 0,
        confidence: buttons.reduce((sum, b) => sum + (b.amount || 0), 0) / buttons.length || 0,
        detected: buttons.map(b => b.type),
      };
    } catch (error) {
      return { success: false, confidence: 0, detected: [] };
    }
  }

  private async saveResult(result: CaptureTestResult): Promise<void> {
    const filename = `capture_${result.timestamp}_${result.windowHandle}.json`;
    const filepath = path.join(this.testResultsDir, filename);
    await fs.writeFile(filepath, JSON.stringify(result, null, 2));
  }

  async runBenchmark(windowHandle: number, iterations: number = 100): Promise<void> {
    console.log(`[CaptureTest] Running ${iterations} iterations...`);
    
    for (let i = 0; i < iterations; i++) {
      await this.runSingleCapture(windowHandle);
      if (i % 10 === 0) {
        console.log(`[CaptureTest] Progress: ${i}/${iterations}`);
      }
    }

    const report = this.generateReport();
    await fs.writeFile(
      path.join(this.testResultsDir, `benchmark_${Date.now()}.json`),
      JSON.stringify(report, null, 2)
    );
    
    console.log("[CaptureTest] Benchmark complete:", report);
  }

  private generateReport() {
    const totalTests = this.results.length;
    if (totalTests === 0) {
      return { error: "No test results available" };
    }

    const successfulHeroCards = this.results.filter(r => r.detectionResults.heroCards.success).length;
    const successfulCommunityCards = this.results.filter(r => r.detectionResults.communityCards.success).length;
    const successfulPot = this.results.filter(r => r.detectionResults.pot.success).length;
    const successfulButtons = this.results.filter(r => r.detectionResults.buttons.success).length;

    const avgCaptureTime = this.results.reduce((sum, r) => sum + r.performance.captureTime, 0) / totalTests;
    const avgOcrTime = this.results.reduce((sum, r) => sum + r.performance.ocrTime, 0) / totalTests;
    const avgTotalTime = this.results.reduce((sum, r) => sum + r.performance.totalTime, 0) / totalTests;

    // Calculate confidence averages
    const avgHeroCardsConf = this.results.reduce((sum, r) => sum + r.detectionResults.heroCards.confidence, 0) / totalTests;
    const avgCommunityCardsConf = this.results.reduce((sum, r) => sum + r.detectionResults.communityCards.confidence, 0) / totalTests;
    const avgPotConf = this.results.reduce((sum, r) => sum + r.detectionResults.pot.confidence, 0) / totalTests;
    const avgButtonsConf = this.results.reduce((sum, r) => sum + r.detectionResults.buttons.confidence, 0) / totalTests;

    // Calculate min/max times
    const captureTimes = this.results.map(r => r.performance.captureTime);
    const ocrTimes = this.results.map(r => r.performance.ocrTime);
    const totalTimes = this.results.map(r => r.performance.totalTime);

    return {
      totalTests,
      timestamp: new Date().toISOString(),
      successRates: {
        heroCards: (successfulHeroCards / totalTests * 100).toFixed(2) + '%',
        communityCards: (successfulCommunityCards / totalTests * 100).toFixed(2) + '%',
        pot: (successfulPot / totalTests * 100).toFixed(2) + '%',
        buttons: (successfulButtons / totalTests * 100).toFixed(2) + '%',
        overall: ((successfulHeroCards + successfulCommunityCards + successfulPot + successfulButtons) / (totalTests * 4) * 100).toFixed(2) + '%',
      },
      confidence: {
        heroCards: (avgHeroCardsConf * 100).toFixed(1) + '%',
        communityCards: (avgCommunityCardsConf * 100).toFixed(1) + '%',
        pot: (avgPotConf * 100).toFixed(1) + '%',
        buttons: (avgButtonsConf * 100).toFixed(1) + '%',
      },
      performance: {
        avgCaptureTime: Math.round(avgCaptureTime) + 'ms',
        avgOcrTime: Math.round(avgOcrTime) + 'ms',
        avgTotalTime: Math.round(avgTotalTime) + 'ms',
        minCaptureTime: Math.round(Math.min(...captureTimes)) + 'ms',
        maxCaptureTime: Math.round(Math.max(...captureTimes)) + 'ms',
        minOcrTime: Math.round(Math.min(...ocrTimes)) + 'ms',
        maxOcrTime: Math.round(Math.max(...ocrTimes)) + 'ms',
        minTotalTime: Math.round(Math.min(...totalTimes)) + 'ms',
        maxTotalTime: Math.round(Math.max(...totalTimes)) + 'ms',
      },
      errors: this.results
        .filter(r => 
          !r.detectionResults.heroCards.success || 
          !r.detectionResults.communityCards.success || 
          !r.detectionResults.pot.success || 
          !r.detectionResults.buttons.success
        )
        .slice(0, 10)
        .map(r => ({
          timestamp: r.timestamp,
          failedDetections: [
            !r.detectionResults.heroCards.success ? 'heroCards' : null,
            !r.detectionResults.communityCards.success ? 'communityCards' : null,
            !r.detectionResults.pot.success ? 'pot' : null,
            !r.detectionResults.buttons.success ? 'buttons' : null,
          ].filter(Boolean),
        })),
    };
  }
}

export async function runCaptureTests() {
  const test = new GGClubCaptureTest();
  await test.initialize();
  
  // Remplacer par le vrai windowHandle détecté
  const windowHandle = 1001;
  await test.runBenchmark(windowHandle, 50);
}
