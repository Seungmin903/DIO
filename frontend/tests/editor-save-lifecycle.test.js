import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as collaboration from '../src/collaboration/collaborationReducer.js'
import * as common from '../src/editor/utils/common.js'
import * as reducer from '../src/editor/state/editorReducer.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/useEditor.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]))
const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)) }

// 실제 reducer 위에서 훅을 돌린다. 읽기와 저장 입구만 바꿔 끼운다.
async function openEditor() {
  const slots = [], effects = [], saved = [], calls = []
  let cursor = 0, hydrator = null
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, (value) => { slots[i].value = value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useReducer(step, arg, init) { const i = cursor++; slots[i] ??= { state: init(arg) }; slots[i].step = step; const slot = slots[i]; return [slot.state, slot.dispatch ??= (action) => { slot.state = slot.step(slot.state, action) }] },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  const pages = [
    { id: 'a', objects: [] },
    { id: 'b', objects: [], unloaded: true },
    { id: 'c', objects: [], unloaded: true },
  ]
  const mocks = {
    react,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '../../collaboration/collaborationReducer.js': collaboration,
    '../utils/common.js': common,
    '../state/defaultDoc': { createDefaultDoc: () => ({ id: 'd', pages: [{ id: 'blank', objects: [] }] }) },
    '../state/editorReducer': reducer,
    '../services/editorDocs': {
      editorDocKey: () => 'doc:d', peekEditorDoc: () => null, rememberEditorDoc() {},
      openEditorDoc: async () => ({ doc: { id: 'd', title: 't', pages }, pendingIds: ['b', 'c'] }),
      loadEditorPages: async () => [],
      saveEditorDoc: async (_, doc) => { saved.push(doc); return true },
    },
    '../utils/pageHydrator.js': {
      createPageHydrator(options) {
        const record = (name) => () => calls.push(name)
        hydrator = { options, start: record('start'), stop: record('stop'), prioritize: record('prioritize'), pause: record('pause'), resume: record('resume') }
        return hydrator
      },
    },
    '../services/mediaStore': { hydrateMedia: async () => {} },
    '../utils/idleTask': { scheduleIdleTask: (fn) => { fn(); return { cancel() {} } } },
    '../services/editorViewState': { peekViewedPage: () => undefined, loadViewedPage: async () => 'a', rememberViewedPage() {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id], module, module.exports)
  const render = () => {
    cursor = 0
    const value = module.exports.useEditor({ id: 'd', title: 't', color: '#000' })
    effects.splice(0).forEach((fn) => fn())
    return value
  }
  render()
  await settle()
  render()
  return { render, saved, calls, hydrator, unmount: () => slots.forEach((slot) => slot.cleanup?.()) }
}

const edit = { type: 'addObjects', objects: [{ id: 'n', type: 'text', x: 0, y: 0, w: 10, h: 10 }] }
const merged = (id) => [{ id, objects: [{ id: `${id}-o`, type: 'sticker', x: 0, y: 0 }] }]
const objectIds = (doc, pageId) => doc.pages.find((page) => page.id === pageId).objects.map((object) => object.id)

test('뒤에서 읽은 내용을 합쳐도 잡혀 있던 저장을 미루지 않는다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const editor = await openEditor()
  assert.ok(editor.calls.includes('start'))
  editor.render().dispatch(edit)
  editor.render()
  t.mock.timers.tick(1000)
  editor.hydrator.options.onPages(merged('b'), false)
  editor.render()
  assert.equal(editor.saved.length, 0)
  t.mock.timers.tick(200)
  assert.equal(editor.saved.length, 1)
  assert.deepEqual(objectIds(editor.saved[0], 'a'), ['n'])
  assert.deepEqual(objectIds(editor.saved[0], 'b'), ['b-o'])
  assert.equal(editor.saved[0].pages[2].unloaded, true)
  editor.unmount()
})

test('읽기만 하고 편집하지 않으면 저장하지 않는다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const editor = await openEditor()
  editor.hydrator.options.onPages(merged('b'), false)
  editor.render()
  editor.hydrator.options.onPages(merged('c'), true)
  assert.equal(editor.render().saveStatus, 'saved')
  t.mock.timers.tick(10000)
  assert.equal(editor.saved.length, 0)
  editor.unmount()
  await settle()
  assert.equal(editor.saved.length, 0)
})

test('읽기에 실패하면 예약된 저장을 멈추고 이후 편집을 저장하지 않는다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const editor = await openEditor()
  editor.hydrator.options.onError(new Error('read'))
  const value = editor.render()
  assert.equal(value.saveStatus, 'load-error')
  value.dispatch(edit)
  editor.render()
  t.mock.timers.tick(10000)
  assert.equal(editor.saved.length, 0)
  editor.unmount()
  await settle()
  assert.equal(editor.saved.length, 0)
})

test('실패 전에 한 편집은 나갈 때 저장하고, 못 읽은 페이지는 안 읽은 표시를 유지한다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const editor = await openEditor()
  editor.render().dispatch(edit)
  editor.render()
  editor.hydrator.options.onError(new Error('read'))
  editor.render()
  t.mock.timers.tick(10000)
  assert.equal(editor.saved.length, 0)
  editor.unmount()
  await settle()
  assert.equal(editor.saved.length, 1)
  assert.deepEqual(objectIds(editor.saved[0], 'a'), ['n'])
  assert.equal(editor.saved[0].pages[1].unloaded, true)
})

test('나가면 읽기를 멈추고 남은 편집을 저장한다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const editor = await openEditor()
  editor.render().dispatch(edit)
  editor.render()
  editor.unmount()
  assert.ok(editor.calls.includes('stop'))
  await settle()
  assert.equal(editor.saved.length, 1)
})

test('화면을 누르면 읽기를 쉬고 페이지를 옮기면 그 근처부터 읽는다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const editor = await openEditor()
  const value = editor.render()
  editor.calls.length = 0
  value.setInputActive(true)
  value.setInputActive(false)
  value.dispatch({ type: 'selectPage', id: 'c' })
  editor.render()
  assert.deepEqual(editor.calls, ['pause', 'resume', 'prioritize'])
  editor.unmount()
})
