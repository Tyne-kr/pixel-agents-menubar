const { PNG } = require('pngjs');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Create a 512x512 pixel art app icon
const size = 512;
const png = new PNG({ width: size, height: size });

// Fill with transparent background
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const idx = (y * size + x) * 4;
    png.data[idx] = 0;
    png.data[idx + 1] = 0;
    png.data[idx + 2] = 0;
    png.data[idx + 3] = 0;
  }
}

// Draw a pixel art character (scaled up from 16x32 to fill 512x512)
// Character design: simple humanoid with monitor
const pixelSize = 16; // each "pixel" is 16x16 real pixels

// Background circle (dark blue)
const cx = 256, cy = 256, radius = 240;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= radius * radius) {
      const idx = (y * size + x) * 4;
      png.data[idx] = 30;     // #1e1e2e
      png.data[idx + 1] = 30;
      png.data[idx + 2] = 46;
      png.data[idx + 3] = 255;
    }
  }
}

// Pixel art character (16x16 grid centered in circle)
// Each row is an array of [r,g,b] or null for transparent
const character = [
  // Row 0-1: Hair top
  [null,null,null,null,null,[101,67,33],[101,67,33],[101,67,33],[101,67,33],[101,67,33],null,null,null,null,null,null],
  [null,null,null,null,[101,67,33],[101,67,33],[101,67,33],[101,67,33],[101,67,33],[101,67,33],[101,67,33],null,null,null,null,null],
  // Row 2-3: Face
  [null,null,null,null,[101,67,33],[245,215,185],[245,215,185],[245,215,185],[245,215,185],[245,215,185],[101,67,33],null,null,null,null,null],
  [null,null,null,null,[101,67,33],[245,215,185],[30,30,30],null,[245,215,185],[30,30,30],[101,67,33],null,null,null,null,null],
  // Row 4: Mouth
  [null,null,null,null,null,[245,215,185],[245,215,185],[200,150,150],[245,215,185],[245,215,185],null,null,null,null,null,null],
  // Row 5: Neck
  [null,null,null,null,null,null,[245,215,185],[245,215,185],[245,215,185],null,null,null,null,null,null,null],
  // Row 6-8: Shirt (green like pixel-agents accent)
  [null,null,null,null,[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],null,null,null,null,null],
  [null,null,null,[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],null,null,null,null],
  [null,null,null,[245,215,185],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[90,200,140],[245,215,185],null,null,null,null],
  // Row 9-10: Pants
  [null,null,null,null,[70,70,120],[70,70,120],[70,70,120],[70,70,120],[70,70,120],[70,70,120],[70,70,120],null,null,null,null,null],
  [null,null,null,null,[70,70,120],[70,70,120],[70,70,120],null,[70,70,120],[70,70,120],[70,70,120],null,null,null,null,null],
  // Row 11: Shoes
  [null,null,null,[50,50,50],[50,50,50],[50,50,50],null,null,null,[50,50,50],[50,50,50],[50,50,50],null,null,null,null],
];

// Draw character centered
const startX = Math.floor((size - 16 * pixelSize) / 2);
const startY = Math.floor((size - 12 * pixelSize) / 2) - 20;

for (let row = 0; row < character.length; row++) {
  for (let col = 0; col < character[row].length; col++) {
    const color = character[row][col];
    if (!color) continue;
    for (let py = 0; py < pixelSize; py++) {
      for (let px = 0; px < pixelSize; px++) {
        const x = startX + col * pixelSize + px;
        const y = startY + row * pixelSize + py;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= radius * radius) {
            const idx = (y * size + x) * 4;
            png.data[idx] = color[0];
            png.data[idx + 1] = color[1];
            png.data[idx + 2] = color[2];
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  }
}

// Save PNG
const outDir = path.join(__dirname, '..', 'assets');
const pngPath = path.join(outDir, 'icon.png');
const buffer = PNG.sync.write(png);
fs.writeFileSync(pngPath, buffer);
console.log('Created icon.png at', pngPath);

// Convert to .icns using macOS sips + iconutil
const iconsetDir = path.join(outDir, 'icon.iconset');
fs.mkdirSync(iconsetDir, { recursive: true });

const sizes = [16, 32, 64, 128, 256, 512];
for (const s of sizes) {
  execSync(`sips -z ${s} ${s} "${pngPath}" --out "${iconsetDir}/icon_${s}x${s}.png"`, { stdio: 'pipe' });
  if (s <= 256) {
    const s2 = s * 2;
    execSync(`sips -z ${s2} ${s2} "${pngPath}" --out "${iconsetDir}/icon_${s}x${s}@2x.png"`, { stdio: 'pipe' });
  }
}

const icnsPath = path.join(outDir, 'icon.icns');
execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
console.log('Created icon.icns at', icnsPath);

// Cleanup iconset
fs.rmSync(iconsetDir, { recursive: true });
console.log('Done!');
