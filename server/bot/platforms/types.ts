import { type TableWindow } from "./ggclub";

import { type TableWindow } from "../platform-adapter";

export interface GGClubWindowInfo {
  handle: number;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
  isMinimized: boolean;
  processName?: string;
  processPath?: string;
}
