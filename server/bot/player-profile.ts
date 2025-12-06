
import { EventEmitter } from "events";

export type PlayerPersonality = "aggressive" | "passive" | "thinking" | "tired" | "tilted" | "balanced";

export interface PlayerProfileConfig {
  personality: PlayerPersonality;
  baseAggression: number; // 0-1
  basePatience: number; // 0-1
  baseFocusLevel: number; // 0-1
  tiltSensitivity: number; // 0-1
  fatigueRate: number; // 0-1
  circadianPeakHour: number; // 0-23
}

export interface PlayerState {
  personality: PlayerPersonality;
  currentAggression: number;
  currentPatience: number;
  currentFocus: number;
  tiltLevel: number; // 0-1
  fatigueLevel: number; // 0-1
  sessionDuration: number; // minutes
  recentBadBeats: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  lastBigWin: number;
  lastBigLoss: number;
  timeOfDay: number; // 0-23
}

export interface ProfileModifiers {
  delayMultiplier: number; // 0.5 - 2.0
  varianceMultiplier: number; // 0.5 - 2.0
  errorProbability: number; // 0 - 0.1
  aggressionShift: number; // -0.3 to +0.3
  rangeWidening: number; // 0.8 - 1.3
  sizingVariance: number; // 0.8 - 1.4
}

const PERSONALITY_PROFILES: Record<PlayerPersonality, Partial<PlayerProfileConfig>> = {
  aggressive: {
    baseAggression: 0.75,
    basePatience: 0.3,
    baseFocusLevel: 0.7,
    tiltSensitivity: 0.6,
  },
  passive: {
    baseAggression: 0.3,
    basePatience: 0.8,
    baseFocusLevel: 0.75,
    tiltSensitivity: 0.4,
  },
  thinking: {
    baseAggression: 0.5,
    basePatience: 0.7,
    baseFocusLevel: 0.9,
    tiltSensitivity: 0.3,
  },
  tired: {
    baseAggression: 0.4,
    basePatience: 0.5,
    baseFocusLevel: 0.4,
    tiltSensitivity: 0.7,
  },
  tilted: {
    baseAggression: 0.9,
    basePatience: 0.2,
    baseFocusLevel: 0.3,
    tiltSensitivity: 0.9,
  },
  balanced: {
    baseAggression: 0.5,
    basePatience: 0.6,
    baseFocusLevel: 0.8,
    tiltSensitivity: 0.5,
  },
};

export class PlayerProfile extends EventEmitter {
  private config: PlayerProfileConfig;
  private state: PlayerState;
  private sessionStartTime: number;
  private lastActionTime: number;
  private actionHistory: { action: string; result: number; timestamp: number }[] = [];

  constructor(personality: PlayerPersonality = "balanced") {
    super();

    this.config = {
      personality,
      baseAggression: 0.5,
      basePatience: 0.6,
      baseFocusLevel: 0.8,
      tiltSensitivity: 0.5,
      fatigueRate: 0.01,
      circadianPeakHour: 14,
      ...PERSONALITY_PROFILES[personality],
    };

    this.state = {
      personality,
      currentAggression: this.config.baseAggression,
      currentPatience: this.config.basePatience,
      currentFocus: this.config.baseFocusLevel,
      tiltLevel: 0,
      fatigueLevel: 0,
      sessionDuration: 0,
      recentBadBeats: 0,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      lastBigWin: 0,
      lastBigLoss: 0,
      timeOfDay: new Date().getHours(),
    };

    this.sessionStartTime = Date.now();
    this.lastActionTime = Date.now();
  }

  updatePersonality(personality: PlayerPersonality): void {
    this.config.personality = personality;
    this.state.personality = personality;
    
    const profile = PERSONALITY_PROFILES[personality];
    this.config = { ...this.config, ...profile };
    
    this.emit("personalityChanged", { personality, state: this.state });
  }

  recordAction(action: string, result: number, potSize: number): void {
    this.actionHistory.push({ action, result, timestamp: Date.now() });
    if (this.actionHistory.length > 200) {
      this.actionHistory = this.actionHistory.slice(-200);
    }

    this.updateSessionDuration();
    this.updateFatigue();
    this.updateTiltLevel(result, potSize);
    this.updateWinLossStreak(result);
    this.applyCircadianRhythm();
    this.updateDynamicPersonality();

    this.lastActionTime = Date.now();
  }

