const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const configPageDir = path.join(rootDir, 'src/renderer/config_page');
const assetsDir = path.join(rootDir, 'assets/config_page');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

try {
  // Clear and create assets/config_page
  console.log('Preparing assets/config_page...');
  if (fs.existsSync(assetsDir)) {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(assetsDir, { recursive: true });

  // Copy dist to assets/config_page
  console.log('Copying dist to assets/config_page...');
  const distSrc = path.join(configPageDir, 'dist');

  if (!fs.existsSync(distSrc)) {
      throw new Error(`Dist directory not found at ${distSrc}. Did you run build?`);
  }

  copyRecursiveSync(distSrc, assetsDir);

  console.log('Success!');
} catch (err) {
  console.error('Error copying files:', err);
  process.exit(1);
}
