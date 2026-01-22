import { logger } from "../logger";

export interface GameState {
  handId: string | null;
  heroHasCards: boolean;
  heroToAct: boolean;
  availableActions: {
    fold: boolean;
    call: boolean;
    raise: boolean;
  };
  potSize?: number;
  street?: 'preflop' | 'flop' | 'turn' | 'river';
}

export class GameStateDetector {
  static detect(rawState: any): GameState {
    const tableId = rawState.tableId || 'unknown';
    logger.info("GameStateDetector", `Traitement de l'état pour la table ${tableId}`, {
      isHeroTurn: rawState.isHeroTurn,
      heroCards: rawState.heroCards?.length,
      potSize: rawState.potSize
    });

    const availableActions = rawState.availableActions || [];
    const actions = {
      fold: availableActions.some((a: any) => a.type === 'fold'),
      call: availableActions.some((a: any) => a.type === 'call' || a.type === 'check'),
      raise: availableActions.some((a: any) => a.type === 'raise' || a.type === 'allin'),
    };

    return {
      handId: rawState.handId || null,
      heroHasCards: (rawState.heroCards && rawState.heroCards.length > 0) || false,
      heroToAct: rawState.isHeroTurn || false,
      availableActions: actions,
      potSize: rawState.potSize || 0,
      street: rawState.currentStreet || 'unknown',
    };
  }
}
