
import { ScreenRegion, TableWindow } from "./platform-adapter";
import { CalibrationProfile, TableRegions, getCalibrationManager } from "./calibration";
import { findColorInRegion, getDominantColorInRegion, ColorRange } from "./calibration";

export interface AnchorPoint {
  name: string;
  region: ScreenRegion;
  colorSignature: ColorRange;
  expectedPosition: { x: number; y: number };
}

export interface CalibrationDrift {
  windowHandle: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  confidence: number;
  timestamp: number;
}

export interface RecalibrationResult {
  success: boolean;
  drift: CalibrationDrift | null;
  adjustedRegions: TableRegions | null;
  reason?: string;
}

export class AutoCalibrationManager {
  private driftHistory: Map<number, CalibrationDrift[]> = new Map();
  private actionCounters: Map<number, number> = new Map();
  private lastRecalibration: Map<number, number> = new Map();
  private recalibrationInterval: number = 400; // Toutes les 400 actions
  private minRecalibrationDelay: number = 300000; // 5 minutes minimum entre recalibrations
  private anchorPoints: AnchorPoint[] = [];
  private driftThreshold: number = 5; // pixels

  constructor() {
    this.initializeAnchorPoints();
  }

  private initializeAnchorPoints(): void {
    // Points d'ancrage fixes sur l'interface GGClub
    this.anchorPoints = [
      {
        name: "gg_logo",
        region: { x: 10, y: 10, width: 50, height: 30 },
        colorSignature: { r: 255, g: 140, b: 0, tolerance: 40 }, // Orange GG
        expectedPosition: { x: 10, y: 10 },
      },
      {
        name: "settings_button",
        region: { x: 800, y: 10, width: 30, height: 30 },
        colorSignature: { r: 200, g: 200, b: 200, tolerance: 30 }, // Gris clair
        expectedPosition: { x: 800, y: 10 },
      },
      {
        name: "table_border_top_left",
        region: { x: 0, y: 0, width: 10, height: 10 },
        colorSignature: { r: 30, g: 60, b: 90, tolerance: 25 }, // Bleu foncé table
        expectedPosition: { x: 0, y: 0 },
      },
      {
        name: "dealer_button_area",
        region: { x: 400, y: 250, width: 80, height: 80 },
        colorSignature: { r: 255, g: 255, b: 255, tolerance: 20 }, // Blanc bouton dealer
        expectedPosition: { x: 440, y: 290 },
      },
    ];
  }

  incrementActionCount(windowHandle: number): void {
    const current = this.actionCounters.get(windowHandle) || 0;
    this.actionCounters.set(windowHandle, current + 1);
  }

  shouldRecalibrate(windowHandle: number): boolean {
    const actionCount = this.actionCounters.get(windowHandle) || 0;
    const lastRecal = this.lastRecalibration.get(windowHandle) || 0;
    const now = Date.now();

    // Recalibrer si:
    // 1. Plus de X actions depuis la dernière recalibration
    // 2. Au moins Y minutes écoulées
    const actionThresholdMet = actionCount >= this.recalibrationInterval;
    const timeThresholdMet = (now - lastRecal) >= this.minRecalibrationDelay;

    return actionThresholdMet && timeThresholdMet;
  }

  async performRecalibration(
    windowHandle: number,
    screenBuffer: Buffer,
    imageWidth: number,
    imageHeight: number,
    currentProfile: CalibrationProfile
  ): Promise<RecalibrationResult> {
    console.log(`[AutoCalibration] Starting recalibration for window ${windowHandle}`);

    const detectedAnchors: Array<{ name: string; actualX: number; actualY: number; confidence: number }> = [];

    // Détecter chaque anchor point
    for (const anchor of this.anchorPoints) {
      const searchRegion = this.expandSearchArea(anchor.region, 30); // ±30px de marge
      
      const colorMatch = findColorInRegion(
        screenBuffer,
        imageWidth,
        searchRegion,
        anchor.colorSignature
      );

      if (colorMatch.found && colorMatch.matchCount > 10) {
        detectedAnchors.push({
          name: anchor.name,
          actualX: colorMatch.x,
          actualY: colorMatch.y,
          confidence: Math.min(1.0, colorMatch.matchCount / 100),
        });
      }
    }

    // Pas assez d'anchors détectés
    if (detectedAnchors.length < 2) {
      console.warn(`[AutoCalibration] Only ${detectedAnchors.length} anchors detected, skipping`);
      return {
        success: false,
        drift: null,
        adjustedRegions: null,
        reason: `Insufficient anchors detected (${detectedAnchors.length}/4)`,
      };
    }

    // Calculer le drift moyen
    const drifts: Array<{ offsetX: number; offsetY: number }> = [];

    for (const detected of detectedAnchors) {
      const anchor = this.anchorPoints.find(a => a.name === detected.name);
      if (!anchor) continue;

      const offsetX = detected.actualX - anchor.expectedPosition.x;
      const offsetY = detected.actualY - anchor.expectedPosition.y;

      drifts.push({ offsetX, offsetY });
    }

    const avgOffsetX = drifts.reduce((sum, d) => sum + d.offsetX, 0) / drifts.length;
    const avgOffsetY = drifts.reduce((sum, d) => sum + d.offsetY, 0) / drifts.length;

    // Détecter scaling (rare mais possible)
    const scaleX = 1.0; // TODO: implémenter détection scaling si nécessaire
    const scaleY = 1.0;

    const drift: CalibrationDrift = {
      windowHandle,
      offsetX: Math.round(avgOffsetX),
      offsetY: Math.round(avgOffsetY),
      scaleX,
      scaleY,
      confidence: detectedAnchors.reduce((sum, a) => sum + a.confidence, 0) / detectedAnchors.length,
      timestamp: Date.now(),
    };

    // Sauvegarder dans l'historique
    if (!this.driftHistory.has(windowHandle)) {
      this.driftHistory.set(windowHandle, []);
    }
    this.driftHistory.get(windowHandle)!.push(drift);

    // Garder seulement les 10 derniers
    const history = this.driftHistory.get(windowHandle)!;
    if (history.length > 10) {
      this.driftHistory.set(windowHandle, history.slice(-10));
    }

    // Reset compteurs
    this.actionCounters.set(windowHandle, 0);
    this.lastRecalibration.set(windowHandle, Date.now());

    // Drift significatif?
    if (Math.abs(drift.offsetX) < this.driftThreshold && Math.abs(drift.offsetY) < this.driftThreshold) {
      console.log(`[AutoCalibration] Drift negligible (${drift.offsetX}px, ${drift.offsetY}px), no adjustment needed`);
      return {
        success: true,
        drift,
        adjustedRegions: null,
        reason: "Drift within acceptable threshold",
      };
    }

    // Appliquer la correction
    const adjustedRegions = this.adjustRegions(currentProfile.regions, drift);

    console.log(`[AutoCalibration] Applied drift correction: offsetX=${drift.offsetX}px, offsetY=${drift.offsetY}px (confidence=${(drift.confidence * 100).toFixed(1)}%)`);

    return {
      success: true,
      drift,
      adjustedRegions,
      reason: `Drift corrected: ${drift.offsetX}px, ${drift.offsetY}px`,
    };
  }

