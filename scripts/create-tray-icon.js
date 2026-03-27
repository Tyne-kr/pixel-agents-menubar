const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const SIZE = 18;
const png = new PNG({ width: SIZE, height: SIZE });

// Pixel art character silhouette (18x18)
// 1 = black pixel, 0 = transparent
// Design: a small humanoid pixel agent with antenna
const pixels = [
  '000000000100000000',  // 0  antenna tip
  '000000000100000000',  // 1  antenna stem
  '000000011111000000',  // 2  head top
  '000000111111100000',  // 3  head
  '000000110110100000',  // 4  head with eyes (gaps for eyes)
  '000000111111100000',  // 5  head bottom
  '000000011111000000',  // 6  chin
  '000000001110000000',  // 7  neck
  '000001111111110000',  // 8  shoulders
  '000011111111111000',  // 9  upper body
  '000011101110111000',  // 10 body with arms
  '000001101110110000',  // 11 body with arms
  '000000011111000000',  // 12 waist
  '000000011111000000',  // 13 hips
  '000000011011000000',  // 14 legs
  '000000110001100000',  // 15 legs
  '000000110001100000',  // 16 lower legs
  '000001110001110000',  // 17 feet
];

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (SIZE * y + x) << 2;
    const on = pixels[y][x] === '1';
    png.data[idx] = 0;       // R
    png.data[idx + 1] = 0;   // G
    png.data[idx + 2] = 0;   // B
    png.data[idx + 3] = on ? 255 : 0; // A
  }
}

const outPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
png.pack().pipe(fs.createWriteStream(outPath)).on('finish', () => {
  console.log(`Tray icon created at: ${outPath}`);
});
