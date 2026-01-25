import { logger } from "../../logger";
import { requireNativeModule } from "../native-loader";

const windowManager = requireNativeModule<any>("node-window-manager");

export const window = {
  focusWindow: (handle: number) => {
    logger.info("Automation", `Focusing window handle: ${handle}`);
    if (windowManager) {
      try {
        const windows = windowManager.windowManager.getWindows();
        const target = windows.find((w: any) => Math.abs(w.handle) === Math.abs(handle));
        if (target) {
          target.bringToTop();
          return true;
        }
      } catch (e) {
        logger.error("Automation", "Focus failed", { error: String(e) });
      }
    }
    return false;
  },
  
  getBounds: (handle: number) => {
    if (windowManager) {
      try {
        const windows = windowManager.windowManager.getWindows();
        const target = windows.find((w: any) => Math.abs(w.handle) === Math.abs(handle));
        if (target) {
          const bounds = target.getBounds();
          return {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
          };
        }
      } catch (e) {}
    }
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
};

export default window;
