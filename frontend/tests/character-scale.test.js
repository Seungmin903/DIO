import test from 'node:test'
import assert from 'node:assert/strict'
import { CHARACTER_ART, CHARACTER_SCALE, MOA_KEY, DIO_KEY } from '../src/shared/characterScale.js'
import { CHARACTER_SHAPES } from '../src/shared/characterShapes.js'

test('같은 상자 높이로 그리면 모아 먹선 키가 디오의 최종 그림 비율(약 87%)이 된다', () => {
  const moa = CHARACTER_ART.moa.ink.height / CHARACTER_ART.moa.height * CHARACTER_SCALE.moa
  const dio = CHARACTER_ART.dio.ink.height / CHARACTER_ART.dio.height * CHARACTER_SCALE.dio
  assert.ok(Math.abs(moa / dio - MOA_KEY / DIO_KEY) < 1e-9)
  assert.ok(CHARACTER_SCALE.dio > 1)
})

test('벡터 데이터(완성 · 윤곽)의 viewBox 가 그림 크기와 같고, 좌표를 정수로 반올림하지 않았다', () => {
  for (const [key, art] of Object.entries(CHARACTER_ART)) {
    for (const variant of ['full', 'line']) {
      const { viewBox, shapes } = CHARACTER_SHAPES[key][variant]
      assert.deepEqual(viewBox.slice(2), [art.width, art.height], `${key} ${variant}`)
      assert.ok(shapes.length > 0)
      assert.ok(shapes.some(s => typeof s[1] === 'string' && /\d\.\d/.test(s[1])), `${key} ${variant} 소수 좌표`)
    }
  }
})

test('표지 디오 배율은 키 비율 그대로 약 1.15 다', () => {
  assert.ok(Math.abs(CHARACTER_SCALE.dio - 1.149) < 0.002)
})

test('CharacterArt: 모르는 캐릭터 · 종류는 모아 완성으로 그리고, 색을 주면 모든 면 · 선을 그 색으로, 화면 읽기에서는 숨긴다', async () => {
  const { readFileSync } = await import('node:fs')
  const { createRequire } = await import('node:module')
  const expo = createRequire(createRequire(import.meta.url).resolve('expo/package.json'))
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/shared/CharacterArt.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs'), [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'classic', pragma: 'h' }]],
  })
  const m = { exports: {} }
  const h = (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } })
  const stub = id => id === 'react' ? { memo: f => f } : id === './characterShapes' ? { CHARACTER_SHAPES } : { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path' }
  new Function('require', 'module', 'exports', 'h', code)(stub, m, m.exports, h)
  const Art = m.exports.default
  const fallback = Art({ character: 'nobody', variant: 'x' })
  assert.equal(fallback.props.viewBox, CHARACTER_SHAPES.moa.full.viewBox.join(' '))
  assert.equal(fallback.props.accessible, false)
  assert.equal(fallback.props.importantForAccessibility, 'no-hide-descendants')
  const tinted = Art({ character: 'dio', variant: 'line', color: '#123456' })
  assert.equal(tinted.props.children.length, CHARACTER_SHAPES.dio.line.shapes.length)
  for (const shape of tinted.props.children) assert.ok(shape.props.fill === '#123456' || (shape.props.fill === 'none' && shape.props.stroke === '#123456'))
})
