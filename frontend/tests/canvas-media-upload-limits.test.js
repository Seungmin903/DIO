import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

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

const limits = { sharedImageMaxBytes: 5 * MB, sharedGifMaxBytes: 15 * MB }

function uploader(platform) {
  let stored = { media: { extension: 'png', mimeType: 'image/png', fileSize: 1 }, blob: { uri: 'file:///image.png' } }
  class FormData { append() {} }
  const common = {
    './mediaRetry.js': {}, './mediaStore': {}, '../utils/mediaPolicy.js': {},
    '../utils/shareImagePlan.js': { needsShareJpeg: () => false }, '../utils/shareImage': {},
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
