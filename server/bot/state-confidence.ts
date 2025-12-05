
export interface ConfidenceScore {
  value: any;
  confidence: number;
  timestamp: number;
  method: string;
}

export interface GameStateConfidence {
  heroCards: ConfidenceScore;
  communityCards: ConfidenceScore;
  potSize: ConfidenceScore;
  heroStack: ConfidenceScore;
  facingBet: ConfidenceScore;
  buttons: {
    fold: ConfidenceScore;
    call: ConfidenceScore;
    raise: ConfidenceScore;
    check?: ConfidenceScore;
    allin?: ConfidenceScore;
  };
  players: ConfidenceScore;
  currentStreet: ConfidenceScore;
  isHeroTurn: ConfidenceScore;
  globalConfidence: number;
}

export interface UncertainState {
  timestamp: number;
  windowHandle: number;
  reason: string;
  screenshot?: Buffer;
  partialState: Partial<GameStateConfidence>;
  retryCount: number;
}

export interface StateConfidenceConfig {
  minGlobalConfidence: number;
  minCardConfidence: number;
  minPotConfidence: number;
  minButtonConfidence: number;
  enableScreenshotCapture: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: StateConfidenceConfig = {
  minGlobalConfidence: 0.70,
  minCardConfidence: 0.75,
  minPotConfidence: 0.65,
  minButtonConfidence: 0.70,
  enableScreenshotCapture: true,
  maxRetries: 3,
  retryDelayMs: 500,
};

export class StateConfidenceAnalyzer {
  private config: StateConfidenceConfig;
  private uncertainStates: Map<number, UncertainState[]> = new Map();
  private stateHistory: Map<number, GameStateConfidence[]> = new Map();
  private maxHistorySize = 50;

