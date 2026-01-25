/**
 * Responsive Regions Manager
 * 
 * Assure que le bot fonctionne sur TOUTES les tailles d'écran
 * (téléphone, tablette, ordinateur)
 * 
 * Stratégie:
 * - Tout est défini en pourcentages de la fenêtre
 * - Adaptation automatique à n'importe quelle résolution
 * - Support du responsive design comme un site web
 */

import type { ScreenRegion, TableWindow } from "./platform-adapter";

export interface ResponsiveRegionTemplate {
  name: string;
  xPercent: number;      // Position X en % de la largeur
  yPercent: number;      // Position Y en % de la hauteur
  widthPercent: number;  // Largeur en % de la largeur
  heightPercent: number; // Hauteur en % de la hauteur
  minWidth?: number;     // Taille minimale en pixels
  minHeight?: number;
  priority: number;
}

export const RESPONSIVE_REGIONS: ResponsiveRegionTemplate[] = [
  // === CARTES DU HÉROS ===
  // Flex-box style: deux cartes côte à côte, centrées en bas
  {
    name: 'hero_card_1',
    xPercent: 0.38,
    yPercent: 0.70,
    widthPercent: 0.10,
    heightPercent: 0.18,
    minWidth: 60,
    minHeight: 80,
    priority: 100,
  },
  {
    name: 'hero_card_2',
    xPercent: 0.52,
    yPercent: 0.70,
    widthPercent: 0.10,
    heightPercent: 0.18,
    minWidth: 60,
    minHeight: 80,
    priority: 100,
  },

  // === CARTES COMMUNAUTAIRES ===
  // Au centre, légèrement au-dessus du milieu
  {
    name: 'community_cards',
    xPercent: 0.2,
    yPercent: 0.35,
    widthPercent: 0.6,
    heightPercent: 0.12,
    minWidth: 300,
    minHeight: 60,
    priority: 95,
  },

  // === POT ===
  // Au centre du tapis
  {
    name: 'pot',
    xPercent: 0.38,
    yPercent: 0.43,
    widthPercent: 0.24,
    heightPercent: 0.10,
    minWidth: 120,
    minHeight: 50,
    priority: 90,
  },

  // === BOUTONS D'ACTION ===
  // En bas à droite, avec de l'espace
  {
    name: 'action_buttons',
    xPercent: 0.55,
    yPercent: 0.82,
    widthPercent: 0.40,
    heightPercent: 0.15,
    minWidth: 200,
    minHeight: 70,
    priority: 85,
  },

  // === CURSEUR DE MISE ===
  // Juste au-dessus des boutons
  {
    name: 'bet_slider',
    xPercent: 0.55,
    yPercent: 0.75,
    widthPercent: 0.40,
    heightPercent: 0.06,
    minWidth: 200,
    minHeight: 30,
    priority: 80,
  },

  // === TIMER ===
  // Au-dessus du pot
  {
    name: 'timer',
    xPercent: 0.44,
    yPercent: 0.28,
    widthPercent: 0.12,
    heightPercent: 0.08,
    minWidth: 70,
    minHeight: 40,
    priority: 75,
  },

  // === SEAT #0 (Hero - bas) ===
  {
    name: 'seat_0',
    xPercent: 0.40,
    yPercent: 0.85,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #1 (droite) ===
  {
    name: 'seat_1',
    xPercent: 0.75,
    yPercent: 0.65,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #2 (haut-droite) ===
  {
    name: 'seat_2',
    xPercent: 0.70,
    yPercent: 0.30,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #3 (top) ===
  {
    name: 'seat_3',
    xPercent: 0.40,
    yPercent: 0.05,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #4 (haut-gauche) ===
  {
    name: 'seat_4',
    xPercent: 0.10,
    yPercent: 0.30,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #5 (gauche) ===
  {
    name: 'seat_5',
    xPercent: 0.05,
    yPercent: 0.65,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #6 (bas-gauche) ===
  {
    name: 'seat_6',
    xPercent: 0.10,
    yPercent: 0.75,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #7 (bas-droite, près du hero) ===
  {
    name: 'seat_7',
    xPercent: 0.70,
    yPercent: 0.75,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === SEAT #8 (dealer position, varie) ===
  {
    name: 'seat_8',
    xPercent: 0.50,
    yPercent: 0.20,
    widthPercent: 0.20,
    heightPercent: 0.12,
    priority: 70,
  },

  // === BOUTON DEALER ===
  {
    name: 'dealer_button',
    xPercent: 0.48,
    yPercent: 0.48,
    widthPercent: 0.04,
    heightPercent: 0.06,
    priority: 65,
  },

  // === CHAT / INFO ===
  {
    name: 'chat',
    xPercent: 0.01,
    yPercent: 0.60,
    widthPercent: 0.18,
    heightPercent: 0.35,
    priority: 40,
  },
];

/**
 * Calcule les régions réelles en pixels en fonction de la taille de la fenêtre
 * 
 * @param template Template de région responsive
 * @param windowWidth Largeur de la fenêtre en pixels
 * @param windowHeight Hauteur de la fenêtre en pixels
 * @returns Région en pixels avec limites de taille minimale
 */
export function templateToScreenRegion(
  template: ResponsiveRegionTemplate,
  windowWidth: number,
  windowHeight: number
): ScreenRegion {
  let x = Math.round(template.xPercent * windowWidth);
  let y = Math.round(template.yPercent * windowHeight);
  let width = Math.round(template.widthPercent * windowWidth);
  let height = Math.round(template.heightPercent * windowHeight);

  // Appliquer les tailles minimales si spécifiées
  if (template.minWidth && width < template.minWidth) {
    width = template.minWidth;
    // Recentraliser si dépassement
    if (x + width > windowWidth) {
      x = Math.max(0, windowWidth - width);
    }
  }

  if (template.minHeight && height < template.minHeight) {
    height = template.minHeight;
    // Recentraliser si dépassement
    if (y + height > windowHeight) {
      y = Math.max(0, windowHeight - height);
    }
  }

  // Limiter aux bounds de la fenêtre
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + width > windowWidth) {
    width = windowWidth - x;
  }
  if (y + height > windowHeight) {
    height = windowHeight - y;
  }

  return { x, y, width, height };
}

/**
 * Génère toutes les régions pour une taille de fenêtre donnée
 */
export function generateResponsiveRegions(
  windowWidth: number,
  windowHeight: number
): Map<string, ScreenRegion> {
  const regions = new Map<string, ScreenRegion>();

  for (const template of RESPONSIVE_REGIONS) {
    regions.set(template.name, templateToScreenRegion(template, windowWidth, windowHeight));
  }

  return regions;
}

/**
 * Valide qu'une région ne dépasse pas les limites de la fenêtre
 */
export function isRegionValid(region: ScreenRegion, windowWidth: number, windowHeight: number): boolean {
  return region.x >= 0 &&
         region.y >= 0 &&
         region.x + region.width <= windowWidth &&
         region.y + region.height <= windowHeight &&
         region.width > 0 &&
         region.height > 0;
}

/**
 * Convertit les régions responsive en format CalibrationProfile
 * Pour utilisation avec le système de calibration existant
 */
export function responsiveRegionsToCalibrationProfile(
  windowWidth: number,
  windowHeight: number
) {
  const regions = generateResponsiveRegions(windowWidth, windowHeight);

  return {
    heroCards: regions.get('hero_card_1') || { x: 0, y: 0, width: 100, height: 100 },
    communityCards: regions.get('community_cards') || { x: 0, y: 0, width: 100, height: 100 },
    pot: regions.get('pot') || { x: 0, y: 0, width: 100, height: 100 },
    actionButtons: regions.get('action_buttons') || { x: 0, y: 0, width: 100, height: 100 },
    betSlider: regions.get('bet_slider') || { x: 0, y: 0, width: 100, height: 100 },
    betInput: regions.get('action_buttons') || { x: 0, y: 0, width: 100, height: 100 },
    playerSeats: Array.from({ length: 9 }, (_, i) =>
      regions.get(`seat_${i}`) || { x: 0, y: 0, width: 100, height: 100 }
    ),
    dealerButton: regions.get('dealer_button') || { x: 0, y: 0, width: 100, height: 100 },
    timer: regions.get('timer') || { x: 0, y: 0, width: 100, height: 100 },
    chat: regions.get('chat') || { x: 0, y: 0, width: 100, height: 100 },
  };
}
