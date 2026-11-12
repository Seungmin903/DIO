import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const constants = { LEGACY_TAPE_PATTERNS: {}, TAPE_DEFAULT: { palette: 'mint' }, TAPE_PALETTES: [{ id: 'mint', bg: '#E4F4EE', fg: '#7CC8A8' }] }
import { LACE_HEIGHT, LACE_TILES } from '../src/editor/components/canvas/laceTapes.js'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/TapeView.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const svg = { __esModule: true, default: 'Svg' }
for (const id of ['Circle', 'ClipPath', 'Defs', 'G', 'Image', 'Line', 'Path', 'Pattern', 'Polygon', 'Rect']) svg[id] = id
const mocks = { react: { cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }) }, 'react-native-svg': svg,
  '../../hooks/useMediaUri': { useMediaUri: () => null }, '../../hooks/useSvgImageUri': { useSvgImageUri: (_, uri) => uri }, '../../utils/objects': { coverLayout: () => null }, '../../constants': constants,
  '../../utils/svgId': { useSvgId: () => 'tape' }, './laceTapes': { LACE_HEIGHT, LACE_TILES },
  '../../../shared/pixelSnap': { snapScale: v => v, snapToPixel: v => v } }
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(id => id === 'react/jsx-runtime' ? require(id) : mocks[id], mod, mod.exports)
const { default: TapeView, stripeBands } = mod.exports

const pts = s => s.split(' ').map(p => p.split(',').map(Number))
const area = poly => Math.abs(poly.reduce((sum, [x, y], i) => { const [nx, ny] = poly[(i + 1) % poly.length]; return sum + x * ny - nx * y }, 0)) / 2
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]

test('사선줄은 무늬 타일 없이 줄마다 테이프 모양으로 잘라 그린다 (칸 이음매가 없다)', () => {
  const tree = TapeView({ pattern: 'stripe', palette: 'mint', width: 180, height: 34, edge: 'straight', scale: 1.37 })
  const all = nodes(tree)
  assert.equal(all.some(n => n.type === 'Pattern'), false)
  const polys = all.filter(n => n.type === 'Polygon')
  assert.ok(polys.length > 10)
  // 모든 줄이 테이프(0~180 × 0~34) 안에 있다
  polys.slice(1).forEach(p => pts(p.props.points).forEach(([x, y]) => assert.ok(x >= -0.01 && x <= 180.01 && y >= -0.01 && y <= 34.01)))
})

test('줄 간격 · 굵기는 예전 타일과 같다: 수직 굵기 3.2 / 간격 12/√2 만큼 칠해진다', () => {
  const rect = [[0, 0], [600, 0], [600, 34], [0, 34]]
  const bands = stripeBands(rect, 634, 1, 0).map(pts)
  const covered = bands.reduce((sum, b) => sum + area(b), 0) / (600 * 34)
  assert.ok(Math.abs(covered - 3.2 / (12 / Math.SQRT2)) < 0.01, `칠한 비율 ${covered}`)
  // 이웃 줄끼리 겹치지 않는다
  bands.forEach(b => assert.ok(b.every(([x, y]) => x >= -0.01 && y >= -0.01)))
})

test('절취선(톱니) 모양도 그 모양 안으로만 자른다', () => {
  const tree = TapeView({ pattern: 'stripe', palette: 'mint', width: 120, height: 34, edge: 'torn', scale: 1 })
  const [shape, ...bands] = nodes(tree).filter(n => n.type === 'Polygon')
  const total = bands.reduce((sum, b) => sum + area(pts(b.props.points)), 0)
  assert.ok(total < area(pts(shape.props.points)))
})

test('이어 붙일 수 있는 레이스는 테이프 길이만큼 한 경로로 이어 붙여 칸 이음매가 없다', () => {
  for (const pattern of ['lace-fan', 'lace-dome', 'lace-chain', 'lace-leaf']) {
    const tile = LACE_TILES[pattern]
    const tree = TapeView({ pattern, palette: 'mint', width: 300, height: 34, edge: 'straight' })
    const pat = nodes(tree).find(n => n.type === 'Pattern'), path = nodes(tree).find(n => n.type === 'Path')
    const copies = Math.ceil(300 / tile.width)
    assert.equal(pat.props.width, tile.width * copies, pattern)
    // 아래 절반이 빈 두 배 높이 타일: 소수점 픽셀 높이에서 아래 칸 타일의 윗줄이 테이프 밑에 비치지 않게
    assert.equal(pat.props.height, 68)
    assert.equal(pat.props.y, undefined)
    assert.equal(path.props.d.split('M').length - 1, (tile.body.split('M').length - 1) * copies)
    const xs = path.props.d.match(/-?\d+(\.\d+)?/g).filter((_, i) => i % 2 === 0).map(Number)
    assert.ok(Math.max(...xs) <= tile.width * copies + 0.01 && Math.min(...xs) >= 0)
  }
  // 타일 밖으로 나간 예전 도안은 한 벌만 (겹치면 evenodd 로 구멍이 된다)
  const tree = TapeView({ pattern: 'lace-flower', palette: 'mint', width: 300, height: 34, edge: 'straight' })
  assert.equal(nodes(tree).find(n => n.type === 'Pattern').props.width, LACE_TILES['lace-flower'].width)
})
