import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createMediaRequest } from '../src/collaboration/canvasMedia.js'

test('사진 보관함의 마지막 자리까지만 새 업로드를 허용한다', async () => {
  let count = 199
  const request = createMediaRequest({
    accountId: '1', sessionKey: 'session', baseUrl: 'https://example.test',
    auth: {
      getSessionKey: () => 'session',
      getAccessToken: async () => 'token',
      getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }),
    },
    fetchImpl: async (url, { method }) => {
      if (method === 'POST') {
        count++
        return { ok: true, json: async () => ({}) }
      }
      const offset = new URL(url).searchParams.has('cursor') ? 100 : 0
      const mediaFiles = Array.from({ length: Math.min(count - offset, 100) }, (_, i) => ({
        mediaFileId: String(offset + i), libraryCategory: 'PHOTO',
      }))
      return { ok: true, json: async () => ({ mediaFiles, nextCursor: offset ? null : 'next' }) }
    },
  })
  const options = { method: 'POST', category: 'PHOTO' }
  await request('/media', options)
  await assert.rejects(request('/media', options), { code: 'STORAGE_LIMIT_REACHED', message: '사진 저장 한도는 200장이에요.' })
  assert.equal(count, 200)
})

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const MB = 1024 * 1024

function compile(path, imports, extra = {}) {
  const code = babel.transformSync(readFileSync(path, 'utf8'), { filename: String(path), configFile: false, babelrc: false,
    plugins: [expo.resolve('@babel/plugin-transform-typescript'), expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(extra), code)(id => {
    if (id in imports) return imports[id]
    throw Error(id)
  }, module, module.exports, ...Object.values(extra))
  return module.exports
}

const limits = { sharedImageMaxBytes: 5 * MB, sharedGifMaxBytes: 15 * MB,
  mediaShareSizeMessage: extension => extension === 'gif' ? 'GIF limit' : 'image limit' }

function uploader(platform) {
  let stored = { media: { extension: 'png', mimeType: 'image/png', fileSize: 1 }, blob: { uri: 'file:///image.png' } }
  class FormData { append() {} }
  const common = {
    './mediaRetry.js': {}, './mediaStore': {}, '../utils/mediaPolicy.js': {},
    '../utils/shareImagePlan.js': { needsShareJpeg: () => false, needsSharePng: () => false }, '../utils/shareImage': {},
    '../../diary/utils/pdfSource.js': { PDF_SHARE_MAX_BYTES: 25 * MB }, '../../shared/mediaLimits.js': limits,
  }
  const imports = platform === 'native' ? {
    ...common, 'expo-file-system': { File: class {}, Paths: {} },
    '../utils/mediaRepository.native.js': { get: async () => stored },
    '../../diary/utils/pdfSourceStore.native.js': {},
  } : {
    ...common, '../utils/mediaRepository.web.js': { get: async () => stored },
    '../../diary/utils/pdfSourceStore.web.js': {},
  }
  const path = new URL(`../src/editor/services/canvasMediaFiles.${platform}.js`, import.meta.url)
  const { canvasMediaFiles } = compile(path, imports, { FormData })
  return { upload: () => canvasMediaFiles.upload('media-id', 'PHOTO'), setStored: value => { stored = value } }
}

for (const platform of ['native', 'web']) test(`${platform} 공유 업로드는 GIF에만 15MiB 한도를 적용한다`, async () => {
  const subject = uploader(platform)
  subject.setStored({ media: { extension: 'gif', mimeType: 'image/gif', fileSize: 6 * MB }, blob: { uri: 'file:///animated.gif' } })
  await assert.doesNotReject(subject.upload())

  subject.setStored({ media: { extension: 'gif', mimeType: 'image/gif', fileSize: limits.sharedGifMaxBytes + 1 }, blob: { uri: 'file:///large.gif' } })
  await assert.rejects(subject.upload(), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' })

  subject.setStored({ media: { extension: 'png', mimeType: 'image/png', fileSize: limits.sharedImageMaxBytes + 1 }, blob: { uri: 'file:///large.png' } })
  await assert.rejects(subject.upload(), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' })
})

for (const platform of ['native', 'web']) test(`${platform} 5MiB 를 넘는 투명할 수 있는 PNG(iPad 화면 캡처)는 PNG 그대로 줄여 올린다`, async () => {
  const MBs = 1024 * 1024, calls = []
  class FormData { constructor() { this.parts = [] } append(...args) { this.parts.push(args) } }
  const stored = { media: { extension: 'png', mimeType: 'image/png', fileSize: 11 * MBs, width: 1640, height: 2360 }, blob: { uri: 'file:///shot.png' } }
  const plan = await import('../src/editor/utils/shareImagePlan.js')
  const shareImage = { toShareJpeg: async () => { throw Error('JPEG 로 바꾸면 투명한 부분에 배경이 생긴다') },
    toSharePng: async (source, size) => { calls.push(size); return { uri: 'file:///small.png', blob: { size: 3 * MBs }, size: 3 * MBs, width: 902, height: 1298 } } }
  const imports = {
    './mediaRetry.js': {}, './mediaStore': {}, '../utils/mediaPolicy.js': {}, '../utils/shareImagePlan.js': plan, '../utils/shareImage': shareImage,
    '../../diary/utils/pdfSource.js': { PDF_SHARE_MAX_BYTES: 25 * MBs }, '../../shared/mediaLimits.js': limits,
    ...(platform === 'native' ? { 'expo-file-system': { File: class { bytes() {} }, Paths: {} }, '../utils/mediaRepository.native.js': { get: async () => stored }, '../../diary/utils/pdfSourceStore.native.js': {} }
      : { '../utils/mediaRepository.web.js': { get: async () => stored }, '../../diary/utils/pdfSourceStore.web.js': {} }),
  }
  const { canvasMediaFiles } = compile(new URL(`../src/editor/services/canvasMediaFiles.${platform}.js`, import.meta.url), imports, { FormData })
  const form = await canvasMediaFiles.upload('media-id', 'PHOTO')
  assert.deepEqual(calls.map(size => [size.width, size.height]), [[1640, 2360]])
  assert.ok(form.parts.some(([name, , filename]) => name === 'file' && filename === 'image.png' || name === 'file' && filename?.name === 'image.png' || name === 'file'))
})
