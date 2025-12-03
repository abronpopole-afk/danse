import { ScreenRegion } from "./platform-adapter";

export interface CalibrationProfile {
  id: string;
  name: string;
  platformName: string;
  resolution: { width: number; height: number };
  windowSize: { width: number; height: number };
  regions: TableRegions;
  colorSignatures: ColorSignatures;
  createdAt: Date;
  updatedAt: Date;
}

export interface TableRegions {
  heroCards: ScreenRegion;
  communityCards: ScreenRegion;
  pot: ScreenRegion;
  actionButtons: ScreenRegion;
  betSlider: ScreenRegion;
  betInput: ScreenRegion;
  playerSeats: ScreenRegion[];
  dealerButton: ScreenRegion;
  timer: ScreenRegion;
  chat: ScreenRegion;
}

export interface ColorSignatures {
  heroTurnHighlight: ColorRange;
  foldButton: ColorRange;
  callButton: ColorRange;
  raiseButton: ColorRange;
  checkButton: ColorRange;
  allInButton: ColorRange;
  activePlayer: ColorRange;
  foldedPlayer: ColorRange;
  dealerButton: ColorRange;
  cardBack: ColorRange;
  hearts: ColorRange;
  diamonds: ColorRange;
  clubs: ColorRange;
  spades: ColorRange;
}

export interface ColorRange {
  r: number;
  g: number;
  b: number;
  tolerance: number;
}

export interface CalibrationPoint {
  name: string;
  description: string;
  expectedType: "region" | "color" | "text";
  region?: ScreenRegion;
  color?: ColorRange;
  sampleText?: string;
}

