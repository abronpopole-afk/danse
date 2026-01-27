const fs = require('fs');
const path = require('path');

const targets = [
  '.github/workflows/build-windows.yml',
  '.github/workflows/release.yml',
  'electron-builder.json'
];

targets.forEach(f => {
  const p = path.resolve(process.cwd(), f);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
      console.log('DELETED: ' + f);
    } catch (e) {
      console.error('FAILED: ' + f + ' - ' + e.message);
    }
  } else {
    console.log('NOT FOUND: ' + f);
  }
});
