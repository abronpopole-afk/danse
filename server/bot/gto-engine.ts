import { GtoRecommendation } from "@shared/schema";

export interface HandContext {
  heroCards: string[];
  communityCards: string[];
  street: "preflop" | "flop" | "turn" | "river";
  heroPosition: string;
  potSize: number;
  heroStack: number;
  facingBet: number;
  numPlayers: number;
  isInPosition: boolean;
}

export interface GtoAdapter {
  getRecommendation(context: HandContext): Promise<GtoRecommendation>;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const CARD_SUITS = ['h', 'd', 'c', 's'];

function getCardValue(rank: string): number {
  return CARD_RANKS.indexOf(rank.charAt(0));
}

function isPair(cards: string[]): boolean {
  if (cards.length !== 2) return false;
  return cards[0].charAt(0) === cards[1].charAt(0);
}

function isSuited(cards: string[]): boolean {
  if (cards.length !== 2) return false;
  return cards[0].charAt(1) === cards[1].charAt(1);
}

function getHandStrength(cards: string[]): number {
  if (cards.length !== 2) return 0.3;
  
  const [card1, card2] = cards;
  const rank1 = getCardValue(card1);
  const rank2 = getCardValue(card2);
  const highCard = Math.max(rank1, rank2);
  const lowCard = Math.min(rank1, rank2);
  const gap = highCard - lowCard;
  const suited = isSuited(cards);
  const pair = isPair(cards);
  
  let strength = 0.2;
  
  if (pair) {
    strength = 0.5 + (highCard / CARD_RANKS.length) * 0.4;
    if (highCard >= 10) strength += 0.15;
  } else {
    strength = (highCard + lowCard) / (2 * CARD_RANKS.length) * 0.6;
    if (suited) strength += 0.08;
    if (gap <= 2) strength += 0.05;
    if (highCard >= 11 && lowCard >= 9) strength += 0.1;
  }
  
  const premiumHands = ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'];
  const handNotation = getHandNotation(cards);
  if (premiumHands.some(h => handNotation.startsWith(h.replace('s', '').replace('o', '')))) {
    strength = Math.max(strength, 0.85);
  }
  
  return Math.min(1, Math.max(0, strength));
}

function getHandNotation(cards: string[]): string {
  if (cards.length !== 2) return '';
  const [card1, card2] = cards;
  const rank1 = card1.charAt(0);
  const rank2 = card2.charAt(0);
  const suited = isSuited(cards);
  
  const val1 = getCardValue(card1);
  const val2 = getCardValue(card2);
  
  if (val1 === val2) return rank1 + rank2;
  
  const highRank = val1 > val2 ? rank1 : rank2;
  const lowRank = val1 > val2 ? rank2 : rank1;
  
  return highRank + lowRank + (suited ? 's' : 'o');
}

function evaluateBoardTexture(communityCards: string[]): {
  isPaired: boolean;
  isFlushDraw: boolean;
  isStraightDraw: boolean;
  highCard: number;
} {
  if (communityCards.length === 0) {
    return { isPaired: false, isFlushDraw: false, isStraightDraw: false, highCard: 0 };
  }
  
  const ranks = communityCards.map(c => getCardValue(c));
  const suits = communityCards.map(c => c.charAt(1));
  
  const isPaired = new Set(ranks).size < ranks.length;
  
  const suitCount: Record<string, number> = {};
  suits.forEach(s => { suitCount[s] = (suitCount[s] || 0) + 1; });
  const isFlushDraw = Object.values(suitCount).some(count => count >= 3);
  
  const sortedRanks = [...new Set(ranks)].sort((a, b) => a - b);
  let isStraightDraw = false;
  for (let i = 0; i < sortedRanks.length - 2; i++) {
    if (sortedRanks[i + 2] - sortedRanks[i] <= 4) {
      isStraightDraw = true;
      break;
    }
  }
  
  return {
    isPaired,
    isFlushDraw,
    isStraightDraw,
    highCard: Math.max(...ranks),
  };
}

export class SimulatedGtoAdapter implements GtoAdapter {
  private connected = false;
  