  private updateSessionDuration(): void {
    this.state.sessionDuration = (Date.now() - this.sessionStartTime) / 60000;
  }

  private updateFatigue(): void {
    const sessionHours = this.state.sessionDuration / 60;
    
    // Fatigue augmente exponentiellement après 2h
    if (sessionHours > 2) {
      this.state.fatigueLevel = Math.min(
        1,
        this.config.fatigueRate * Math.pow(sessionHours - 2, 1.5)
      );
    }

    // Fatigue affecte focus
    this.state.currentFocus = Math.max(
      0.2,
      this.config.baseFocusLevel * (1 - this.state.fatigueLevel * 0.6)
    );
  }

  private updateTiltLevel(result: number, potSize: number): void {
    const bbLoss = Math.abs(result);
    const isBigLoss = bbLoss > potSize * 0.7 && result < 0;
    const isBadBeat = isBigLoss && Math.random() < 0.3; // 30% des grosses pertes = bad beat

    if (isBadBeat) {
      this.state.recentBadBeats++;
      this.state.lastBigLoss = bbLoss;
      
      const tiltIncrease = this.config.tiltSensitivity * (bbLoss / 100) * 0.3;
      this.state.tiltLevel = Math.min(1, this.state.tiltLevel + tiltIncrease);

      this.emit("badBeatDetected", { loss: bbLoss, tiltLevel: this.state.tiltLevel });
    }

    // Récupération graduelle du tilt
    if (result > 0) {
      this.state.tiltLevel *= 0.95;
      this.state.recentBadBeats = Math.max(0, this.state.recentBadBeats - 1);
    }

    // Decay naturel du tilt
    const timeSinceLastAction = (Date.now() - this.lastActionTime) / 60000;
    if (timeSinceLastAction > 5) {
      this.state.tiltLevel *= 0.9;
    }
  }

  private updateWinLossStreak(result: number): void {
    if (result > 0) {
      this.state.consecutiveWins++;
      this.state.consecutiveLosses = 0;
      
      if (result > 50) this.state.lastBigWin = result;
    } else if (result < 0) {
      this.state.consecutiveLosses++;
      this.state.consecutiveWins = 0;
    }

    // Winning streak = légère augmentation aggression
    if (this.state.consecutiveWins > 3) {
      this.state.currentAggression = Math.min(
        1,
        this.config.baseAggression * (1 + this.state.consecutiveWins * 0.05)
      );
    }

    // Losing streak = plus conservateur (sauf si tilt)
    if (this.state.consecutiveLosses > 4 && this.state.tiltLevel < 0.5) {
      this.state.currentPatience = Math.min(
        1,
        this.config.basePatience * (1 + this.state.consecutiveLosses * 0.08)
      );
    }
  }

  private applyCircadianRhythm(): void {
    const currentHour = new Date().getHours();
    this.state.timeOfDay = currentHour;

    const hourDiff = Math.abs(currentHour - this.config.circadianPeakHour);
    const circadianFactor = 1 - Math.min(0.3, hourDiff / 24);

    this.state.currentFocus = Math.max(
      0.3,
      this.state.currentFocus * circadianFactor
    );

    // Nuit = plus de fatigue
    if (currentHour < 6 || currentHour > 23) {
      this.state.fatigueLevel = Math.min(1, this.state.fatigueLevel * 1.3);
    }
  }

  private updateDynamicPersonality(): void {
    // Auto-switch vers "tilted" si tilt élevé
    if (this.state.tiltLevel > 0.7 && this.state.personality !== "tilted") {
      this.updatePersonality("tilted");
    }

    // Auto-switch vers "tired" si fatigue élevée
    if (this.state.fatigueLevel > 0.6 && this.state.personality !== "tired") {
      this.updatePersonality("tired");
    }

    // Retour vers personnalité de base si récupération
    if (this.state.tiltLevel < 0.2 && this.state.fatigueLevel < 0.3) {
      if (this.state.personality === "tilted" || this.state.personality === "tired") {
        this.updatePersonality("balanced");
      }
    }
  }

