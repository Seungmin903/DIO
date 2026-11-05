// Run from frontend/. Approved source artwork is never modified.
const path = require('node:path');
const fs = require('node:fs');
const Jimp = require('jimp-compact');
const root = path.resolve(__dirname, '..');
// The approved SVG consists of integer, one-pixel-high rectangular paths.
// Render those vector layers directly so launcher artwork can omit the rounded background.
function launcherForeground() {
 const svg = fs.readFileSync(path.join(root, 'assets/brand/launcher/app-icon-square-combined.svg'), 'utf8');
 const size = 1254;
 const rootElement = svg.trim().match(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" xmlns:inkscape="http:\/\/www\.inkscape\.org\/namespaces\/inkscape" width="1254" height="1254" viewBox="0 0 1254 1254">([\s\S]*)<\/svg>$/);
 if (!rootElement) throw new Error('Expected launcher SVG with viewBox 0 0 1254 1254');
 const image = new Jimp(size, size, 0x00000000);
 const layers = new Set(['paper-and-corners', 'background', 'body', 'bookmark', 'outlines']);
 const body = rootElement[1].replace(/^\s*<rect id="square-background" width="1254" height="1254" fill="#F0ECFD"\s*\/>/, '')
  .replace(/^\s*<title>[^<]*<\/title>\s*<desc>[^<]*<\/desc>/, '');
 const remaining = body.replace(/<g id="([^"]+)">([\s\S]*?)<\/g>/g, (_, layer, contents) => {
  if (!layers.delete(layer)) throw new Error(`Unexpected launcher SVG layer: ${layer}`);
  let pathCount = 0;
  const unrendered = contents.replace(/<path fill="(#[0-9A-Fa-f]{6})" shape-rendering="crispEdges" d="([^"]+)"\s*\/>/g, (_, fill, data) => {
   pathCount++;
   if (layer === 'background') return '';
   const color = Number.parseInt(`${fill.slice(1)}ff`, 16);
   const spans = [...data.matchAll(/M(\d+),(\d+)h(\d+)v1h-\3z/g)];
   if (spans.map(span => span[0]).join('') !== data) throw new Error(`Unsupported launcher SVG path in ${layer}`);
   for (const span of spans) {
    const x = Number(span[1]);
    const y = Number(span[2]);
    const width = Number(span[3]);
    if (y >= size || width < 1 || x + width > size) throw new Error(`Launcher SVG path out of bounds in ${layer}`);
    for (let offset = 0; offset < width; offset++) image.setPixelColor(color, x + offset, y);
   }
   return '';
  });
  if (!pathCount || unrendered.trim()) throw new Error(`Unsupported launcher SVG content in ${layer}`);
  return '';
 });
 if (remaining.trim() || layers.size) throw new Error('Unexpected or missing launcher SVG elements');
 return image;
}
(async () => {
 const foreground = launcherForeground();
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
