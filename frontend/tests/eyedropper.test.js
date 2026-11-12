import test from 'node:test'
import assert from 'node:assert/strict'
import UPNG from 'upng-js'
import { decodeEyedropper, eyedropperDimensions, eyedropperSample, eyedropperLens } from '../src/editor/utils/canvasEyedropper.js'

test('캡처 크기는 화면 논리 크기를 유지하고 긴 변 2048 이하로 제한한다', () => {
  assert.deepEqual(eyedropperDimensions(1000, 600), { pixelWidth: 1000, pixelHeight: 600 })
  assert.deepEqual(eyedropperDimensions(8000, 4000), { pixelWidth: 2048, pixelHeight: 1024 })
  assert.throws(() => eyedropperDimensions(0, 100))
})
test('PNG는 한 번 해석한 RGBA에서 평균 없이 색을 추출한다', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 128, 255, 255])
  const png = new Uint8Array(UPNG.encode([rgba.buffer], 2, 1, 0, undefined, true))
  const decoded = decodeEyedropper(png)
  assert.deepEqual(decoded.rgba, rgba)
  const frame = { x: 20, y: 40, width: 200, height: 100 }
  assert.equal(eyedropperSample(decoded, { x: 25, y: 45 }, frame, frame).color, '#FF0000')
  assert.equal(eyedropperSample(decoded, { x: 219, y: 139 }, frame, frame).color, '#0080FF')
  assert.throws(() => decodeEyedropper(new Uint8Array(5)))
})
test('확대·이동된 페이지와 보이는 영역의 교집합만 선택한다', () => {
  const pixels = { width: 4, height: 2, rgba: new Uint8Array(32).fill(255) }
  const viewport = { x: 80, y: 60, width: 100, height: 100 }
  const frame = { x: -20, y: 10, width: 400, height: 200 }
  assert.deepEqual(eyedropperSample(pixels, { x: 100, y: 80 }, frame, viewport), { color: '#FFFFFF', x: 1, y: 0, point: { x: 100, y: 80 } })
  for (const point of [{ x: 10, y: 80 }, { x: 180, y: 80 }, { x: 100, y: 160 }, { x: NaN, y: 80 }]) assert.equal(eyedropperSample(pixels, point, frame, viewport), null)
  pixels.rgba.fill(0); assert.equal(eyedropperSample(pixels, { x: 100, y: 80 }, frame, viewport), null)
})
test('확대 미리보기는 좁은 화면과 모서리에서도 화면 안에 배치된다', () => {
  for (const [width,height] of [[320,740],[844,390],[1280,800]]) for (const point of [{ x: 0, y: 0 },{ x: width, y: height }]) {
    const lens = eyedropperLens(point, width, height)
    assert.ok(lens.x >= 0 && lens.y >= 0 && lens.x + lens.width <= width && lens.y + lens.height <= height)
  }
})
