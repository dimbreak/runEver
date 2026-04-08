
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const runEverMarkDir = path.join(rootDir, 'runEverMark/mockSite');
const assetsDir = path.join(rootDir, 'assets/runEverMark');

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
  // 1. Copy img to dist/img
  console.log('Copying img to dist/img...');
  const imgSrc = path.join(runEverMarkDir, 'img');
  const imgDest = path.join(runEverMarkDir, 'dist/img');
  if (fs.existsSync(imgSrc)) {
      copyRecursiveSync(imgSrc, imgDest);
  } else {
      console.warn('img directory not found:', imgSrc);
  }

  // 2. Clear and create assets/runEverMark
  console.log('Preparing assets/runEverMark...');
  if (fs.existsSync(assetsDir)) {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(assetsDir, { recursive: true });

  // 3. Copy dist to assets/runEverMark
  console.log('Copying dist to assets/runEverMark...');
  const distSrc = path.join(runEverMarkDir, 'dist');
  copyRecursiveSync(distSrc, assetsDir);

  console.log('Success!');
} catch (err) {
  console.error('Error copying files:', err);
  process.exit(1);
}