  async getRecommendation(context: HandContext): Promise<GtoRecommendation> {
    // Check cache first
    const { getGtoCache } = await import("./gto-cache");
    const cache = getGtoCache();
    const cached = cache.get(context);
    
    if (cached) {
      return cached;
    }
    
    const handStrength = getHandStrength(context.heroCards);
    const boardTexture = evaluateBoardTexture(context.communityCards);
    
    // Récupérer les modifiers du profil dynamique
    let modifiers = {
      aggressionShift: 0,
      rangeWidening: 1,
      sizingVariance: 1,
    };

    try {
      const { getPlayerProfile } = await import("./player-profile");
      const profile = getPlayerProfile();
      const profileModifiers = profile.getModifiers();
      modifiers = {
        aggressionShift: profileModifiers.aggressionShift,
        rangeWidening: profileModifiers.rangeWidening,
        sizingVariance: profileModifiers.sizingVariance,
      };
    } catch (error) {
      // Utiliser les valeurs par défaut si le profil n'est pas disponible
    }

    // Vérifier le mode conservateur
    try {
      const { getSafeModeManager } = await import("./safe-mode");
      const safeModeManager = getSafeModeManager();
      
      if (safeModeManager.shouldFoldBorderlineHand(handStrength, context.facingBet, context.potSize)) {
        const result = {
          actions: [
            { action: "FOLD", probability: 0.95, ev: 0 },
            { action: "CALL", probability: 0.05, ev: -0.1 },
          ],
          bestAction: "FOLD",
          confidence: 0.90,
        };
        
        // Cache the result
        cache.set(context, result);
        
        return result;
      }
    } catch (error) {
      // Safe mode non disponible, continuer normalement
    }
    
    const result = this.generateRecommendation(context, handStrength, boardTexture, modifiers);
    
    // Cache the result
    cache.set(context, result);
    
    return result;
  }
  
  private generateRecommendation(
    context: HandContext,
    handStrength: number,
    boardTexture: ReturnType<typeof evaluateBoardTexture>,
    modifiers: { aggressionShift: number; rangeWidening: number; sizingVariance: number } = { aggressionShift: 0, rangeWidening: 1, sizingVariance: 1 }
  ): GtoRecommendation {
    const { street, facingBet, potSize, isInPosition, numPlayers } = context;
    
    // Ajuster la force de main selon rangeWidening (tilt = joue plus large)
    const adjustedStrength = handStrength * modifiers.rangeWidening;
    
    if (street === "preflop") {
      return this.getPreflopRecommendation(context, adjustedStrength, modifiers);
    }
    
    return this.getPostflopRecommendation(context, adjustedStrength, boardTexture, modifiers);
  }
  
