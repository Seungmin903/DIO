const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.join(__dirname, '../.expo/thick-pen-results');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const { penContour } = await import('../src/editor/utils/strokes.js');
  const { thickPenCases, penCasePoints } = await import('./fixtures/thick-pen-cases.js');
  const baselineRef = process.env.PEN_BASELINE_REF || 'a7bf9c7';
  const source = execFileSync('git', ['show', `${baselineRef}:frontend/src/editor/utils/strokes.js`], { encoding: 'utf8' });
  const old = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const inputs = thickPenCases.flatMap(fixture => ['fountain', 'brush'].map(kind => {
    const points = penCasePoints(fixture, kind);
    return { name: fixture.name, kind, points, before: old.penContour(points, 16, kind), after: penContour(points, 16, kind) };
  }));
  const longPoints = Array.from({ length: 1000 }, (_, i) => ({ x: i * 1.3, y: 70 + 30 * Math.sin(i / 18), pressure: 0.7 + 0.7 * (1 + Math.sin(i / 40)) / 2 }));
  const benchmark = fn => {
    for (let i = 0; i < 5; i++) fn(longPoints, 16, 'fountain');
    const runs = [];
    for (let i = 0; i < 20; i++) { const start = performance.now(); fn(longPoints, 16, 'fountain'); runs.push(performance.now() - start); }
    runs.sort((a, b) => a - b); return { medianMs: runs[10], maxMs: runs.at(-1) };
  };
  const geometryTiming = { baseline: benchmark(old.penContour), fixed: benchmark(penContour) };
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const results = await page.evaluate(inputs => inputs.map(input => {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      const before = new Path2D(input.before), after = new Path2D(input.after);
      const missing = p => {
        let count = 0, total = 0;
        for (let i = 1; i < input.points.length; i++) {
          const a = input.points[i - 1], b = input.points[i];
          for (let k = 1; k < 20; k++) {
            const t = k / 20;
            if (!ctx.isPointInPath(p, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 'nonzero')) count++;
            total++;
          }
        }
        return { count, total };
      };
      const oldMissing = missing(before), fixedMissing = missing(after);
      // 0.5px 외곽 이내의 곡선 근사 차이를 빼고 실제 안쪽 빈 영역이 메워졌는지 확인한다.
      ctx.lineWidth = 1;
      let filledInteriorSamples = 0;
      for (let y = 20; y < 120; y += 0.5) for (let x = 20; x < 180; x += 0.5) {
        if (ctx.isPointInPath(after, x, y, 'nonzero') && !ctx.isPointInPath(before, x, y, 'nonzero') && !ctx.isPointInStroke(before, x, y)) filledInteriorSamples++;
      }
      return { name: input.name, kind: input.kind, oldMissing, fixedMissing, filledInteriorSamples };
    }), inputs);
    for (const r of results) assert.equal(r.fixedMissing.count, 0, `${r.name}/${r.kind}: 획 중심 경로의 빈틈`);
    for (const kind of ['fountain', 'brush']) assert.ok(results.filter(r => r.kind === kind).some(r => r.filledInteriorSamples > 0), `${kind}의 내부 빈틈 재현·보완`);
    const cells = inputs.map(input => `<section style="width:280px"><div>${input.name} / ${input.kind}</div><div>Before</div><svg width="270" height="170" viewBox="0 0 200 130" style="background:#fff;border:1px solid #ccc"><path d="${input.before}" fill="#151515"/></svg><div>After</div><svg width="270" height="170" viewBox="0 0 200 130" style="background:#fff;border:1px solid #ccc"><path d="${input.after}" fill="#151515" fill-rule="nonzero"/></svg></section>`).join('');
    await page.setContent(`<body style="margin:12px;background:#f4f4f4;display:flex;gap:10px;flex-wrap:wrap">${cells}</body>`);
    await page.screenshot({ path: path.join(out, 'before-after.png'), fullPage: true });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baselineRef, results, geometryTiming }, null, 2));
    console.log(JSON.stringify({ baselineRef, results, geometryTiming }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
