export * from "./ggclub";
export { 
  PlatformAdapter, 
  PlatformAdapterRegistry,
  type PlatformCapabilities,
  type ConnectionConfig,
  type PlatformCredentials,
  type TableWindow,
  type GameTableState,
  type CardInfo,
  type DetectedPlayer,
  type DetectedButton,
  type ScreenRegion,
  type ConnectionStatus,
  type PlatformEvent,
  type AntiDetectionConfig,
  parseCardNotation,
  cardInfoToNotation,
  gameStateToPlayerData,
} from "../platform-adapter";

import { PlatformAdapterRegistry, PlatformAdapter } from "../platform-adapter";
import { GGClubAdapter } from "./ggclub";

export function createPlatformAdapter(platformName: string): PlatformAdapter | null {
  const registry = PlatformAdapterRegistry.getInstance();
  return registry.create(platformName);
}

export function getSupportedPlatforms(): string[] {
  return PlatformAdapterRegistry.getInstance().getSupportedPlatforms();
}

export function isPlatformSupported(platformName: string): boolean {
  return PlatformAdapterRegistry.getInstance().isSupported(platformName);
}

export { GGClubAdapter };