  private getPreflopRecommendation(
    context: HandContext, 
    handStrength: number,
    modifiers: { aggressionShift: number; rangeWidening: number; sizingVariance: number } = { aggressionShift: 0, rangeWidening: 1, sizingVariance: 1 }
  ): GtoRecommendation {
    const { facingBet, potSize, heroPosition } = context;
    const isRfi = facingBet === 0 || facingBet <= 1;
    
    // Appliquer aggressionShift (tilt = plus agressif)
    const aggBonus = modifiers.aggressionShift;
    
    if (isRfi) {
      if (handStrength >= 0.85) {
        return {
          actions: [
            { action: "RAISE", probability: Math.min(0.98, 0.95 + aggBonus * 0.3), ev: 0.45 },
            { action: "CALL", probability: Math.max(0.02, 0.05 - aggBonus * 0.3), ev: 0.20 },
          ],
          bestAction: "RAISE",
          confidence: 0.95,
        };
      } else if (handStrength >= 0.6) {
        return {
          actions: [
            { action: "RAISE", probability: Math.min(0.90, 0.70 + aggBonus * 0.4), ev: 0.25 },
            { action: "FOLD", probability: Math.max(0.05, 0.25 - aggBonus * 0.3), ev: 0 },
            { action: "CALL", probability: 0.05, ev: 0.10 },
          ],
          bestAction: "RAISE",
          confidence: 0.85,
        };
      } else if (handStrength >= 0.4) {
        return {
          actions: [
            { action: "FOLD", probability: 0.55, ev: 0 },
            { action: "RAISE", probability: 0.35, ev: 0.08 },
            { action: "CALL", probability: 0.10, ev: 0.02 },
          ],
          bestAction: "FOLD",
          confidence: 0.70,
        };
      } else {
        return {
          actions: [
            { action: "FOLD", probability: 0.90, ev: 0 },
            { action: "RAISE", probability: 0.10, ev: -0.05 },
          ],
          bestAction: "FOLD",
          confidence: 0.90,
        };
      }
    } else {
      if (handStrength >= 0.85) {
        return {
          actions: [
            { action: "RAISE", probability: 0.75, ev: 0.55 },
            { action: "CALL", probability: 0.25, ev: 0.35 },
          ],
          bestAction: "RAISE",
          confidence: 0.92,
        };
      } else if (handStrength >= 0.6) {
        return {
          actions: [
            { action: "CALL", probability: 0.60, ev: 0.18 },
            { action: "FOLD", probability: 0.30, ev: 0 },
            { action: "RAISE", probability: 0.10, ev: 0.12 },
          ],
          bestAction: "CALL",
          confidence: 0.75,
        };
      } else {
        return {
          actions: [
            { action: "FOLD", probability: 0.85, ev: 0 },
            { action: "CALL", probability: 0.15, ev: -0.08 },
          ],
          bestAction: "FOLD",
          confidence: 0.88,
        };
      }
    }
  }
  
