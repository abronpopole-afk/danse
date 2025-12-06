
import { EventEmitter } from "events";

export interface OpponentStats {
  playerId: string;
  seat: number;
  
  // Stats basiques (VPIP/PFR)
  vpip: number; // 0-100
  pfr: number; // 0-100
  aggFactor: number; // Aggression factor (bet+raise / call)
  
  // Tendances récentes
  recentBluffs: number; // Nombre de bluffs détectés récemment
  recentFolds: number; // Folds récents face à aggression
  recentCalls: number; // Calls passifs récents
  
  // Patterns de bet sizing
  avgBetSize: number; // % du pot moyen
  smallBetFreq: number; // Fréquence de small bets (0-1)
  oversizeFreq: number; // Fréquence d'oversizes (0-1)
  
  // Comportement par street
  cbetFlop: number; // % de c-bet au flop
  cbetTurn: number;
  foldToCbet: number; // % de fold face à c-bet
  checkRaiseTurn: number;
  
  // Détection de tilt
  tiltIndicators: number; // 0-1, composite score
  recentLosses: number;
  lastBigLoss: number;
  isOnTilt: boolean;
  
  // Historique
  handsObserved: number;
  lastSeenAt: number;
  confidence: number; // 0-1, based on sample size
}

export interface TableDynamics {
  tableId: string;
  
  // Contexte global
  avgPotSize: number;
  avgVpip: number; // VPIP moyen de la table
  isAggressive: boolean; // Table loose-aggressive
  isNitty: boolean; // Table tight-passive
  
  // Anomalies détectées
  potSizeAnomalies: Array<{ handNumber: string; size: number; expected: number }>;
  unusualAggression: boolean;
  massivePotRecently: boolean;
  
  // Historique récent
  recentHands: Array<{
    handNumber: string;
    heroAction: string;
    heroResult: number;
    timestamp: number;
  }>;
  
  lastUpdated: number;
}

export interface ExploitativeAdjustment {
  reason: string;
  aggressionShift: number; // -0.3 to +0.3
  rangeAdjustment: number; // 0.7 to 1.3 (multiplier)
  bluffFrequencyShift: number; // -0.2 to +0.2
  valueBetSizingShift: number; // 0.8 to 1.4
  confidence: number; // 0-1
}

const DEFAULT_OPPONENT_STATS: Omit<OpponentStats, 'playerId' | 'seat'> = {
  vpip: 25,
  pfr: 18,
  aggFactor: 2.0,
  recentBluffs: 0,
  recentFolds: 0,
  recentCalls: 0,
  avgBetSize: 0.66,
  smallBetFreq: 0.3,
  oversizeFreq: 0.1,
  cbetFlop: 0.65,
  cbetTurn: 0.50,
  foldToCbet: 0.45,
  checkRaiseTurn: 0.08,
  tiltIndicators: 0,
  recentLosses: 0,
  lastBigLoss: 0,
  isOnTilt: false,
  handsObserved: 0,
  lastSeenAt: Date.now(),
  confidence: 0,
};

export class OpponentProfiler extends EventEmitter {
  private opponentProfiles: Map<string, OpponentStats> = new Map();
  private tableDynamics: Map<string, TableDynamics> = new Map();
  private actionHistory: Map<string, Array<{
    action: string;
    street: string;
    betSize: number;
    result?: number;
    timestamp: number;
  }>> = new Map();
  
  private maxHistorySize = 50; // Garder 50 dernières mains
  private tiltThreshold = 0.6; // Seuil de détection de tilt
  private confidenceDecayRate = 0.95; // Decay si pas vu depuis longtemps

  constructor() {
    super();
    
    // Decay périodique de la confiance pour les stats anciennes
    setInterval(() => this.decayOldStats(), 60000); // Chaque minute
  }

  // Initialiser ou récupérer le profil d'un adversaire
  getOpponentProfile(playerId: string, seat: number): OpponentStats {
    const existing = this.opponentProfiles.get(playerId);
    if (existing) {
      return existing;
    }

    const newProfile: OpponentStats = {
      playerId,
      seat,
      ...DEFAULT_OPPONENT_STATS,
    };

    this.opponentProfiles.set(playerId, newProfile);
    return newProfile;
  }

