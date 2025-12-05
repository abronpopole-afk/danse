
export type SafeMode = "normal" | "conservative" | "freeze";

export interface SafeModeConfig {
  mode: SafeMode;
  suspicionThreshold: {
    conservative: number; // 0.5 = déclenche mode conservateur
    freeze: number; // 0.7 = déclenche mode freeze
  };
  conservativeSettings: {
    foldBorderlineHands: boolean;
    noRoboticRaises: boolean;
    minDelayMs: number;
    maxDelayMs: number;
    maxActiveTables: number;
  };
  freezeSettings: {
    disableAutoActions: boolean;
    continueReading: boolean;
    continueStats: boolean;
    alertUser: boolean;
  };
}

const DEFAULT_SAFE_MODE_CONFIG: SafeModeConfig = {
  mode: "normal",
  suspicionThreshold: {
    conservative: 0.5,
    freeze: 0.7,
  },
  conservativeSettings: {
    foldBorderlineHands: true,
    noRoboticRaises: true,
    minDelayMs: 1000,
    maxDelayMs: 2500,
    maxActiveTables: 4,
  },
  freezeSettings: {
    disableAutoActions: true,
    continueReading: true,
    continueStats: true,
    alertUser: true,
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
      actions.push("Actions automatiques désactivées");
      actions.push("Intervention manuelle requise");
      actions.push("Lecture et statistiques maintenues");
    } else if (suspicionLevel >= this.config.suspicionThreshold.conservative) {
      newMode = "conservative";
      reason = `Suspicion élevée (${(suspicionLevel * 100).toFixed(1)}%)`;
      actions.push("Fold sur mains borderline");
      actions.push("Délais augmentés (1-2.5s)");
      actions.push("Pas de raises robotisés");
      if (this.config.conservativeSettings.maxActiveTables < 24) {
        actions.push(`Max ${this.config.conservativeSettings.maxActiveTables} tables actives`);
      }
    } else {
      newMode = "normal";
      if (previousMode !== "normal") {
        reason = `Suspicion normale (${(suspicionLevel * 100).toFixed(1)}%)`;
        actions.push("Retour au mode normal");
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
    if (this.currentMode !== "conservative") return null;
    return {
      minDelayMs: this.config.conservativeSettings.minDelayMs,
      maxDelayMs: this.config.conservativeSettings.maxDelayMs,
    };
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

      case "conservative":
        return {
          mode: "conservative",
          description: "Mode conservateur - Jeu défensif",
          restrictions: [
            "Fold automatique sur mains borderline (equity 40-55%)",
            "Délais augmentés (1000-2500ms)",
            "Pas de raises rapides",
            `Maximum ${this.config.conservativeSettings.maxActiveTables} tables`,
          ],
          benefits: [
            "Réduit drastiquement la suspicion",
            "Pattern plus humain",
            "Protège le compte",
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
