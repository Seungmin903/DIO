import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createPenColorPreference, PEN_COLOR_KEY } from '../src/editor/utils/penColorPreference.js'
import * as penSettings from '../src/editor/utils/penSettings.js'
const { DEFAULT_PEN_SETTINGS } = penSettings

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/usePenSettings.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture() {
  let resolve, loading, options = DEFAULT_PEN_SETTINGS, kinds = {}
  const writes = [], effects = []
  const read = new Promise(done => { resolve = done })
  const storage = { getItem: () => read, setItem: async (key, value) => { writes.push([key, value]) } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return {
      useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => effects.push(fn),
      useState: () => [options, next => { options = next }],
      useSyncExternalStore: (_subscribe, get) => get(),
    }
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage }
    if (id.endsWith('/penSettings.js')) return penSettings
    if (id.endsWith('/toolPreferences.js')) return { useToolPreference: key => key === 'penKinds' ? [kinds, next => { kinds = next }] : [options, next => { options = next }] }
    if (id.endsWith('/penColorPreference.js')) return { createPenColorPreference: disk => {
      const preference = createPenColorPreference(disk), load = preference.load
      preference.load = () => loading = load()
      return preference
    } }
    return require(id)
  }, module, module.exports)
  const render = module.exports.usePenSettings
  return { render, writes, mount() { const result = render(); effects.splice(0).forEach(fn => fn()); return result }, async restore(color) { resolve(color); await loading; await Promise.resolve() } }
}

test('복원 중 기본 색을 명시적으로 다시 고르면 늦은 저장 색이 선택을 덮지 않는다', async () => {
  const app = fixture(), [settings, change] = app.mount()
  change({ ...settings, color: DEFAULT_PEN_SETTINGS.color })
  await app.restore('#ABCDEF')
  assert.equal(app.render()[0].color, DEFAULT_PEN_SETTINGS.color)
  assert.deepEqual(app.writes, [[PEN_COLOR_KEY, DEFAULT_PEN_SETTINGS.color]])
})

test('선택하지 않으면 기존 저장 색을 복원하고 복원 후 다른 색 선택도 저장한다', async () => {
  const app = fixture()
  app.mount(); await app.restore('#ABCDEF')
  const [settings, change] = app.render()
  assert.equal(settings.color, '#ABCDEF')
  assert.deepEqual(app.writes, [])
  change({ ...settings, color: '#123456' }); await Promise.resolve(); await Promise.resolve()
  assert.equal(app.render()[0].color, '#123456')
  assert.deepEqual(app.writes, [[PEN_COLOR_KEY, '#123456']])
})

test('펜 종류를 오가도 종류마다 마지막 굵기 · 불투명도가 그대로다', () => {
  const app = fixture()
  let [settings, change] = app.mount()
  const pick = kind => { change({ ...app.render()[0], kind, opacity: penSettings.penDefaultOpacity(kind) }); ;[settings, change] = app.render() }
  change({ ...settings, width: 6, opacity: 0.9 }); ;[settings, change] = app.render()
  pick('pencil')
  assert.equal(settings.kind, 'pencil')
  assert.equal(settings.width, 6, '처음 쓰는 종류는 지금 굵기를 이어 받는다')
  assert.equal(settings.opacity, 0.8, '연필 기본 불투명도')
  change({ ...settings, width: 14, opacity: 0.5 }); ;[settings, change] = app.render()
  pick('ball')
  assert.deepEqual([settings.width, settings.opacity], [6, 0.9], '볼펜 설정이 돌아온다')
  pick('pencil')
  assert.deepEqual([settings.width, settings.opacity], [14, 0.5], '연필 설정이 돌아온다')
})

test('저장된 종류별 설정은 손상된 값만 버린다', () => {
  assert.deepEqual(penSettings.sanitizePenKinds({ ball: { width: 99, opacity: 0.2 }, pencil: { width: 'x' }, zzz: { width: 3 }, calligraphy: 5 }),
    { ball: { width: 16, opacity: 0.2 }, pencil: { width: 2.5, opacity: 0.8 } })
  assert.equal(penSettings.sanitizePenKinds(null), undefined)
})
