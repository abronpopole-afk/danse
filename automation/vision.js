import sharp from "sharp";
import Tesseract from "tesseract.js";

export default {
  async readText(path) {
    const { data } = await Tesseract.recognize(path, "eng", {
      tessedit_char_whitelist: "0123456789TJQKA♠♥♦♣"
    });
    return data.text.trim();
  },

  async detectCard(path) {
    const text = await this.readText(path);
    return text.replace(/\s+/g, "");
  }
};