import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as libraryView from '../src/diary/utils/libraryView.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/diary/hooks/useLibraryView.js', import.meta.url), 'utf8')
const code = expo('@babel/core').transformSync(source, {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code

function mount(load, save = async () => {}) {
  let value, initialized = false, cleanup
  const ref = { current: false }
  const react = {
    useState(initial) {
      if (!initialized) { value = initial; initialized = true }
      return [value, next => { value = next }]
    },
    useRef: () => ref,
    useEffect(effect) { if (!cleanup) cleanup = effect() },
    useCallback: fn => fn,
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react
    if (name === '../utils/libraryView.js') return libraryView
    return require(name)
  }, module, module.exports)
  return {
    render: () => module.exports.useLibraryView(load, save, 'library-view'),
    unmount: () => cleanup(),
  }
}

const tick = () => new Promise(resolve => setImmediate(resolve))

test('저장된 보기를 읽을 때까지 표시를 기다리고 저장된 보기를 먼저 사용한다', async () => {
  let resolve
  const ui = mount(() => new Promise(done => { resolve = done }))
  assert.equal(ui.render()[0], null)
  await tick()
  assert.equal(ui.render()[0], null)
  resolve('grid')
  await tick()
  assert.equal(ui.render()[0], 'grid')
  ui.unmount()
})

test('저장값이 없거나 잘못됐거나 읽기에 실패하면 기본 보기를 사용한다', async () => {
  for (const load of [async () => null, async () => 'invalid', async () => { throw Error('read failed') }]) {
    const ui = mount(load)
    assert.equal(ui.render()[0], null)
    await tick()
    assert.equal(ui.render()[0], 'carousel')
    ui.unmount()
  }
})

test('사용자가 선택한 보기는 늦은 저장값이나 읽기 실패로 덮어쓰지 않는다', async () => {
  for (const rejectRead of [false, true]) {
    let settle
    const writes = []
    const ui = mount(() => new Promise((resolve, reject) => { settle = rejectRead ? reject : resolve }), async (...args) => writes.push(args))
    ui.render()
    await tick()
    ui.render()[1]('open')
    settle(rejectRead ? Error('read failed') : 'grid')
    await tick()
    assert.equal(ui.render()[0], 'open')
    assert.deepEqual(writes, [['library-view', 'open']])
    ui.unmount()
  }
})

test('화면이 닫힌 뒤 완료된 읽기는 상태를 바꾸지 않는다', async () => {
  let resolve
  const ui = mount(() => new Promise(done => { resolve = done }))
  ui.render()
  await tick()
  ui.unmount()
  resolve('grid')
  await tick()
  assert.equal(ui.render()[0], null)
})
