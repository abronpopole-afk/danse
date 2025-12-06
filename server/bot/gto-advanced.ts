import { GtoRecommendation } from "@shared/schema";
import { HandContext, GtoAdapter } from "./gto-engine";

const CARD_RANKS: readonly string[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const CARD_SUITS: readonly string[] = ['h', 'd', 'c', 's'];
const ALL_CARDS: string[] = [];

function getRankIndex(rank: string): number {
  return CARD_RANKS.indexOf(rank);
}

for (const rank of CARD_RANKS) {
  for (const suit of CARD_SUITS) {
    ALL_CARDS.push(rank + suit);
  }
}

export interface PlayerProfile {
  playerId: string;
  vpip: number;
  pfr: number;
  aggression: number;
  threeBetPercentage: number;
  foldToThreeBet: number;
  cbet: number;
  foldToCbet: number;
  wtsd: number;
  handsObserved: number;
  lastUpdated: number;
}

export interface RangeDefinition {
  hands: Map<string, number>;
  description: string;
}

export interface EquityResult {
  equity: number;
  winRate: number;
  tieRate: number;
  simulations: number;
}

export interface BluffingStrategy {
  bluffFrequency: number;
  valueToBluffRatio: number;
  polarizationFactor: number;
  blockerValue: number;
}

const DEFAULT_PLAYER_PROFILE: PlayerProfile = {
  playerId: "unknown",
  vpip: 25,
  pfr: 18,
  aggression: 2.0,
  threeBetPercentage: 7,
  foldToThreeBet: 55,
  cbet: 65,
  foldToCbet: 45,
  wtsd: 25,
  handsObserved: 0,
  lastUpdated: Date.now(),
};

export function parseCard(card: string): { rank: number; suit: string } | null {
  if (!card || card.length < 2) return null;
  const rank = CARD_RANKS.indexOf(card.charAt(0) as typeof CARD_RANKS[number]);
  const suit = card.charAt(1);
  if (rank === -1 || !CARD_SUITS.includes(suit as typeof CARD_SUITS[number])) return null;
  return { rank, suit };
}

export function getHandNotation(cards: string[]): string {
  if (cards.length !== 2) return '';
  const card1 = parseCard(cards[0]);
  const card2 = parseCard(cards[1]);
  if (!card1 || !card2) return '';

  const suited = card1.suit === card2.suit;

  if (card1.rank === card2.rank) {
    return CARD_RANKS[card1.rank] + CARD_RANKS[card2.rank];
  }

  const highRank = card1.rank > card2.rank ? card1.rank : card2.rank;
  const lowRank = card1.rank > card2.rank ? card2.rank : card1.rank;

  return CARD_RANKS[highRank] + CARD_RANKS[lowRank] + (suited ? 's' : 'o');
}

const PREFLOP_RANGES: Record<string, RangeDefinition> = {
  utg_rfi: {
    hands: new Map([
      ['AA', 1.0], ['KK', 1.0], ['QQ', 1.0], ['JJ', 1.0], ['TT', 1.0],
      ['99', 0.8], ['88', 0.6], ['77', 0.4],
      ['AKs', 1.0], ['AKo', 1.0], ['AQs', 1.0], ['AQo', 0.9], ['AJs', 1.0], ['ATs', 0.9],
      ['KQs', 1.0], ['KQo', 0.7], ['KJs', 0.9], ['KTs', 0.7],
      ['QJs', 0.9], ['QTs', 0.6],
      ['JTs', 0.8],
    ]),
    description: "UTG RFI range",
  },
  mp_rfi: {
    hands: new Map([
      ['AA', 1.0], ['KK', 1.0], ['QQ', 1.0], ['JJ', 1.0], ['TT', 1.0],
      ['99', 1.0], ['88', 0.8], ['77', 0.6], ['66', 0.4],
      ['AKs', 1.0], ['AKo', 1.0], ['AQs', 1.0], ['AQo', 1.0], ['AJs', 1.0], ['ATs', 1.0], ['A9s', 0.7],
      ['KQs', 1.0], ['KQo', 0.9], ['KJs', 1.0], ['KTs', 0.9], ['K9s', 0.5],
      ['QJs', 1.0], ['QTs', 0.8], ['Q9s', 0.4],
      ['JTs', 1.0], ['J9s', 0.5],
      ['T9s', 0.7],
      ['98s', 0.5],
    ]),
    description: "MP RFI range",
  },
  co_rfi: {
    hands: new Map([
      ['AA', 1.0], ['KK', 1.0], ['QQ', 1.0], ['JJ', 1.0], ['TT', 1.0],
      ['99', 1.0], ['88', 1.0], ['77', 1.0], ['66', 0.8], ['55', 0.6], ['44', 0.4],
      ['AKs', 1.0], ['AKo', 1.0], ['AQs', 1.0], ['AQo', 1.0], ['AJs', 1.0], ['AJo', 0.8],
      ['ATs', 1.0], ['A9s', 1.0], ['A8s', 0.8], ['A7s', 0.7], ['A6s', 0.6], ['A5s', 0.8], ['A4s', 0.7], ['A3s', 0.6], ['A2s', 0.5],
      ['KQs', 1.0], ['KQo', 1.0], ['KJs', 1.0], ['KJo', 0.7], ['KTs', 1.0], ['K9s', 0.8], ['K8s', 0.5],
      ['QJs', 1.0], ['QJo', 0.6], ['QTs', 1.0], ['Q9s', 0.7],
      ['JTs', 1.0], ['JTo', 0.4], ['J9s', 0.8],
      ['T9s', 1.0], ['T8s', 0.6],
      ['98s', 0.9], ['97s', 0.5],
      ['87s', 0.8], ['86s', 0.4],
      ['76s', 0.7], ['75s', 0.3],
      ['65s', 0.6],
      ['54s', 0.5],
    ]),
    description: "CO RFI range",
  },
  btn_rfi: {
    hands: new Map([
      ['AA', 1.0], ['KK', 1.0], ['QQ', 1.0], ['JJ', 1.0], ['TT', 1.0],
      ['99', 1.0], ['88', 1.0], ['77', 1.0], ['66', 1.0], ['55', 1.0], ['44', 0.9], ['33', 0.8], ['22', 0.7],
      ['AKs', 1.0], ['AKo', 1.0], ['AQs', 1.0], ['AQo', 1.0], ['AJs', 1.0], ['AJo', 1.0],
      ['ATs', 1.0], ['ATo', 0.9], ['A9s', 1.0], ['A9o', 0.6], ['A8s', 1.0], ['A7s', 1.0], ['A6s', 1.0], ['A5s', 1.0], ['A4s', 1.0], ['A3s', 1.0], ['A2s', 1.0],
      ['KQs', 1.0], ['KQo', 1.0], ['KJs', 1.0], ['KJo', 1.0], ['KTs', 1.0], ['KTo', 0.8], ['K9s', 1.0], ['K8s', 0.9], ['K7s', 0.8], ['K6s', 0.7], ['K5s', 0.6], ['K4s', 0.5], ['K3s', 0.4], ['K2s', 0.3],
      ['QJs', 1.0], ['QJo', 1.0], ['QTs', 1.0], ['QTo', 0.7], ['Q9s', 1.0], ['Q8s', 0.8], ['Q7s', 0.5],
      ['JTs', 1.0], ['JTo', 0.8], ['J9s', 1.0], ['J8s', 0.7], ['J7s', 0.4],
      ['T9s', 1.0], ['T9o', 0.5], ['T8s', 0.9], ['T7s', 0.5],
      ['98s', 1.0], ['98o', 0.4], ['97s', 0.8], ['96s', 0.4],
      ['87s', 1.0], ['86s', 0.7], ['85s', 0.3],
      ['76s', 1.0], ['75s', 0.6],
      ['65s', 1.0], ['64s', 0.4],
      ['54s', 1.0], ['53s', 0.3],
      ['43s', 0.6],
      ['32s', 0.3],
    ]),
    description: "BTN RFI range",
  },
  sb_rfi: {
    hands: new Map([
      ['AA', 1.0], ['KK', 1.0], ['QQ', 1.0], ['JJ', 1.0], ['TT', 1.0],
      ['99', 1.0], ['88', 1.0], ['77', 1.0], ['66', 1.0], ['55', 1.0], ['44', 1.0], ['33', 0.9], ['22', 0.8],
      ['AKs', 1.0], ['AKo', 1.0], ['AQs', 1.0], ['AQo', 1.0], ['AJs', 1.0], ['AJo', 1.0],
      ['ATs', 1.0], ['ATo', 1.0], ['A9s', 1.0], ['A9o', 0.8], ['A8s', 1.0], ['A8o', 0.6], ['A7s', 1.0], ['A6s', 1.0], ['A5s', 1.0], ['A4s', 1.0], ['A3s', 1.0], ['A2s', 1.0],
      ['KQs', 1.0], ['KQo', 1.0], ['KJs', 1.0], ['KJo', 1.0], ['KTs', 1.0], ['KTo', 1.0], ['K9s', 1.0], ['K9o', 0.5], ['K8s', 1.0], ['K7s', 1.0], ['K6s', 1.0], ['K5s', 1.0], ['K4s', 0.9], ['K3s', 0.8], ['K2s', 0.7],
      ['QJs', 1.0], ['QJo', 1.0], ['QTs', 1.0], ['QTo', 0.9], ['Q9s', 1.0], ['Q8s', 1.0], ['Q7s', 0.8], ['Q6s', 0.6],
      ['JTs', 1.0], ['JTo', 1.0], ['J9s', 1.0], ['J8s', 0.9], ['J7s', 0.7],
      ['T9s', 1.0], ['T9o', 0.8], ['T8s', 1.0], ['T7s', 0.7],
      ['98s', 1.0], ['98o', 0.6], ['97s', 1.0], ['96s', 0.6],
      ['87s', 1.0], ['87o', 0.4], ['86s', 0.9], ['85s', 0.5],
      ['76s', 1.0], ['75s', 0.8], ['74s', 0.3],
      ['65s', 1.0], ['64s', 0.6],
      ['54s', 1.0], ['53s', 0.5],
      ['43s', 0.8],
      ['32s', 0.5],
    ]),
    description: "SB vs BB range",
  },
  three_bet_value: {
    hands: new Map([
      ['AA', 1.0], ['KK', 1.0], ['QQ', 1.0], ['JJ', 0.8], ['TT', 0.5],
      ['AKs', 1.0], ['AKo', 1.0], ['AQs', 1.0], ['AQo', 0.6],
    ]),
    description: "3-bet value range",
  },
  three_bet_bluff: {
    hands: new Map([
      ['A5s', 0.8], ['A4s', 0.7], ['A3s', 0.6], ['A2s', 0.5],
      ['K5s', 0.3], ['K4s', 0.3],
      ['76s', 0.4], ['65s', 0.4], ['54s', 0.4],
    ]),
    description: "3-bet bluff range",
  },
};

export class MonteCarloEquityCalculator {
  private simulations: number;

  constructor(simulations: number = 10000) {
    this.simulations = simulations;
  }

  calculateEquityVsRange(
    heroCards: string[],
    villainRange: RangeDefinition,
    board: string[] = [],
    deadCards: string[] = []
  ): EquityResult {
    const usedCards = new Set([...heroCards, ...board, ...deadCards]);
    const availableCards = ALL_CARDS.filter(c => !usedCards.has(c));

    let wins = 0;
    let ties = 0;
    let totalSims = 0;

    const villainHands = this.sampleVillainHands(villainRange, usedCards, Math.min(100, this.simulations / 100));

    for (const villainCards of villainHands) {
      const simsPerHand = Math.floor(this.simulations / villainHands.length);

      for (let i = 0; i < simsPerHand; i++) {
        const remainingCards = availableCards.filter(c => !villainCards.includes(c));
        const cardsNeeded = 5 - board.length;
        const runout = this.sampleCards(remainingCards, cardsNeeded);
        const finalBoard = [...board, ...runout];

        const heroStrength = this.evaluateHand([...heroCards, ...finalBoard]);
        const villainStrength = this.evaluateHand([...villainCards, ...finalBoard]);

        if (heroStrength > villainStrength) {
          wins++;
        } else if (heroStrength === villainStrength) {
          ties++;
        }
        totalSims++;
      }
    }

    return {
      equity: (wins + ties * 0.5) / totalSims,
      winRate: wins / totalSims,
      tieRate: ties / totalSims,
      simulations: totalSims,
    };
  }

  calculateEquityVsRandomHand(
    heroCards: string[],
    board: string[] = [],
    numOpponents: number = 1
  ): EquityResult {
    const usedCards = new Set([...heroCards, ...board]);
    const availableCards = ALL_CARDS.filter(c => !usedCards.has(c));

    let wins = 0;
    let ties = 0;

    for (let i = 0; i < this.simulations; i++) {
      const shuffled = [...availableCards].sort(() => Math.random() - 0.5);

      const opponentHands: string[][] = [];
      let cardIndex = 0;
      for (let j = 0; j < numOpponents; j++) {
        opponentHands.push([shuffled[cardIndex], shuffled[cardIndex + 1]]);
        cardIndex += 2;
      }

      const cardsNeeded = 5 - board.length;
      const runout = shuffled.slice(cardIndex, cardIndex + cardsNeeded);
      const finalBoard = [...board, ...runout];

      const heroStrength = this.evaluateHand([...heroCards, ...finalBoard]);
      let heroWins = true;
      let hasTie = false;

      for (const oppHand of opponentHands) {
        const oppStrength = this.evaluateHand([...oppHand, ...finalBoard]);
        if (oppStrength > heroStrength) {
          heroWins = false;
          break;
        } else if (oppStrength === heroStrength) {
          hasTie = true;
        }
      }

      if (heroWins && !hasTie) {
        wins++;
      } else if (heroWins && hasTie) {
        ties++;
      }
    }

    return {
      equity: (wins + ties * 0.5) / this.simulations,
      winRate: wins / this.simulations,
      tieRate: ties / this.simulations,
      simulations: this.simulations,
    };
  }

  private sampleVillainHands(range: RangeDefinition, usedCards: Set<string>, count: number): string[][] {
    const hands: string[][] = [];
    const entries = Array.from(range.hands.entries());

    for (let i = 0; i < count && entries.length > 0; i++) {
      const idx = Math.floor(Math.random() * entries.length);
      const [notation, frequency] = entries[idx];

      if (Math.random() > frequency) continue;

      const possibleCombos = this.getHandCombos(notation).filter(
        combo => !combo.some(c => usedCards.has(c))
      );

      if (possibleCombos.length > 0) {
        const combo = possibleCombos[Math.floor(Math.random() * possibleCombos.length)];
        hands.push(combo);
      }
    }

    return hands.length > 0 ? hands : [this.sampleRandomHand(usedCards)];
  }

  private getHandCombos(notation: string): string[][] {
    const combos: string[][] = [];

    if (notation.length === 2 && notation[0] === notation[1]) {
      const rank = notation[0];
      for (let i = 0; i < CARD_SUITS.length; i++) {
        for (let j = i + 1; j < CARD_SUITS.length; j++) {
          combos.push([rank + CARD_SUITS[i], rank + CARD_SUITS[j]]);
        }
      }
    } else if (notation.endsWith('s')) {
      const rank1 = notation[0];
      const rank2 = notation[1];
      for (const suit of CARD_SUITS) {
        combos.push([rank1 + suit, rank2 + suit]);
      }
    } else if (notation.endsWith('o')) {
      const rank1 = notation[0];
      const rank2 = notation[1];
      for (const suit1 of CARD_SUITS) {
        for (const suit2 of CARD_SUITS) {
          if (suit1 !== suit2) {
            combos.push([rank1 + suit1, rank2 + suit2]);
          }
        }
      }
    } else {
      const rank1 = notation[0];
      const rank2 = notation[1];
      for (const suit1 of CARD_SUITS) {
        for (const suit2 of CARD_SUITS) {
          combos.push([rank1 + suit1, rank2 + suit2]);
        }
      }
    }

    return combos;
  }

  private sampleRandomHand(usedCards: Set<string>): string[] {
    const available = ALL_CARDS.filter(c => !usedCards.has(c));
    const idx1 = Math.floor(Math.random() * available.length);
    const card1 = available[idx1];
    const remaining = available.filter((_, i) => i !== idx1);
    const idx2 = Math.floor(Math.random() * remaining.length);
    const card2 = remaining[idx2];
    return [card1, card2];
  }

  private sampleCards(available: string[], count: number): string[] {
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private evaluateHand(cards: string[]): number {
    const parsed = cards.map(c => parseCard(c)).filter(c => c !== null) as Array<{ rank: number; suit: string }>;
    if (parsed.length < 5) return 0;

    const ranks = parsed.map(c => c.rank).sort((a, b) => b - a);
    const suits = parsed.map(c => c.suit);

    const rankCounts = new Map<number, number>();
    for (const r of ranks) {
      rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
    }

    const suitCounts = new Map<string, number>();
    for (const s of suits) {
      suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
    }

    const hasFlush = Array.from(suitCounts.values()).some(c => c >= 5);
    const hasStraight = this.checkStraight(ranks);

    const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);

    if (hasFlush && hasStraight) {
      const flushSuit = Array.from(suitCounts.entries()).find(([_, c]) => c >= 5)?.[0];
      const flushCards = parsed.filter(c => c.suit === flushSuit).map(c => c.rank);
      if (this.checkStraight(flushCards)) {
        const highCard = Math.max(...flushCards);
        if (highCard === 12) return 9000000;
        return 8000000 + highCard;
      }
    }

    if (counts[0] === 4) {
      const quadRank = Array.from(rankCounts.entries()).find(([_, c]) => c === 4)?.[0] || 0;
      const kicker = ranks.find(r => r !== quadRank) || 0;
      return 7000000 + quadRank * 100 + kicker;
    }

    if (counts[0] === 3 && counts[1] >= 2) {
      const tripRank = Array.from(rankCounts.entries()).find(([_, c]) => c === 3)?.[0] || 0;
      const pairRank = Array.from(rankCounts.entries()).find(([r, c]) => c >= 2 && r !== tripRank)?.[0] || 0;
      return 6000000 + tripRank * 100 + pairRank;
    }

    if (hasFlush) {
      const flushSuit = Array.from(suitCounts.entries()).find(([_, c]) => c >= 5)?.[0];
      const flushRanks = parsed.filter(c => c.suit === flushSuit).map(c => c.rank).sort((a, b) => b - a);
      return 5000000 + flushRanks[0] * 10000 + flushRanks[1] * 1000 + flushRanks[2] * 100 + flushRanks[3] * 10 + flushRanks[4];
    }

    if (hasStraight) {
      const straightHigh = this.getStraightHighCard(ranks);
      return 4000000 + straightHigh;
    }

    if (counts[0] === 3) {
      const tripRank = Array.from(rankCounts.entries()).find(([_, c]) => c === 3)?.[0] || 0;
      const kickers = ranks.filter(r => r !== tripRank).slice(0, 2);
      return 3000000 + tripRank * 10000 + kickers[0] * 100 + (kickers[1] || 0);
    }

    if (counts[0] === 2 && counts[1] === 2) {
      const pairs = Array.from(rankCounts.entries()).filter(([_, c]) => c === 2).map(([r, _]) => r).sort((a, b) => b - a);
      const kicker = ranks.find(r => !pairs.includes(r)) || 0;
      return 2000000 + pairs[0] * 10000 + pairs[1] * 100 + kicker;
    }

    if (counts[0] === 2) {
      const pairRank = Array.from(rankCounts.entries()).find(([_, c]) => c === 2)?.[0] || 0;
      const kickers = ranks.filter(r => r !== pairRank).slice(0, 3);
      return 1000000 + pairRank * 100000 + kickers[0] * 1000 + kickers[1] * 10 + (kickers[2] || 0);
    }

    return ranks[0] * 100000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4];
  }

  private checkStraight(ranks: number[]): boolean {
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
    if (uniqueRanks.length < 5) return false;

    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) return true;
    }

    if (uniqueRanks.includes(12) && uniqueRanks.includes(0) && uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
      return true;
    }

    return false;
  }

  private getStraightHighCard(ranks: number[]): number {
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) return uniqueRanks[i];
    }

    if (uniqueRanks.includes(12) && uniqueRanks.includes(0) && uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
      return 3;
    }

    return 0;
  }
}

