const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  console.log('After pack hook running...');
  
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;
  
  if (platform === 'windows') {
    console.log('Windows build detected, checking native modules...');
    
    const nativePath = path.join(appOutDir, 'resources', 'native');
    
    if (fs.existsSync(nativePath)) {
      console.log('Native modules found at:', nativePath);
      const files = fs.readdirSync(nativePath);
      console.log('Native files:', files);
    } else {
      console.log('Native modules directory not found, creating...');
      fs.mkdirSync(nativePath, { recursive: true });
    }
    
    const sourceDxgi = path.join(process.cwd(), 'native', 'build', 'Release', 'dxgi-capture.node');
    const destDxgi = path.join(nativePath, 'dxgi-capture.node');
    
    if (fs.existsSync(sourceDxgi)) {
      fs.copyFileSync(sourceDxgi, destDxgi);
      console.log('DXGI module copied successfully');
    } else {
      console.log('DXGI module not found (optional)');
    }
  }
  
  console.log('After pack hook completed');
};
