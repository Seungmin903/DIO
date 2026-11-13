import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MODEL_VERSION, PREPROCESS_VERSION } from '../src/handwriting/protocol.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('modules/dio-handwriting/android/src/main/assets/dio_handwriting/manifest.json'))

test('JS·Android·iOS·변환기·준비 스크립트는 같은 모델 버전과 ONNX 해시를 사용한다', () => {
  const native = read('modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/DioHandwritingModule.kt')
  const ios = read('modules/dio-handwriting/ios/HandwritingInference.swift')
  const prepare = read('scripts/prepare-handwriting-models.ps1')
  const factory = read('model-tools/dio_dmfont/factory.py')
  assert.equal(manifest.model_version, MODEL_VERSION)
  assert.equal(manifest.preprocess_version, PREPROCESS_VERSION)
  assert(native.includes(`input.getString("preprocessVersion") == "${PREPROCESS_VERSION}"`))
  assert(read('scripts/export-handwriting-model.py').includes(PREPROCESS_VERSION))
  assert(prepare.includes(PREPROCESS_VERSION))
  assert(ios.includes(PREPROCESS_VERSION))
  for (const source of [native, ios, prepare, factory]) assert(source.includes(MODEL_VERSION))
  for (const [file, constant] of [['encoder.fp32.onnx', 'ENCODER_HASH'], ['decoder.fp32.onnx', 'DECODER_HASH']]) {
    const expected = manifest.files[file].sha256
    assert.equal(native.match(new RegExp(`${constant} = "([a-f0-9]+)"`))[1], expected)
    assert(prepare.includes(expected))
    assert(ios.includes(expected))
  }
  assert.deepEqual(manifest.input_contract.encoder.image, [1, 1, 128, 128])
  assert.deepEqual(manifest.input_contract.decoder.components, [1, 3, 256, 16, 16])
  assert.deepEqual(manifest.input_contract.decoder.skips, [1, 3, 128, 32, 32])
})

test('iOS Expo 모듈과 세 EAS 프로필이 같은 모델 리소스를 포함한다', () => {
  const config = JSON.parse(read('modules/dio-handwriting/expo-module.config.json'))
  const app = JSON.parse(read('app.json'))
  const eas = JSON.parse(read('eas.json'))
  assert(config.platforms.includes('apple'))
  assert.deepEqual(config.apple.modules, ['DioHandwritingModule'])
  assert(app.expo.plugins.includes('./plugins/withHandwritingIos'))
  const spec = read(`modules/dio-handwriting/${config.apple.podspecPath}`)
  assert.match(spec, /s\.resource_bundles\s*=\s*\{\s*'DioHandwritingModels'/)
  for (const profile of ['development', 'preview', 'production']) {
    assert.equal(eas.build[profile].env.DIO_REQUIRE_IOS_HANDWRITING, '1')
  }
  for (const file of ['encoder.fp32.onnx', 'decoder.fp32.onnx']) {
    assert(read('.easignore').includes(`!modules/dio-handwriting/android/src/main/assets/dio_handwriting/${file}`))
  }
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

test('운영 빌드 R8이 ONNX Runtime JNI 클래스를 지우지 않고, 작업 스레드 Error가 앱을 종료시키지 않는다', () => {
  const gradle = read('modules/dio-handwriting/android/build.gradle')
  assert.match(gradle, /consumerProguardFiles\s+'consumer-rules\.pro'/)
  assert.match(read('modules/dio-handwriting/android/consumer-rules.pro'), /^-keep class ai\.onnxruntime\.\*\* \{ \*; \}$/m)
  const native = read('modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/DioHandwritingModule.kt')
  assert(native.includes('} catch (error: Throwable) {'))
})
