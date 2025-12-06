
/**
 * Anti-Pattern Detector
 * Surveille les patterns du bot et les compare à un joueur humain
 * Déclenche corrections si comportement trop "parfait"
 */

export interface PlayerBehaviorMetrics {
  avgDecisionTime: number;
  stdDevDecisionTime: number;
  coefficientOfVariation: number; // CV du timing (stdDev / mean)
  threeBetFrequency: number;
  cbetConsistency: number;
  valueToBluffRatio: number;
  tiltAggressionCorrelation: number;
  gtoAccuracy: number;
  foldToThreeBetFrequency: number; // Nouvelle métrique
  checkRaiseFrequency: number; // Nouvelle métrique
  donkBetFrequency: number; // Nouvelle métrique
  timeoutFrequency: number; // Fréquence des timeouts (humain = rare)
  instantActionFrequency: number; // Actions <500ms (suspect)
  sessionConsistency: number; // Variance inter-sessions (humain = haute)
  sizingRoundness: number; // Tendance à utiliser des sizings ronds (0.5, 0.66, 1.0)
  mouseMovementEntropy: number; // Entropie des mouvements souris
  pausePatternVariance: number; // Variance des pauses de réflexion
}

export interface HumanBaseline {
  avgDecisionTime: { min: number; max: number };
  stdDevDecisionTime: { min: number; max: number };
  coefficientOfVariation: { min: number; max: number };
  threeBetFrequency: { min: number; max: number };
  cbetConsistency: { min: number; max: number };
  valueToBluffRatio: { min: number; max: number };
  tiltAggressionCorrelation: { min: number; max: number };
  gtoAccuracy: { min: number; max: number };
  foldToThreeBetFrequency: { min: number; max: number };
  checkRaiseFrequency: { min: number; max: number };
  donkBetFrequency: { min: number; max: number };
  timeoutFrequency: { min: number; max: number };
  instantActionFrequency: { min: number; max: number };
  sessionConsistency: { min: number; max: number };
  sizingRoundness: { min: number; max: number };
  mouseMovementEntropy: { min: number; max: number };
  pausePatternVariance: { min: number; max: number };
}

// Baselines issues de datasets de vrais joueurs (500+ échantillons)
const HUMAN_BASELINE: HumanBaseline = {
  avgDecisionTime: { min: 2000, max: 8000 },
  stdDevDecisionTime: { min: 800, max: 3000 },
  coefficientOfVariation: { min: 0.35, max: 0.65 }, // CV = 35-65% pour humains
  threeBetFrequency: { min: 0.04, max: 0.12 },
  cbetConsistency: { min: 0.50, max: 0.75 },
  valueToBluffRatio: { min: 1.5, max: 3.5 },
  tiltAggressionCorrelation: { min: 0.3, max: 0.7 },
  gtoAccuracy: { min: 0.65, max: 0.85 }, // Jamais >90%
  foldToThreeBetFrequency: { min: 0.55, max: 0.75 },
  checkRaiseFrequency: { min: 0.05, max: 0.15 },
  donkBetFrequency: { min: 0.02, max: 0.08 },
  timeoutFrequency: { min: 0.001, max: 0.015 }, // 0.1-1.5% timeouts
  instantActionFrequency: { min: 0.05, max: 0.20 }, // 5-20% actions rapides OK
  sessionConsistency: { min: 0.20, max: 0.50 }, // Variance entre sessions
  sizingRoundness: { min: 0.25, max: 0.45 }, // 25-45% sizings "ronds"
  mouseMovementEntropy: { min: 3.5, max: 5.5 }, // Entropie Shannon
  pausePatternVariance: { min: 0.40, max: 0.75 }, // Variance des pauses
};

export class AntiPatternDetector {
  private botMetrics: Partial<PlayerBehaviorMetrics> = {};
  private actionHistory: Array<{
    timestamp: number;
    decisionTime: number;
    action: string;
    wasThreeBet: boolean;
    wasCbet: boolean;
    wasGtoOptimal: boolean;
    tiltLevel: number;
    aggression: number;
  }> = [];

  recordAction(action: {
    timestamp: number;
    decisionTime: number;
    action: string;
    wasThreeBet: boolean;
    wasCbet: boolean;
    wasGtoOptimal: boolean;
    tiltLevel: number;
    aggression: number;
  }): void {
    this.actionHistory.push(action);

    // Garder 500 dernières actions
    if (this.actionHistory.length > 500) {
      this.actionHistory = this.actionHistory.slice(-500);
    }

    // Recalculer métriques tous les 50 actions
    if (this.actionHistory.length % 50 === 0) {
      this.updateMetrics();
    }
  }

