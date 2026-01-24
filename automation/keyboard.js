import { load } from 'win32-api';

const user32 = load('user32', {
  keybd_event: ['void', ['int', 'int', 'int', 'int']],
});

const KEYEVENTF_KEYUP = 0x0002;

function pressKey(vk) {
  user32.keybd_event(vk, 0, 0, 0);
  user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
}

export default {
  pressKey,
  type(text) {
    for (const char of text) {
      const vk = char.toUpperCase().charCodeAt(0);
      pressKey(vk);
    }
  },
};