export class PlayerProfiler {
  private profiles: Map<string, PlayerProfile> = new Map();
  private actionHistory: Map<string, Array<{ action: string; context: string; timestamp: number }>> = new Map();

  getProfile(playerId: string): PlayerProfile {
    return this.profiles.get(playerId) || { ...DEFAULT_PLAYER_PROFILE, playerId };
  }

  updateProfile(playerId: string, action: string, context: {
    street: string;
    facingBet: boolean;
    wasThreeBet: boolean;
    wasCbet: boolean;
    position: string;
  }): void {
    const profile = this.getProfile(playerId);

    profile.handsObserved++;
    profile.lastUpdated = Date.now();

    if (context.street === "preflop") {
      if (action === "RAISE" || action === "CALL") {
        profile.vpip = this.updateStat(profile.vpip, 100, profile.handsObserved);
      } else {
        profile.vpip = this.updateStat(profile.vpip, 0, profile.handsObserved);
      }

      if (action === "RAISE") {
        if (context.wasThreeBet) {
          profile.threeBetPercentage = this.updateStat(profile.threeBetPercentage, 100, profile.handsObserved);
        } else {
          profile.pfr = this.updateStat(profile.pfr, 100, profile.handsObserved);
        }
      }

      if (context.wasThreeBet && action === "FOLD") {
        profile.foldToThreeBet = this.updateStat(profile.foldToThreeBet, 100, profile.handsObserved);
      }
    }

    if (context.street !== "preflop") {
      if (context.wasCbet && action === "FOLD") {
        profile.foldToCbet = this.updateStat(profile.foldToCbet, 100, profile.handsObserved);
      }

      if (action === "BET" || action === "RAISE") {
        profile.aggression = this.updateStat(profile.aggression, 3.0, profile.handsObserved);
      } else if (action === "CALL") {
        profile.aggression = this.updateStat(profile.aggression, 1.0, profile.handsObserved);
      }

      if (context.street === "river" && (action === "CALL" || action === "RAISE")) {
        profile.wtsd = this.updateStat(profile.wtsd, 100, profile.handsObserved);
      }
    }

    this.profiles.set(playerId, profile);

    const history = this.actionHistory.get(playerId) || [];
    history.push({
      action,
      context: `${context.street}_${context.facingBet ? 'faced' : 'ip'}`,
      timestamp: Date.now(),
    });
    if (history.length > 100) history.shift();
    this.actionHistory.set(playerId, history);
  }

