import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core'), parser = expo('@babel/parser')
const root = resolve(import.meta.dirname, '..')
const shim = readFileSync(join(root, 'src/shared/dioText/dioReactNative.js'), 'utf8')
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [])
}

test('앱이 사용하는 React Native 이름을 모두 내보내고 사용하지 않는 네이티브 getter를 읽지 않는다', () => {
  const shimAst = parser.parse(shim, { sourceType: 'module' })
  const exports = new Set(shimAst.program.body.filter(n => n.type === 'ExportNamedDeclaration').flatMap(n => n.specifiers.map(s => s.exported.name)))
  const missing = []
  for (const file of [join(root, 'App.js'), ...sources(join(root, 'src'))]) {
    if (file.includes('dioText')) continue
    const ast = parser.parse(readFileSync(file, 'utf8'), { sourceType: 'unambiguous', plugins: ['jsx'] })
    for (const n of ast.program.body) if (n.type === 'ImportDeclaration' && n.source.value === 'react-native') {
      for (const s of n.specifiers) if (s.type === 'ImportSpecifier' && !exports.has(s.imported.name)) missing.push(`${file}: ${s.imported.name}`)
      for (const s of n.specifiers) if (s.type !== 'ImportSpecifier') missing.push(`${file}: unsupported namespace/default import`)
    }
  }
  assert.deepEqual(missing, [])
  const transformed = babel.transformSync(shim, { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const rn = {}
  for (const name of exports) if (name !== 'Text' && name !== 'TextInput') rn[name] = name
  Object.defineProperty(rn, 'PushNotificationIOS', { enumerable: true, get() { throw Error('unused native module accessed') } })
  const legacy = babel.transformSync("export * from 'react-native'; export { Text, TextInput } from './DioText';", { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const legacyModule = { exports: {} }
  new Function('require', 'module', 'exports', legacy)(name => name === 'react-native' ? rn : { Text: 'text', TextInput: 'input' }, legacyModule, legacyModule.exports)
  // Babel에서는 초기 import가 아닌 전체 속성 열거 시 지연 getter가 실행된다.
  assert.throws(() => Object.assign({}, legacyModule.exports), /unused native module accessed/)
  const module = { exports: {} }
  new Function('require', 'module', 'exports', transformed)(name => name === 'react-native' ? rn : { Text: 'text', TextInput: 'input' }, module, module.exports)
  assert.equal(module.exports.View, 'View')
})
