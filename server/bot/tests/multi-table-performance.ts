
import { GGClubAdapter } from "../platforms/ggclub";

interface TablePerformance {
  windowHandle: number;
  cycleTime: number;
  detectionSuccess: boolean;
  queueDepth: number;
}

export class MultiTablePerformanceTest {
  private adapter: GGClubAdapter;
  private metrics: TablePerformance[] = [];
  private memorySnapshots: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];

  constructor() {
    this.adapter = new GGClubAdapter();
  }

  async testSixTables(): Promise<void> {
    await this.runTableTest(6);
  }

  async testTwelveTables(): Promise<void> {
    await this.runTableTest(12);
  }

  async testTwentyFourTables(): Promise<void> {
    await this.runTableTest(24);
  }

  async stressTest(): Promise<void> {
    console.log("[MultiTableTest] Running stress test (6, 12, 24 tables)...");
    
    for (const tableCount of [6, 12, 24]) {
      console.log(`\n[MultiTableTest] Testing ${tableCount} tables...`);
      this.metrics = [];
      this.memorySnapshots = [];
      await this.runTableTest(tableCount);
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  private async runTableTest(tableCount: number): Promise<void> {
    const windowHandles = Array.from({ length: tableCount }, (_, i) => 1001 + i);
    
    console.log(`[MultiTableTest] Testing ${tableCount} tables simultaneously...`);
    
    const startMemory = process.memoryUsage();
    this.memorySnapshots.push({ timestamp: Date.now(), usage: startMemory });
    
    const startTime = Date.now();
    const promises = windowHandles.map(handle => this.processTable(handle));
    
    await Promise.all(promises);
    
    const endMemory = process.memoryUsage();
    this.memorySnapshots.push({ timestamp: Date.now(), usage: endMemory });
    
    const totalTime = Date.now() - startTime;
    
    console.log(`[MultiTableTest] Completed in ${totalTime}ms`);
    console.log(`[MultiTableTest] Avg time per table: ${Math.round(totalTime / tableCount)}ms`);
    console.log(`[MultiTableTest] Tables/second: ${(tableCount / (totalTime / 1000)).toFixed(2)}`);
    
    const successRate = this.metrics.filter(m => m.detectionSuccess).length / this.metrics.length;
    console.log(`[MultiTableTest] Success rate: ${(successRate * 100).toFixed(2)}%`);
    
    const memoryDelta = {
      heapUsed: (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024,
      external: (endMemory.external - startMemory.external) / 1024 / 1024,
      rss: (endMemory.rss - startMemory.rss) / 1024 / 1024,
    };
    
    console.log(`[MultiTableTest] Memory delta: heap=${memoryDelta.heapUsed.toFixed(2)}MB, rss=${memoryDelta.rss.toFixed(2)}MB`);
  }

  getReport() {
    if (this.metrics.length === 0) {
      return { error: "No metrics available" };
    }

    const avgCycleTime = this.metrics.reduce((sum, m) => sum + m.cycleTime, 0) / this.metrics.length;
    const successRate = this.metrics.filter(m => m.detectionSuccess).length / this.metrics.length;
    
    return {
      totalTables: this.metrics.length,
      avgCycleTime: Math.round(avgCycleTime) + 'ms',
      successRate: (successRate * 100).toFixed(2) + '%',
      memorySnapshots: this.memorySnapshots.map(s => ({
        timestamp: s.timestamp,
        heapUsedMB: (s.usage.heapUsed / 1024 / 1024).toFixed(2),
        rssMB: (s.usage.rss / 1024 / 1024).toFixed(2),
      })),
    };
  }

  private async processTable(windowHandle: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      const state = await this.adapter.getGameState(windowHandle);
      const detectionSuccess = state.heroCards.length > 0 || state.communityCards.length > 0;
      
      this.metrics.push({
        windowHandle,
        cycleTime: Date.now() - startTime,
        detectionSuccess,
        queueDepth: 0,
      });
    } catch (error) {
      this.metrics.push({
        windowHandle,
        cycleTime: Date.now() - startTime,
        detectionSuccess: false,
        queueDepth: 0,
      });
    }
  }
}
