
/**
 * OCR Error Correction Module
 * Détecte et corrige les erreurs communes d'OCR dans la reconnaissance poker
 */

export interface CorrectionRule {
  type: "rank" | "suit" | "pot" | "stack" | "bet";
  pattern: string | RegExp;
  correction: string | ((match: string) => string);
  confidence: number;
  description: string;
}

export interface CorrectionResult {
  original: string;
  corrected: string;
  applied: boolean;
  rule?: CorrectionRule;
  confidence: number;
}

export class OCRErrorCorrector {
  private rankRules: CorrectionRule[] = [
    {
      type: "rank",
      pattern: /^R$/i,
      correction: "K",
      confidence: 0.85,
      description: "R brouillé → K",
    },
    {
      type: "rank",
      pattern: /^6$/,
      correction: (match) => "9", // Contextuel
      confidence: 0.70,
      description: "6 inversé → potentiel 9",
    },
    {
      type: "rank",
      pattern: /^9$/,
      correction: (match) => "6", // Contextuel
      confidence: 0.70,
      description: "9 inversé → potentiel 6",
    },
    {
      type: "rank",
      pattern: /^O$/i,
      correction: "Q",
      confidence: 0.80,
      description: "O → Q (Queen)",
    },
    {
      type: "rank",
      pattern: /^0$/,
      correction: "Q",
      confidence: 0.75,
      description: "0 → Q",
    },
    {
      type: "rank",
      pattern: /^I$/i,
      correction: "1",
      confidence: 0.70,
      description: "I → 1 ou J",
    },
    {
      type: "rank",
      pattern: /^[1l]$/i,
      correction: "J",
      confidence: 0.65,
      description: "1/l → J",
    },
    {
      type: "rank",
      pattern: /^5$/,
      correction: "S",
      confidence: 0.60,
      description: "5 → S (contextuel)",
    },
  ];

  private potRules: CorrectionRule[] = [
    {
      type: "pot",
      pattern: /[^\d.,]/g,
      correction: "",
      confidence: 0.90,
      description: "Suppression caractères non-numériques",
    },
    {
      type: "pot",
      pattern: /^[\d.,]+$/,
      correction: (match) => {
        const cleaned = match.replace(/,/g, ".");
        const value = parseFloat(cleaned);
        if (isNaN(value)) return "0";
        if (value > 1000000) return String(value / 100); // Erreur décimale
        if (value > 100000) return String(value / 10); // Erreur décimale
        return String(value);
      },
      confidence: 0.85,
      description: "Validation plage pot réaliste",
    },
    {
      type: "pot",
      pattern: /O/g,
      correction: "0",
      confidence: 0.88,
      description: "O → 0 dans montants",
    },
    {
      type: "pot",
      pattern: /l/g,
      correction: "1",
      confidence: 0.85,
      description: "l → 1 dans montants",
    },
  ];

  private cardLogicRules: {
    check: (cards: string[]) => boolean;
    description: string;
    fix?: (cards: string[]) => string[];
  }[] = [
    {
      check: (cards) => {
        if (cards.length !== 2) return false;
        const [c1, c2] = cards;
        return c1 === c2; // Cartes identiques impossibles
      },
      description: "Cartes hero identiques (impossible)",
      fix: (cards) => {
        console.warn("[OCRCorrector] Détection carte dupliquée, invalidation");
        return []; // Invalide la main
      },
    },
    {
      check: (cards) => {
        const validRanks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
        const validSuits = ["h", "d", "c", "s"];
        return cards.some(c => {
          const rank = c.slice(0, -1);
          const suit = c.slice(-1).toLowerCase();
          return !validRanks.includes(rank) || !validSuits.includes(suit);
        });
      },
      description: "Carte avec rang/couleur invalide",
    },
  ];