  private updateStat(current: number, newValue: number, sampleSize: number): number {
    const weight = Math.min(1, 20 / sampleSize);
    return current * (1 - weight) + newValue * weight;
  }

  getPlayerType(playerId: string): { style: string; tendency: string; exploitability: string } {
    const profile = this.getProfile(playerId);

    let style: string;
    if (profile.vpip > 30) {
      style = profile.pfr > 20 ? "LAG" : "Loose Passive";
    } else {
      style = profile.pfr > 15 ? "TAG" : "Nit";
    }

    let tendency: string;
    if (profile.aggression > 2.5) {
      tendency = "Very Aggressive";
    } else if (profile.aggression > 1.5) {
      tendency = "Balanced";
    } else {
      tendency = "Passive";
    }

    let exploitability: string;
    if (profile.foldToThreeBet > 70) {
      exploitability = "Folds too much to 3-bets";
    } else if (profile.foldToCbet > 60) {
      exploitability = "Folds too much to c-bets";
    } else if (profile.vpip - profile.pfr > 15) {
      exploitability = "Calls too much preflop";
    } else {
      exploitability = "Relatively balanced";
    }

    return { style, tendency, exploitability };
  }

  suggestExploit(playerId: string, context: HandContext): { adjustment: string; factor: number } {
    const profile = this.getProfile(playerId);
    const playerType = this.getPlayerType(playerId);

    if (context.street === "preflop") {
      if (profile.foldToThreeBet > 65 && context.facingBet > 0) {
        return { adjustment: "Increase 3-bet frequency", factor: 1.3 };
      }
      if (profile.vpip - profile.pfr > 12) {
        return { adjustment: "Value bet thinner, bluff less", factor: 0.8 };
      }
    }

    if (context.street !== "preflop") {
      if (profile.foldToCbet > 55) {
        return { adjustment: "C-bet more frequently", factor: 1.25 };
      }
      if (profile.wtsd < 20) {
        return { adjustment: "Bluff more on later streets", factor: 1.4 };
      }
      if (profile.aggression < 1.2) {
        return { adjustment: "Call down lighter vs bets", factor: 1.2 };
      }
    }

    return { adjustment: "Play GTO baseline", factor: 1.0 };
  }
}

