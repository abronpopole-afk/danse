
export type SafeMode = "normal" | "cautious" | "conservative" | "freeze";

export interface SafeModeConfig {
  mode: SafeMode;
  suspicionThreshold: {
    cautious: number; // 0.35 = légère alerte
    conservative: number; // 0.55 = mode conservateur
    freeze: number; // 0.75 = mode freeze
  };
  cautiousSettings: {
    increaseDelayVariance: boolean;
    enableMoreErrors: boolean;
    addRandomPauses: boolean;
    minDelayMs: number;
    maxDelayMs: number;
    errorProbability: number;
  };
  conservativeSettings: {
    foldBorderlineHands: boolean;
    noRoboticRaises: boolean;
    enableTimeouts: boolean;
    enableDonkBets: boolean;
    minDelayMs: number;
    maxDelayMs: number;
    maxActiveTables: number;
    gtoAccuracyLimit: number; // Limiter GTO à 80%
  };
  freezeSettings: {
    disableAutoActions: boolean;
    continueReading: boolean;
    continueStats: boolean;
    alertUser: boolean;
    cooldownMinutes: number; // Temps avant reprise auto
  };
}

const DEFAULT_SAFE_MODE_CONFIG: SafeModeConfig = {
  mode: "normal",
  suspicionThreshold: {
    cautious: 0.35,
    conservative: 0.55,
    freeze: 0.75,
  },
  cautiousSettings: {
    increaseDelayVariance: true,
    enableMoreErrors: true,
    addRandomPauses: true,
    minDelayMs: 1800,
    maxDelayMs: 5000,
    errorProbability: 0.08, // 8% erreurs
  },
  conservativeSettings: {
    foldBorderlineHands: true,
    noRoboticRaises: true,
    enableTimeouts: true,
    enableDonkBets: true,
    minDelayMs: 2500,
    maxDelayMs: 7000,
    maxActiveTables: 4,
    gtoAccuracyLimit: 0.80, // Max 80% GTO
  },
  freezeSettings: {
    disableAutoActions: true,
    continueReading: true,
    continueStats: true,
    alertUser: true,
    cooldownMinutes: 15, // 15min cooldown
  },
};

export class SafeModeManager {
  private config: SafeModeConfig;
  private currentMode: SafeMode = "normal";
  private lastSuspicionLevel: number = 0;
  private modeChangeHistory: Array<{ mode: SafeMode; timestamp: number; reason: string }> = [];

  constructor(config?: Partial<SafeModeConfig>) {
    this.config = { ...DEFAULT_SAFE_MODE_CONFIG, ...config };
  }