const DEFAULT_GGCLUB_9MAX: CalibrationProfile = {
  id: "ggclub_9max_default",
  name: "GGClub 9-Max Default",
  platformName: "ggclub",
  resolution: { width: 1920, height: 1080 },
  windowSize: { width: 880, height: 600 },
  regions: {
    heroCards: { x: 380, y: 450, width: 120, height: 80 },
    communityCards: { x: 280, y: 280, width: 320, height: 90 },
    pot: { x: 380, y: 230, width: 120, height: 40 },
    actionButtons: { x: 500, y: 520, width: 380, height: 80 },
    betSlider: { x: 500, y: 480, width: 300, height: 30 },
    betInput: { x: 810, y: 480, width: 70, height: 30 },
    playerSeats: generateSeatRegions(9, 880, 600),
    dealerButton: { x: 0, y: 0, width: 30, height: 30 },
    timer: { x: 400, y: 200, width: 80, height: 30 },
    chat: { x: 10, y: 400, width: 200, height: 150 },
  },
  colorSignatures: {
    heroTurnHighlight: { r: 255, g: 215, b: 0, tolerance: 40 },
    foldButton: { r: 180, g: 60, b: 60, tolerance: 30 },
    callButton: { r: 60, g: 150, b: 60, tolerance: 30 },
    raiseButton: { r: 60, g: 100, b: 180, tolerance: 30 },
    checkButton: { r: 80, g: 160, b: 80, tolerance: 30 },
    allInButton: { r: 200, g: 80, b: 200, tolerance: 30 },
    activePlayer: { r: 255, g: 200, b: 50, tolerance: 35 },
    foldedPlayer: { r: 100, g: 100, b: 100, tolerance: 25 },
    dealerButton: { r: 255, g: 255, b: 255, tolerance: 20 },
    cardBack: { r: 30, g: 90, b: 150, tolerance: 30 },
    hearts: { r: 220, g: 50, b: 50, tolerance: 30 },
    diamonds: { r: 220, g: 50, b: 50, tolerance: 30 },
    clubs: { r: 40, g: 40, b: 40, tolerance: 25 },
    spades: { r: 40, g: 40, b: 40, tolerance: 25 },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DEFAULT_GGCLUB_6MAX: CalibrationProfile = {
  ...DEFAULT_GGCLUB_9MAX,
  id: "ggclub_6max_default",
  name: "GGClub 6-Max Default",
  regions: {
    ...DEFAULT_GGCLUB_9MAX.regions,
    playerSeats: generateSeatRegions(6, 880, 600),
  },
};

function generateSeatRegions(maxPlayers: number, windowWidth: number, windowHeight: number): ScreenRegion[] {
  const regions: ScreenRegion[] = [];
  const centerX = windowWidth / 2;
  const centerY = windowHeight / 2 - 50;
  const radiusX = windowWidth * 0.4;
  const radiusY = windowHeight * 0.33;
  const seatWidth = 120;
  const seatHeight = 80;

  for (let i = 0; i < maxPlayers; i++) {
    const angle = (2 * Math.PI * i) / maxPlayers - Math.PI / 2;
    const x = centerX + radiusX * Math.cos(angle) - seatWidth / 2;
    const y = centerY + radiusY * Math.sin(angle) - seatHeight / 2;
    regions.push({
      x: Math.round(x),
      y: Math.round(y),
      width: seatWidth,
      height: seatHeight,
    });
  }

  return regions;
}

export class CalibrationManager {
  private profiles: Map<string, CalibrationProfile> = new Map();
  private activeProfile: CalibrationProfile | null = null;
  private calibrationMode: boolean = false;
  private calibrationPoints: CalibrationPoint[] = [];

  constructor() {
    this.loadDefaultProfiles();
  }

  private loadDefaultProfiles(): void {
    this.profiles.set(DEFAULT_GGCLUB_9MAX.id, DEFAULT_GGCLUB_9MAX);
    this.profiles.set(DEFAULT_GGCLUB_6MAX.id, DEFAULT_GGCLUB_6MAX);
  }

  getProfile(id: string): CalibrationProfile | undefined {
    return this.profiles.get(id);
  }

  getProfileForPlatform(platformName: string, maxPlayers: number = 9): CalibrationProfile | undefined {
    for (const profile of this.profiles.values()) {
      if (profile.platformName === platformName.toLowerCase()) {
        const seatCount = profile.regions.playerSeats.length;
        if (seatCount === maxPlayers) {
          return profile;
        }
      }
    }
    return undefined;
  }

  getAllProfiles(): CalibrationProfile[] {
    return Array.from(this.profiles.values());
  }

  setActiveProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (profile) {
      this.activeProfile = profile;
      return true;
    }
    return false;
  }

  getActiveProfile(): CalibrationProfile | null {
    return this.activeProfile;
  }

  createProfile(profile: Omit<CalibrationProfile, "id" | "createdAt" | "updatedAt">): CalibrationProfile {
    const newProfile: CalibrationProfile = {
      ...profile,
      id: `${profile.platformName}_${profile.name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.profiles.set(newProfile.id, newProfile);
    return newProfile;
  }

  updateProfile(id: string, updates: Partial<CalibrationProfile>): CalibrationProfile | null {
    const existing = this.profiles.get(id);
    if (!existing) return null;

    const updated: CalibrationProfile = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };
    this.profiles.set(id, updated);

    if (this.activeProfile?.id === id) {
      this.activeProfile = updated;
    }

    return updated;
  }

  deleteProfile(id: string): boolean {
    if (this.activeProfile?.id === id) {
      this.activeProfile = null;
    }
    return this.profiles.delete(id);
  }

  startCalibration(): CalibrationPoint[] {
    this.calibrationMode = true;
    this.calibrationPoints = this.generateCalibrationPoints();
    return this.calibrationPoints;
  }

  private generateCalibrationPoints(): CalibrationPoint[] {
    return [
      {
        name: "hero_cards",
        description: "Cliquez sur le coin supérieur gauche puis inférieur droit de vos cartes",
        expectedType: "region",
      },
      {
        name: "community_cards",
        description: "Cliquez sur la zone des cartes communes (board)",
        expectedType: "region",
      },
      {
        name: "pot",
        description: "Cliquez sur la zone d'affichage du pot",
        expectedType: "region",
      },
      {
        name: "fold_button",
        description: "Cliquez sur le bouton Fold",
        expectedType: "region",
      },
      {
        name: "call_button",
        description: "Cliquez sur le bouton Call/Check",
        expectedType: "region",
      },
      {
        name: "raise_button",
        description: "Cliquez sur le bouton Raise/Bet",
        expectedType: "region",
      },
      {
        name: "bet_slider",
        description: "Cliquez sur le slider de mise",
        expectedType: "region",
      },
      {
        name: "bet_input",
        description: "Cliquez sur le champ de saisie du montant",
        expectedType: "region",
      },
      {
        name: "hero_seat",
        description: "Cliquez sur votre siège (héros)",
        expectedType: "region",
      },
      {
        name: "timer",
        description: "Cliquez sur le timer d'action",
        expectedType: "region",
      },
    ];
  }

  submitCalibrationPoint(pointName: string, data: ScreenRegion | ColorRange): boolean {
    const point = this.calibrationPoints.find(p => p.name === pointName);
    if (!point) return false;

    if (point.expectedType === "region") {
      point.region = data as ScreenRegion;
    } else if (point.expectedType === "color") {
      point.color = data as ColorRange;
    }

    return true;
  }

  finalizeCalibration(profileName: string, platformName: string): CalibrationProfile | null {
    if (!this.calibrationMode) return null;

    const regions: Partial<TableRegions> = {};
    const colors: Partial<ColorSignatures> = {};

    for (const point of this.calibrationPoints) {
      if (point.region) {
        switch (point.name) {
          case "hero_cards":
            regions.heroCards = point.region;
            break;
          case "community_cards":
            regions.communityCards = point.region;
            break;
          case "pot":
            regions.pot = point.region;
            break;
          case "fold_button":
          case "call_button":
          case "raise_button":
            if (!regions.actionButtons) {
              regions.actionButtons = point.region;
            } else {
              regions.actionButtons = this.expandRegion(regions.actionButtons, point.region);
            }
            break;
          case "bet_slider":
            regions.betSlider = point.region;
            break;
          case "bet_input":
            regions.betInput = point.region;
            break;
          case "timer":
            regions.timer = point.region;
            break;
        }
      }

      if (point.color) {
        switch (point.name) {
          case "fold_button_color":
            colors.foldButton = point.color;
            break;
          case "call_button_color":
            colors.callButton = point.color;
            break;
          case "raise_button_color":
            colors.raiseButton = point.color;
            break;
        }
      }
    }

    const baseProfile = this.getProfileForPlatform(platformName) || DEFAULT_GGCLUB_9MAX;

    const newProfile = this.createProfile({
      name: profileName,
      platformName,
      resolution: baseProfile.resolution,
      windowSize: baseProfile.windowSize,
      regions: { ...baseProfile.regions, ...regions } as TableRegions,
      colorSignatures: { ...baseProfile.colorSignatures, ...colors } as ColorSignatures,
    });

    // Validation automatique du profil
    const validationResult = this.validateProfile(newProfile);
    if (!validationResult.isValid) {
      console.warn("[Calibration] Profile validation issues:", validationResult.warnings);
    }

    this.calibrationMode = false;
    this.calibrationPoints = [];

    return newProfile;
  }

  validateProfile(profile: CalibrationProfile): { 
    isValid: boolean; 
    score: number; 
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Vérifier les régions critiques
    const criticalRegions = ['heroCards', 'communityCards', 'actionButtons', 'pot'] as const;
    for (const regionName of criticalRegions) {
      const region = profile.regions[regionName];
      if (!region || region.width <= 0 || region.height <= 0) {
        warnings.push(`Missing or invalid region: ${regionName}`);
        score -= 20;
      }

      // Vérifier si les régions sont hors limites
      if (region && (region.x < 0 || region.y < 0 || 
          region.x + region.width > profile.windowSize.width ||
          region.y + region.height > profile.windowSize.height)) {
        warnings.push(`Region ${regionName} is out of window bounds`);
        score -= 10;
      }
    }

    // Vérifier les overlaps critiques
    if (this.regionsOverlap(profile.regions.heroCards, profile.regions.communityCards)) {
      warnings.push("Hero cards and community cards regions overlap");
      score -= 15;
    }

    // Vérifier les tailles minimales
    if (profile.regions.heroCards && 
        (profile.regions.heroCards.width < 80 || profile.regions.heroCards.height < 50)) {
      recommendations.push("Hero cards region might be too small");
      score -= 5;
    }

    if (profile.regions.actionButtons && 
        (profile.regions.actionButtons.width < 200 || profile.regions.actionButtons.height < 40)) {
      recommendations.push("Action buttons region might be too small");
      score -= 5;
    }

    // Vérifier les signatures de couleurs
    const colorCount = Object.values(profile.colorSignatures).filter(c => c !== undefined).length;
    if (colorCount < 8) {
      recommendations.push("Consider adding more color signatures for better detection");
      score -= 5;
    }

    const isValid = score >= 50; // Seuil minimal de validité

    return {
      isValid,
      score: Math.max(0, score),
      warnings,
      recommendations,
    };
  }

  private regionsOverlap(r1: ScreenRegion, r2: ScreenRegion): boolean {
    if (!r1 || !r2) return false;
    
    return !(r1.x + r1.width < r2.x || 
             r2.x + r2.width < r1.x || 
             r1.y + r1.height < r2.y || 
             r2.y + r2.height < r1.y);
  }

  private expandRegion(existing: ScreenRegion, addition: ScreenRegion): ScreenRegion {
    const minX = Math.min(existing.x, addition.x);
    const minY = Math.min(existing.y, addition.y);
    const maxX = Math.max(existing.x + existing.width, addition.x + addition.width);
    const maxY = Math.max(existing.y + existing.height, addition.y + addition.height);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  cancelCalibration(): void {
    this.calibrationMode = false;
    this.calibrationPoints = [];
  }

  isCalibrating(): boolean {
    return this.calibrationMode;
  }

  exportProfile(id: string): string | null {
    const profile = this.profiles.get(id);
    if (!profile) return null;

    return JSON.stringify(profile, null, 2);
  }

  importProfile(jsonData: string): CalibrationProfile | null {
    try {
      const data = JSON.parse(jsonData);
      
      // Validation basique de la structure
      if (!data.platformName || !data.regions || !data.colorSignatures) {
        throw new Error("Invalid profile structure");
      }

      const profile: CalibrationProfile = {
        ...data,
        id: `imported_${data.platformName}_${Date.now()}`,
        createdAt: new Date(data.createdAt || new Date()),
        updatedAt: new Date(),
      };

      this.profiles.set(profile.id, profile);
      return profile;
    } catch (error) {
      console.error("[Calibration] Failed to import profile:", error);
      return null;
    }
  }

  getProfileStatistics(): {
    totalProfiles: number;
    profilesByPlatform: Record<string, number>;
    avgValidationScore: number;
  } {
    const profilesByPlatform: Record<string, number> = {};
    let totalScore = 0;

    for (const profile of this.profiles.values()) {
      profilesByPlatform[profile.platformName] = 
        (profilesByPlatform[profile.platformName] || 0) + 1;
      
      const validation = this.validateProfile(profile);
      totalScore += validation.score;
    }

    return {
      totalProfiles: this.profiles.size,
      profilesByPlatform,
      avgValidationScore: this.profiles.size > 0 ? totalScore / this.profiles.size : 0,
    };
  }

  scaleRegionsForWindow(
    profile: CalibrationProfile, 
    actualWidth: number, 
    actualHeight: number,
    dpiScale: number = 1.0
  ): TableRegions {
    // Gestion du scaling avec aspect ratio préservé
    const targetAspectRatio = actualWidth / actualHeight;
    const profileAspectRatio = profile.windowSize.width / profile.windowSize.height;
    
    let scaleX = actualWidth / profile.windowSize.width;
    let scaleY = actualHeight / profile.windowSize.height;

    // Ajustement si l'aspect ratio a changé (ex: ultra-wide)
    if (Math.abs(targetAspectRatio - profileAspectRatio) > 0.1) {
      const avgScale = (scaleX + scaleY) / 2;
      scaleX = avgScale;
      scaleY = avgScale;
      
      console.warn(
        `[Calibration] Aspect ratio mismatch detected. ` +
        `Using uniform scaling (${avgScale.toFixed(2)}x) instead of non-uniform.`
      );
    }

    // Application du DPI scaling
    scaleX *= dpiScale;
    scaleY *= dpiScale;

    const scaleRegion = (region: ScreenRegion): ScreenRegion => {
      const scaled = {
        x: Math.round(region.x * scaleX),
        y: Math.round(region.y * scaleY),
        width: Math.round(region.width * scaleX),
        height: Math.round(region.height * scaleY),
      };

      // Vérification des limites après scaling
      if (scaled.x < 0) scaled.x = 0;
      if (scaled.y < 0) scaled.y = 0;
      if (scaled.x + scaled.width > actualWidth) {
        scaled.width = actualWidth - scaled.x;
      }
      if (scaled.y + scaled.height > actualHeight) {
        scaled.height = actualHeight - scaled.y;
      }

      return scaled;
    };

    return {
      heroCards: scaleRegion(profile.regions.heroCards),
      communityCards: scaleRegion(profile.regions.communityCards),
      pot: scaleRegion(profile.regions.pot),
      actionButtons: scaleRegion(profile.regions.actionButtons),
      betSlider: scaleRegion(profile.regions.betSlider),
      betInput: scaleRegion(profile.regions.betInput),
      playerSeats: profile.regions.playerSeats.map(scaleRegion),
      dealerButton: scaleRegion(profile.regions.dealerButton),
      timer: scaleRegion(profile.regions.timer),
      chat: scaleRegion(profile.regions.chat),
    };
  }

  autoAdjustRegions(
    profile: CalibrationProfile, 
    screenshot: Buffer, 
    screenshotWidth: number
  ): TableRegions | null {
    // Placeholder pour future détection automatique par IA
    // Pourrait utiliser template matching ou ML pour affiner les régions
    console.log("[Calibration] Auto-adjustment not yet implemented");
    return null;
  }
}

let calibrationManagerInstance: CalibrationManager | null = null;

export function getCalibrationManager(): CalibrationManager {
  if (!calibrationManagerInstance) {
    calibrationManagerInstance = new CalibrationManager();
  }
  return calibrationManagerInstance;
}

export function colorMatch(pixel: { r: number; g: number; b: number }, target: ColorRange): boolean {
  return (
    Math.abs(pixel.r - target.r) <= target.tolerance &&
    Math.abs(pixel.g - target.g) <= target.tolerance &&
    Math.abs(pixel.b - target.b) <= target.tolerance
  );
}

export function findColorInRegion(
  imageBuffer: Buffer,
  imageWidth: number,
  region: ScreenRegion,
  targetColor: ColorRange
): { found: boolean; x: number; y: number; matchCount: number } {
  let matchCount = 0;
  let firstMatchX = -1;
  let firstMatchY = -1;

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const offset = (y * imageWidth + x) * 4;
      const r = imageBuffer[offset];
      const g = imageBuffer[offset + 1];
      const b = imageBuffer[offset + 2];

      if (colorMatch({ r, g, b }, targetColor)) {
        matchCount++;
        if (firstMatchX === -1) {
          firstMatchX = x;
          firstMatchY = y;
        }
      }
    }
  }

  return {
    found: matchCount > 0,
    x: firstMatchX,
    y: firstMatchY,
    matchCount,
  };
}

export function getDominantColorInRegion(
  imageBuffer: Buffer,
  imageWidth: number,
  region: ScreenRegion
): { r: number; g: number; b: number } {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let pixelCount = 0;

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const offset = (y * imageWidth + x) * 4;
      totalR += imageBuffer[offset];
      totalG += imageBuffer[offset + 1];
      totalB += imageBuffer[offset + 2];
      pixelCount++;
    }
  }

  return {
    r: Math.round(totalR / pixelCount),
    g: Math.round(totalG / pixelCount),
    b: Math.round(totalB / pixelCount),
  };
}