  private updateMetrics(): void {
    const actions = this.actionHistory;

    // Decision time stats
    const decisionTimes = actions.map(a => a.decisionTime);
    const avgTime = decisionTimes.reduce((sum, t) => sum + t, 0) / decisionTimes.length;
    const variance = decisionTimes.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / decisionTimes.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / avgTime; // Coefficient de variation

    // 3-bet frequency
    const threeBets = actions.filter(a => a.wasThreeBet).length;
    const threeBetFreq = threeBets / actions.length;

    // C-bet consistency
    const cbets = actions.filter(a => a.wasCbet);
    const cbetConsistency = cbets.length > 0
      ? cbets.filter(a => a.action.includes('BET')).length / cbets.length
      : 0;

    // GTO accuracy
    const gtoOptimal = actions.filter(a => a.wasGtoOptimal).length;
    const gtoAccuracy = gtoOptimal / actions.length;

    // Tilt-aggression correlation
    const correlation = this.calculateCorrelation(
      actions.map(a => a.tiltLevel),
      actions.map(a => a.aggression)
    );

    // Nouvelles métriques avancées
    const foldToThreeBets = actions.filter(a => a.action === 'FOLD' && a.wasThreeBet).length;
    const foldToThreeBetFreq = threeBets > 0 ? foldToThreeBets / threeBets : 0.65;

    const checkRaises = actions.filter(a => a.action.includes('RAISE') && a.action.includes('CHECK')).length;
    const checkRaiseFreq = checkRaises / actions.length;

    const donkBets = actions.filter(a => a.action.includes('DONK')).length;
    const donkBetFreq = donkBets / actions.length;

    // Actions instantanées (<500ms) - suspect si trop fréquent
    const instantActions = decisionTimes.filter(t => t < 500).length;
    const instantFreq = instantActions / decisionTimes.length;

    // Timeouts simulés (rare chez humains)
    const timeouts = actions.filter(a => a.decisionTime > 25000).length;
    const timeoutFreq = timeouts / actions.length;

    // Variance des pauses de réflexion
    const pauseVariances = this.calculatePauseVariance(decisionTimes);

    this.botMetrics = {
      avgDecisionTime: avgTime,
      stdDevDecisionTime: stdDev,
      coefficientOfVariation: cv,
      threeBetFrequency: threeBetFreq,
      cbetConsistency,
      valueToBluffRatio: 2.5, // TODO: calculer réellement
      gtoAccuracy,
      tiltAggressionCorrelation: correlation,
      foldToThreeBetFrequency: foldToThreeBetFreq,
      checkRaiseFrequency: checkRaiseFreq,
      donkBetFrequency: donkBetFreq,
      timeoutFrequency: timeoutFreq,
      instantActionFrequency: instantFreq,
      sessionConsistency: 0.35, // TODO: calculer entre sessions
      sizingRoundness: 0.35, // TODO: calculer depuis sizings
      mouseMovementEntropy: 4.2, // TODO: calculer depuis mouvements souris
      pausePatternVariance: pauseVariances,
    };
  }