export class RangeConstructor {
  private equityCalculator: MonteCarloEquityCalculator;

  constructor() {
    this.equityCalculator = new MonteCarloEquityCalculator(5000);
  }

  constructContinuationRange(
    startingRange: RangeDefinition,
    board: string[],
    action: "bet" | "check" | "call" | "raise" | "fold"
  ): RangeDefinition {
    const newRange = new Map<string, number>();

    for (const [notation, frequency] of startingRange.hands) {
      const adjustment = this.getPostflopAdjustment(notation, board, action);
      const newFrequency = Math.min(1, Math.max(0, frequency * adjustment));
      if (newFrequency > 0.05) {
        newRange.set(notation, newFrequency);
      }
    }

    return {
      hands: newRange,
      description: `${startingRange.description} -> ${action} on ${board.join('')}`,
    };
  }

  private getPostflopAdjustment(notation: string, board: string[], action: string): number {
    const combos = this.getRepresentativeCombos(notation);
    if (combos.length === 0) return 0;

    const sample = combos[0];
    const result = this.equityCalculator.calculateEquityVsRandomHand(sample, board);
    const equity = result.equity;

    const hasTopPair = this.checkTopPair(sample, board);
    const hasOverpair = this.checkOverpair(sample, board);
    const hasFlushDraw = this.checkFlushDraw(sample, board);
    const hasStraightDraw = this.checkStraightDraw(sample, board);
    const hasBlocker = this.checkBlockers(sample, board);

    switch (action) {
      case "bet":
      case "raise":
        if (equity > 0.7 || hasOverpair) return 1.2;
        if (equity > 0.5 || hasTopPair) return 1.0;
        if (hasFlushDraw || hasStraightDraw) return 0.8;
        if (hasBlocker && equity < 0.3) return 0.6;
        return 0.3;

      case "check":
        if (equity > 0.6) return 0.5;
        if (equity > 0.4) return 1.0;
        return 1.2;

      case "call":
        if (equity > 0.55) return 1.1;
        if (equity > 0.35) return 1.0;
        if (hasFlushDraw || hasStraightDraw) return 0.9;
        return 0.4;

      case "fold":
        if (equity > 0.4) return 0.2;
        if (hasFlushDraw || hasStraightDraw) return 0.3;
        return 1.0;

      default:
        return 1.0;
    }
  }