  private expandSearchArea(region: ScreenRegion, margin: number): ScreenRegion {
    return {
      x: Math.max(0, region.x - margin),
      y: Math.max(0, region.y - margin),
      width: region.width + margin * 2,
      height: region.height + margin * 2,
    };
  }

  private adjustRegions(regions: TableRegions, drift: CalibrationDrift): TableRegions {
    const adjusted: TableRegions = { ...regions };

    // Appliquer l'offset à toutes les régions
    const applyDrift = (region: ScreenRegion): ScreenRegion => ({
      x: Math.round(region.x + drift.offsetX),
      y: Math.round(region.y + drift.offsetY),
      width: Math.round(region.width * drift.scaleX),
      height: Math.round(region.height * drift.scaleY),
    });

    adjusted.heroCards = applyDrift(regions.heroCards);
    adjusted.communityCards = applyDrift(regions.communityCards);
    adjusted.pot = applyDrift(regions.pot);
    adjusted.actionButtons = applyDrift(regions.actionButtons);
    adjusted.betSlider = applyDrift(regions.betSlider);
    adjusted.betInput = applyDrift(regions.betInput);
    adjusted.dealerButton = applyDrift(regions.dealerButton);
    adjusted.timer = applyDrift(regions.timer);
    adjusted.chat = applyDrift(regions.chat);
    adjusted.playerSeats = regions.playerSeats.map(applyDrift);

    return adjusted;
  }

  getDriftHistory(windowHandle: number): CalibrationDrift[] {
    return this.driftHistory.get(windowHandle) || [];
  }

  getAverageDrift(windowHandle: number): { offsetX: number; offsetY: number } | null {
    const history = this.getDriftHistory(windowHandle);
    if (history.length === 0) return null;

    const avgOffsetX = history.reduce((sum, d) => sum + d.offsetX, 0) / history.length;
    const avgOffsetY = history.reduce((sum, d) => sum + d.offsetY, 0) / history.length;

    return {
      offsetX: Math.round(avgOffsetX),
      offsetY: Math.round(avgOffsetY),
    };
  }

  resetCalibration(windowHandle: number): void {
    this.driftHistory.delete(windowHandle);
    this.actionCounters.delete(windowHandle);
    this.lastRecalibration.delete(windowHandle);
  }

  getStats(): {
    totalWindows: number;
    totalRecalibrations: number;
    averageDrift: { x: number; y: number };
    windowsWithDrift: number;
  } {
    const totalWindows = this.driftHistory.size;
    let totalRecalibrations = 0;
    let totalOffsetX = 0;
    let totalOffsetY = 0;
    let windowsWithDrift = 0;

    for (const history of this.driftHistory.values()) {
      totalRecalibrations += history.length;
      
      if (history.length > 0) {
        const lastDrift = history[history.length - 1];
        totalOffsetX += Math.abs(lastDrift.offsetX);
        totalOffsetY += Math.abs(lastDrift.offsetY);
        
        if (Math.abs(lastDrift.offsetX) > this.driftThreshold || 
            Math.abs(lastDrift.offsetY) > this.driftThreshold) {
          windowsWithDrift++;
        }
      }
    }

    return {
      totalWindows,
      totalRecalibrations,
      averageDrift: {
        x: totalWindows > 0 ? Math.round(totalOffsetX / totalWindows) : 0,
        y: totalWindows > 0 ? Math.round(totalOffsetY / totalWindows) : 0,
      },
      windowsWithDrift,
    };
  }
}

let autoCalibrationInstance: AutoCalibrationManager | null = null;

export function getAutoCalibrationManager(): AutoCalibrationManager {
  if (!autoCalibrationInstance) {
    autoCalibrationInstance = new AutoCalibrationManager();
  }
  return autoCalibrationInstance;
}
