// Run from frontend/. Approved source artwork is never modified.
const path = require('node:path');
const fs = require('node:fs');
const Jimp = require('jimp-compact');
const root = path.resolve(__dirname, '..');
(async () => {
 // Android adaptive foreground: the launcher artwork without its square background (transparent PNG).
 const foreground = await Jimp.read(path.join(root, 'assets/brand/launcher/app-icon-square-foreground.png'));
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
 const icon = await Jimp.read(path.join(root, 'assets/brand/launcher/app-icon-square-combined.png'));
 icon.resize(1024,1024,Jimp.RESIZE_HERMITE);
 await icon.writeAsync(out('icon.png'));
 const adaptive = new Jimp(1024,1024,0x00000000);
 // The launcher displays the central 72/108 viewport. Fill it with the square artwork.
 // Decorative cover edges may be masked; the face and bookmark center remain in the safe zone.
 const launcherSize = Math.round(1024 * 72 / 108);
 const launcherOffset = Math.floor((1024 - launcherSize) / 2);
 adaptive.composite(foreground.resize(launcherSize,launcherSize,Jimp.RESIZE_HERMITE),launcherOffset,launcherOffset);
 await adaptive.writeAsync(out('adaptive-icon.png'));
 await source.clone().resize(512,512).writeAsync(out('splash-icon.png'));
 await source.clone().resize(64,64).writeAsync(out('favicon.png'));
})().catch(error => { console.error(error); process.exitCode=1; });
