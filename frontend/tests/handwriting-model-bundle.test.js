import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MODEL_VERSION, PREPROCESS_VERSION } from '../src/handwriting/protocol.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('modules/dio-handwriting/android/src/main/assets/dio_handwriting/manifest.json'))

test('JS·Android·변환기·준비 스크립트는 같은 모델 버전과 ONNX 해시를 사용한다', () => {
  const native = read('modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/DioHandwritingModule.kt')
  const prepare = read('scripts/prepare-handwriting-models.ps1')
  const factory = read('model-tools/dio_dmfont/factory.py')
  assert.equal(manifest.model_version, MODEL_VERSION)
  assert.equal(manifest.preprocess_version, PREPROCESS_VERSION)
  assert(native.includes(`input.getString("preprocessVersion") == "${PREPROCESS_VERSION}"`))
  assert(read('scripts/export-handwriting-model.py').includes(PREPROCESS_VERSION))
  assert(prepare.includes(PREPROCESS_VERSION))
  for (const source of [native, prepare, factory]) assert(source.includes(MODEL_VERSION))
  for (const [file, constant] of [['encoder.fp32.onnx', 'ENCODER_HASH'], ['decoder.fp32.onnx', 'DECODER_HASH']]) {
    const expected = manifest.files[file].sha256
    assert.equal(native.match(new RegExp(`${constant} = "([a-f0-9]+)"`))[1], expected)
    assert(prepare.includes(expected))
  }
  assert.deepEqual(manifest.input_contract.encoder.image, [1, 1, 128, 128])
  assert.deepEqual(manifest.input_contract.decoder.components, [1, 3, 256, 16, 16])
  assert.deepEqual(manifest.input_contract.decoder.skips, [1, 3, 128, 32, 32])
})

test('모델 번들은 개인 입력·절대 경로 없이 검증 결과와 추론 소스 출처만 포함한다', () => {
  assert.equal(manifest.verification.glyphs, 11172)
  assert.equal(manifest.verification.torch_exact.outputs, true)
  assert.equal(manifest.inference_imports, undefined)
  assert.equal(manifest.verification.input_hash, undefined)
  for (const path of Object.keys(manifest.source_files)) {
    assert(path.startsWith('dio_dmfont/'))
    assert(!path.includes('/modules/modules.py'))
  }
})
