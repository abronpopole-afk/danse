import { HumanizerConfig } from "@shared/schema";
import { getPlayerProfile, ProfileModifiers } from "./player-profile";

export interface HumanizerSettings {
  minDelayMs: number;
  maxDelayMs: number;
  enableBezierMouse: boolean;
  enableMisclicks: boolean;
  misclickProbability: number;
  enableRandomFolds: boolean;
  randomFoldProbability: number;
  thinkingTimeVariance: number;
  preActionDelay: number;
  postActionDelay: number;
  stealthModeEnabled: boolean;
  enableDynamicProfile: boolean;
}

export interface BezierPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface HumanizedAction {
  action: string;
  delay: number;
  mousePath?: BezierPoint[];
  shouldMisclick: boolean;
  misclickRecoveryDelay?: number;
  thinkingPauses: number[];
}

function gaussianRandom(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export class Humanizer {
  private settings: HumanizerSettings;
  private actionHistory: { action: string; timestamp: number }[] = [];
  
  constructor(settings?: Partial<HumanizerSettings>) {
    this.settings = {
      minDelayMs: 1500,
      maxDelayMs: 4200,
      enableBezierMouse: true,
      enableMisclicks: false,
      misclickProbability: 0.0001,
      enableRandomFolds: false,
      randomFoldProbability: 0.001,
      thinkingTimeVariance: 0.3,
      preActionDelay: 500,
      postActionDelay: 300,
      stealthModeEnabled: true,
      enableDynamicProfile: true,
      ...settings,
    };
  }
  
  updateSettings(config: Partial<HumanizerConfig>): void {
    if (config.minDelayMs !== undefined && config.minDelayMs !== null) this.settings.minDelayMs = config.minDelayMs;
    if (config.maxDelayMs !== undefined && config.maxDelayMs !== null) this.settings.maxDelayMs = config.maxDelayMs;
    if (config.enableBezierMouse !== undefined && config.enableBezierMouse !== null) this.settings.enableBezierMouse = config.enableBezierMouse;
    if (config.enableMisclicks !== undefined && config.enableMisclicks !== null) this.settings.enableMisclicks = config.enableMisclicks;
    if (config.misclickProbability !== undefined && config.misclickProbability !== null) this.settings.misclickProbability = config.misclickProbability;
    if (config.enableRandomFolds !== undefined && config.enableRandomFolds !== null) this.settings.enableRandomFolds = config.enableRandomFolds;
    if (config.randomFoldProbability !== undefined && config.randomFoldProbability !== null) this.settings.randomFoldProbability = config.randomFoldProbability;
    if (config.thinkingTimeVariance !== undefined && config.thinkingTimeVariance !== null) this.settings.thinkingTimeVariance = config.thinkingTimeVariance;
    if (config.preActionDelay !== undefined && config.preActionDelay !== null) this.settings.preActionDelay = config.preActionDelay;
    if (config.postActionDelay !== undefined && config.postActionDelay !== null) this.settings.postActionDelay = config.postActionDelay;
    if (config.stealthModeEnabled !== undefined && config.stealthModeEnabled !== null) this.settings.stealthModeEnabled = config.stealthModeEnabled;
    if ((config as any).enableDynamicProfile !== undefined) this.settings.enableDynamicProfile = (config as any).enableDynamicProfile;
  }
  
  getSettings(): HumanizerSettings {
    return { ...this.settings };
  }
  
  calculateThinkingDelay(actionType: string, handStrength: number, isComplexDecision: boolean, street: string = "preflop", potSize: number = 0): number {
    let { minDelayMs, maxDelayMs, thinkingTimeVariance, stealthModeEnabled, enableDynamicProfile } = this.settings;
    
    // Vérifier le mode conservateur
    try {
      const { getSafeModeManager } = await import("./safe-mode");
      const safeModeManager = getSafeModeManager();
      const conservativeDelays = safeModeManager.getConservativeDelays();
      
      if (conservativeDelays) {
        minDelayMs = conservativeDelays.minDelayMs;
        maxDelayMs = conservativeDelays.maxDelayMs;
      }
    } catch (error) {
      // Safe mode non disponible, utiliser les paramètres normaux
    }
    
    // Récupérer les modifiers du profil dynamique
    let modifiers: ProfileModifiers = {
      delayMultiplier: 1,
      varianceMultiplier: 1,
      errorProbability: 0,
      aggressionShift: 0,
      rangeWidening: 1,
      sizingVariance: 1,
    };

    if (enableDynamicProfile) {
      const profile = getPlayerProfile();
      modifiers = profile.getModifiers();
      
      // Micro-pause si fatigué sur gros pot
      if (profile.shouldTakeMicroBreak(street, potSize)) {
        const breakDuration = profile.getMicroBreakDuration();
        return Math.round(breakDuration * modifiers.delayMultiplier);
      }
    }
    
    let baseDelay = (minDelayMs + maxDelayMs) / 2;
    
    if (actionType === "FOLD" && !isComplexDecision) {
      baseDelay = minDelayMs * 1.2;
    } else if (actionType === "CALL") {
      baseDelay = (minDelayMs + maxDelayMs) / 2;
    } else if (actionType.includes("RAISE") || actionType.includes("BET")) {
      baseDelay = maxDelayMs * 0.85;
    } else if (actionType === "CHECK") {
      baseDelay = minDelayMs * 1.1;
    }
    
    if (handStrength > 0.8) {
      baseDelay *= randomInRange(0.9, 1.1);
    } else if (handStrength < 0.3) {
      baseDelay *= randomInRange(0.85, 1.05);
    } else {
      baseDelay *= randomInRange(1.1, 1.4);
    }
    
    if (isComplexDecision) {
      baseDelay *= randomInRange(1.3, 1.8);
    }

    // Appliquer le multiplicateur de délai du profil (tilt = plus rapide)
    baseDelay *= modifiers.delayMultiplier;
    
    const variance = baseDelay * thinkingTimeVariance * modifiers.varianceMultiplier;
    const randomizedDelay = gaussianRandom(baseDelay, variance);
    
    let finalDelay = clamp(randomizedDelay, minDelayMs * modifiers.delayMultiplier, maxDelayMs * 1.5);
    
    if (stealthModeEnabled) {
      // Minimum absolu pour éviter détection (jamais <800ms)
      finalDelay = Math.max(finalDelay, 800);
      
      // Forcer un délai plus long sur actions rapides
      if (finalDelay < 1000) {
        finalDelay += randomInRange(200, 500);
      }

      // Bloquer les timings "impossibles" (<500ms total)
      if (finalDelay + this.settings.preActionDelay < 500) {
        finalDelay = 500 - this.settings.preActionDelay + randomInRange(100, 300);
      }
    }
    
    return Math.round(finalDelay);
  }
  
  generateBezierMousePath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): BezierPoint[] {
    if (!this.settings.enableBezierMouse) {
      return [
        { x: startX, y: startY, timestamp: 0 },
        { x: endX, y: endY, timestamp: duration },
      ];
    }
    
    const points: BezierPoint[] = [];
    const numPoints = Math.max(10, Math.floor(duration / 16));
    
    const cp1x = startX + (endX - startX) * randomInRange(0.2, 0.4) + randomInRange(-50, 50);
    const cp1y = startY + (endY - startY) * randomInRange(0.2, 0.4) + randomInRange(-50, 50);
    const cp2x = startX + (endX - startX) * randomInRange(0.6, 0.8) + randomInRange(-30, 30);
    const cp2y = startY + (endY - startY) * randomInRange(0.6, 0.8) + randomInRange(-30, 30);
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const mt = 1 - t;
      
      const x = mt * mt * mt * startX +
                3 * mt * mt * t * cp1x +
                3 * mt * t * t * cp2x +
                t * t * t * endX;
      
      const y = mt * mt * mt * startY +
                3 * mt * mt * t * cp1y +
                3 * mt * t * t * cp2y +
                t * t * t * endY;
      
      const jitterX = randomInRange(-2, 2);
      const jitterY = randomInRange(-2, 2);
      
      const timestamp = Math.round(t * duration);
      
      points.push({
        x: Math.round(x + jitterX),
        y: Math.round(y + jitterY),
        timestamp,
      });
    }
    
    return points;
  }
  
  shouldTriggerMisclick(): boolean {
    if (!this.settings.enableMisclicks) return false;
    
    let probability = this.settings.misclickProbability;
    
    if (this.settings.enableDynamicProfile) {
      const modifiers = getPlayerProfile().getModifiers();
      probability += modifiers.errorProbability;
    }
    
    return Math.random() < probability;
  }
  
  shouldTriggerRandomFold(): boolean {
    if (!this.settings.enableRandomFolds) return false;
    return Math.random() < this.settings.randomFoldProbability;
  }
  
  generateThinkingPauses(totalThinkingTime: number): number[] {
    const pauses: number[] = [];
    const numPauses = Math.floor(randomInRange(0, 3));
    
    if (numPauses === 0 || totalThinkingTime < 2000) return pauses;
    
    const availableTime = totalThinkingTime * 0.3;
    let usedTime = 0;
    
    for (let i = 0; i < numPauses && usedTime < availableTime; i++) {
      const pauseDuration = Math.round(randomInRange(100, Math.min(500, availableTime - usedTime)));
      pauses.push(pauseDuration);
      usedTime += pauseDuration;
    }
    
    return pauses;
  }
  
  humanizeAction(
    action: string,
    handStrength: number,
    isComplexDecision: boolean,
    buttonPosition?: { x: number; y: number },
    currentMousePosition?: { x: number; y: number },
    street: string = "preflop",
    potSize: number = 0
  ): HumanizedAction {
    const thinkingDelay = this.calculateThinkingDelay(action, handStrength, isComplexDecision, street, potSize);
    const thinkingPauses = this.generateThinkingPauses(thinkingDelay);
    const shouldMisclick = this.shouldTriggerMisclick();
    
    let mousePath: BezierPoint[] | undefined;
    
    if (buttonPosition && currentMousePosition && this.settings.enableBezierMouse) {
      const mouseDuration = Math.round(randomInRange(200, 500));
      mousePath = this.generateBezierMousePath(
        currentMousePosition.x,
        currentMousePosition.y,
        buttonPosition.x,
        buttonPosition.y,
        mouseDuration
      );
    }
    
    const humanizedAction: HumanizedAction = {
      action,
      delay: thinkingDelay + this.settings.preActionDelay,
      mousePath,
      shouldMisclick,
      thinkingPauses,
    };
    
    if (shouldMisclick) {
      humanizedAction.misclickRecoveryDelay = Math.round(randomInRange(300, 800));
    }
    
    this.actionHistory.push({
      action,
      timestamp: Date.now(),
    });
    
    if (this.actionHistory.length > 100) {
      this.actionHistory = this.actionHistory.slice(-100);
    }
    
    return humanizedAction;
  }
  
  getRecentActionPattern(): { averageDelay: number; actionCount: number } {
    if (this.actionHistory.length < 2) {
      return { averageDelay: 0, actionCount: this.actionHistory.length };
    }
    
    let totalDelay = 0;
    for (let i = 1; i < this.actionHistory.length; i++) {
      totalDelay += this.actionHistory[i].timestamp - this.actionHistory[i - 1].timestamp;
    }
    
    return {
      averageDelay: totalDelay / (this.actionHistory.length - 1),
      actionCount: this.actionHistory.length,
    };
  }
  
  async waitForHumanDelay(delay: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

let globalHumanizer: Humanizer = new Humanizer();

export function getHumanizer(): Humanizer {
  return globalHumanizer;
}

export function updateHumanizerFromConfig(config: Partial<HumanizerConfig>): void {
  globalHumanizer.updateSettings(config);
}

export function resetHumanizer(settings?: Partial<HumanizerSettings>): void {
  globalHumanizer = new Humanizer(settings);
}