  private getRepresentativeCombos(notation: string): string[][] {
    const combos: string[][] = [];

    if (notation.length === 2 && notation[0] === notation[1]) {
      combos.push([notation[0] + 'h', notation[0] + 'd']);
    } else if (notation.endsWith('s')) {
      combos.push([notation[0] + 'h', notation[1] + 'h']);
    } else {
      combos.push([notation[0] + 'h', notation[1] + 'd']);
    }

    return combos;
  }

  private checkTopPair(hand: string[], board: string[]): boolean {
    const handRanks = hand.map(c => CARD_RANKS.indexOf(c[0]));
    const boardRanks = board.map(c => CARD_RANKS.indexOf(c[0]));
    const topBoardRank = Math.max(...boardRanks);
    return handRanks.includes(topBoardRank);
  }

  private checkOverpair(hand: string[], board: string[]): boolean {
    if (hand[0][0] !== hand[1][0]) return false;
    const pairRank = CARD_RANKS.indexOf(hand[0][0]);
    const boardRanks = board.map(c => CARD_RANKS.indexOf(c[0]));
    return pairRank > Math.max(...boardRanks);
  }

  private checkFlushDraw(hand: string[], board: string[]): boolean {
    const allCards = [...hand, ...board];
    const suitCounts = new Map<string, number>();
    for (const card of allCards) {
      const suit = card[1];
      suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
    }
    return Array.from(suitCounts.values()).some(c => c === 4);
  }

  private checkStraightDraw(hand: string[], board: string[]): boolean {
    const allCards = [...hand, ...board];
    const ranks = [...new Set(allCards.map(c => CARD_RANKS.indexOf(c[0])))].sort((a, b) => a - b);

    for (let i = 0; i <= ranks.length - 4; i++) {
      if (ranks[i + 3] - ranks[i] <= 4) return true;
    }
    return false;
  }

  private checkBlockers(hand: string[], board: string[]): boolean {
    const suitCounts = new Map<string, number>();
    for (const card of board) {
      const suit = card[1];
      suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
    }

    const flushSuit = Array.from(suitCounts.entries()).find(([_, c]) => c >= 3)?.[0];
    if (flushSuit) {
      const hasAceBlocker = hand.some(c => c[0] === 'A' && c[1] === flushSuit);
      const hasKingBlocker = hand.some(c => c[0] === 'K' && c[1] === flushSuit);
      if (hasAceBlocker || hasKingBlocker) return true;
    }

    const boardRanks = board.map(c => CARD_RANKS.indexOf(c[0]));
    const highCard = Math.max(...boardRanks);
    const hasTopBlocker = hand.some(c => CARD_RANKS.indexOf(c[0]) === highCard);

    return hasTopBlocker;
  }

