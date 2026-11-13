import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core'), modules = expo.resolve('@babel/plugin-transform-modules-commonjs')
test('회원 표지의 사진 선택 버튼은 자르기 전에 회원 사진 한도를 확인한다', async () => {
  const ast = babel.parseSync(readFileSync(new URL('../src/diary/components/CoverOptions.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
  const component = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'PhotoOptions')
  const { code } = babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'module', directives: [], body: [component] } }, undefined, {
    configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], modules],
  })
  const notices = [], checks = [], jsx = (type, props) => ({ type, props })
  const checkMemberPhotoCapacity = async count => { checks.push(count); throw Object.assign(Error('사진 저장 한도는 200장이에요.'), { code: 'STORAGE_LIMIT_REACHED' }) }
  const env = {
    useState: initial => [initial, () => {}], useRef: () => ({}), useEffect() {},
    authService: { getSessionKey: () => 'member' }, checkMemberPhotoCapacity,
    pickImages: async options => { assert.equal(options.guestPhoto, false); await options.checkPhotoCapacity(1); return [] },
    mediaFailureMessage: error => error.message, styles: {},
    useCoverPhotoAspect: () => ({ aspect: null, status: 'idle', retry() {} }), coverCropPhoto: () => null, coverPhotoWithAspect: photo => photo, applyCoverPhotoCrop: () => null,
    discardGeneratedMedia: async () => {}, PhotoCropper: 'PhotoCropper', OwnPhotoTile: 'OwnPhotoTile',
    OptionRow: 'row', View: 'view', Pressable: 'button', Icon: 'icon', Text: 'text',
  }
  const componentFn = new Function('require', ...Object.keys(env), code + '\nreturn PhotoOptions')(() => ({ jsx, jsxs: jsx }), ...Object.values(env))
  const view = componentFn({ cover: {}, onNotice: message => notices.push(message) })
  const find = node => !node ? null : Array.isArray(node) ? node.map(find).find(Boolean) : node.props?.accessibilityLabel === '내 사진 고르기' ? node : find(node.props?.children)
  await find(view).props.onPress()
  assert.deepEqual(checks, [1])
  assert.deepEqual(notices, ['사진 저장 한도는 200장이에요.'])
})

test('표지 한도 요청은 계정별로 연결하고 세션이 바뀌면 새 요청을 만든다', async () => {
  const { code } = babel.transformSync(readFileSync(new URL('../src/editor/services/memberPhotoCapacity.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [modules] })
  let session = 'first', account = '7', created = 0
  const storage = {}, entries = () => []
  const mocks = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    'expo/fetch': {},
    '../../auth/authService': { authService: { getSessionKey: () => session, getCurrentUserId: () => account } },
    '../utils/mediaRepository': { entries },
    '../../collaboration/canvasMedia.js': { createMediaRequest: options => {
      created++
      assert.equal(options.photoStorage, storage)
      assert.equal(options.photoEntries, entries)
      return { checkPhotoCapacity: (count, photos) => ({ count, photos }) }
    } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id], module, module.exports)
  const check = module.exports.checkMemberPhotoCapacity
  assert.deepEqual(check(0, [{ mediaFileId: 'photo' }]), { count: 0, photos: [{ mediaFileId: 'photo' }] })
  check(1)
  assert.equal(created, 1)
  session = 'second'; check(1)
  assert.equal(created, 2)
  account = null
  assert.throws(() => check(1), { code: 'PHOTO_LIBRARY_NOT_READY' })
})
