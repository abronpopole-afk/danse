const fs = require('fs');
const path = require('path');

const files = [
  '.github/workflows/build-windows.yml',
  '.github/workflows/release.yml',
  'electron-builder.json'
];

files.forEach(f => {
  const p = path.join(process.cwd(), f);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
      console.log('Deleted: ' + f);
    } catch (e) {
      console.error('Error: ' + f, e.message);
    }
  }
});
