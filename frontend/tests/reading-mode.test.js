import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as gestures from '../src/editor/utils/readingGestures.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/chrome/ReadingChrome.js', import.meta.url), 'utf8')
const { code } = expo('@babel/core').transformSync(source, { configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
function chrome() {
  const mod = { exports: {} }
  const load = id => {
    if (id === 'react') return { useRef: current => ({current}), useState: initial => [initial, () => {}], useEffect() {} }
    if (id === 'react-native') return { Pressable: 'button', Text: 'text', View: 'view', StyleSheet: {create: x => x} }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {}, DISABLED_OPACITY: 0.4 }
    if (id.endsWith('/readingGestures.js')) return gestures
    if (id.endsWith('/BrandLogo') || id.endsWith('/Icon')) return () => null
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, mod, mod.exports)
  return mod.exports
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found }
  return null
}
test('슬라이더는 해제할 때만 페이지를 변경하고 취소하면 변경하지 않는다', () => {
  for (const cancel of [false,true]) {
    const calls = [], tree = chrome().ReadingNavigation({index:0,count:5,onSelect:i => calls.push(i)})
    const slider = find(tree, node => node.props?.accessibilityRole === 'adjustable').props
    slider.onLayout({nativeEvent:{layout:{width:400}}})
    slider.onResponderGrant({nativeEvent:{pageX:100,locationX:100}})
    slider.onResponderMove({nativeEvent:{pageX:300}})
    assert.deepEqual(calls, [])
    if (cancel) slider.onResponderTerminate(); else slider.onResponderRelease()
    assert.deepEqual(calls, cancel ? [] : [3])
  }
})
test('한 페이지 슬라이더는 터치를 받지 않고 키보드 탐색은 경계를 넘지 않는다', () => {
  const calls = [], one = find(chrome().ReadingNavigation({index:0,count:1,onSelect:i=>calls.push(i)}), n=>n.props?.accessibilityRole==='adjustable').props
  assert.equal(one.onStartShouldSetResponder(),false)
  const slider = find(chrome().ReadingNavigation({index:0,count:3,onSelect:i=>calls.push(i)}), n=>n.props?.accessibilityRole==='adjustable').props
  slider.onKeyDown({key:'ArrowLeft',preventDefault(){}}); slider.onKeyDown({key:'End',preventDefault(){}})
  assert.deepEqual(calls,[0,2])
})
test('탭·스와이프의 시간·거리·대각선·핀치 경계를 적용한다', () => {
  const action = patch => gestures.readingGestureAction({dx:0,dy:0,x:500,width:1000,duration:20,scale:1,...patch})
  assert.equal(action({duration:351}),null)
  assert.equal(action({dx:-47}),null)
  assert.equal(action({dx:-48,dy:32}),'next')
  assert.equal(action({dx:-48,dy:33}),null)
  assert.equal(action({dx:-100,scale:1.01}),null)
  assert.equal(action({pinched:true}),null)
  assert.equal(action({cancelled:true}),null)
  assert.equal(gestures.pageFromProgress(-10,100,5),0)
  assert.equal(gestures.pageFromProgress(110,100,5),4)
})