  correctRank(detectedRank: string, context?: { position?: string; previousDetections?: string[] }): CorrectionResult {
    const original = detectedRank;
    let corrected = detectedRank;
    let appliedRule: CorrectionRule | undefined;
    let maxConfidence = 1.0;

    for (const rule of this.rankRules) {
      if (typeof rule.pattern === "string") {
        if (detectedRank.toUpperCase() === rule.pattern.toUpperCase()) {
          const correction = typeof rule.correction === "function" 
            ? rule.correction(detectedRank) 
            : rule.correction;
          
          if (rule.confidence > maxConfidence - 0.2) {
            corrected = correction;
            appliedRule = rule;
            maxConfidence = rule.confidence;
          }
        }
      } else {
        const match = detectedRank.match(rule.pattern);
        if (match) {
          const correction = typeof rule.correction === "function" 
            ? rule.correction(match[0]) 
            : rule.correction;
          
          corrected = detectedRank.replace(rule.pattern, correction);
          appliedRule = rule;
          maxConfidence = rule.confidence;
          break;
        }
      }
    }

    // Validation contextuelle pour 6/9
    if (context?.previousDetections && (corrected === "6" || corrected === "9")) {
      const has6 = context.previousDetections.includes("6");
      const has9 = context.previousDetections.includes("9");
      
      if (has6 && original === "9") {
        maxConfidence *= 0.6; // Probable erreur si déjà un 6
      }
      if (has9 && original === "6") {
        maxConfidence *= 0.6; // Probable erreur si déjà un 9
      }
    }

    return {
      original,
      corrected,
      applied: corrected !== original,
      rule: appliedRule,
      confidence: maxConfidence,
    };
  }

  correctPotValue(detectedValue: string): CorrectionResult {
    const original = detectedValue;
    let corrected = detectedValue;
    let appliedRule: CorrectionRule | undefined;

    for (const rule of this.potRules) {
      if (typeof rule.pattern === "string") {
        continue;
      } else {
        const match = detectedValue.match(rule.pattern);
        if (match) {
          const correction = typeof rule.correction === "function" 
            ? rule.correction(detectedValue) 
            : rule.correction;
          
          corrected = detectedValue.replace(rule.pattern, correction);
          appliedRule = rule;
        }
      }
    }

    const numValue = parseFloat(corrected.replace(/,/g, "."));
    const confidence = this.validatePotRange(numValue);

    return {
      original,
      corrected,
      applied: corrected !== original,
      rule: appliedRule,
      confidence,
    };
  }

  private validatePotRange(value: number): number {
    if (isNaN(value) || value < 0) return 0.0;
    if (value === 0) return 0.95; // Pot vide valide
    if (value < 0.5) return 0.5; // Trop petit, suspect
    if (value <= 1000) return 0.90; // Range normal
    if (value <= 10000) return 0.75; // Range élevé mais possible
    if (value <= 100000) return 0.50; // Très suspect
    return 0.20; // Quasi impossible
  }

  validateCards(cards: string[]): { valid: boolean; errors: string[]; fixedCards?: string[] } {
    const errors: string[] = [];
    let fixedCards: string[] | undefined;

    for (const rule of this.cardLogicRules) {
      if (rule.check(cards)) {
        errors.push(rule.description);
        if (rule.fix) {
          fixedCards = rule.fix(cards);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      fixedCards,
    };
  }

  correctCardNotation(notation: string, context?: { allCards?: string[] }): CorrectionResult {
    if (!notation || notation.length < 2) {
      return {
        original: notation,
        corrected: "",
        applied: false,
        confidence: 0,
      };
    }

    const rank = notation.slice(0, -1);
    const suit = notation.slice(-1).toLowerCase();

    const rankCorrection = this.correctRank(rank, {
      previousDetections: context?.allCards?.map(c => c.slice(0, -1)),
    });

    const validSuits = ["h", "d", "c", "s"];
    let correctedSuit = suit;
    let suitConfidence = 1.0;

    if (!validSuits.includes(suit)) {
      // Tentative correction couleur
      const suitMap: Record<string, string> = {
        "i": "h",
        "o": "d",
        "0": "d",
        "l": "c",
        "1": "c",
      };
      correctedSuit = suitMap[suit] || suit;
      suitConfidence = 0.60;
    }

    const correctedNotation = rankCorrection.corrected + correctedSuit;
    const finalConfidence = Math.min(rankCorrection.confidence, suitConfidence);

    return {
      original: notation,
      corrected: correctedNotation,
      applied: correctedNotation !== notation,
      rule: rankCorrection.rule,
      confidence: finalConfidence,
    };
  }

  getStats(): {
    rankRulesCount: number;
    potRulesCount: number;
    cardLogicRulesCount: number;
  } {
    return {
      rankRulesCount: this.rankRules.length,
      potRulesCount: this.potRules.length,
      cardLogicRulesCount: this.cardLogicRules.length,
    };
  }
}

export const ocrErrorCorrector = new OCRErrorCorrector();
