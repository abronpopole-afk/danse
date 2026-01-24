import { logger } from "../../logger";

export const anti = {
  humanize: () => {
    logger.info("Automation", "Applying humanization");
  }
};

export default anti;
