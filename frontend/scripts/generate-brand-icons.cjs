// Run from frontend/. Approved source artwork is never modified.
const path = require('node:path');
const fs = require('node:fs');
const Jimp = require('jimp-compact');
const root = path.resolve(__dirname, '..');
(async () => {
 const source = await Jimp.read(path.join(root, 'assets/brand/mascot-final-combined.png'));
 const display = path.join(root, 'assets/brand/display');
 fs.mkdirSync(display, { recursive: true });
 // Area averaging (Hermite) preserves fractional edge coverage at each device density.
 for (const size of [24, 28, 30, 32, 52, 160]) {
  for (const density of [1, 2, 3]) {
   const suffix = density === 1 ? '' : `@${density}x`;
   await source.clone().resize(size * density, size * density, Jimp.RESIZE_HERMITE)
    .writeAsync(path.join(display, `mascot-${size}${suffix}.png`));
  }
 }
 const out = name => path.join(root, 'assets/images', name);
 // Installed iOS/general icon must be opaque; app/splash assets retain transparency.
 const icon = new Jimp(1024,1024,0xf0ebffff);
 icon.composite(source.clone().resize(1024,1024),0,0);
 await icon.writeAsync(out('icon.png'));
 const adaptive = new Jimp(1024,1024,0x00000000);
 // A 440px square fits entirely inside the central 66/108 safe-zone circle.
 adaptive.composite(source.clone().resize(440,440),292,292);
 await adaptive.writeAsync(out('adaptive-icon.png'));
 await source.clone().resize(512,512).writeAsync(out('splash-icon.png'));
 await source.clone().resize(64,64).writeAsync(out('favicon.png'));
})().catch(error => { console.error(error); process.exitCode=1; });
