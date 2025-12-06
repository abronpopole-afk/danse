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

    try {
      const safeModeModule = require("./safe-mode");
      const safeModeManager = safeModeModule.getSafeModeManager();
      const conservativeDelays = safeModeManager.getConservativeDelays();

      if (conservativeDelays) {
        minDelayMs = conservativeDelays.minDelayMs;
        maxDelayMs = conservativeDelays.maxDelayMs;
      }
    } catch (error) {
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

    // Récupérer les modifiers de fatigue/tilt
    let modifiers: ProfileModifiers = {
      delayMultiplier: 1,
      varianceMultiplier: 1,
      errorProbability: 0,
      aggressionShift: 0,
      rangeWidening: 1,
      sizingVariance: 1,
    };

    let fatigueLevel = 0;
    if (this.settings.enableDynamicProfile) {
      const profile = getPlayerProfile();
      modifiers = profile.getModifiers();
      fatigueLevel = profile.getState().fatigueLevel;
    }

    const points: BezierPoint[] = [];
    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

    // Loi de Fitts: temps = a + b * log2(distance/width + 1)
    // Plus la distance est grande, plus le mouvement prend du temps
    const fittsIndex = Math.log2(distance / 20 + 1);
    const adjustedDuration = Math.max(duration, duration * (0.8 + fittsIndex * 0.3));
    const numPoints = Math.max(10, Math.floor(adjustedDuration / 16));

    // Biais de trajectoire personnel (constant pour simuler un humain spécifique)
    const personalBiasX = Math.sin(123.456) * 15; // Biais horizontal constant
    const personalBiasY = Math.cos(789.012) * 12; // Biais vertical constant

    // Points de contrôle Bézier avec biais
    const cp1x = startX + (endX - startX) * randomInRange(0.2, 0.4) + randomInRange(-50, 50) + personalBiasX * 0.3;
    const cp1y = startY + (endY - startY) * randomInRange(0.2, 0.4) + randomInRange(-50, 50) + personalBiasY * 0.3;
    const cp2x = startX + (endX - startX) * randomInRange(0.6, 0.8) + randomInRange(-30, 30) + personalBiasX * 0.5;
    const cp2y = startY + (endY - startY) * randomInRange(0.6, 0.8) + randomInRange(-30, 30) + personalBiasY * 0.5;

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const mt = 1 - t;

      // Courbe de Bézier cubique
      const x = mt * mt * mt * startX +
                3 * mt * mt * t * cp1x +
                3 * mt * t * t * cp2x +
                t * t * t * endX;

      const y = mt * mt * mt * startY +
                3 * mt * mt * t * cp1y +
                3 * mt * t * t * cp2y +
                t * t * t * endY;

      // Loi de Fitts: vitesse non constante (accélération au début, décélération à la fin)
      const fittsVelocityFactor = Math.sin(t * Math.PI); // Bell curve: lent au début/fin, rapide au milieu

      // Tremblements micro-moteurs (80-120 Hz) dépendants de la fatigue
      const microTremorFrequency = 80 + Math.random() * 40; // 80-120 Hz
      const microTremorAmplitude = (0.3 + fatigueLevel * 1.2) * modifiers.varianceMultiplier;
      const microTremorX = Math.sin(t * numPoints * microTremorFrequency * 0.1) * microTremorAmplitude;
      const microTremorY = Math.cos(t * numPoints * microTremorFrequency * 0.1) * microTremorAmplitude;

      // Jitter de base augmenté par la fatigue
      const baseJitter = 2 + fatigueLevel * 3; // 2-5 pixels selon fatigue
      const jitterX = randomInRange(-baseJitter, baseJitter) * (1 - fittsVelocityFactor * 0.3);
      const jitterY = randomInRange(-baseJitter, baseJitter) * (1 - fittsVelocityFactor * 0.3);

      // Biais directionnel personnel (trajectoire non parfaite)
      const biasInfluence = 1 - fittsVelocityFactor; // Plus fort au début/fin
      const trajectoryBiasX = personalBiasX * biasInfluence * 0.2;
      const trajectoryBiasY = personalBiasY * biasInfluence * 0.2;

      // Erreurs de précision augmentées par fatigue (main tremblante)
      const precisionError = fatigueLevel > 0.5 ? randomInRange(-2, 2) * fatigueLevel : 0;

      const timestamp = Math.round(t * adjustedDuration);

      points.push({
        x: Math.round(x + jitterX + microTremorX + trajectoryBiasX + precisionError),
        y: Math.round(y + jitterY + microTremorY + trajectoryBiasY + precisionError),
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
    
    let probability = this.settings.randomFoldProbability;
    
    // Augmenter la probabilité si fatigué
    if (this.settings.enableDynamicProfile) {
      const modifiers = getPlayerProfile().getModifiers();
      probability += modifiers.errorProbability * 0.5; // Max 5% de folds aléatoires
    }
    
    return Math.random() < probability;
  }

  /**
   * Calcule un sizing de bet/raise humanisé avec variance intentionnelle
   * @param baseSizing Le sizing GTO optimal (ex: 0.66 pour 66% pot)
   * @param potSize Taille du pot actuel
   * @param street Street actuelle
   * @returns Sizing ajusté avec variance humaine
   */
  getHumanizedSizing(baseSizing: number, potSize: number, street: string): number {
    let modifiers: ProfileModifiers = {
      delayMultiplier: 1,
      varianceMultiplier: 1,
      errorProbability: 0,
      aggressionShift: 0,
      rangeWidening: 1,
      sizingVariance: 1,
    };

    if (this.settings.enableDynamicProfile) {
      const profile = getPlayerProfile();
      modifiers = profile.getModifiers();
    }

    // Variance de base: ±5% à ±15% selon street
    const baseVariance = street === "preflop" ? 0.05 : 0.10;
    
    // Appliquer le multiplicateur de variance (tilt/fatigue augmente)
    const variance = baseVariance * modifiers.sizingVariance;
    
    // Ajouter du bruit gaussien
    const noise = gaussianRandom(0, variance);
    let adjustedSizing = baseSizing + noise;
    
    // Arrondir à des valeurs "humaines" (multiples de 0.05)
    adjustedSizing = Math.round(adjustedSizing * 20) / 20;
    
    // Parfois utiliser des sizings "ronds" comme un humain
    if (Math.random() < 0.15) {
      const roundSizings = [0.33, 0.5, 0.66, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0];
      const nearest = roundSizings.reduce((prev, curr) => 
        Math.abs(curr - adjustedSizing) < Math.abs(prev - adjustedSizing) ? curr : prev
      );
      adjustedSizing = nearest;
    }
    
    // Clamp entre 0.25 et 5.0 (min bet et over-bet max)
    return clamp(adjustedSizing, 0.25, 5.0);
  }

  /**
   * Détermine si une action erronée intentionnelle doit être déclenchée
   * Simule des "brain farts" humains très rares
   */
  shouldTriggerIntentionalError(handStrength: number): { 
    shouldError: boolean; 
    errorType?: 'wrong_action' | 'wrong_sizing' | 'premature_fold';
  } {
    if (!this.settings.stealthModeEnabled) return { shouldError: false };
    
    let errorProb = 0.002; // 0.2% de base
    
    // Augmenter avec fatigue/tilt
    if (this.settings.enableDynamicProfile) {
      const modifiers = getPlayerProfile().getModifiers();
      errorProb += modifiers.errorProbability * 0.3;
    }
    
    if (Math.random() < errorProb) {
      // Type d'erreur selon force de main
      if (handStrength > 0.8 && Math.random() < 0.3) {
        return { shouldError: true, errorType: 'premature_fold' }; // Fold AA par erreur
      } else if (Math.random() < 0.5) {
        return { shouldError: true, errorType: 'wrong_sizing' }; // Sizing bizarre
      } else {
        return { shouldError: true, errorType: 'wrong_action' }; // Check au lieu de bet
      }
    }
    
    return { shouldError: false };
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

  async performRandomHumanAction(): Promise<void> {
    const actions = [
      'hover_stack',
      'hover_pot',
      'hover_cards',
      'check_bankroll',
      'move_to_corner',
    ];

    const action = actions[Math.floor(Math.random() * actions.length)];
    const { getPlayerProfile } = await import("./player-profile");
    const profile = getPlayerProfile();

    // Plus de chance si fatigué
    if (profile.getState().fatigue > 50 && Math.random() < 0.3) {
      console.log(`[Humanizer] Performing random human action: ${action}`);
      // TODO: Implémenter les actions réelles
    }
  }

  private generateMousePath(startX: number, startY: number, endX: number, endY: number): Array<{x: number, y: number}> {
    // This method seems to be a remnant or incomplete, as generateBezierMousePath is used instead.
    // Keeping it as is to avoid breaking existing functionality based on the provided changes.
    // If this method is indeed intended to be used, its implementation needs to be added or clarified.
    return [];
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

  /**
   * Simule un mouvement de souris réaliste avec vitesse variable selon la loi de Fitts
   * @param startX Position X de départ
   * @param startY Position Y de départ
   * @param endX Position X de destination
   * @param endY Position Y de destination
   * @returns Durée totale du mouvement en ms
   */
  async simulateMouseMovement(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<number> {
    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

    // Loi de Fitts: MT = a + b * log2(D/W + 1)
    // a = 50ms (temps incompressible), b = 150ms (coefficient), W = 20px (largeur cible)
    const baseDuration = 50 + 150 * Math.log2(distance / 20 + 1);

    // Variation selon fatigue
    let durationMultiplier = 1;
    if (this.settings.enableDynamicProfile) {
      const modifiers = getPlayerProfile().getModifiers();
      durationMultiplier = modifiers.delayMultiplier;
    }

    const totalDuration = Math.round(baseDuration * durationMultiplier * randomInRange(0.9, 1.1));

    // Générer la trajectoire
    const path = this.generateBezierMousePath(startX, startY, endX, endY, totalDuration);

    // Note: L'exécution réelle du mouvement se ferait via robotjs dans platform-manager
    // Ici on retourne juste la durée pour la synchronisation

    return totalDuration;
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