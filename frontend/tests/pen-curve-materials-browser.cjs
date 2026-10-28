const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const { feltStrokeLayers, FELT_LAYERS } = await import('../src/editor/utils/feltStroke.js');
  const { feltMaterialLayers, FELT_MATERIAL_OPACITIES } = await import('../src/editor/utils/penMaterials.js');
  const { strokeInkLayers, inkLevels } = await import('../src/editor/utils/penInk.js');
  const { createStrokePreview } = await import('../src/editor/utils/strokePreview.js');
  const points = Array.from({ length: 250 }, (_, i) => ({ x: 30 + i * 2.2, y: 60 + Math.sin(i * 0.4) * 18,
    pressure: 0.6 + 0.35 * Math.cos(i * 0.3), force: 0.2 + 0.65 * Math.sin(i / 250 * Math.PI), speed: 0.4, inkDistance: i * 2.2 }));
  const opacity = levels => levels.map((v, i) => i ? (v - levels[i - 1]) / (1 - levels[i - 1]) : v);
  const rows = [
    { label: 'Fountain / previous', paths: strokeInkLayers([{ points }], 16, 'fountain'), alpha: opacity(inkLevels('fountain')) },
    { label: 'Fountain / new', paths: strokeInkLayers([{ points }], 16, 'fountain', 3), alpha: opacity(inkLevels('fountain', 3)) },
    { label: 'Felt / previous', paths: feltStrokeLayers([{ points }], 16), alpha: FELT_LAYERS.map(v => v.opacity) },
    { label: 'Felt / new', paths: feltMaterialLayers([{ points }], 16, 101), alpha: FELT_MATERIAL_OPACITIES },
  ];
  const parts = createStrokePreview().snapshot(points);
  const comparisons = [
    [rows[0], strokeInkLayers(parts, 16, 'fountain')],
    [rows[2], feltStrokeLayers(parts, 16)],
    [rows[1], strokeInkLayers(parts, 16, 'fountain', 3)],
    [rows[3], feltMaterialLayers(parts, 16, 101)],
  ];
  for (const source of [points.map(({ inkDistance, ...p }) => p), points.map(({ inkDistance, force, speed, ...p }) => p)]) {
    const pieces = createStrokePreview().snapshot(source)
    for (const kind of ['brush', 'fountain']) {
      const paths = strokeInkLayers([{ points: source }], 16, kind, 3)
      comparisons.push([{ label: `${kind} / cumulative distance`, paths, alpha: opacity(inkLevels(kind, 3)) }, strokeInkLayers(pieces, 16, kind, 3)])
    }
    comparisons.push([{ label: 'Felt / cumulative distance', paths: feltMaterialLayers([{ points: source }], 16, 101), alpha: FELT_MATERIAL_OPACITIES }, feltMaterialLayers(pieces, 16, 101)])
  }
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 950 }, deviceScaleFactor: 2 });
    const results = await page.evaluate(comparisons => {
      const render = (paths, alpha) => {
        const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 480;
        const ctx = canvas.getContext('2d'); ctx.scale(4, 4);
        paths.forEach((p, i) => { ctx.globalAlpha = alpha[i]; ctx.fill(new Path2D(p)); });
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      return comparisons.map(([saved, preview]) => {
        const a = render(saved.paths, saved.alpha), b = render(preview, saved.alpha);
        let maxDifference = 0, changed = 0;
        for (let i = 3; i < a.length; i += 4) { const diff = Math.abs(a[i] - b[i]); maxDifference = Math.max(maxDifference, diff); if (diff > 8) changed++; }
        return { label: saved.label, maxDifference, changed };
      });
    }, comparisons);
    for (const r of results) assert.ok(r.maxDifference <= 8 && r.changed === 0, JSON.stringify(r));
    const svg = row => `<svg width="900" height="160" viewBox="0 0 600 120">${row.paths.map((d, i) => `<path d="${d}" fill="#1d1d1f" fill-rule="nonzero" fill-opacity="${row.alpha[i]}"/>`).join('')}</svg>`;
    await page.setContent(`<body style="background:#fffaf1;font:18px sans-serif;margin:24px"><h2>Pen material comparison / width 16</h2>${rows.map(row => `<div>${row.label}</div>${svg(row)}`).join('')}</body>`);
    const out = path.join(__dirname, '../.expo/pen-curve-material-results'); fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'comparison.png'), fullPage: true });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