  getPolarizedRange(
    valueRange: RangeDefinition,
    bluffRange: RangeDefinition,
    polarizationFactor: number = 0.7
  ): RangeDefinition {
    const combined = new Map<string, number>();

    for (const [notation, freq] of valueRange.hands) {
      combined.set(notation, freq * polarizationFactor);
    }

    const bluffAdjust = (1 - polarizationFactor) / polarizationFactor;
    for (const [notation, freq] of bluffRange.hands) {
      const existing = combined.get(notation) || 0;
      combined.set(notation, Math.min(1, existing + freq * bluffAdjust));
    }

    return {
      hands: combined,
      description: `Polarized range (${(polarizationFactor * 100).toFixed(0)}% value)`,
    };
  }
}

export class BluffingManager {
  private equityCalculator: MonteCarloEquityCalculator;

  constructor() {
    this.equityCalculator = new MonteCarloEquityCalculator(3000);
  }

  shouldBluff(
    heroCards: string[],
    board: string[],
    potSize: number,
    betSize: number,
    villainProfile: PlayerProfile
  ): BluffingStrategy {
    const equity = this.equityCalculator.calculateEquityVsRandomHand(heroCards, board);

    const bluffBreakeven = betSize / (potSize + betSize);

    const requiredFoldFreq = bluffBreakeven;

    const hasBlocker = this.calculateBlockerValue(heroCards, board);
    const hasBackdoor = this.hasBackdoorEquity(heroCards, board);

    let baseBluffFreq = 0;
    if (equity.equity < 0.25) {
      if (hasBlocker > 0.5) {
        baseBluffFreq = 0.4;
      } else if (hasBackdoor) {
        baseBluffFreq = 0.3;
      } else {
        baseBluffFreq = 0.15;
      }
    }

    const exploitAdjust = (villainProfile.foldToCbet - 45) / 100;
    const adjustedBluffFreq = Math.min(0.6, Math.max(0, baseBluffFreq + exploitAdjust));

    const valueToBluffRatio = 2.0;
    const optimalBluffFreq = 1 / (1 + valueToBluffRatio);

    return {
      bluffFrequency: adjustedBluffFreq,
      valueToBluffRatio,
      polarizationFactor: 0.7,
      blockerValue: hasBlocker,
    };
  }

  private calculateBlockerValue(heroCards: string[], board: string[]): number {
    let blockerScore = 0;

    const suitCounts = new Map<string, number>();
    for (const card of board) {
      const suit = card[1];
      suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
    }

    const potentialFlushSuit = Array.from(suitCounts.entries()).find(([_, c]) => c >= 3)?.[0];
    if (potentialFlushSuit) {
      for (const card of heroCards) {
        if (card[1] === potentialFlushSuit) {
          const rank = CARD_RANKS.indexOf(card[0]);
          blockerScore += 0.1 + rank / 130;
        }
      }
    }

    const boardRanks = board.map(c => CARD_RANKS.indexOf(c[0])).sort((a, b) => b - a);
    for (const card of heroCards) {
      const rank = CARD_RANKS.indexOf(card[0]);
      if (rank === boardRanks[0]) {
        blockerScore += 0.3;
      }
    }

    return Math.min(1, blockerScore);
  }

  private hasBackdoorEquity(heroCards: string[], board: string[]): boolean {
    if (board.length > 3) return false;

    const allCards = [...heroCards, ...board];

    const suitCounts = new Map<string, number>();
    for (const card of allCards) {
      const suit = card[1];
      suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
    }
    if (Array.from(suitCounts.values()).some(c => c >= 3)) return true;

    const ranks = [...new Set(allCards.map(c => CARD_RANKS.indexOf(c[0])))].sort((a, b) => a - b);
    for (let i = 0; i <= ranks.length - 3; i++) {
      if (ranks[i + 2] - ranks[i] <= 4) return true;
    }

    return false;
  }
}

export class AdvancedGtoAdapter implements GtoAdapter {
  private connected = false;
  private equityCalculator: MonteCarloEquityCalculator;
  private playerProfiler: PlayerProfiler;
  private rangeConstructor: RangeConstructor;
  private bluffingManager: BluffingManager;
  private debugMode = false;
  private currentVillainId: string = "villain_0";
  private currentTableId: string = "table_0";
  private currentVillainSeat: number = 0;
  public injectedNoise: number = 0; // Bruit injecté par anti-detection (0-1)

  constructor() {
    // Adapter le nombre de simulations selon le contexte
    this.equityCalculator = new MonteCarloEquityCalculator(3000); // Réduit de 5000 à 3000
    this.playerProfiler = new PlayerProfiler();
    this.rangeConstructor = new RangeConstructor();
    this.bluffingManager = new BluffingManager();
  }

  enableDebugMode(enabled: boolean = true): void {
    this.debugMode = enabled;
  }

  setCurrentVillain(villainId: string, seat: number = 0): void {
    this.currentVillainId = villainId;
    this.currentVillainSeat = seat;
  }

  setCurrentTable(tableId: string): void {
    this.currentTableId = tableId;
  }

  async updateVillainAction(
    action: string, 
    context: { 
      street: string; 
      facingBet: boolean; 
      wasThreeBet: boolean; 
      wasCbet: boolean; 
      position: string;
      betSize?: number;
      potSize?: number;
    }
  ): Promise<void> {
    this.playerProfiler.updateProfile(this.currentVillainId, action, context);
    
    // Mettre à jour opponent profiler
    const { getOpponentProfiler } = await import("./opponent-profiler");
    const opponentProfiler = getOpponentProfiler();
    
    opponentProfiler.updateOpponentAction(
      this.currentVillainId,
      this.currentVillainSeat,
      {
        action,
        street: context.street,
        betSize: context.betSize,
        facingBet: context.facingBet ? (context.betSize || 0) : 0,
        potSize: context.potSize || 0,
        wasPreflop: context.street === "preflop",
        wasCbet: context.wasCbet,
      }
    );
  }

