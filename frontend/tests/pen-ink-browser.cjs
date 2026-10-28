const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const { strokeInkLayers, inkLevels } = await import('../src/editor/utils/penInk.js');
  const { penContour } = await import('../src/editor/utils/strokes.js');
  const { createStrokePreview } = await import('../src/editor/utils/strokePreview.js');
  const out = path.join(__dirname, '../.expo/thick-pen-results');
  fs.mkdirSync(out, { recursive: true });
  const points = Array.from({ length: 240 }, (_, i) => ({ x: 30 + i * 2.5, y: 60 + 20 * Math.sin(i / 20), pressure: 1 }));
  const straight = [{ x: 30, y: 60 }, { x: 630, y: 60 }];
  const examples = ['fountain', 'brush'].map(kind => ({ kind, levels: inkLevels(kind),
    saved: strokeInkLayers([{ points }], 16, kind),
    preview: strokeInkLayers(createStrokePreview().snapshot(points), 16, kind),
    straight: strokeInkLayers([{ points: straight }], 16, kind),
    short: strokeInkLayers([{ points: [{ x: 30, y: 60 }, { x: 100, y: 60 }] }], 16, kind),
    jitter: penContour([{ x: 30, y: 60 }, { x: 100, y: 60 }, { x: 99.7, y: 60.15 }], 16, kind),
  }));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const results = await page.evaluate(examples => {
      const render = (paths, levels) => {
        const canvas = document.createElement('canvas'); canvas.width = 680; canvas.height = 120;
        const ctx = canvas.getContext('2d');
        paths.forEach((d, i) => { ctx.globalAlpha = i ? (levels[i] - levels[i - 1]) / (1 - levels[i - 1]) : levels[0]; ctx.fill(new Path2D(d), 'nonzero'); });
        return { ctx, pixels: ctx.getImageData(0, 0, 680, 120).data };
      };
      return examples.map(e => {
        const a = render(e.saved, e.levels), b = render(e.preview, e.levels), line = render(e.straight, e.levels), short = render(e.short, e.levels);
        let changed = 0, maxDifference = 0;
        for (let i = 3; i < a.pixels.length; i += 4) { const difference = Math.abs(a.pixels[i] - b.pixels[i]); if (difference > 8) changed++; maxDifference = Math.max(maxDifference, difference); }
        const alpha = (r, x) => r.ctx.getImageData(x, 60, 1, 1).data[3];
        const contour = new Path2D(e.jitter);
        const missingCap = [[103, 60], [100, 64], [100, 56]].filter(([x, y]) => !a.ctx.isPointInPath(contour, x, y)).length;
        return { kind: e.kind, changed, maxDifference, startAlpha: alpha(line, 40), middleAlpha: alpha(line, 300), endAlpha: alpha(line, 620), shortEndAlpha: alpha(short, 95), missingCap };
      });
    }, examples);
    for (const result of results) {
      assert.equal(result.missingCap, 0, `${result.kind}: 끝점 패임`);
      assert.ok(result.changed < 15, `${result.kind}: 미리보기/저장 농도 차이 ${result.changed}px`);
      if (result.kind === 'brush') {
        assert.ok(result.startAlpha > result.middleAlpha && result.middleAlpha > result.endAlpha);
        assert.ok(result.endAlpha >= 135 && result.shortEndAlpha > 235);
      }
    }
    const svg = (paths, levels, color) => `<svg width="900" height="150" viewBox="0 0 680 120">${paths.map((d, i) => `<path d="${d}" fill="${color}" fill-rule="nonzero" fill-opacity="${i ? (levels[i] - levels[i - 1]) / (1 - levels[i - 1]) : levels[0]}"/>`).join('')}</svg>`;
    await page.setContent(`<body style="font:18px sans-serif;background:#fff8ee;margin:24px"><h2>동일한 좌표 · 굵기 16</h2><div>볼펜</div><svg width="900" height="150" viewBox="0 0 680 120"><path d="M${points.map(p => `${p.x} ${p.y}`).join('L')}" stroke="#1d1d1f" stroke-width="16" fill="none" stroke-linecap="round"/></svg>${examples.map(e => `<div>${e.kind === 'fountain' ? '만년필 — 잉크 농도' : '붓펜 — 긴 획 뒤쪽 농도 감소'}</div>${svg(e.saved, e.levels, '#1d1d1f')}${svg(e.saved, e.levels, '#184aab')}`).join('')}</body>`);
    await page.screenshot({ path: path.join(out, 'ink-comparison.png'), fullPage: true });
    fs.writeFileSync(path.join(out, 'ink-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
