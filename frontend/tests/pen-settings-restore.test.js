import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createPenColorPreference, PEN_COLOR_KEY } from '../src/editor/utils/penColorPreference.js'
import { DEFAULT_PEN_SETTINGS } from '../src/editor/utils/penSettings.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/usePenSettings.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture() {
  let resolve, loading, options = DEFAULT_PEN_SETTINGS
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
    if (id.endsWith('/penSettings.js')) return { DEFAULT_PEN_SETTINGS }
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