  async recordHandResult(result: number, potSize: number): Promise<void> {
    const { getOpponentProfiler } = await import("./opponent-profiler");
    const opponentProfiler = getOpponentProfiler();
    
    opponentProfiler.recordHandResult(this.currentVillainId, result, potSize);
  }

  async getRecommendation(context: HandContext): Promise<GtoRecommendation> {
    const villainProfile = this.playerProfiler.getProfile(this.currentVillainId);
    const exploit = this.playerProfiler.suggestExploit(this.currentVillainId, context);

    if (context.street === "preflop") {
      return this.getPreflopRecommendation(context, villainProfile, exploit);
    }

    return this.getPostflopRecommendation(context, villainProfile, exploit);
  }

  private getPreflopRecommendation(
    context: HandContext,
    villainProfile: PlayerProfile,
    exploit: { adjustment: string; factor: number }
  ): GtoRecommendation {
    const handNotation = getHandNotation(context.heroCards);
    const isRfi = context.facingBet === 0 || context.facingBet <= 1;

    let range: RangeDefinition;
    if (isRfi) {
      const position = context.heroPosition.toLowerCase();
      if (position.includes("utg")) {
        range = PREFLOP_RANGES.utg_rfi;
      } else if (position.includes("mp") || position.includes("middle")) {
        range = PREFLOP_RANGES.mp_rfi;
      } else if (position.includes("co") || position.includes("cutoff")) {
        range = PREFLOP_RANGES.co_rfi;
      } else if (position.includes("btn") || position.includes("button")) {
        range = PREFLOP_RANGES.btn_rfi;
      } else if (position.includes("sb") || position.includes("small")) {
        range = PREFLOP_RANGES.sb_rfi;
      } else {
        range = PREFLOP_RANGES.mp_rfi;
      }
    } else {
      range = PREFLOP_RANGES.three_bet_value;
    }

    const handFrequency = range.hands.get(handNotation) || 0;

    const equity = this.equityCalculator.calculateEquityVsRandomHand(
      context.heroCards,
      [],
      context.numPlayers - 1
    );

    let raiseProb = handFrequency * 0.8 * exploit.factor;
    let callProb = (1 - handFrequency) * 0.3;
    let foldProb = 1 - raiseProb - callProb;

    if (villainProfile.foldToThreeBet > 65 && !isRfi) {
      const bluffRange = PREFLOP_RANGES.three_bet_bluff;
      const bluffFreq = bluffRange.hands.get(handNotation) || 0;
      if (bluffFreq > 0 && Math.random() < bluffFreq * exploit.factor) {
        raiseProb = 0.7;
        foldProb = 0.3;
        callProb = 0;
      }
    }

    const total = raiseProb + callProb + foldProb;
    raiseProb /= total;
    callProb /= total;
    foldProb /= total;

    const actions: Array<{ action: string; probability: number; ev: number }> = [];
    if (raiseProb > 0.05) {
      actions.push({ action: "RAISE", probability: raiseProb, ev: equity.equity * 0.8 });
    }
    if (callProb > 0.05) {
      actions.push({ action: "CALL", probability: callProb, ev: equity.equity * 0.5 });
    }
    if (foldProb > 0.05) {
      actions.push({ action: "FOLD", probability: foldProb, ev: 0 });
    }

    actions.sort((a, b) => b.probability - a.probability);
    
    // Appliquer bruit si demandé par anti-detection
    if (this.injectedNoise > 0) {
      actions.forEach(action => {
        const noise = (Math.random() - 0.5) * this.injectedNoise * 2;
        action.probability = Math.max(0.05, Math.min(0.95, action.probability + noise));
      });
      
      // Renormaliser
      const total = actions.reduce((sum, a) => sum + a.probability, 0);
      actions.forEach(a => a.probability /= total);
      actions.sort((a, b) => b.probability - a.probability);
      
      // Réduire progressivement le bruit
      this.injectedNoise *= 0.9;
    }
    
    const bestAction = actions[0]?.action || "FOLD";

    return {
      actions,
      bestAction,
      confidence: Math.min(0.95, equity.equity + 0.3),
    };
  }

