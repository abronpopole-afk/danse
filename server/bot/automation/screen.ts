import { logger } from "../../logger";
import { requireNativeModule } from "../native-loader";

const screenshot = requireNativeModule<any>("screenshot-desktop");

export const screen = {
  captureRegion: async (x: number, y: number, width: number, height: number, filename: string) => {
    logger.info("Automation", `Capturing region: ${x},${y} ${width}x${height} to ${filename}`);
    if (screenshot) {
      // Mocking region capture logic for now
      return true;
    }
    return false;
  }
};

export default screen;
