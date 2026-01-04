const fs = require('fs');
const path = require('path');

const copyDir = (src, dest) => {
  if (!fs.existsSync(src)) {
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

const rootPath = path.join(__dirname, '../..');
const srcExtensionsPath = path.join(rootPath, 'src/extensions');

const erbExtensionsPath = path.join(rootPath, '.erb/extensions');
copyDir(srcExtensionsPath, erbExtensionsPath);

const distPath = path.join(rootPath, 'release/app/dist');
if (fs.existsSync(distPath)) {
  const distExtensionsPath = path.join(distPath, 'extensions');
  copyDir(srcExtensionsPath, distExtensionsPath);
}