  private getPostflopRecommendation(
    context: HandContext,
    handStrength: number,
    boardTexture: ReturnType<typeof evaluateBoardTexture>,
    modifiers: { aggressionShift: number; rangeWidening: number; sizingVariance: number } = { aggressionShift: 0, rangeWidening: 1, sizingVariance: 1 }
  ): GtoRecommendation {
    const { facingBet, potSize, isInPosition, street } = context;
    const positionBonus = isInPosition ? 0.1 : 0;
    const adjustedStrength = handStrength + positionBonus;
    
    const dangerousBoard = boardTexture.isFlushDraw || boardTexture.isStraightDraw;
    const aggBonus = modifiers.aggressionShift;
    
    if (facingBet === 0) {
      if (adjustedStrength >= 0.75) {
        const baseBetSize = dangerousBoard ? 0.75 : 0.33;
        
        // Utiliser le humanizer pour sizing imparfait
        const { getHumanizer } = await import("./humanizer");
        const humanizer = getHumanizer();
        const betSize = humanizer.getHumanizedSizing(baseBetSize, potSize, street);
        
        return {
          actions: [
            { action: `BET ${Math.round(betSize * 100)}%`, probability: Math.min(0.90, 0.65 + aggBonus * 0.5), ev: 0.35 },
            { action: "CHECK", probability: Math.max(0.10, 0.35 - aggBonus * 0.5), ev: 0.20 },
          ],
          bestAction: `BET ${Math.round(betSize * 100)}%`,
          confidence: 0.85,
        };
      } else if (adjustedStrength >= 0.5) {
        return {
          actions: [
            { action: "CHECK", probability: 0.55, ev: 0.12 },
            { action: "BET 33%", probability: 0.45, ev: 0.10 },
          ],
          bestAction: "CHECK",
          confidence: 0.70,
        };
      } else {
        return {
          actions: [
            { action: "CHECK", probability: 0.85, ev: 0.02 },
            { action: "BET 33%", probability: 0.15, ev: -0.02 },
          ],
          bestAction: "CHECK",
          confidence: 0.88,
        };
      }
    } else {
      const potOdds = facingBet / (potSize + facingBet);
      const requiredEquity = potOdds;
      
      if (adjustedStrength >= 0.8) {
        return {
          actions: [
            { action: "RAISE", probability: 0.60, ev: 0.45 },
            { action: "CALL", probability: 0.40, ev: 0.30 },
          ],
          bestAction: "RAISE",
          confidence: 0.88,
        };
      } else if (adjustedStrength >= requiredEquity + 0.1) {
        return {
          actions: [
            { action: "CALL", probability: 0.75, ev: 0.15 },
            { action: "RAISE", probability: 0.15, ev: 0.08 },
            { action: "FOLD", probability: 0.10, ev: 0 },
          ],
          bestAction: "CALL",
          confidence: 0.78,
        };
      } else if (adjustedStrength >= requiredEquity - 0.1) {
        return {
          actions: [
            { action: "FOLD", probability: 0.55, ev: 0 },
            { action: "CALL", probability: 0.45, ev: -0.05 },
          ],
          bestAction: "FOLD",
          confidence: 0.65,
        };
      } else {
        return {
          actions: [
            { action: "FOLD", probability: 0.90, ev: 0 },
            { action: "CALL", probability: 0.10, ev: -0.15 },
          ],
          bestAction: "FOLD",
          confidence: 0.92,
        };
      }
    }
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  async connect(): Promise<void> {
    this.connected = true;
  }
  
  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

export class GtoWizardAdapter implements GtoAdapter {
  private apiEndpoint: string;
  private apiKey: string;
  private connected = false;
  private fallbackAdapter: SimulatedGtoAdapter;
  
  constructor(apiEndpoint: string, apiKey: string) {
    this.apiEndpoint = apiEndpoint;
    this.apiKey = apiKey;
    this.fallbackAdapter = new SimulatedGtoAdapter();
  }
  
  async getRecommendation(context: HandContext): Promise<GtoRecommendation> {
    // Check cache first
    const { getGtoCache } = await import("./gto-cache");
    const cache = getGtoCache();
    const cached = cache.get(context);
    
    if (cached) {
      return cached;
    }
    
    if (!this.connected) {
      const result = await this.fallbackAdapter.getRecommendation(context);
      cache.set(context, result);
      return result;
    }
    
    try {
      // TODO: Implement actual GTO Wizard API call here
      const result = await this.fallbackAdapter.getRecommendation(context);
      cache.set(context, result);
      return result;
    } catch (error) {
      console.error("GTO Wizard API error, falling back to simulation:", error);
      const result = await this.fallbackAdapter.getRecommendation(context);
      cache.set(context, result);
      return result;
    }
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  async connect(): Promise<void> {
    this.connected = true;
    await this.fallbackAdapter.connect();
  }
  
  async disconnect(): Promise<void> {
    this.connected = false;
    await this.fallbackAdapter.disconnect();
  }
}

let currentGtoAdapter: GtoAdapter = new SimulatedGtoAdapter();

export function getGtoAdapter(): GtoAdapter {
  return currentGtoAdapter;
}

export function setGtoAdapter(adapter: GtoAdapter): void {
  currentGtoAdapter = adapter;
}

export async function initializeGtoAdapter(config: {
  apiEndpoint?: string;
  apiKey?: string;
  useSimulation?: boolean;
  useAdvanced?: boolean;
}): Promise<GtoAdapter> {
  if (config.useAdvanced) {
    const { AdvancedGtoAdapter } = await import("./gto-advanced");
    currentGtoAdapter = new AdvancedGtoAdapter();
  } else if (config.useSimulation || !config.apiKey || !config.apiEndpoint) {
    currentGtoAdapter = new SimulatedGtoAdapter();
  } else {
    currentGtoAdapter = new GtoWizardAdapter(config.apiEndpoint, config.apiKey);
  }
  
  await currentGtoAdapter.connect();
  return currentGtoAdapter;
}