  private async getPostflopRecommendation(
    context: HandContext,
    villainProfile: PlayerProfile,
    exploit: { adjustment: string; factor: number }
  ): Promise<GtoRecommendation> {
    // Récupérer ajustements exploitatifs
    const { getOpponentProfiler } = await import("./opponent-profiler");
    const opponentProfiler = getOpponentProfiler();
    
    const exploitAdjustment = opponentProfiler.getExploitativeAdjustment(
      this.currentVillainId,
      this.currentTableId,
      {
        street: context.street,
        facingBet: context.facingBet,
        potSize: context.potSize,
        position: context.heroPosition,
      }
    );

    // Ajuster précision selon street (river = moins de runouts possibles)
    const simulations = context.street === "river" ? 1000 : 
                       context.street === "turn" ? 2000 : 3000;
    
    const tempCalculator = new MonteCarloEquityCalculator(simulations);
    const equity = tempCalculator.calculateEquityVsRandomHand(
      context.heroCards,
      context.communityCards
    );

    const potOdds = context.facingBet > 0 
      ? context.facingBet / (context.potSize + context.facingBet) 
      : 0;

    const bluffStrategy = this.bluffingManager.shouldBluff(
      context.heroCards,
      context.communityCards,
      context.potSize,
      context.potSize * 0.66,
      villainProfile
    );

    // Appliquer ajustements exploitatifs
    bluffStrategy.bluffFrequency = Math.max(
      0,
      Math.min(0.6, bluffStrategy.bluffFrequency + exploitAdjustment.bluffFrequencyShift)
    );

    const actions: Array<{ action: string; probability: number; ev: number }> = [];

    // Facteurs d'ajustement exploitatif
    const aggressionMult = 1 + exploitAdjustment.aggressionShift;
    const sizingMult = exploitAdjustment.valueBetSizingShift;

    if (context.facingBet === 0) {
      if (equity.equity > 0.7) {
        const baseBetSize = this.calculateOptimalBetSize(equity.equity, context.potSize, context.street);
        const adjustedBetSize = Math.round(baseBetSize * sizingMult);
        const betProb = Math.min(0.9, 0.7 * aggressionMult);
        actions.push({ action: `BET ${adjustedBetSize}%`, probability: betProb, ev: equity.equity * 0.6 });
        actions.push({ action: "CHECK", probability: 1 - betProb, ev: equity.equity * 0.3 });
      } else if (equity.equity > 0.5) {
        const betSize = Math.round(33 * sizingMult);
        actions.push({ action: `BET ${betSize}%`, probability: 0.5 * aggressionMult, ev: equity.equity * 0.4 });
        actions.push({ action: "CHECK", probability: 0.5 / aggressionMult, ev: equity.equity * 0.35 });
      } else if (bluffStrategy.bluffFrequency > 0 && Math.random() < bluffStrategy.bluffFrequency) {
        const bluffSize = bluffStrategy.blockerValue > 0.5 ? 75 : 50;
        actions.push({ action: `BET ${bluffSize}%`, probability: bluffStrategy.bluffFrequency, ev: bluffStrategy.blockerValue * 0.2 });
        actions.push({ action: "CHECK", probability: 1 - bluffStrategy.bluffFrequency, ev: 0.05 });
      } else {
        actions.push({ action: "CHECK", probability: 0.9, ev: equity.equity * 0.2 });
        actions.push({ action: "BET 33%", probability: 0.1, ev: -0.05 });
      }
    } else {
      const adjustedEquity = equity.equity + (context.isInPosition ? 0.05 : 0);
      const rangeAdjustedOdds = potOdds / exploitAdjustment.rangeAdjustment;

      if (adjustedEquity >= rangeAdjustedOdds + 0.15) {
        if (adjustedEquity > 0.75) {
          const raiseProb = Math.min(0.7, 0.5 * aggressionMult);
          actions.push({ action: "RAISE", probability: raiseProb, ev: adjustedEquity * 0.7 });
          actions.push({ action: "CALL", probability: 1 - raiseProb, ev: adjustedEquity * 0.5 });
        } else {
          actions.push({ action: "CALL", probability: 0.8, ev: adjustedEquity * 0.4 });
          actions.push({ action: "RAISE", probability: 0.1 * aggressionMult, ev: adjustedEquity * 0.3 });
          actions.push({ action: "FOLD", probability: 0.1, ev: 0 });
        }
      } else if (adjustedEquity >= rangeAdjustedOdds - 0.05) {
        const impliedOddsBonus = this.calculateImpliedOddsBonus(context);
        if (adjustedEquity + impliedOddsBonus >= rangeAdjustedOdds) {
          actions.push({ action: "CALL", probability: 0.6, ev: (adjustedEquity - potOdds) * context.potSize });
          actions.push({ action: "FOLD", probability: 0.4, ev: 0 });
        } else {
          actions.push({ action: "FOLD", probability: 0.65, ev: 0 });
          actions.push({ action: "CALL", probability: 0.35, ev: -0.1 });
        }
      } else {
        if (bluffStrategy.bluffFrequency > 0.3 && Math.random() < bluffStrategy.bluffFrequency * 0.5) {
          actions.push({ action: "RAISE", probability: 0.3, ev: bluffStrategy.blockerValue * 0.3 });
          actions.push({ action: "FOLD", probability: 0.7, ev: 0 });
        } else {
          actions.push({ action: "FOLD", probability: 0.9, ev: 0 });
          actions.push({ action: "CALL", probability: 0.1, ev: -0.2 });
        }
      }
    }

    actions.sort((a, b) => b.probability - a.probability);
    const bestAction = actions[0]?.action || "FOLD";

    const confidence = Math.min(0.95, 0.5 + equity.equity * 0.4 + (villainProfile.handsObserved > 50 ? 0.1 : 0));

    if (this.debugMode) {
      console.log(`[GTO Advanced] Equity: ${(equity.equity * 100).toFixed(1)}%, PotOdds: ${(potOdds * 100).toFixed(1)}%`);
      console.log(`[GTO Advanced] Best action: ${bestAction}, Confidence: ${(confidence * 100).toFixed(1)}%`);
      console.log(`[GTO Advanced] Player exploit: ${exploit.adjustment} (factor: ${exploit.factor})`);
      console.log(`[GTO Advanced] Opponent exploit: ${exploitAdjustment.reason} (conf: ${(exploitAdjustment.confidence * 100).toFixed(0)}%)`);
      console.log(`[GTO Advanced] Adjustments: aggr=${exploitAdjustment.aggressionShift.toFixed(2)}, range=${exploitAdjustment.rangeAdjustment.toFixed(2)}, bluff=${exploitAdjustment.bluffFrequencyShift.toFixed(2)}`);
    }

    return {
      actions,
      bestAction,
      confidence,
    };
  }

  private calculateOptimalBetSize(equity: number, potSize: number, street: string): number {
    if (street === "river") {
      if (equity > 0.85) return 100;
      if (equity > 0.75) return 75;
      return 50;
    }

    if (street === "turn") {
      if (equity > 0.8) return 75;
      return 50;
    }

    if (equity > 0.75) return 66;
    if (equity > 0.6) return 50;
    return 33;
  }

  private calculateImpliedOddsBonus(context: HandContext): number {
    const effectiveStack = Math.min(context.heroStack, context.potSize * 5);
    const stackToPot = effectiveStack / context.potSize;

    if (context.street === "flop" && stackToPot > 3) {
      return 0.08;
    }
    if (context.street === "turn" && stackToPot > 2) {
      return 0.05;
    }
    return 0.02;
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

export const advancedGtoAdapter = new AdvancedGtoAdapter();
