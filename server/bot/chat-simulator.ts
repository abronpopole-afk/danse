
import { EventEmitter } from "events";

export interface ChatMessage {
  type: "chat" | "note" | "emote";
  content: string;
  timestamp: number;
  targetTable?: string;
}

export interface ChatSimulatorConfig {
  enableChat: boolean;
  chatFrequency: number; // Messages par heure
  enableNotes: boolean;
  noteFrequency: number; // Notes par heure
  enableEmotes: boolean;
  emoteFrequency: number; // Emotes par heure
}

const CHAT_TEMPLATES = {
  greeting: ["gg", "gl all", "hi", "hey"],
  reaction: ["nh", "nice hand", "wp", "wow", "omg", "lol"],
  frustration: ["ugh", "cmon", "really?", "sigh"],
  neutral: ["ty", "thx", "np", "yep", "k"],
};

const NOTE_TEMPLATES = [
  "TAG player, 3bet wide",
  "Loose passive, station",
  "Aggro reg, adjust ranges",
  "Nit, fold to 3bet 80%+",
  "Calling station postflop",
  "Bluffs river often",
  "Weak to check-raise",
  "Overfolds to pressure",
];

export class ChatSimulator extends EventEmitter {
  private config: ChatSimulatorConfig;
  private messageHistory: ChatMessage[] = [];
  private lastChatTime = 0;
  private lastNoteTime = 0;
  private lastEmoteTime = 0;

  constructor(config?: Partial<ChatSimulatorConfig>) {
    super();
    
    this.config = {
      enableChat: true,
      chatFrequency: 2, // 2 messages/heure en moyenne
      enableNotes: true,
      noteFrequency: 5, // 5 notes/heure
      enableEmotes: false, // Désactivé par défaut (moins naturel)
      emoteFrequency: 1,
      ...config,
    };
  }

  updateConfig(updates: Partial<ChatSimulatorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Détermine si un message de chat doit être envoyé
   */
  shouldSendChat(context: {
    eventType?: "hand_won" | "hand_lost" | "session_start" | "bad_beat";
    sessionDuration: number; // minutes
  }): ChatMessage | null {
    if (!this.config.enableChat) return null;

    const now = Date.now();
    const timeSinceLastChat = (now - this.lastChatTime) / 60000; // minutes

    // Fréquence de base
    const baseProb = (this.config.chatFrequency / 60) * 0.1; // Par minute

    // Augmenter probabilité sur événements
    let eventMultiplier = 1;
    if (context.eventType === "hand_won" && Math.random() < 0.15) {
      eventMultiplier = 3;
    } else if (context.eventType === "bad_beat" && Math.random() < 0.25) {
      eventMultiplier = 4;
    } else if (context.eventType === "session_start" && context.sessionDuration < 2) {
      eventMultiplier = 5; // Plus de chat en début de session
    }

    const adjustedProb = baseProb * eventMultiplier;

    if (Math.random() < adjustedProb && timeSinceLastChat > 5) {
      this.lastChatTime = now;
      return this.generateChatMessage(context.eventType);
    }

    return null;
  }

  /**
   * Détermine si une note doit être prise
   */
  shouldTakeNote(context: {
    opponentAction: string;
    sessionDuration: number;
  }): ChatMessage | null {
    if (!this.config.enableNotes) return null;

    const now = Date.now();
    const timeSinceLastNote = (now - this.lastNoteTime) / 60000;

    const baseProb = (this.config.noteFrequency / 60) * 0.1;

    // Plus de notes sur actions inhabituelles
    let eventMultiplier = 1;
    if (context.opponentAction.includes("3BET") || context.opponentAction.includes("4BET")) {
      eventMultiplier = 2;
    } else if (context.opponentAction.includes("BLUFF")) {
      eventMultiplier = 3;
    }

    const adjustedProb = baseProb * eventMultiplier;

    if (Math.random() < adjustedProb && timeSinceLastNote > 3) {
      this.lastNoteTime = now;
      return this.generateNote();
    }

    return null;
  }

  private generateChatMessage(eventType?: string): ChatMessage {
    let category: keyof typeof CHAT_TEMPLATES = "neutral";

    if (eventType === "hand_won") {
      category = Math.random() < 0.7 ? "neutral" : "reaction";
    } else if (eventType === "bad_beat") {
      category = Math.random() < 0.6 ? "frustration" : "reaction";
    } else if (eventType === "session_start") {
      category = "greeting";
    } else {
      // Sélection aléatoire pondérée
      const rand = Math.random();
      if (rand < 0.6) category = "neutral";
      else if (rand < 0.85) category = "reaction";
      else category = "greeting";
    }

    const templates = CHAT_TEMPLATES[category];
    const content = templates[Math.floor(Math.random() * templates.length)];

    const message: ChatMessage = {
      type: "chat",
      content,
      timestamp: Date.now(),
    };

    this.messageHistory.push(message);
    this.emit("chatMessage", message);

    return message;
  }

  private generateNote(): ChatMessage {
    const content = NOTE_TEMPLATES[Math.floor(Math.random() * NOTE_TEMPLATES.length)];

    const message: ChatMessage = {
      type: "note",
      content,
      timestamp: Date.now(),
    };

    this.messageHistory.push(message);
    this.emit("noteCreated", message);

    return message;
  }

  getMessageHistory(): ChatMessage[] {
    return [...this.messageHistory];
  }

  reset(): void {
    this.messageHistory = [];
    this.lastChatTime = 0;
    this.lastNoteTime = 0;
    this.lastEmoteTime = 0;
  }
}

let globalChatSimulator: ChatSimulator = new ChatSimulator();

export function getChatSimulator(): ChatSimulator {
  return globalChatSimulator;
}

export function resetChatSimulator(config?: Partial<ChatSimulatorConfig>): void {
  globalChatSimulator = new ChatSimulator(config);
}
