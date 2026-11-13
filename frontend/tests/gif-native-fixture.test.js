import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { encodeFixtureGif, encodeFixtureInput, fixtureFrames } from '../modules/dio-gif-encoder/fixture.mjs'

// 네이티브 GIF 묶기(Android GifAssembler.kt)는 이 고정 입력 · 기대 결과와 바이트까지 같은지 Kotlin 테스트로 본다.
// 여기서는 그 기대 결과가 지금 JS createGifAssembler 의 결과와 같은지 본다. 다르면 JS 와 Kotlin 중 한쪽만 고친 것이다:
// 둘을 함께 고치고 node modules/dio-gif-encoder/scripts/make-fixture.mjs 로 다시 만든다.
const resource = (name) => new Uint8Array(readFileSync(new URL(`../modules/dio-gif-encoder/android/src/test/resources/${name}`, import.meta.url)))

test('네이티브 GIF 묶기 고정 입력 · 기대 결과가 지금 JS 묶기와 같다', () => {
  const frames = fixtureFrames()
  assert.deepEqual(encodeFixtureInput(frames), resource('gif-fixture.bin'))
  assert.deepEqual(encodeFixtureGif(frames), resource('gif-fixture.gif'))
})
