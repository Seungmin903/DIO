import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/image.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

for (const platform of ['web', 'android']) {
  test(`${platform} 사진 선택과 한도 검사는 가져오기 전에 실행된다`, async () => {
    const calls = []
    const error = Object.assign(new Error('사진 한도'), { code: 'STORAGE_LIMIT_REACHED' })
    const mocks = {
      '../../auth/authService': { authService: { getSessionKey: () => 'member' } },
      'react-native': { Platform: { OS: platform } },
      '../utils/mediaPicker': { selectImages: async () => { calls.push('picker'); return { assets: [{}, {}] } } },
      './mediaStore': { importMedia: async () => { calls.push('import'); return [] } },
      '../utils/mediaPolicy.js': { MediaError: class extends Error {} },
    }
    const module = { exports: {} }
    new Function('require', 'module', 'exports', code)(id => mocks[id] ?? {}, module, module.exports)
    const selecting = module.exports.pickImages({
      async checkPhotoCapacity(count) { calls.push(count); if (count > 1) throw error },
    })
    assert.equal(calls[0], platform === 'web' ? 'picker' : 1)
    await assert.rejects(selecting, { code: 'STORAGE_LIMIT_REACHED' })
    assert.deepEqual(calls, platform === 'web' ? ['picker', 2] : [1, 'picker', 2])
  })
}

