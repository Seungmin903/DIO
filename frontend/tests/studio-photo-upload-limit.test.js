import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createMediaRequest } from '../src/collaboration/canvasMedia.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const ast = babel.parseSync(readFileSync(new URL('../src/diary/components/StickerLibrarySyncHost.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
const createSyncs = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'createSyncs')
assert.ok(createSyncs)
const { code } = babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'script', directives: [], body: [createSyncs] } }, undefined, { configFile: false, babelrc: false })

test('공방 표지·속지 PHOTO 업로드도 실제 한도 요청을 거치고 스티커·테이프는 구분한다', async () => {
  const sent = [], calls = []
  const env = Object.fromEntries([
    'myPapersReady', 'defaultPaperStyleReady', 'myPapersSnapshot', 'defaultPaperStyleSnapshot',
    'subscribeMyPapers', 'subscribeDefaultPaperStyle', 'replaceMyPapers', 'replaceDefaultPaperStyle',
    'customDecorFolders', 'subscribeCustomDecor', 'replaceStickerFolders', 'customDecorTapeFolders', 'replaceTapeFolders',
    'myCoversReady', 'myCoversSnapshot', 'subscribeMyCovers', 'replaceMyCovers',
  ].map(name => [name, () => {}]))
  Object.assign(env, {
    AsyncStorage: { getItem: async () => null, setItem: async () => {} }, apiBaseUrl: 'https://example.test', accessTokenHeader: 'Authorization',
    entries: async () => [],
    authService: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    createAuthenticatedMemberTransport: () => () => {},
    memberFetch: async (_, { method }) => {
      if (method === 'POST') { sent.push(method); return { ok: true, json: async () => ({ mediaFileId: 'remote' }) } }
      return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: 200 }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
    },
    canvasMediaFiles: { upload: async () => ({}) },
    createMediaRequest: options => {
      assert.equal(options.photoEntries, env.entries)
      const request = createMediaRequest(options)
      return (path, body) => { calls.push(body); return request(path, body) }
    },
    createPaperLibrarySync: value => value, createCoverLibrarySync: value => value,
    createStickerLibrarySync: value => value, createTapeLibrarySync: value => value,
  })
  const syncs = new Function(...Object.keys(env), code + '\nreturn createSyncs')(...Object.values(env))('account', 'session')
  await assert.rejects(syncs.cover.media.upload('cover-photo', 'PHOTO'), { code: 'STORAGE_LIMIT_REACHED' })
  await assert.rejects(syncs.paper.media.upload('paper-photo', 'PHOTO'), { code: 'STORAGE_LIMIT_REACHED' })
  assert.deepEqual(sent, [])
  await syncs.sticker.media.upload('sticker')
  await syncs.tape.media.upload('tape')
  assert.deepEqual(calls.map(body => [body.category, body.localPhotoId]), [['PHOTO', 'cover-photo'], ['PHOTO', 'paper-photo'], ['STICKER', 'sticker'], ['TAPE', 'tape']])
  assert.equal(sent.length, 2)
})