  // Mettre à jour les stats après observation d'une action
  updateOpponentAction(
    playerId: string,
    seat: number,
    context: {
      action: string;
      street: string;
      betSize?: number;
      facingBet: number;
      potSize: number;
      wasPreflop?: boolean;
      wasCbet?: boolean;
    }
  ): void {
    const profile = this.getOpponentProfile(playerId, seat);
    profile.handsObserved++;
    profile.lastSeenAt = Date.now();

    // Mettre à jour historique
    const history = this.actionHistory.get(playerId) || [];
    history.push({
      action: context.action,
      street: context.street,
      betSize: context.betSize || 0,
      timestamp: Date.now(),
    });
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    this.actionHistory.set(playerId, history);

    // Calculer VPIP/PFR
    if (context.wasPreflop) {
      if (context.action === "RAISE" || context.action === "CALL") {
        profile.vpip = this.updateStat(profile.vpip, 100, profile.handsObserved);
      } else {
        profile.vpip = this.updateStat(profile.vpip, 0, profile.handsObserved);
      }

      if (context.action === "RAISE") {
        profile.pfr = this.updateStat(profile.pfr, 100, profile.handsObserved);
      }
    }

    // Calculer aggression factor
    if (context.action === "BET" || context.action === "RAISE") {
      profile.aggFactor = this.updateStat(profile.aggFactor, 3.0, profile.handsObserved);
      profile.recentCalls = Math.max(0, profile.recentCalls - 1);
    } else if (context.action === "CALL") {
      profile.aggFactor = this.updateStat(profile.aggFactor, 1.0, profile.handsObserved);
      profile.recentCalls++;
    } else if (context.action === "FOLD") {
      profile.recentFolds++;
    }

    // C-bet tracking
    if (context.wasCbet) {
      if (context.street === "flop") {
        profile.cbetFlop = this.updateStat(
          profile.cbetFlop,
          context.action === "BET" ? 100 : 0,
          profile.handsObserved
        );
      } else if (context.street === "turn") {
        profile.cbetTurn = this.updateStat(
          profile.cbetTurn,
          context.action === "BET" ? 100 : 0,
          profile.handsObserved
        );
      }

      if (context.action === "FOLD" && context.facingBet > 0) {
        profile.foldToCbet = this.updateStat(profile.foldToCbet, 100, profile.handsObserved);
      }
    }

    // Bet sizing patterns
    if (context.betSize && context.potSize > 0) {
      const betSizePct = context.betSize / context.potSize;
      profile.avgBetSize = this.updateStat(
        profile.avgBetSize * 100,
        betSizePct * 100,
        profile.handsObserved
      ) / 100;

      if (betSizePct < 0.4) {
        profile.smallBetFreq = this.updateStat(profile.smallBetFreq, 1, profile.handsObserved);
      } else if (betSizePct > 1.2) {
        profile.oversizeFreq = this.updateStat(profile.oversizeFreq, 1, profile.handsObserved);
      }
    }

    // Check-raise tracking
    if (context.action === "RAISE" && context.street === "turn" && context.facingBet === 0) {
      profile.checkRaiseTurn = this.updateStat(profile.checkRaiseTurn, 100, profile.handsObserved);
    }

    // Calculer confiance (basé sur taille d'échantillon)
    profile.confidence = Math.min(1, profile.handsObserved / 50);

    this.opponentProfiles.set(playerId, profile);
    this.emit("profileUpdated", { playerId, profile });
  }

  // Détecter un bluff probable
  recordProbableBluff(playerId: string, strength: number): void {
    const profile = this.opponentProfiles.get(playerId);
    if (!profile) return;

    profile.recentBluffs++;

    // Ajuster aggFactor
    profile.aggFactor = Math.min(4, profile.aggFactor * 1.1);

    this.emit("bluffDetected", { playerId, bluffCount: profile.recentBluffs });
  }

