import { logger } from "../../logger";
import { requireNativeModule } from "../native-loader";

const windowManager = requireNativeModule<any>("node-window-manager");

export const window = {
  focusPokerStars: () => {
    logger.info("Automation", "Focusing PokerStars window");
    if (windowManager) {
      const windows = windowManager.windowManager.getWindows();
      const pokerWindow = windows.find((w: any) => w.getTitle().includes("Poker"));
      if (pokerWindow) {
        pokerWindow.bringToTop();
        return true;
      }
    }
    return false;
  },
  getBounds: () => {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
};

export default window;