  updateConfig(config: Partial<SafeModeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SafeModeConfig {
    return { ...this.config };
  }

  getCurrentMode(): SafeMode {
    return this.currentMode;
  }

  evaluateMode(suspicionLevel: number): { 
    mode: SafeMode; 
    changed: boolean; 
    reason?: string;
    actions: string[];
  } {
    const previousMode = this.currentMode;
    this.lastSuspicionLevel = suspicionLevel;

    let newMode: SafeMode = "normal";
    let reason = "";
    const actions: string[] = [];

    if (suspicionLevel >= this.config.suspicionThreshold.freeze) {
      newMode = "freeze";
      reason = `Suspicion critique (${(suspicionLevel * 100).toFixed(1)}%)`;
      actions.push("🚨 Actions automatiques désactivées");
      actions.push("⏸️ Intervention manuelle requise");
      actions.push("📊 Lecture et statistiques maintenues");
      actions.push(`⏱️ Cooldown: ${this.config.freezeSettings.cooldownMinutes}min`);
    } else if (suspicionLevel >= this.config.suspicionThreshold.conservative) {
      newMode = "conservative";
      reason = `Suspicion élevée (${(suspicionLevel * 100).toFixed(1)}%)`;
      actions.push("🛡️ Mode ultra-défensif activé");
      actions.push("📉 Fold sur mains borderline");
      actions.push("⏱️ Délais augmentés (2.5-7s)");
      actions.push("🎲 GTO limité à 80% max");
      actions.push("🎭 Timeouts + donk-bets activés");
      if (this.config.conservativeSettings.maxActiveTables < 24) {
        actions.push(`🎰 Max ${this.config.conservativeSettings.maxActiveTables} tables actives`);
      }
    } else if (suspicionLevel >= this.config.suspicionThreshold.cautious) {
      newMode = "cautious";
      reason = `Suspicion modérée (${(suspicionLevel * 100).toFixed(1)}%)`;
      actions.push("⚠️ Mode prudent activé");
      actions.push("📈 Variance augmentée (timing + sizing)");
      actions.push("🎲 Erreurs intentionnelles (8%)");
      actions.push("⏸️ Pauses aléatoires ajoutées");
      actions.push("⏱️ Délais augmentés (1.8-5s)");
    } else {
      newMode = "normal";
      if (previousMode !== "normal") {
        reason = `Suspicion normale (${(suspicionLevel * 100).toFixed(1)}%)`;
        actions.push("✅ Retour au mode normal");
      }
    }

    const changed = newMode !== previousMode;

    if (changed) {
      this.currentMode = newMode;
      this.modeChangeHistory.push({
        mode: newMode,
        timestamp: Date.now(),
        reason,
      });

      if (this.modeChangeHistory.length > 50) {
        this.modeChangeHistory = this.modeChangeHistory.slice(-50);
      }

      console.log(`[SafeMode] Changement de mode: ${previousMode} → ${newMode} (${reason})`);
    }

    return {
      mode: newMode,
      changed,
      reason: changed ? reason : undefined,
      actions,
    };
  }

  shouldFoldBorderlineHand(handStrength: number, facingBet: number, potSize: number): boolean {
    if (this.currentMode !== "conservative") return false;

    // Main borderline = equity entre 40% et 55%
    const isBorderline = handStrength >= 0.40 && handStrength <= 0.55;
    
    // Pot odds
    const potOdds = facingBet > 0 ? facingBet / (potSize + facingBet) : 0;
    
    // Si borderline ET pot odds défavorables, fold
    if (isBorderline && handStrength < potOdds + 0.08) {
      return true;
    }

    return false;
  }

  getConservativeDelays(): { minDelayMs: number; maxDelayMs: number } | null {
    if (this.currentMode === "conservative") {
      return {
        minDelayMs: this.config.conservativeSettings.minDelayMs,
        maxDelayMs: this.config.conservativeSettings.maxDelayMs,
      };
    }
    
    if (this.currentMode === "cautious") {
      return {
        minDelayMs: this.config.cautiousSettings.minDelayMs,
        maxDelayMs: this.config.cautiousSettings.maxDelayMs,
      };
    }
    
    return null;
  }

  getErrorProbability(): number {
    if (this.currentMode === "cautious") {
      return this.config.cautiousSettings.errorProbability;
    }
    
    if (this.currentMode === "conservative") {
      return 0.12; // 12% erreurs en mode conservateur
    }
    
    return 0.02; // 2% erreurs en mode normal
  }

  shouldEnableTimeouts(): boolean {
    return this.currentMode === "conservative" && this.config.conservativeSettings.enableTimeouts;
  }

  shouldEnableDonkBets(): boolean {
    return this.currentMode === "conservative" && this.config.conservativeSettings.enableDonkBets;
  }

  getGtoAccuracyLimit(): number | null {
    if (this.currentMode === "conservative") {
      return this.config.conservativeSettings.gtoAccuracyLimit;
    }
    return null;
  }

  shouldReduceTables(): { reduce: boolean; maxTables: number } {
    if (this.currentMode !== "conservative") {
      return { reduce: false, maxTables: 24 };
    }

    return {
      reduce: true,
      maxTables: this.config.conservativeSettings.maxActiveTables,
    };
  }

  canAutoAct(): boolean {
    if (this.currentMode === "freeze") {
      return !this.config.freezeSettings.disableAutoActions;
    }
    return true;
  }

  shouldContinueReading(): boolean {
    if (this.currentMode === "freeze") {
      return this.config.freezeSettings.continueReading;
    }
    return true;
  }

  shouldContinueStats(): boolean {
    if (this.currentMode === "freeze") {
      return this.config.freezeSettings.continueStats;
    }
    return true;
  }

  getHistory(): Array<{ mode: SafeMode; timestamp: number; reason: string }> {
    return [...this.modeChangeHistory];
  }

  getModeDescription(): {
    mode: SafeMode;
    description: string;
    restrictions: string[];
    benefits: string[];
  } {
    switch (this.currentMode) {
      case "normal":
        return {
          mode: "normal",
          description: "Mode de jeu normal",
          restrictions: [],
          benefits: ["Performance maximale", "Toutes les fonctionnalités actives"],
        };

      case "cautious":
        return {
          mode: "cautious",
          description: "Mode prudent - Suspicion modérée détectée",
          restrictions: [
            "Variance augmentée (timing + sizing)",
            "Délais augmentés (1800-5000ms)",
            "Erreurs intentionnelles (8%)",
            "Pauses aléatoires ajoutées",
          ],
          benefits: [
            "Réduit la suspicion légère",
            "Pattern plus naturel",
            "Prévention précoce",
            "Performance quasi-normale",
          ],
        };

      case "conservative":
        return {
          mode: "conservative",
          description: "Mode conservateur - Jeu ultra-défensif",
          restrictions: [
            "Fold automatique sur mains borderline (equity 40-55%)",
            "Délais augmentés (2500-7000ms)",
            "GTO limité à 80% max",
            "Timeouts + donk-bets activés",
            `Maximum ${this.config.conservativeSettings.maxActiveTables} tables`,
          ],
          benefits: [
            "Réduit drastiquement la suspicion",
            "Pattern très humain",
            "Protège le compte",
            "Jeu crédible",
          ],
        };

      case "freeze":
        return {
          mode: "freeze",
          description: "Mode gel - Intervention manuelle requise",
          restrictions: [
            "Actions automatiques désactivées",
            "Aucune décision prise par le bot",
            "Attente intervention manuelle",
            `Cooldown: ${this.config.freezeSettings.cooldownMinutes}min`,
          ],
          benefits: [
            "Lecture des états maintenue",
            "Statistiques continuées",
            "Compte protégé du ban",
            "Temps de récupération de suspicion",
          ],
        };

      default:
        return {
          mode: "normal",
          description: "Mode inconnu",
          restrictions: [],
          benefits: [],
        };
    }
  }

  reset(): void {
    this.currentMode = "normal";
    this.lastSuspicionLevel = 0;
  }
}

let globalSafeModeManager: SafeModeManager = new SafeModeManager();

export function getSafeModeManager(): SafeModeManager {
  return globalSafeModeManager;
}

export function setSafeModeManager(manager: SafeModeManager): void {
  globalSafeModeManager = manager;
}

export function resetSafeModeManager(config?: Partial<SafeModeConfig>): void {
  globalSafeModeManager = new SafeModeManager(config);
}
