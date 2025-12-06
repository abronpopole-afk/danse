
import Redis from "ioredis";
import { EventEmitter } from "events";

export type EventType =
  | "vision.state_detected"
  | "vision.ocr_completed"
  | "gto.request"
  | "gto.response"
  | "action.queued"
  | "action.executed"
  | "ui.update"
  | "platform.window_detected"
  | "platform.connection_change"
  | "session.state_change";

export interface BusEvent {
  id: string;
  type: EventType;
  timestamp: number;
  payload: any;
  metadata?: {
    tableId?: string;
    windowHandle?: number;
    accountId?: string;
    priority?: number;
  };
}

export class EventBus extends EventEmitter {
  private redis: Redis;
  private pubRedis: Redis;
  private streamName = "poker_bot_events";
  private consumerGroup = "bot_workers";
  private consumerId: string;
  private isConsuming = false;
  private eventHandlers: Map<EventType, Array<(event: BusEvent) => Promise<void>>> = new Map();

  constructor(redisUrl?: string) {
    super();
    const url = redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
    this.redis = new Redis(url);
    this.pubRedis = new Redis(url);
    this.consumerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.xgroup(
        "CREATE",
        this.streamName,
        this.consumerGroup,
        "$",
        "MKSTREAM"
      );
      console.log(`[EventBus] Consumer group created: ${this.consumerGroup}`);
    } catch (error: any) {
      if (!error.message.includes("BUSYGROUP")) {
        console.error("[EventBus] Error creating consumer group:", error);
      }
    }
  }

  async publish(type: EventType, payload: any, metadata?: BusEvent["metadata"]): Promise<string> {
    const event: BusEvent = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      payload,
      metadata,
    };

    const eventData = {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp.toString(),
      payload: JSON.stringify(event.payload),
      metadata: event.metadata ? JSON.stringify(event.metadata) : "",
    };

    const streamId = await this.pubRedis.xadd(
      this.streamName,
      "*",
      ...Object.entries(eventData).flat()
    );

    this.emit("published", event);
    return streamId;
  }

  on(type: EventType, handler: (event: BusEvent) => Promise<void>): this {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, []);
    }
    this.eventHandlers.get(type)!.push(handler);
    return this;
  }

  async startConsuming(): Promise<void> {
    if (this.isConsuming) {
      return;
    }

    this.isConsuming = true;
    console.log(`[EventBus] Consumer started: ${this.consumerId}`);

    while (this.isConsuming) {
      try {
        const results = await this.redis.xreadgroup(
          "GROUP",
          this.consumerGroup,
          this.consumerId,
          "COUNT",
          10,
          "BLOCK",
          1000,
          "STREAMS",
          this.streamName,
          ">"
        );

        if (!results || results.length === 0) {
          continue;
        }

        for (const [stream, messages] of results) {
          for (const [messageId, fields] of messages) {
            await this.processMessage(messageId, fields);
          }
        }
      } catch (error) {
        console.error("[EventBus] Error consuming events:", error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async processMessage(messageId: string, fields: string[]): Promise<void> {
    try {
      const data: any = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      const event: BusEvent = {
        id: data.id,
        type: data.type as EventType,
        timestamp: parseInt(data.timestamp),
        payload: JSON.parse(data.payload),
        metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
      };

      const handlers = this.eventHandlers.get(event.type) || [];
      
      await Promise.all(
        handlers.map(handler => 
          handler(event).catch(err => 
            console.error(`[EventBus] Handler error for ${event.type}:`, err)
          )
        )
      );

      await this.redis.xack(this.streamName, this.consumerGroup, messageId);
      this.emit("processed", event);
    } catch (error) {
      console.error("[EventBus] Error processing message:", error);
    }
  }

  async stopConsuming(): Promise<void> {
    this.isConsuming = false;
    console.log(`[EventBus] Consumer stopped: ${this.consumerId}`);
  }

  async getStreamInfo(): Promise<any> {
    const info = await this.redis.xinfo("STREAM", this.streamName);
    return this.parseStreamInfo(info);
  }

  private parseStreamInfo(info: any[]): any {
    const result: any = {};
    for (let i = 0; i < info.length; i += 2) {
      result[info[i]] = info[i + 1];
    }
    return result;
  }

  async getPendingCount(): Promise<number> {
    const pending = await this.redis.xpending(
      this.streamName,
      this.consumerGroup
    );
    return pending ? parseInt(pending[0] as string) : 0;
  }

  async trimStream(maxLength: number = 10000): Promise<void> {
    await this.redis.xtrim(this.streamName, "MAXLEN", "~", maxLength);
  }

  async disconnect(): Promise<void> {
    await this.stopConsuming();
    await this.redis.quit();
    await this.pubRedis.quit();
  }
}

let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}

export async function initializeEventBus(): Promise<EventBus> {
  const bus = getEventBus();
  await bus.initialize();
  return bus;
}
