import { logger } from "../../logger";

export const vision = {
  detectCard: async (imagePath: string) => {
    logger.info("Automation", `Detecting card in ${imagePath}`);
    return "AA"; // Mock detection
  }
};

export default vision;
