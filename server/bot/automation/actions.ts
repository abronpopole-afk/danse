import { logger } from "../../logger";
import { requireNativeModule } from "../native-loader";

const robot = requireNativeModule<any>("robotjs");

export const actions = {
  raise: async () => {
    logger.info("Automation", "Action: RAISE");
    if (robot) {
      robot.mouseClick();
    }
  },
  fold: async () => {
    logger.info("Automation", "Action: FOLD");
    if (robot) {
      robot.mouseClick();
    }
  }
};

export default actions;
