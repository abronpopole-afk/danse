export default {
  async wait(min = 80, max = 250) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(res => setTimeout(res, delay));
  },

  jitter(value, amount = 3) {
    return value + Math.floor(Math.random() * amount * 2) - amount;
  },

  async humanClick(mouse, x, y) {
    const jx = this.jitter(x, 5);
    const jy = this.jitter(y, 5);
    mouse.move(jx, jy);
    await this.wait(50, 120);
    mouse.click();
  }
};