import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { MODEL_VERSION, PREPROCESS_VERSION } from '../src/handwriting/protocol.js'
import { HANDWRITING_FONT_CREATION_ENABLED } from '../src/shared/featureFlags.js'

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

test('폰트 만들기를 켜면 iOS Expo 모듈과 세 EAS 프로필이 같은 모델 리소스를 포함한다', { skip: !HANDWRITING_FONT_CREATION_ENABLED && '폰트 만들기 꺼짐(shared/featureFlags.js)' }, () => {
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
    assert(readFileSync(new URL('../../.easignore', import.meta.url), 'utf8').includes(`!/frontend/modules/dio-handwriting/android/src/main/assets/dio_handwriting/${file}`))
    assert(read('.gitignore').includes(`!/modules/dio-handwriting/android/src/main/assets/dio_handwriting/${file}`))
  }
  // 켜는 변경에서 Android 디버그 빌드 모델 검사도 함께 되돌린다(꺼진 동안 이 테스트는 건너뛴다 — 스위치를 켜면 자동으로 다시 돈다)
  assert.match(read('modules/dio-handwriting/android/build.gradle'), /tasks\.matching \{ it\.name == 'preDebugBuild' \}\.configureEach \{\s*dependsOn verifyDebugHandwritingModels/)
})

test('폰트 만들기를 끄면 모델 없이 빌드되게 EAS · iOS · Android 모델 필수 검사를 모두 끈다', { skip: HANDWRITING_FONT_CREATION_ENABLED && '폰트 만들기 켜짐' }, () => {
  const eas = JSON.parse(read('eas.json'))
  for (const profile of ['development', 'preview', 'production']) assert.equal(eas.build[profile].env.DIO_REQUIRE_IOS_HANDWRITING, undefined)
  const rootIgnore = readFileSync(new URL('../../.easignore', import.meta.url), 'utf8')
  for (const ignore of [read('.easignore'), rootIgnore, read('.gitignore')]) assert(!/^\s*!.*\.onnx\s*$/m.test(ignore))
  // iOS: 모델 리소스는 DIO_REQUIRE_IOS_HANDWRITING=1 일 때만 pod 리소스에 들어가고, 그 값을 주는 EAS 프로필이 없다
  const spec = read('modules/dio-handwriting/DioHandwriting.podspec')
  assert.match(spec, /model_files = ENV\['DIO_REQUIRE_IOS_HANDWRITING'\] == '1' \? \["#\{models\}\/\*\.onnx"\] : \[\]/)
  assert.match(spec, /'DioHandwritingModels' => model_files \+/)
  assert(!/\.onnx/.test(read('modules/dio-handwriting/expo-module.config.json')))
  // 모델이 없어도 네이티브 모듈은 뜨고 capabilities 가 available=false 를 돌려준다: Android 는 에셋 열기 실패를 잡고,
  // iOS 는 리소스 묶음에 모델이 없으면 assets 가 nil 이다. ONNX 세션은 작업을 시작할 때만 만든다
  const android = read('modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/DioHandwritingModule.kt')
  assert.match(android, /AsyncFunction\("capabilities"\) \{[\s\S]{0,200}val bundled = try \{ assets\.open\("dio_handwriting\/encoder\.fp32\.onnx"\)\.close\(\); assets\.open\("dio_handwriting\/decoder\.fp32\.onnx"\)\.close\(\); true \} catch \(_: Exception\) \{ false \}/)
  assert.match(android, /"available" to bundled/)
  const iosModule = read('modules/dio-handwriting/ios/DioHandwritingModule.swift')
  assert.match(iosModule, /let bundled = HandwritingModel\.assets != nil\s*return \["available": bundled/)
  assert.match(read('modules/dio-handwriting/ios/HandwritingInference.swift'), /static let assets: \(encoder: URL, decoder: URL\)\? = \{[\s\S]*?else \{ continue \}[\s\S]*?return nil/)
  // 폰트 화면을 여는 입구는 공방 폰트 탭(스위치로 숨김) 하나뿐이다. 새 입구를 만들면 스위치로 막고 여기에 더한다
  const openers = execFileSync('git', ['grep', '-l', 'openFontStudio(', '--', 'src', 'App.js'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim().split('\n').sort()
  assert.deepEqual(openers, ['src/diary/screens/DecorationStudioScreen.js', 'src/handwriting/studioBus.js'])
  assert(!/dependsOn verifyDebugHandwritingModels/.test(read('modules/dio-handwriting/android/build.gradle')))
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
