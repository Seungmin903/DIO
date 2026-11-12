import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isGifUri } from '../src/editor/utils/svgImageSource.js'

const source = (path) => readFileSync(new URL(`../src/editor/${path}`, import.meta.url), 'utf8')

test('보관소 참조가 없는 예전 주소도 GIF 인지 알아본다', () => {
  assert.equal(isGifUri('data:image/gif;base64,R0lGODlh'), true)
  assert.equal(isGifUri('file:///cache/sticker.GIF'), true)
  assert.equal(isGifUri('https://cdn.example/a.gif?v=2'), true)
  assert.equal(isGifUri('data:image/png;base64,iVBOR'), false)
  assert.equal(isGifUri('file:///cache/gif-folder/photo.png'), false)
  assert.equal(isGifUri(null), false)
})

// Android 의 react-native-svg <Image> 는 움직이는 GIF 를 받으면 비트맵이 null 이라 앱이 죽는다.
// SVG 이미지로 사용자 이미지를 그리는 곳(사진 테이프 · 모양 틀 사진)은 GIF 를 거르는 주소만 넘겨야 한다.
test('사진 테이프와 모양 틀 사진은 SVG 이미지에 GIF 를 거른 주소를 넘긴다', () => {
  const tape = source('components/canvas/TapeView.js')
  assert.match(tape, /const uri = useSvgImageUri\(\{ src, mediaFileId \}, useMediaUri\(\{ src, mediaFileId \}\)\)/)
  const photo = source('components/canvas/ObjectView.js')
  assert.match(photo, /const svgUri = useSvgImageUri\(/)
  assert.match(photo, /<SvgImage[\s\S]*?href=\{svgUri \? \{ uri: svgUri \} : undefined\}/)
  assert.doesNotMatch(photo, /<SvgImage[\s\S]{0,200}href=\{uri \?/)
})
