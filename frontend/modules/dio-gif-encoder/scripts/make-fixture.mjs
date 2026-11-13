// 네이티브 GIF 묶기 테스트 입력과 JS 가 만든 기대 결과를 다시 만든다 (frontend/ 에서: node modules/dio-gif-encoder/scripts/make-fixture.mjs)
import { writeFileSync } from 'node:fs'
import { encodeFixtureGif, encodeFixtureInput, fixtureFrames } from '../fixture.mjs'

const dir = new URL('../android/src/test/resources/', import.meta.url)
const frames = fixtureFrames()
writeFileSync(new URL('gif-fixture.bin', dir), encodeFixtureInput(frames))
const gif = encodeFixtureGif(frames)
writeFileSync(new URL('gif-fixture.gif', dir), gif)
console.log(`gif-fixture.gif ${gif.length} bytes`)
