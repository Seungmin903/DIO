const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const { FELT_LAYERS, feltStrokeLayers } = await import('../src/editor/utils/feltStroke.js');
  const { createStrokePreview } = await import('../src/editor/utils/strokePreview.js');
  const out = path.join(__dirname, '../.expo/thick-pen-results');
  fs.mkdirSync(out, { recursive: true });
  const points = Array.from({ length: 240 }, (_, i) => ({ x: 40 + i * 2.4, y: 65 + Math.sin(i / 18) * 20 }));
  const input = {
    layers: FELT_LAYERS,
    saved: feltStrokeLayers([{ points }], 16),
    preview: feltStrokeLayers(createStrokePreview().snapshot(points), 16),
    line: feltStrokeLayers([{ points: [{ x: 40, y: 65 }, { x: 620, y: 65 }] }], 16),
    dot: feltStrokeLayers([{ points: [{ x: 40, y: 65 }] }], 16),
  };
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 }, deviceScaleFactor: 2 });
    const result = await page.evaluate(input => {
      const render = paths => {
        const canvas = document.createElement('canvas'); canvas.width = 700 * 4; canvas.height = 140 * 4;
        const ctx = canvas.getContext('2d'); ctx.scale(4, 4);
        paths.forEach((d, i) => { ctx.globalAlpha = input.layers[i].opacity; ctx.fill(new Path2D(d)); });
        return { ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      };
      const a = render(input.saved), b = render(input.preview), line = render(input.line), dot = render(input.dot);
      let maxDifference = 0, changed = 0;
      for (let i = 3; i < a.data.length; i += 4) { const d = Math.abs(a.data[i] - b.data[i]); maxDifference = Math.max(maxDifference, d); if (d > 8) changed++; }
      const alpha = (rendered, x, y) => rendered.ctx.getImageData(x * 4, y * 4, 1, 1).data[3];
      const crossSection = [0, 5.5, 6, 6.5, 7, 7.5, 8.5].map(offset => alpha(line, 300, 65 + offset));
      return { maxDifference, changed, crossSection, start: alpha(line, 50, 65), end: alpha(line, 610, 65), dot: alpha(dot, 40, 65) };
    }, input);
    assert.ok(result.maxDifference <= 8 && result.changed === 0, '실시간 구간 경계와 저장된 획의 농도 일치');
    assert.ok(result.crossSection[0] >= 248, '중심이 선명해야 한다');
    for (let i = 1; i < result.crossSection.length; i++) assert.ok(result.crossSection[i] <= result.crossSection[i - 1], '바깥으로 갈수록 옅어져야 한다');
    assert.equal(result.crossSection.at(-1), 0);
    assert.equal(result.start, result.end, '거리 기반 페이드 없음');
    assert.ok(result.dot >= 248, '탭 중심도 선명해야 한다');
    const svg = (paths, color) => `<svg width="900" height="170" viewBox="0 0 700 140">${paths.map((d, i) => `<path d="${d}" fill="${color}" fill-rule="nonzero" fill-opacity="${input.layers[i].opacity}"/>`).join('')}</svg>`;
    await page.setContent(`<body style="background:#fffaf1;font:18px sans-serif;margin:24px"><h2>펠트펜 · 굵기 16</h2><div>검정 — 선명한 중심과 부드러운 가장자리</div>${svg(input.saved, '#1d1d1f')}<div>파랑</div>${svg(input.saved, '#184aab')}<div>직선 · 확대</div><div style="transform:scaleY(2);transform-origin:top">${svg(input.line, '#1d1d1f')}</div></body>`);
    await page.screenshot({ path: path.join(out, 'felt-preview.png'), fullPage: true });
    fs.writeFileSync(path.join(out, 'felt-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
