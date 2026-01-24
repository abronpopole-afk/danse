import screenshot from "screenshot-desktop";
import sharp from "sharp";

export default {
  async capture(path = "screen.png") {
    const img = await screenshot({ format: "png" });
    await sharp(img).toFile(path);
    return path;
  },

  async captureRegion(x, y, width, height, path = "region.png") {
    const img = await screenshot({ format: "png" });
    await sharp(img)
      .extract({ left: x, top: y, width, height })
      .toFile(path);
    return path;
  }
};