test('손상된 게스트 사진 집계 오류를 일반 선택창 오류로 바꾸지 않는다', async () => {
  const error = Object.assign(new Error('집계 기록 확인'), { code: 'GUEST_PHOTO_INDEX_DAMAGED' })
  const mocks = {
    '../../auth/authService': { authService: { getSessionKey: () => null } },
    'react-native': { Platform: { OS: 'android' } },
    './guestPhotoLimit.js': { guestPhotoIds: async () => { throw error } },
    '../utils/mediaPolicy.js': { MediaError: class extends Error {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? {}, module, module.exports)
  await assert.rejects(module.exports.pickImages(), actual => actual === error)
})

test('비로그인 사진 선택은 guestPhoto false를 넘겨도 한도를 검사한다', async () => {
  let checked = false
  const error = Object.assign(new Error('한도'), { code: 'STORAGE_LIMIT_REACHED' })
  const mocks = {
    'react-native': { Platform: { OS: 'android' } },
    '../../auth/authService': { authService: { getSessionKey: () => null } },
    './guestPhotoLimit.js': {
      guestPhotoIds: async () => new Set(),
      checkGuestPhotoCapacity: () => { checked = true; throw error },
    },
    '../utils/mediaPolicy.js': { MediaError: class extends Error {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? {}, module, module.exports)
  await assert.rejects(module.exports.pickImages({ usage: 'photo', guestPhoto: false }), actual => actual === error)
  assert.equal(checked, true)
})

test('회원 새 사진은 반환 전에 대기 한도를 기록하고 기록 실패 시 가져온 파일을 정리한다', async () => {
  const items = [{ mediaFileId: 'local' }], calls = []
  let fail = false
  const mocks = {
    'react-native': { Platform: { OS: 'android' } },
    '../../auth/authService': { authService: { getSessionKey: () => 'member' } },
    '../utils/mediaPicker': { selectImages: async () => ({ assets: [{}] }) },
    './mediaStore': { importMedia: async () => items, discardGeneratedMedia: async received => { assert.equal(received, items); calls.push('discard') } },
    '../utils/mediaPolicy.js': { MediaError: class extends Error {} },
    '../utils/mediaImport.js': { attachMediaPreviews: async received => received },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? {}, module, module.exports)
  const checkPhotoCapacity = async (count, photos) => {
    if (photos) { calls.push('reserve'); assert.equal(count, 0); assert.equal(photos, items); if (fail) throw Object.assign(Error('한도'), { code: 'STORAGE_LIMIT_REACHED' }) }
  }
  assert.equal(await module.exports.pickImages({ checkPhotoCapacity }), items)
  assert.deepEqual(calls, ['reserve'])
  fail = true
  await assert.rejects(module.exports.pickImages({ checkPhotoCapacity }), { code: 'STORAGE_LIMIT_REACHED' })
  assert.deepEqual(calls, ['reserve', 'reserve', 'discard'])
})

for (const code of ['STORAGE_LIMIT_REACHED', 'GUEST_PHOTO_INDEX_DAMAGED', 'PHOTO_LIBRARY_NOT_READY', 'MEMBER_PHOTO_INDEX_DAMAGED', 'NETWORK_ERROR', 'ETIMEDOUT', 'PHOTO_CAPACITY_CHECK_FAILED', undefined]) {
  test(`사진 한도 확인 오류 ${code ?? '일반 연결 오류'}의 원래 안내를 유지한다`, async () => {
    const error = Object.assign(Error('사진 보관함 연결을 확인해 주세요.'), code ? { code } : {})
    const mocks = {
      'react-native': { Platform: { OS: 'android' } },
      '../../auth/authService': { authService: { getSessionKey: () => 'member' } },
      '../utils/mediaPolicy.js': { MediaError: class extends Error {} },
    }
    const module = { exports: {} }
    // 파일 상단에서 컴파일한 선택 함수를 사용한다.
    const compiled = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/image.js', import.meta.url), 'utf8'), {
      configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code
    new Function('require', 'module', 'exports', compiled)(id => mocks[id] ?? {}, module, module.exports)
    await assert.rejects(module.exports.pickImages({ checkPhotoCapacity: async () => { throw error } }), actual => {
      const preserved = ['STORAGE_LIMIT_REACHED', 'GUEST_PHOTO_INDEX_DAMAGED', 'PHOTO_LIBRARY_NOT_READY', 'MEMBER_PHOTO_INDEX_DAMAGED'].includes(code)
      if (!preserved) {
        assert.equal(actual.message, '사진 보관함을 확인하지 못했어요. 다시 시도해 주세요.')
        assert.equal(actual.cause, error)
      } else assert.equal(actual, error)
      assert.equal(actual.code, preserved ? code : 'PHOTO_CAPACITY_CHECK_FAILED')
      return true
    })
  })
}

test('회원 사진 옵션은 런타임 준비 전에도 한도를 유지하고 준비 후 같은 호출로 검사한다', () => {
  const babel = expo('@babel/core'), traverse = expo('@babel/traverse').default
  const parse = path => babel.parseSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
  let optionsNode, checkerNode
  traverse(parse('../src/editor/screens/EditorScreen.js'), { VariableDeclarator(path) {
    if (path.node.id.name === 'photoLimit') optionsNode = path.node
  } })
  traverse(parse('../src/editor/hooks/useMemberCanvasCollaboration.js'), { ObjectProperty(path) {
    if (path.node.key.name === 'checkPhotoCapacity' && path.node.value.type === 'ArrowFunctionExpression') checkerNode = path.node.value
  } })
  assert.ok(optionsNode); assert.ok(checkerNode)
  const compile = node => babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'script', directives: [], body: [{ type: 'VariableDeclaration', kind: 'const', declarations: [node] }] } }, undefined, { configFile: false, babelrc: false }).code
  const runtime = { current: null }
  const checker = new Function('runtime', compile({ type: 'VariableDeclarator', id: { type: 'Identifier', name: 'checker' }, init: checkerNode }) + '\nreturn checker')(runtime)
  const options = new Function('diary', 'textSync', 'MEDIA_POLICY', compile(optionsNode) + '\nreturn photoLimit')
  for (const enabled of [true, false]) {
    const member = options({ source: 'member-api' }, { enabled, checkPhotoCapacity: checker }, { sharedGifMaxBytes: 15 * 1024 * 1024 })
    assert.equal(member.sharedGifMaxBytes, 15 * 1024 * 1024)
    assert.throws(() => member.checkPhotoCapacity(1), { code: 'PHOTO_LIBRARY_NOT_READY' })
  }
  runtime.current = { checkPhotoCapacity: (count, photos) => ({ count, photos }) }
  assert.deepEqual(checker(2, ['photo']), { count: 2, photos: ['photo'] })
  assert.deepEqual(options({ source: 'guest' }, {}, {}), { guestPhoto: true })
})

test('회원 사진 한도를 오프라인에서 확인하지 못하면 새 파일을 가져오지 않는다', async () => {
  const calls = []
  const mocks = {
    'react-native': { Platform: { OS: 'android' } },
    '../../auth/authService': { authService: { getSessionKey: () => 'member' } },
    '../utils/mediaPicker': { selectImages: async () => { calls.push('picker'); return { assets: [{}] } } },
    './mediaStore': { importMedia: async () => { calls.push('import'); return [] } },
    '../utils/mediaPolicy.js': { MediaError: class extends Error {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? {}, module, module.exports)
  await assert.rejects(module.exports.pickImages({ checkPhotoCapacity: async () => { throw TypeError('Failed to fetch') } }), {
    code: 'PHOTO_CAPACITY_CHECK_FAILED', message: '사진 보관함을 확인하지 못했어요. 다시 시도해 주세요.',
  })
  assert.deepEqual(calls, [])
})
