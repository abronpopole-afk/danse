import { windowManager } from "node-window-manager";

export default {
  getPokerStarsWindow() {
    return windowManager.getWindows().find(w =>
      w.getTitle().toLowerCase().includes("pokerstars")
    );
  },

  focusPokerStars() {
    const win = this.getPokerStarsWindow();
    if (win) win.bringToTop();
    return win;
  },

  getBounds() {
    const win = this.getPokerStarsWindow();
    return win ? win.getBounds() : null;
  }
};