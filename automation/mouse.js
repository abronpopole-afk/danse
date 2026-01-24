import { load } from 'win32-api';

const user32 = load('user32', {
  SetCursorPos: ['bool', ['int', 'int']],
  mouse_event: ['void', ['int', 'int', 'int', 'int', 'int']],
});

const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;

export default {
  move(x, y) {
    user32.SetCursorPos(x, y);
  },

  click() {
    user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
    user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
  },
};