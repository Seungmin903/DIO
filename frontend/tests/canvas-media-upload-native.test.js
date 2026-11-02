import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
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

test('Android 캔버스 사진·PDF 업로드를 Expo multipart 인코더가 파일 바이트로 직렬화한다', async () => {
  class Form { constructor() { this._parts = [] } }
  // Expo SDK 58의 실제 multipart 인코더와 파일 bytes() 계약을 검증하는 통합 경계다.
  // 아래 winter 경로는 Expo 내부 API다. SDK 업그레이드 시 경로·직렬화 계약을 확인해
  // 이 어댑터를 갱신하고 테스트를 다시 실행한다. 경로가 바뀌었다고 검증을 건너뛰지 않는다.
  const expoPath = relative => new URL(relative, new URL('../node_modules/expo/package.json', import.meta.url))
  compile(expoPath('./src/winter/FormData.ts'), {}).installFormDataPatch(Form)
  const image = new Uint8Array([137, 80, 78, 71]), pdf = new TextEncoder().encode('%PDF-1.7')
  class File {
    constructor(uri) { this.uri = uri; this.name = uri.split('/').at(-1); this.type = uri.endsWith('.pdf') ? 'application/pdf' : 'image/png' }
    get size() { return this.type === 'application/pdf' ? pdf.length : image.length }
    async bytes() { return this.type === 'application/pdf' ? pdf : image }
  }
  const { canvasMediaFiles } = compile(new URL('../src/editor/services/canvasMediaFiles.native.js', import.meta.url), {
    'expo-file-system': { File, Paths: {} },
    '../utils/mediaRepository.native.js': { get: async () => ({ media: { extension: 'png', mimeType: 'image/png', fileSize: image.length }, blob: { uri: 'file:///photo.png' } }) },
    './mediaRetry.js': {}, './mediaStore': {}, '../utils/mediaPolicy.js': {},
    '../utils/shareImagePlan.js': { needsShareJpeg: () => false }, '../utils/shareImage': {},
    '../../diary/utils/pdfSourceStore.native.js': { pdfSourceUri: () => 'file:///document.pdf' },
    '../../diary/utils/pdfSource.js': { PDF_SHARE_MAX_BYTES: 25 * 1024 * 1024 },
  }, { FormData: Form })
  const { convertFormDataAsync } = compile(expoPath('./src/winter/fetch/convertFormData.ts'), {
    '../../utils/blobUtils': { blobToArrayBufferAsync: blob => blob.arrayBuffer() },
  })
  for (const [category, bytes, type] of [['PHOTO', image, 'image/png'], ['DOCUMENT', pdf, 'application/pdf']]) {
    const form = await canvasMediaFiles.upload('test-id', category)
    const result = await convertFormDataAsync(form, 'test-boundary')
    const wire = new TextDecoder().decode(result.body)
    assert.match(wire, /name="file"; filename=/)
    assert.ok(wire.includes(`content-type: ${type}`))
    assert.ok(wire.includes(category))
    assert.ok(result.body.some((_, index) => bytes.every((byte, offset) => result.body[index + offset] === byte)))
  }
})
