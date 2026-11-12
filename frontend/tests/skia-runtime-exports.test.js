import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// createPageGif 는 skiaRuntime 의 skiaState 로 GPU Skia 를 고른다. 웹 · 앱 두 파일 모두 내보내야 한다
// (create-page-gif 테스트는 이 모듈을 흉내 내므로 여기서 실제 파일을 본다. 앱 파일은 Node 에서 불러올 수 없어 원문을 본다)
test('skiaRuntime 은 웹 · 앱 모두 skiaState 를 내보낸다', async () => {
  const web = await import('../src/editor/skia/skiaRuntime.js')
  assert.equal(typeof web.skiaState, 'function')
  assert.equal(web.skiaState().runtime, null) // 웹은 불러오기 전 Skia 없음 → GIF 는 JS 합성
  const native = readFileSync(new URL('../src/editor/skia/skiaRuntime.native.js', import.meta.url), 'utf8')
  assert.match(native, /export const skiaState = \(\) => state/)
  assert.match(native, /gpuSurface: true/)
})
