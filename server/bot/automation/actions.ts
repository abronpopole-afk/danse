import { logger } from "../../logger";
import { requireNativeModule } from "../native-loader";

const robot = requireNativeModule<any>("robotjs");

export interface ClickOptions {
  windowX: number;
  windowY: number;
  width: number;
  height: number;
}

export const actions = {
  executeAction: async (action: string, amount: number | undefined, region: any, options: ClickOptions) => {
    logger.info("Automation", `Executing: ${action} at region`, { region, options });
    
    if (!robot) {
      logger.warning("Automation", "RobotJS not loaded, simulating click");
      return;
    }

    // Calcul des coordonnées absolues
    // region.x/y/width/height sont en ratio (0-1) par rapport à la fenêtre
    const centerX = options.windowX + (region.x + region.width / 2) * options.width;
    const centerY = options.windowY + (region.y + region.height / 2) * options.height;

    try {
      // Déplacement de la souris (humanisé via robotjs si possible)
      robot.moveMouseSmooth(centerX, centerY);
      
      // Petit délai pour assurer que le clic est enregistré
      await new Promise(resolve => setTimeout(resolve, 100));
      
      robot.mouseClick();
      logger.info("Automation", `Click executed at (${centerX}, ${centerY})`);
    } catch (error) {
      logger.error("Automation", "Click failed", { error: String(error) });
    }
  },

  raise: async (region: any, options: ClickOptions) => {
    await actions.executeAction("RAISE", undefined, region, options);
  },

  fold: async (region: any, options: ClickOptions) => {
    await actions.executeAction("FOLD", undefined, region, options);
  },
  
  call: async (region: any, options: ClickOptions) => {
    await actions.executeAction("CALL", undefined, region, options);
  }
};

export default actions;
