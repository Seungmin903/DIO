import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const source = readFileSync(new URL('../src/editor/components/canvas/ObjectView.js', import.meta.url), 'utf8')
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
let declaration
babel.traverse(ast, { FunctionDeclaration(path) { if (path.node.id.name === 'flipTransform') declaration = path.node } })
const flipTransform = new Function(`return (${source.slice(declaration.start, declaration.end)})`)()

// 실제 설치된 RN의 개발 모드 검사를 사용해 forEach of null 오류를 재현한다.
const rnSource = readFileSync(require.resolve('react-native/Libraries/StyleSheet/processTransform.js'), 'utf8')
const { code } = babel.transformSync(rnSource, {
  configFile: false, babelrc: false,
  plugins: [expo.resolve('@babel/plugin-transform-flow-strip-types'), expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', '__DEV__', code)(id => id.includes('stringifySafe') ? { default: JSON.stringify } : expo(id), module, module.exports, true)
const processTransform = module.exports.default

test('RN 변환 검사에서 null 입력 오류를 재현하고 모든 반전 조합의 유효성을 확인한다', () => {
  assert.throws(() => processTransform(null), /forEach/)
  for (const flipX of [undefined, false, true]) for (const flipY of [undefined, false, true]) {
    const transform = flipTransform({ flipX, flipY })
    assert.deepEqual(processTransform(transform), [{ scaleX: flipX ? -1 : 1 }, { scaleY: flipY ? -1 : 1 }])
  }
})

for (const type of ['photo', 'sticker', 'tape']) test(`${type}: 반복·교차 반전 및 Undo/Redo 후에도 유효한 변환과 원본을 유지한다`, () => {
  const original = { id: 'o', type, x: 20, y: 30, w: 100, h: 80, rotation: 15, src: 'image.png', crop: { fx: 0.5, fy: 0.5, zoom: 1 } }
  let state = createInitialState({ pages: [{ id: 'p', objects: [original] }] })
  const check = () => {
    const object = state.doc.pages[0].objects[0]
    assert.doesNotThrow(() => processTransform(flipTransform(object)))
    for (const key of ['x', 'y', 'w', 'h', 'rotation', 'src', 'crop']) assert.deepEqual(object[key], original[key])
    return object
  }
  for (let i = 0; i < 200; i++) {
    const axis = i % 4 < 2 ? 'flipX' : 'flipY'
    const before = check()
    state = editorReducer(state, { type: 'updateMany', record: true, patches: { o: { [axis]: !before[axis] } } })
    assert.equal(check()[axis], !before[axis])
    state = editorReducer(state, { type: 'undo' })
    assert.equal(check()[axis], before[axis])
    state = editorReducer(state, { type: 'redo' })
    assert.equal(check()[axis], !before[axis])
  }
  assert.equal(check().flipX, false)
  assert.equal(check().flipY, false)
})
