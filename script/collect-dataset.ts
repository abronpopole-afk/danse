
import { GGClubAdapter } from "../server/bot/platforms/ggclub";
import { getDataCollector } from "../server/bot/ml-ocr/data-collector";
import { promises as fs } from "fs";
import path from "path";

interface CollectionConfig {
  targetScreenshots: number;
  minConfidence: number;
  outputDir: string;
  delayBetweenCaptures: number;
}

class DatasetCollector {
  private adapter: GGClubAdapter;
  private config: CollectionConfig;
  private captureCount = 0;
  private errorCount = 0;

  constructor(config: Partial<CollectionConfig> = {}) {
    this.adapter = new GGClubAdapter();
    this.config = {
      targetScreenshots: config.targetScreenshots || 300,
      minConfidence: config.minConfidence || 0.7,
      outputDir: config.outputDir || "./dataset/ggclub-captures",
      delayBetweenCaptures: config.delayBetweenCaptures || 2000,
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.mkdir(path.join(this.config.outputDir, "raw"), { recursive: true });
    await fs.mkdir(path.join(this.config.outputDir, "annotated"), { recursive: true });
    
    console.log("[DatasetCollector] Initialized");
    console.log(`[DatasetCollector] Target: ${this.config.targetScreenshots} screenshots`);
    console.log(`[DatasetCollector] Output: ${this.config.outputDir}`);
  }

  async collectFromActiveTables(): Promise<void> {
    const dataCollector = await getDataCollector();
    
    console.log("[DatasetCollector] Connecting to GGClub...");
    const connected = await this.adapter.connect({
      credentials: { username: "", password: "" },
      autoReconnect: false,
      maxReconnectAttempts: 0,
      reconnectDelayMs: 0,
    });

    if (!connected) {
      console.error("[DatasetCollector] Connection failed");
      return;
    }

    console.log("[DatasetCollector] Detecting tables...");
    const windows = await this.adapter.detectTableWindows();
    console.log(`[DatasetCollector] Found ${windows.length} tables`);

    if (windows.length === 0) {
      console.warn("[DatasetCollector] No tables found. Please open GGClub tables first.");
      return;
    }

    const startTime = Date.now();
    
    while (this.captureCount < this.config.targetScreenshots) {
      for (const windowHandle of windows) {
        if (this.captureCount >= this.config.targetScreenshots) break;

        try {
          await this.captureAndAnnotate(windowHandle, dataCollector);
          await this.delay(this.config.delayBetweenCaptures);
        } catch (error) {
          this.errorCount++;
          console.error(`[DatasetCollector] Error on window ${windowHandle}:`, error);
        }

        this.printProgress();
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    await this.saveManifest();
    await dataCollector.saveIndex();
    
    console.log("\n[DatasetCollector] Collection complete!");
    console.log(`  Total captures: ${this.captureCount}`);
    console.log(`  Errors: ${this.errorCount}`);
    console.log(`  Time elapsed: ${elapsed} minutes`);
    console.log(`  Output directory: ${this.config.outputDir}`);
  }

  private async captureAndAnnotate(
    windowHandle: number,
    dataCollector: any
  ): Promise<void> {
    const screenshot = await this.adapter.captureScreen(windowHandle);
    const gameState = await this.adapter.getGameState(windowHandle);

    const timestamp = Date.now();
    const rawPath = path.join(this.config.outputDir, "raw", `capture_${timestamp}.png`);
    await fs.writeFile(rawPath, screenshot);

    // Collecter les cartes du héros
    for (const card of gameState.heroCards) {
      if (card.confidence >= this.config.minConfidence) {
        const rankSample = this.extractCardRegion(screenshot, card.position, 'rank');
        await dataCollector.addSample(
          rankSample,
          32,
          32,
          card.rank,
          'rank',
          card.confidence,
          `capture_${timestamp}`
        );

        const suitSample = this.extractCardRegion(screenshot, card.position, 'suit');
        await dataCollector.addSample(
          suitSample,
          32,
          32,
          card.suit,
          'suit',
          card.confidence,
          `capture_${timestamp}`
        );
      }
    }

    // Collecter les cartes communes
    for (const card of gameState.communityCards) {
      if (card.confidence >= this.config.minConfidence) {
        const rankSample = this.extractCardRegion(screenshot, card.position, 'rank');
        await dataCollector.addSample(
          rankSample,
          32,
          32,
          card.rank,
          'rank',
          card.confidence,
          `capture_${timestamp}`
        );

        const suitSample = this.extractCardRegion(screenshot, card.position, 'suit');
        await dataCollector.addSample(
          suitSample,
          32,
          32,
          card.suit,
          'suit',
          card.confidence,
          `capture_${timestamp}`
        );
      }
    }

    // Collecter les montants (pot, stacks, bets)
    if (gameState.pot > 0) {
      const potDigits = gameState.pot.toString().split('');
      for (const digit of potDigits) {
        const digitSample = this.createDigitSample(digit);
        await dataCollector.addSample(
          digitSample,
          16,
          16,
          digit,
          'digit',
          0.8,
          `capture_${timestamp}`
        );
      }
    }

    // Sauvegarder métadonnées
    const metadata = {
      timestamp,
      windowHandle,
      heroCards: gameState.heroCards.map(c => c.raw),
      communityCards: gameState.communityCards.map(c => c.raw),
      pot: gameState.pot,
      stacks: gameState.players.map(p => p.stack),
      isHeroTurn: gameState.isHeroTurn,
    };

    const metaPath = path.join(this.config.outputDir, "annotated", `capture_${timestamp}.json`);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

    this.captureCount++;
  }

  private extractCardRegion(screenshot: Buffer, position: any, type: 'rank' | 'suit'): Buffer {
    // Simuler l'extraction d'une région - dans la vraie implémentation,
    // utiliser sharp ou jimp pour extraire la région réelle
    const size = 32;
    const buffer = Buffer.alloc(size * size * 4);
    buffer.fill(255); // Blanc par défaut
    return buffer;
  }

  private createDigitSample(digit: string): Buffer {
    const size = 16;
    const buffer = Buffer.alloc(size * size * 4);
    buffer.fill(255);
    return buffer;
  }

  private async saveManifest(): Promise<void> {
    const manifest = {
      totalCaptures: this.captureCount,
      errors: this.errorCount,
      config: this.config,
      timestamp: new Date().toISOString(),
    };

    const manifestPath = path.join(this.config.outputDir, "manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private printProgress(): void {
    const percent = ((this.captureCount / this.config.targetScreenshots) * 100).toFixed(1);
    process.stdout.write(
      `\r[DatasetCollector] Progress: ${this.captureCount}/${this.config.targetScreenshots} (${percent}%) | Errors: ${this.errorCount}`
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetCount = parseInt(args[0]) || 300;
  
  const collector = new DatasetCollector({
    targetScreenshots: targetCount,
    minConfidence: 0.7,
    delayBetweenCaptures: 2000,
  });

  await collector.initialize();
  await collector.collectFromActiveTables();
}

if (require.main === module) {
  main().catch(console.error);
}

export { DatasetCollector };