  // Enregistrer résultat de la main (pour détecter tilt)
  recordHandResult(playerId: string, result: number, potSize: number): void {
    const profile = this.opponentProfiles.get(playerId);
    if (!profile) return;

    const isBigLoss = result < 0 && Math.abs(result) > potSize * 0.8;

    if (isBigLoss) {
      profile.recentLosses++;
      profile.lastBigLoss = Math.abs(result);
      profile.tiltIndicators = Math.min(1, profile.tiltIndicators + 0.15);
    } else if (result > 0) {
      profile.recentLosses = Math.max(0, profile.recentLosses - 1);
      profile.tiltIndicators = Math.max(0, profile.tiltIndicators - 0.08);
    }

    // Détection tilt
    profile.isOnTilt = profile.tiltIndicators > this.tiltThreshold;

    if (profile.isOnTilt && !this.opponentProfiles.get(playerId)?.isOnTilt) {
      this.emit("tiltDetected", { playerId, tiltLevel: profile.tiltIndicators });
    }

    // Decay progressif des compteurs récents
    if (Math.random() < 0.3) {
      profile.recentBluffs = Math.max(0, profile.recentBluffs - 1);
      profile.recentFolds = Math.max(0, profile.recentFolds - 1);
      profile.recentCalls = Math.max(0, profile.recentCalls - 1);
    }
  }

  // Initialiser ou récupérer table dynamics
  getTableDynamics(tableId: string): TableDynamics {
    const existing = this.tableDynamics.get(tableId);
    if (existing) return existing;

    const newDynamics: TableDynamics = {
      tableId,
      avgPotSize: 0,
      avgVpip: 25,
      isAggressive: false,
      isNitty: false,
      potSizeAnomalies: [],
      unusualAggression: false,
      massivePotRecently: false,
      recentHands: [],
      lastUpdated: Date.now(),
    };

    this.tableDynamics.set(tableId, newDynamics);
    return newDynamics;
  }

  // Mettre à jour table dynamics
  updateTableDynamics(
    tableId: string,
    context: {
      handNumber: string;
      potSize: number;
      heroAction: string;
      heroResult: number;
      tableVpip?: number;
    }
  ): void {
    const dynamics = this.getTableDynamics(tableId);

    // Mettre à jour avg pot size
    dynamics.avgPotSize = dynamics.avgPotSize * 0.9 + context.potSize * 0.1;

    // Détecter anomalies de pot size
    if (context.potSize > dynamics.avgPotSize * 2.5) {
      dynamics.potSizeAnomalies.push({
        handNumber: context.handNumber,
        size: context.potSize,
        expected: dynamics.avgPotSize,
      });
      dynamics.massivePotRecently = true;

      if (dynamics.potSizeAnomalies.length > 5) {
        dynamics.potSizeAnomalies.shift();
      }
    }

    // Mettre à jour VPIP moyen de la table
    if (context.tableVpip !== undefined) {
      dynamics.avgVpip = dynamics.avgVpip * 0.85 + context.tableVpip * 0.15;
    }

    // Détecter style de table
    dynamics.isAggressive = dynamics.avgVpip > 35;
    dynamics.isNitty = dynamics.avgVpip < 18;

    // Ajouter à historique récent
    dynamics.recentHands.push({
      handNumber: context.handNumber,
      heroAction: context.heroAction,
      heroResult: context.heroResult,
      timestamp: Date.now(),
    });

    if (dynamics.recentHands.length > 20) {
      dynamics.recentHands.shift();
    }

    dynamics.lastUpdated = Date.now();
    this.tableDynamics.set(tableId, dynamics);
  }