  private calculatePauseVariance(timings: number[]): number {
    if (timings.length < 10) return 0.5;
    
    // Calculer variance entre chunks de 10 actions
    const chunkSize = 10;
    const chunks: number[] = [];
    
    for (let i = 0; i < timings.length - chunkSize; i += chunkSize) {
      const chunk = timings.slice(i, i + chunkSize);
      const chunkAvg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      chunks.push(chunkAvg);
    }
    
    if (chunks.length < 2) return 0.5;
    
    const chunksAvg = chunks.reduce((a, b) => a + b, 0) / chunks.length;
    const chunksVariance = chunks.reduce((sum, c) => sum + Math.pow(c - chunksAvg, 2), 0) / chunks.length;
    const chunksStdDev = Math.sqrt(chunksVariance);
    
    return chunksStdDev / chunksAvg; // CV des pauses
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Détecte si un pattern est trop parfait
   */
  detectPerfectionistPatterns(): Array<{
    metric: string;
    severity: 'warning' | 'critical';
    deviation: string;
    recommendation: string;
  }> {
    const issues: Array<any> = [];

    Object.entries(this.botMetrics).forEach(([metric, value]) => {
      const baseline = HUMAN_BASELINE[metric as keyof HumanBaseline];
      if (!baseline || value === undefined) return;

      let severity: 'warning' | 'critical' | null = null;
      let deviation = '';

      if (value < baseline.min) {
        const pct = ((baseline.min - value) / baseline.min * 100).toFixed(1);
        deviation = `${pct}% below human range`;
        severity = parseFloat(pct) > 20 ? 'critical' : 'warning';
      } else if (value > baseline.max) {
        const pct = ((value - baseline.max) / baseline.max * 100).toFixed(1);
        deviation = `${pct}% above human range`;
        severity = parseFloat(pct) > 20 ? 'critical' : 'warning';
      }

      if (severity) {
        issues.push({
          metric,
          severity,
          deviation,
          recommendation: this.getRecommendation(metric),
        });
      }
    });

    return issues;
  }

  private getRecommendation(metric: string): string {
    const recommendations: Record<string, string> = {
      avgDecisionTime: 'Augmenter les délais de thinking ou ajouter pauses',
      stdDevDecisionTime: 'Augmenter thinkingTimeVariance à 0.4+',
      coefficientOfVariation: 'Augmenter variance relative (CV cible: 40-60%)',
      threeBetFrequency: 'Ajuster ranges 3-bet selon profil',
      cbetConsistency: 'Varier C-bet frequency (50-75%)',
      gtoAccuracy: 'Augmenter erreurs intentionnelles à 15-20%',
      tiltAggressionCorrelation: 'Activer profil dynamique avec tilt réaliste',
      foldToThreeBetFrequency: 'Varier réaction aux 3-bets (55-75%)',
      checkRaiseFrequency: 'Ajouter check-raises occasionnels (5-15%)',
      donkBetFrequency: 'Ajouter donk-bets rares (2-8%)',
      timeoutFrequency: 'Simuler timeouts occasionnels (0.1-1.5%)',
      instantActionFrequency: 'Réduire actions instantanées (<20%)',
      sessionConsistency: 'Augmenter variance entre sessions',
      sizingRoundness: 'Varier sizings (25-45% ronds)',
      mouseMovementEntropy: 'Augmenter chaos mouvements souris',
      pausePatternVariance: 'Augmenter variance des pauses (CV 40-75%)',
    };
    return recommendations[metric] || 'Review behavior pattern';
  }

  /**
   * Suggère des ajustements automatiques
   */
  suggestAutoAdjustments(): {
    thinkingTimeVariance?: number;
    errorProbability?: number;
    delayMultiplier?: number;
    enableTimeouts?: boolean;
    enableDonkBets?: boolean;
    enableCheckRaises?: boolean;
    reduceSizingRoundness?: boolean;
    increaseMouseEntropy?: boolean;
  } {
    const issues = this.detectPerfectionistPatterns();
    const adjustments: any = {};

    issues.forEach(issue => {
      // Variance du timing trop faible
      if (issue.metric === 'stdDevDecisionTime' && issue.severity === 'critical') {
        adjustments.thinkingTimeVariance = 0.5;
      }
      
      if (issue.metric === 'coefficientOfVariation' && this.botMetrics.coefficientOfVariation! < 0.35) {
        adjustments.thinkingTimeVariance = 0.6; // Augmenter encore plus
      }

      // GTO trop parfait
      if (issue.metric === 'gtoAccuracy' && this.botMetrics.gtoAccuracy! > 0.90) {
        adjustments.errorProbability = 0.15; // 15% erreurs
      } else if (this.botMetrics.gtoAccuracy! > 0.88) {
        adjustments.errorProbability = 0.12; // 12% erreurs
      }

      // Timing trop rapide
      if (issue.metric === 'avgDecisionTime' && this.botMetrics.avgDecisionTime! < 2500) {
        adjustments.delayMultiplier = 1.5;
      }
      
      // Actions instantanées trop fréquentes
      if (issue.metric === 'instantActionFrequency' && this.botMetrics.instantActionFrequency! > 0.20) {
        adjustments.delayMultiplier = Math.max(adjustments.delayMultiplier || 1, 1.3);
      }

      // Manque de timeouts (trop parfait)
      if (issue.metric === 'timeoutFrequency' && this.botMetrics.timeoutFrequency! < 0.001) {
        adjustments.enableTimeouts = true;
      }

      // Manque de donk-bets (jeu trop GTO)
      if (issue.metric === 'donkBetFrequency' && this.botMetrics.donkBetFrequency! < 0.02) {
        adjustments.enableDonkBets = true;
      }

      // Manque de check-raises
      if (issue.metric === 'checkRaiseFrequency' && this.botMetrics.checkRaiseFrequency! < 0.05) {
        adjustments.enableCheckRaises = true;
      }

      // Sizings trop ronds (suspect)
      if (issue.metric === 'sizingRoundness' && this.botMetrics.sizingRoundness! > 0.45) {
        adjustments.reduceSizingRoundness = true;
      }

      // Mouvements souris trop réguliers
      if (issue.metric === 'mouseMovementEntropy' && this.botMetrics.mouseMovementEntropy! < 3.5) {
        adjustments.increaseMouseEntropy = true;
      }

      // Pauses trop régulières
      if (issue.metric === 'pausePatternVariance' && this.botMetrics.pausePatternVariance! < 0.40) {
        adjustments.thinkingTimeVariance = Math.max(adjustments.thinkingTimeVariance || 0, 0.55);
      }
    });

    return adjustments;
  }

  getMetrics(): PlayerBehaviorMetrics {
    return this.botMetrics as PlayerBehaviorMetrics;
  }
}

let antiPatternInstance: AntiPatternDetector | null = null;

export function getAntiPatternDetector(): AntiPatternDetector {
  if (!antiPatternInstance) {
    antiPatternInstance = new AntiPatternDetector();
  }
  return antiPatternInstance;
}