  constructor(config?: Partial<StateConfidenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  updateConfig(config: Partial<StateConfidenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  analyzeStateConfidence(
    rawDetections: {
      heroCards?: { cards: string[]; confidence: number; method: string };
      communityCards?: { cards: string[]; confidence: number; method: string };
      potSize?: { value: number; confidence: number; method: string };
      heroStack?: { value: number; confidence: number; method: string };
      facingBet?: { value: number; confidence: number; method: string };
      buttons?: {
        fold?: { enabled: boolean; confidence: number };
        call?: { enabled: boolean; confidence: number };
        raise?: { enabled: boolean; confidence: number };
        check?: { enabled: boolean; confidence: number };
        allin?: { enabled: boolean; confidence: number };
      };
      players?: { count: number; confidence: number };
      currentStreet?: { street: string; confidence: number };
      isHeroTurn?: { value: boolean; confidence: number };
    }
  ): GameStateConfidence {
    const now = Date.now();

    const heroCards: ConfidenceScore = {
      value: rawDetections.heroCards?.cards || [],
      confidence: rawDetections.heroCards?.confidence || 0,
      timestamp: now,
      method: rawDetections.heroCards?.method || "none",
    };

    const communityCards: ConfidenceScore = {
      value: rawDetections.communityCards?.cards || [],
      confidence: rawDetections.communityCards?.confidence || 0,
      timestamp: now,
      method: rawDetections.communityCards?.method || "none",
    };

    const potSize: ConfidenceScore = {
      value: rawDetections.potSize?.value || 0,
      confidence: rawDetections.potSize?.confidence || 0,
      timestamp: now,
      method: rawDetections.potSize?.method || "none",
    };

    const heroStack: ConfidenceScore = {
      value: rawDetections.heroStack?.value || 0,
      confidence: rawDetections.heroStack?.confidence || 0,
      timestamp: now,
      method: rawDetections.heroStack?.method || "none",
    };

    const facingBet: ConfidenceScore = {
      value: rawDetections.facingBet?.value || 0,
      confidence: rawDetections.facingBet?.confidence || 0,
      timestamp: now,
      method: rawDetections.facingBet?.method || "none",
    };

    const buttons = {
      fold: {
        value: rawDetections.buttons?.fold?.enabled || false,
        confidence: rawDetections.buttons?.fold?.confidence || 0,
        timestamp: now,
        method: "template",
      },
      call: {
        value: rawDetections.buttons?.call?.enabled || false,
        confidence: rawDetections.buttons?.call?.confidence || 0,
        timestamp: now,
        method: "template",
      },
      raise: {
        value: rawDetections.buttons?.raise?.enabled || false,
        confidence: rawDetections.buttons?.raise?.confidence || 0,
        timestamp: now,
        method: "template",
      },
      check: rawDetections.buttons?.check ? {
        value: rawDetections.buttons.check.enabled,
        confidence: rawDetections.buttons.check.confidence,
        timestamp: now,
        method: "template",
      } : undefined,
      allin: rawDetections.buttons?.allin ? {
        value: rawDetections.buttons.allin.enabled,
        confidence: rawDetections.buttons.allin.confidence,
        timestamp: now,
        method: "template",
      } : undefined,
    };

    const players: ConfidenceScore = {
      value: rawDetections.players?.count || 0,
      confidence: rawDetections.players?.confidence || 0,
      timestamp: now,
      method: "detection",
    };

    const currentStreet: ConfidenceScore = {
      value: rawDetections.currentStreet?.street || "unknown",
      confidence: rawDetections.currentStreet?.confidence || 0,
      timestamp: now,
      method: "inference",
    };

    const isHeroTurn: ConfidenceScore = {
      value: rawDetections.isHeroTurn?.value || false,
      confidence: rawDetections.isHeroTurn?.confidence || 0,
      timestamp: now,
      method: "button_detection",
    };

    const globalConfidence = this.calculateGlobalConfidence({
      heroCards,
      communityCards,
      potSize,
      heroStack,
      facingBet,
      buttons,
      players,
      currentStreet,
      isHeroTurn,
    });

    return {
      heroCards,
      communityCards,
      potSize,
      heroStack,
      facingBet,
      buttons,
      players,
      currentStreet,
      isHeroTurn,
      globalConfidence,
    };
  }

  private calculateGlobalConfidence(state: Omit<GameStateConfidence, "globalConfidence">): number {
    const weights = {
      heroCards: 0.25,
      communityCards: 0.15,
      potSize: 0.15,
      heroStack: 0.10,
      facingBet: 0.10,
      buttons: 0.15,
      players: 0.05,
      currentStreet: 0.03,
      isHeroTurn: 0.02,
    };

    let totalWeight = 0;
    let weightedSum = 0;

    if (state.heroCards.value.length > 0) {
      weightedSum += state.heroCards.confidence * weights.heroCards;
      totalWeight += weights.heroCards;
    }

    if (state.communityCards.value.length > 0) {
      weightedSum += state.communityCards.confidence * weights.communityCards;
      totalWeight += weights.communityCards;
    }

    weightedSum += state.potSize.confidence * weights.potSize;
    totalWeight += weights.potSize;

    weightedSum += state.heroStack.confidence * weights.heroStack;
    totalWeight += weights.heroStack;

    weightedSum += state.facingBet.confidence * weights.facingBet;
    totalWeight += weights.facingBet;

    const buttonConfidence = (
      state.buttons.fold.confidence +
      state.buttons.call.confidence +
      state.buttons.raise.confidence
    ) / 3;
    weightedSum += buttonConfidence * weights.buttons;
    totalWeight += weights.buttons;

    weightedSum += state.players.confidence * weights.players;
    totalWeight += weights.players;

    weightedSum += state.currentStreet.confidence * weights.currentStreet;
    totalWeight += weights.currentStreet;

    weightedSum += state.isHeroTurn.confidence * weights.isHeroTurn;
    totalWeight += weights.isHeroTurn;

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  shouldProceedWithAction(
    windowHandle: number,
    stateConfidence: GameStateConfidence
  ): { proceed: boolean; reason?: string; uncertainties: string[] } {
    const uncertainties: string[] = [];

    if (stateConfidence.globalConfidence < this.config.minGlobalConfidence) {
      return {
        proceed: false,
        reason: `Global confidence too low: ${(stateConfidence.globalConfidence * 100).toFixed(1)}%`,
        uncertainties: ["global_confidence"],
      };
    }

    if (stateConfidence.heroCards.value.length > 0 && 
        stateConfidence.heroCards.confidence < this.config.minCardConfidence) {
      uncertainties.push("hero_cards");
    }

    if (stateConfidence.potSize.confidence < this.config.minPotConfidence) {
      uncertainties.push("pot_size");
    }

    const criticalButtons = [
      stateConfidence.buttons.fold,
      stateConfidence.buttons.call,
      stateConfidence.buttons.raise,
    ];

    const lowConfidenceButtons = criticalButtons.filter(
      btn => btn.confidence < this.config.minButtonConfidence
    );

    if (lowConfidenceButtons.length >= 2) {
      uncertainties.push("buttons");
    }

    if (uncertainties.length > 0) {
      return {
        proceed: false,
        reason: `Low confidence in critical areas: ${uncertainties.join(", ")}`,
        uncertainties,
      };
    }

    return { proceed: true, uncertainties: [] };
  }

  recordUncertainState(
    windowHandle: number,
    stateConfidence: GameStateConfidence,
    reason: string,
    screenshot?: Buffer
  ): void {
    if (!this.uncertainStates.has(windowHandle)) {
      this.uncertainStates.set(windowHandle, []);
    }

    const states = this.uncertainStates.get(windowHandle)!;
    const existingState = states.find(s => Date.now() - s.timestamp < 2000);

    if (existingState) {
      existingState.retryCount++;
    } else {
      states.push({
        timestamp: Date.now(),
        windowHandle,
        reason,
        screenshot: this.config.enableScreenshotCapture ? screenshot : undefined,
        partialState: stateConfidence,
        retryCount: 0,
      });

      if (states.length > 20) {
        states.shift();
      }
    }
  }

  getUncertainStates(windowHandle: number): UncertainState[] {
    return this.uncertainStates.get(windowHandle) || [];
  }

  shouldRetry(windowHandle: number): { retry: boolean; delayMs: number } {
    const states = this.getUncertainStates(windowHandle);
    if (states.length === 0) return { retry: false, delayMs: 0 };

    const mostRecent = states[states.length - 1];
    if (mostRecent.retryCount >= this.config.maxRetries) {
      return { retry: false, delayMs: 0 };
    }

    const timeSinceLastTry = Date.now() - mostRecent.timestamp;
    if (timeSinceLastTry < this.config.retryDelayMs) {
      return {
        retry: true,
        delayMs: this.config.retryDelayMs - timeSinceLastTry,
      };
    }

    return { retry: true, delayMs: this.config.retryDelayMs };
  }

  addToHistory(windowHandle: number, stateConfidence: GameStateConfidence): void {
    if (!this.stateHistory.has(windowHandle)) {
      this.stateHistory.set(windowHandle, []);
    }

    const history = this.stateHistory.get(windowHandle)!;
    history.push(stateConfidence);

    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  getConfidenceTrend(windowHandle: number, field: keyof Omit<GameStateConfidence, "globalConfidence" | "buttons">): number[] {
    const history = this.stateHistory.get(windowHandle) || [];
    return history.slice(-10).map(state => state[field].confidence);
  }

  clearUncertainStates(windowHandle: number): void {
    this.uncertainStates.delete(windowHandle);
  }

  clearHistory(windowHandle: number): void {
    this.stateHistory.delete(windowHandle);
  }

  getStats(windowHandle: number): {
    totalUncertainStates: number;
    avgGlobalConfidence: number;
    mostUncertainField: string;
    confidenceTrends: Record<string, number[]>;
  } {
    const uncertainStates = this.getUncertainStates(windowHandle);
    const history = this.stateHistory.get(windowHandle) || [];

    const avgGlobalConfidence = history.length > 0
      ? history.reduce((sum, s) => sum + s.globalConfidence, 0) / history.length
      : 0;

    const fieldConfidences: Record<string, number> = {
      heroCards: 0,
      communityCards: 0,
      potSize: 0,
      heroStack: 0,
      facingBet: 0,
      players: 0,
      currentStreet: 0,
      isHeroTurn: 0,
    };

    if (history.length > 0) {
      for (const state of history) {
        fieldConfidences.heroCards += state.heroCards.confidence;
        fieldConfidences.communityCards += state.communityCards.confidence;
        fieldConfidences.potSize += state.potSize.confidence;
        fieldConfidences.heroStack += state.heroStack.confidence;
        fieldConfidences.facingBet += state.facingBet.confidence;
        fieldConfidences.players += state.players.confidence;
        fieldConfidences.currentStreet += state.currentStreet.confidence;
        fieldConfidences.isHeroTurn += state.isHeroTurn.confidence;
      }

      for (const key in fieldConfidences) {
        fieldConfidences[key] /= history.length;
      }
    }

    const mostUncertainField = Object.entries(fieldConfidences)
      .sort((a, b) => a[1] - b[1])[0]?.[0] || "none";

    return {
      totalUncertainStates: uncertainStates.length,
      avgGlobalConfidence,
      mostUncertainField,
      confidenceTrends: {
        heroCards: this.getConfidenceTrend(windowHandle, "heroCards"),
        potSize: this.getConfidenceTrend(windowHandle, "potSize"),
        heroStack: this.getConfidenceTrend(windowHandle, "heroStack"),
      },
    };
  }
}

let globalAnalyzer: StateConfidenceAnalyzer | null = null;

export function getStateConfidenceAnalyzer(): StateConfidenceAnalyzer {
  if (!globalAnalyzer) {
    globalAnalyzer = new StateConfidenceAnalyzer();
  }
  return globalAnalyzer;
}

export function resetStateConfidenceAnalyzer(config?: Partial<StateConfidenceConfig>): void {
  globalAnalyzer = new StateConfidenceAnalyzer(config);
}
