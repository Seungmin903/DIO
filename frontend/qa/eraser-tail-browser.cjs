const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRequire } = require('node:module')
const expo = createRequire(require.resolve('expo/package.json'))
const { chromium } = require('playwright-core')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const { code } = expo('@babel/core').transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react-native-svg') return { __esModule: true, default: 'svg', Path: 'path', Defs: 'defs', Pattern: 'pattern', Rect: 'rect' }
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id.endsWith('.js') ? id : id + '.js'))
    return require(id)
  }, module, module.exports)
  return module.exports
}
;(async () => {
  const { createStroke } = await import('../src/editor/utils/strokes.js')
  const { createEraserSession } = await import('../src/editor/utils/eraser.js')
  const StrokeContent = load(path.resolve(__dirname, '../src/editor/components/StrokeContent.js')).default
  const cases = []
  for (const [kind, version] of [['fountain', 1], ['brush', 1], ['fountain', 3], ['brush', 2], ['felt', 3]]) {
    const source = createStroke([{ x: 20, y: 50, pressure: 1.5 }, { x: 280, y: 50, pressure: 1.5 }],
      { id: kind, kind, width: 16, renderVersion: version, materialSeed: 101 })
    const session = createEraserSession([source], 10, 'area'); session.move({ x: 150, y: 0 }, { x: 150, y: 100 })
    const object = session.finish().replacements[kind][0]
    const svg = renderToStaticMarkup(React.createElement(StrokeContent, { object, zoom: 2 }))
    const restored = renderToStaticMarkup(React.createElement(StrokeContent, { object: JSON.parse(JSON.stringify(object)), zoom: 2 }))
    assert.equal(svg, restored)
    cases.push({ kind, version, svg, object })
  }
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 740, height: 600 } })
    await page.setContent(cases.map(c => `<section><div>${c.kind} v${c.version}</div>${c.svg}</section>`).join(''))
    const result = await page.evaluate(cases => cases.map((c, i) => {
      const svg = document.querySelectorAll('section svg')[i], paths = [...svg.querySelectorAll('path')]
      const test = (x, y) => paths.some(p => document.createElement('canvas').getContext('2d').isPointInPath(new Path2D(p.getAttribute('d')), x, y, 'nonzero'))
      const end = c.object.points.at(-1), radius = 12
      return { kind: c.kind, version: c.version,
        roundedTip: test(end.x + radius * 0.5, end.y),
        squareCorner: test(end.x + radius * 0.8, end.y + radius * 0.8) }
    }), cases)
    for (const r of result) { assert.equal(r.roundedTip, true, JSON.stringify(r)); assert.equal(r.squareCorner, false, JSON.stringify(r)) }
    const out = path.resolve(process.argv[2] || '.expo/eraser-tail-results'); fs.mkdirSync(out, { recursive: true })
    await page.screenshot({ path: path.join(out, 'tails.png'), fullPage: true })
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
