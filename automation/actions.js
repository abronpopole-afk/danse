import mouse from "./mouse.js";
import window from "./window.js";

export default {
  async fold() {
    const win = window.getBounds();
    mouse.move(win.x + 200, win.y + 500);
    mouse.click();
  },

  async call() {
    const win = window.getBounds();
    mouse.move(win.x + 400, win.y + 500);
    mouse.click();
  },

  async raise() {
    const win = window.getBounds();
    mouse.move(win.x + 600, win.y + 500);
    mouse.click();
  }
};