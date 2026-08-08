/**
 * Generates placeholder PNG assets for development.
 * Run once: node scripts/gen-assets.js
 * Replace with real assets before app store submission.
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function makeIcon(size, outPath) {
  try {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, size, size);

    // Brand circle
    const cx = size / 2, cy = size / 2, r = size * 0.38;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, '#818CF8');
    grad.addColorStop(1, '#6366F1');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Letter C
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${size * 0.38}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', cx, cy);

    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    console.log(`Generated ${outPath}`);
  } catch {
    // If canvas is not installed, write a minimal 1×1 transparent PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(outPath, png);
    console.log(`Generated placeholder (canvas not available): ${outPath}`);
  }
}

const assetsDir = path.join(__dirname, '../assets');
fs.mkdirSync(assetsDir, { recursive: true });

makeIcon(1024, path.join(assetsDir, 'icon.png'));
makeIcon(1024, path.join(assetsDir, 'adaptive-icon.png'));
makeIcon(2048, path.join(assetsDir, 'splash.png'));

console.log('Asset generation complete.');