  getModifiers(): ProfileModifiers {
    const tiltFactor = this.state.tiltLevel;
    const fatigueFactor = this.state.fatigueLevel;
    const focusFactor = this.state.currentFocus;

    return {
      // Tilt = actions plus rapides, moins de réflexion
      // Fatigue = actions plus lentes (coordination réduite)
      delayMultiplier: Math.max(
        0.5,
        1 - tiltFactor * 0.5 + fatigueFactor * 0.3
      ),

      // Fatigue = plus de variance dans les mouvements et décisions
      varianceMultiplier: 1 + fatigueFactor * 1.2 + tiltFactor * 0.5,

      // Tilt + Fatigue = plus d'erreurs (tremblements, misclicks)
      errorProbability: Math.min(
        0.1,
        (tiltFactor * 0.05 + fatigueFactor * 0.04) * (1 - focusFactor)
      ),

      // Tilt = plus agressif
      aggressionShift: tiltFactor * 0.3 - this.state.currentPatience * 0.15,

      // Tilt = range plus large (joue plus de mains)
      rangeWidening: 1 + tiltFactor * 0.3,

      // Tilt + Fatigue = sizing erratique
      sizingVariance: 1 + tiltFactor * 0.4 + fatigueFactor * 0.3,
    };
  }

  getState(): PlayerState {
    return { ...this.state };
  }

  getConfig(): PlayerProfileConfig {
    return { ...this.config };
  }

  shouldTakeMicroBreak(street: string, potSize: number): boolean {
    if (this.state.fatigueLevel < 0.4) return false;

    // Plus de pauses sur décisions complexes quand fatigué
    const complexStreets = ["turn", "river"];
    if (complexStreets.includes(street) && potSize > 20) {
      return Math.random() < this.state.fatigueLevel * 0.4;
    }

    return Math.random() < this.state.fatigueLevel * 0.15;
  }

  getMicroBreakDuration(): number {
    return Math.round(
      2000 + this.state.fatigueLevel * 5000 + Math.random() * 3000
    );
  }

  reset(): void {
    this.sessionStartTime = Date.now();
    this.state.sessionDuration = 0;
    this.state.fatigueLevel = 0;
    this.state.tiltLevel = 0;
    this.state.consecutiveLosses = 0;
    this.state.consecutiveWins = 0;
    this.state.recentBadBeats = 0;
    this.actionHistory = [];
    
    this.emit("profileReset");
    this.persistState();
  }

  private async persistState(): Promise<void> {
    try {
      const { storage } = await import("../storage");
      await storage.updatePlayerProfileState(this.state);
    } catch (error) {
      console.error("Erreur persistance profil:", error);
    }
  }

  async restoreState(): Promise<void> {
    try {
      const { storage } = await import("../storage");
      const saved = await storage.getPlayerProfileState();
      
      if (saved) {
        this.state.personality = saved.personality as PlayerPersonality;
        this.state.tiltLevel = saved.tiltLevel;
        this.state.fatigueLevel = saved.fatigueLevel;
        this.state.sessionDuration = saved.sessionDuration;
        this.state.recentBadBeats = saved.recentBadBeats;
        this.state.consecutiveLosses = saved.consecutiveLosses;
        this.state.consecutiveWins = saved.consecutiveWins;
        this.state.lastBigWin = saved.lastBigWin;
        this.state.lastBigLoss = saved.lastBigLoss;
        
        if (saved.sessionStartTime) {
          this.sessionStartTime = new Date(saved.sessionStartTime).getTime();
        }
        
        this.updatePersonality(this.state.personality);
        this.emit("profileRestored", { state: this.state });
      }
    } catch (error) {
      console.error("Erreur restauration profil:", error);
    }
  }
}

let globalPlayerProfile: PlayerProfile = new PlayerProfile("balanced");

export function getPlayerProfile(): PlayerProfile {
  return globalPlayerProfile;
}

export function setPlayerProfile(profile: PlayerProfile): void {
  globalPlayerProfile = profile;
}

export function resetPlayerProfile(personality?: PlayerPersonality): void {
  globalPlayerProfile = new PlayerProfile(personality);
}

export async function initializePlayerProfile(): Promise<void> {
  await globalPlayerProfile.restoreState();
}
