// v2.0.0 잉크펜(glass) 끄기(shared/featureFlags.js INK_PEN_ENABLED): 고르는 곳에서 빠지고, 저장된 설정은 볼펜으로 돌아간다
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { INK_PEN_ENABLED } from '../src/shared/featureFlags.js'
import { sanitizeToolPreferences } from '../src/editor/utils/toolPreferences.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
// 내 프리셋 화면을 플래그 값만 바꿔 불러온다(color-picker-opening.test.js 와 같은 방식)
function loadPresets(inkPen) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/components/StudioPresets.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { useState: value => [value, () => {}] }
    if (id === 'react-native') return { View: 'view', Pressable: 'button', Text: 'text', StyleSheet: { create: v => v } }
    if (id === 'react/jsx-runtime') return require(id)
    if (id.endsWith('/featureFlags')) return { INK_PEN_ENABLED: inkPen }
    if (id.endsWith('/theme')) return { colors: {} }
    return { __esModule: true, default: id }
  }, module, module.exports)
  return module.exports.default
}
const scopes = Presets => Presets({}).props.children('100%').map(group => group.props.group.scope)

test('잉크펜을 끄면 내 프리셋에 잉크펜 색 줄이 없고, 켜면 펜 다음에 나온다', () => {
  assert.deepEqual(scopes(loadPresets(false)), ['pen', 'highlighter', 'tape', 'text'])
  assert.deepEqual(scopes(loadPresets(true)), ['pen', 'glass', 'highlighter', 'tape', 'text'])
})

test('잉크펜을 끄면 기기에 저장된 펜 설정(잉크펜)을 불러올 때 볼펜으로 시작한다', { skip: INK_PEN_ENABLED && '잉크펜 켜짐' }, () => {
  const restored = sanitizeToolPreferences({
    pen: { kind: 'glass', color: '#A33C4B', width: 24, opacity: 1, inkGlitter: true },
    penKinds: { glass: { width: 24, opacity: 1 } },
  })
  assert.equal(restored.pen.kind, 'ball')
  assert.equal(restored.pen.width, 16) // 잉크펜만 32까지 — 볼펜 상한으로 맞춘다
  assert.equal('inkGlitter' in restored.pen, false)
  assert.ok(restored.penKinds.glass) // 기억은 남겨 다시 켜면 되살아난다
})
