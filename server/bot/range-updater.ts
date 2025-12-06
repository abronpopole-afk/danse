
import { HandContext } from "./gto-engine";
import { storage } from "../storage";

export interface RangeUpdate {
  id: string;
  version: string;
  updatedAt: Date;
  source: "gto_wizard" | "solver" | "custom";
  rangeData: RangeDefinition[];
}

export interface RangeDefinition {
  position: string;
  action: "raise" | "call" | "fold" | "3bet" | "4bet";
  street: "preflop" | "flop" | "turn" | "river";
  hands: string[];
  frequency: number;
  conditions?: {
    vsPosition?: string;
    stackDepth?: { min: number; max: number };
    numPlayers?: number;
  };
}

export interface RangeSource {
  name: string;
  apiEndpoint?: string;
  updateFrequency: "daily" | "weekly" | "monthly";
  enabled: boolean;
}

export class RangeUpdater {
  private updateInterval: NodeJS.Timeout | null = null;
  private currentVersion: string = "1.0.0";
  private lastUpdate: Date | null = null;
  private sources: RangeSource[] = [];

  constructor() {
    this.loadLastUpdate();
  }

  private async loadLastUpdate(): Promise<void> {
    try {
      // Check database for last update
      const logs = await storage.getActionLogs({
        logType: "info",
        limit: 1,
      });
      
      const updateLog = logs.find(log => 
        log.message.includes("Range update completed")
      );
      
      if (updateLog && updateLog.timestamp) {
        this.lastUpdate = new Date(updateLog.timestamp);
      }
    } catch (error) {
      console.error("[RangeUpdater] Failed to load last update:", error);
    }
  }

  addSource(source: RangeSource): void {
    this.sources.push(source);
  }

  removeSource(name: string): void {
    this.sources = this.sources.filter(s => s.name !== name);
  }

  getSources(): RangeSource[] {
    return [...this.sources];
  }

  async startAutoUpdate(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Run immediately on start
    await this.checkAndUpdate();

    // Then check every 24 hours
    this.updateInterval = setInterval(async () => {
      await this.checkAndUpdate();
    }, 24 * 60 * 60 * 1000);

    console.log("[RangeUpdater] Auto-update started");
  }

  stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log("[RangeUpdater] Auto-update stopped");
  }

  private async checkAndUpdate(): Promise<void> {
    const now = new Date();
    
    if (!this.lastUpdate) {
      await this.performUpdate();
      return;
    }

    // Check if a week has passed
    const daysSinceUpdate = Math.floor(
      (now.getTime() - this.lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceUpdate >= 7) {
      console.log(`[RangeUpdater] ${daysSinceUpdate} days since last update, updating ranges...`);
      await this.performUpdate();
    } else {
      console.log(`[RangeUpdater] Next update in ${7 - daysSinceUpdate} days`);
    }
  }

  private async performUpdate(): Promise<void> {
    console.log("[RangeUpdater] Starting range update...");

    const enabledSources = this.sources.filter(s => s.enabled);
    
    if (enabledSources.length === 0) {
      console.log("[RangeUpdater] No enabled sources, using default ranges");
      await this.useDefaultRanges();
      return;
    }

    const updates: RangeUpdate[] = [];

    for (const source of enabledSources) {
      try {
        const rangeUpdate = await this.fetchRangesFromSource(source);
        updates.push(rangeUpdate);
      } catch (error) {
        console.error(`[RangeUpdater] Failed to fetch from ${source.name}:`, error);
      }
    }

    if (updates.length > 0) {
      await this.applyRangeUpdates(updates);
      this.lastUpdate = new Date();
      this.currentVersion = this.incrementVersion(this.currentVersion);

      await storage.createActionLog({
        logType: "info",
        message: `Range update completed - Version ${this.currentVersion}`,
        metadata: {
          sources: updates.map(u => u.source),
          rangeCount: updates.reduce((sum, u) => sum + u.rangeData.length, 0),
        },
      });

      console.log(`[RangeUpdater] Update completed - Version ${this.currentVersion}`);
    }
  }

  private async fetchRangesFromSource(source: RangeSource): Promise<RangeUpdate> {
    // For GTO Wizard integration
    if (source.name === "GTO Wizard" && source.apiEndpoint) {
      return await this.fetchFromGTOWizard(source.apiEndpoint);
    }

    // Fallback to simulation-based ranges
    return this.generateSimulatedRanges();
  }

  private async fetchFromGTOWizard(endpoint: string): Promise<RangeUpdate> {
    // TODO: Implement actual GTO Wizard API integration
    // For now, return simulated data
    return this.generateSimulatedRanges();
  }

  private generateSimulatedRanges(): RangeUpdate {
    const ranges: RangeDefinition[] = [
      // UTG RFI
      {
        position: "UTG",
        action: "raise",
        street: "preflop",
        hands: [
          "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77",
          "AKs", "AQs", "AJs", "ATs", "A5s", "A4s",
          "AKo", "AQo", "AJo",
          "KQs", "KJs", "KTs",
          "QJs", "QTs",
          "JTs", "T9s",
        ],
        frequency: 0.12,
      },
      // MP RFI
      {
        position: "MP",
        action: "raise",
        street: "preflop",
        hands: [
          "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
          "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s", "A2s",
          "AKo", "AQo", "AJo", "ATo",
          "KQs", "KJs", "KTs", "K9s",
          "QJs", "QTs", "Q9s",
          "JTs", "J9s",
          "T9s", "T8s",
          "98s", "87s",
        ],
        frequency: 0.16,
      },
      // CO RFI
      {
        position: "CO",
        action: "raise",
        street: "preflop",
        hands: [
          "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
          "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
          "AKo", "AQo", "AJo", "ATo", "A9o",
          "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s",
          "KQo", "KJo",
          "QJs", "QTs", "Q9s", "Q8s",
          "QJo",
          "JTs", "J9s", "J8s",
          "T9s", "T8s", "T7s",
          "98s", "97s", "87s", "86s", "76s", "65s", "54s",
        ],
        frequency: 0.26,
      },
      // BTN RFI
      {
        position: "BTN",
        action: "raise",
        street: "preflop",
        hands: [
          "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
          "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
          "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o",
          "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
          "KQo", "KJo", "KTo", "K9o",
          "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s",
          "QJo", "QTo", "Q9o",
          "JTs", "J9s", "J8s", "J7s", "J6s",
          "JTo", "J9o",
          "T9s", "T8s", "T7s", "T6s",
          "T9o",
          "98s", "97s", "96s", "87s", "86s", "85s", "76s", "75s", "65s", "64s", "54s", "53s",
        ],
        frequency: 0.48,
      },
      // BB vs BTN 3-bet
      {
        position: "BB",
        action: "3bet",
        street: "preflop",
        hands: [
          "AA", "KK", "QQ", "JJ", "TT",
          "AKs", "AQs", "AJs", "ATs", "A5s", "A4s",
          "AKo", "AQo",
          "KQs", "KJs",
          "QJs",
        ],
        frequency: 0.11,
        conditions: { vsPosition: "BTN" },
      },
    ];

    return {
      id: `simulated_${Date.now()}`,
      version: this.currentVersion,
      updatedAt: new Date(),
      source: "solver",
      rangeData: ranges,
    };
  }

  private async applyRangeUpdates(updates: RangeUpdate[]): Promise<void> {
    // Merge updates from multiple sources
    const mergedRanges = this.mergeRangeUpdates(updates);

    // Store in cache for quick access
    const { getGtoCache } = await import("./gto-cache");
    const cache = getGtoCache();

    // Pre-warm cache with new ranges
    await this.warmCacheWithRanges(mergedRanges);

    console.log(`[RangeUpdater] Applied ${mergedRanges.length} range definitions`);
  }

  private mergeRangeUpdates(updates: RangeUpdate[]): RangeDefinition[] {
    const rangeMap = new Map<string, RangeDefinition>();

    for (const update of updates) {
      for (const range of update.rangeData) {
        const key = `${range.position}_${range.action}_${range.street}`;
        
        // Prefer GTO Wizard over solver over custom
        const existing = rangeMap.get(key);
        if (!existing || this.shouldReplace(existing, range, update.source)) {
          rangeMap.set(key, range);
        }
      }
    }

    return Array.from(rangeMap.values());
  }

  private shouldReplace(
    existing: RangeDefinition,
    newRange: RangeDefinition,
    source: RangeUpdate["source"]
  ): boolean {
    // Priority: gto_wizard > solver > custom
    const priority = { gto_wizard: 3, solver: 2, custom: 1 };
    return priority[source] >= 2;
  }

  private async warmCacheWithRanges(ranges: RangeDefinition[]): Promise<void> {
    const { getGtoCache } = await import("./gto-cache");
    const cache = getGtoCache();

    const commonSituations: HandContext[] = [];

    for (const range of ranges) {
      if (range.street !== "preflop") continue;

      // Sample some hands from each range
      const sampleHands = range.hands.slice(0, 10);

      for (const handNotation of sampleHands) {
        const cards = this.notationToCards(handNotation);
        if (!cards) continue;

        commonSituations.push({
          heroCards: cards,
          communityCards: [],
          street: "preflop",
          heroPosition: range.position,
          potSize: 1.5,
          heroStack: 100,
          facingBet: range.action === "raise" ? 0 : 3,
          numPlayers: 9,
          isInPosition: ["CO", "BTN"].includes(range.position),
        });
      }
    }

    await cache.warmup(commonSituations);
  }

  private notationToCards(notation: string): string[] | null {
    // Convert hand notation (e.g., "AKs", "QQ", "T9o") to cards
    if (notation.length < 2) return null;

    const rank1 = notation[0];
    const rank2 = notation[1];
    const suited = notation.endsWith("s");

    const suit1 = "h";
    const suit2 = suited ? "h" : "d";

    return [`${rank1}${suit1}`, `${rank2}${suit2}`];
  }

  private incrementVersion(version: string): string {
    const parts = version.split(".");
    const patch = parseInt(parts[2] || "0") + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  private async useDefaultRanges(): Promise<void> {
    const defaultUpdate = this.generateSimulatedRanges();
    await this.applyRangeUpdates([defaultUpdate]);
    this.lastUpdate = new Date();

    await storage.createActionLog({
      logType: "info",
      message: "Using default ranges - No external sources configured",
      metadata: { rangeCount: defaultUpdate.rangeData.length },
    });
  }

  async forceUpdate(): Promise<void> {
    console.log("[RangeUpdater] Force update requested");
    await this.performUpdate();
  }

  getStatus(): {
    currentVersion: string;
    lastUpdate: Date | null;
    nextUpdate: Date | null;
    sources: RangeSource[];
  } {
    let nextUpdate: Date | null = null;
    
    if (this.lastUpdate) {
      nextUpdate = new Date(this.lastUpdate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    return {
      currentVersion: this.currentVersion,
      lastUpdate: this.lastUpdate,
      nextUpdate,
      sources: this.sources,
    };
  }
}

let rangeUpdaterInstance: RangeUpdater | null = null;

export function getRangeUpdater(): RangeUpdater {
  if (!rangeUpdaterInstance) {
    rangeUpdaterInstance = new RangeUpdater();
  }
  return rangeUpdaterInstance;
}

export function resetRangeUpdater(): void {
  if (rangeUpdaterInstance) {
    rangeUpdaterInstance.stopAutoUpdate();
    rangeUpdaterInstance = null;
  }
}
