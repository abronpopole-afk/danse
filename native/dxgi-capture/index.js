const path = require('path');
const bindings = require('bindings');

// Charge le .node compilé via node-gyp
const addon = bindings('dxgi-capture');

module.exports = {
  captureDesktop: addon.captureDesktop
};