  // Générer ajustements exploitatifs basés sur profil adversaire + table dynamics
  getExploitativeAdjustment(
    playerId: string,
    tableId: string,
    context: {
      street: string;
      facingBet: number;
      potSize: number;
      position: string;
    }
  ): ExploitativeAdjustment {
    const profile = this.opponentProfiles.get(playerId);
    const dynamics = this.tableDynamics.get(tableId);

    // Si pas assez de données, retour GTO pur
    if (!profile || profile.confidence < 0.2) {
      return {
        reason: "Insufficient data, playing GTO",
        aggressionShift: 0,
        rangeAdjustment: 1.0,
        bluffFrequencyShift: 0,
        valueBetSizingShift: 1.0,
        confidence: 0.1,
      };
    }

    let aggressionShift = 0;
    let rangeAdjustment = 1.0;
    let bluffFrequencyShift = 0;
    let valueBetSizingShift = 1.0;
    const reasons: string[] = [];

    // Adversaire sur tilt
    if (profile.isOnTilt) {
      aggressionShift += 0.15;
      bluffFrequencyShift -= 0.1; // Moins de bluffs, il call light
      valueBetSizingShift += 0.2; // Value bet plus gros
      reasons.push("Opponent on tilt - increase value, reduce bluffs");
    }

    // Adversaire trop fold face à aggression
    if (profile.foldToCbet > 60) {
      bluffFrequencyShift += 0.15;
      aggressionShift += 0.1;
      reasons.push(`High fold-to-cbet (${profile.foldToCbet.toFixed(0)}%) - increase bluff frequency`);
    }

    // Adversaire passif (call station)
    if (profile.aggFactor < 1.5 && profile.recentCalls > 3) {
      bluffFrequencyShift -= 0.15;
      valueBetSizingShift += 0.15;
      rangeAdjustment = 0.9; // Tighter range
      reasons.push("Passive calling station - reduce bluffs, bet bigger for value");
    }

    // Adversaire hyper-agressif
    if (profile.aggFactor > 3.0 && profile.recentBluffs > 2) {
      aggressionShift -= 0.1; // Plus de traps
      rangeAdjustment = 1.2; // Call lighter
      reasons.push("Hyper-aggressive opponent - trap more, call lighter");
    }

    // Small bet tendencies
    if (profile.smallBetFreq > 0.5) {
      aggressionShift += 0.08;
      reasons.push("Opponent uses small bets frequently - apply pressure");
    }

    // Table dynamics adjustments
    if (dynamics) {
      if (dynamics.isAggressive) {
        rangeAdjustment *= 0.95; // Tighten slightly
        reasons.push("Aggressive table - tighten range");
      }

      if (dynamics.massivePotRecently) {
        aggressionShift -= 0.05; // Plus prudent
        reasons.push("Recent massive pot - play cautiously");
      }
    }

    // Limiter les ajustements
    aggressionShift = Math.max(-0.3, Math.min(0.3, aggressionShift));
    rangeAdjustment = Math.max(0.7, Math.min(1.3, rangeAdjustment));
    bluffFrequencyShift = Math.max(-0.2, Math.min(0.2, bluffFrequencyShift));
    valueBetSizingShift = Math.max(0.8, Math.min(1.4, valueBetSizingShift));

    return {
      reason: reasons.join(" | "),
      aggressionShift,
      rangeAdjustment,
      bluffFrequencyShift,
      valueBetSizingShift,
      confidence: profile.confidence,
    };
  }

  // Decay stats anciennes (appelé périodiquement)
  private decayOldStats(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [playerId, profile] of this.opponentProfiles.entries()) {
      const age = now - profile.lastSeenAt;

      if (age > maxAge) {
        profile.confidence *= this.confidenceDecayRate;

        // Supprimer si confiance trop faible
        if (profile.confidence < 0.05) {
          this.opponentProfiles.delete(playerId);
          this.actionHistory.delete(playerId);
        }
      }
    }
  }

  // Helper: mettre à jour une stat avec weighted average
  private updateStat(current: number, newValue: number, sampleSize: number): number {
    const weight = Math.min(1, 15 / sampleSize);
    return current * (1 - weight) + newValue * weight;
  }

  // Obtenir tous les profils pour une table
  getTableOpponents(tableId: string): OpponentStats[] {
    return Array.from(this.opponentProfiles.values());
  }

  // Obtenir statistiques d'ensemble
  getStats(): {
    totalProfiles: number;
    avgConfidence: number;
    tiltedOpponents: number;
    aggressiveTables: number;
  } {
    const profiles = Array.from(this.opponentProfiles.values());
    const dynamics = Array.from(this.tableDynamics.values());

    return {
      totalProfiles: profiles.length,
      avgConfidence: profiles.reduce((sum, p) => sum + p.confidence, 0) / profiles.length || 0,
      tiltedOpponents: profiles.filter(p => p.isOnTilt).length,
      aggressiveTables: dynamics.filter(d => d.isAggressive).length,
    };
  }

  // Reset tout
  reset(): void {
    this.opponentProfiles.clear();
    this.tableDynamics.clear();
    this.actionHistory.clear();
    this.emit("reset");
  }
}

// Singleton global
let globalOpponentProfiler: OpponentProfiler = new OpponentProfiler();

export function getOpponentProfiler(): OpponentProfiler {
  return globalOpponentProfiler;
}

export function resetOpponentProfiler(): void {
  globalOpponentProfiler = new OpponentProfiler();
}
