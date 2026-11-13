import { createGifAssembler } from '../../src/editor/utils/gifExport.js'

/*
 * 네이티브 GIF 묶기(Android GifAssembler.kt)가 JS createGifAssembler 와 같은 바이트를 내는지 보는 고정 입력.
 * 만들기: node modules/dio-gif-encoder/scripts/make-fixture.mjs (frontend/ 에서)
 * → android/src/test/resources/gif-fixture.bin (입력) · gif-fixture.gif (JS 가 만든 결과)
 * input.bin: [width, height, frameCount] (int32 LE), 장면마다 [x, y, w, h, delay] (int32 LE) + w*h*4 RGBA.
 * 색 모으기는 모든 장면을 순서대로 넣고(createPageGif 와 같음), 그다음 장면을 순서대로 묶는다.
 */
export const FIXTURE = { width: 160, height: 120 }

function random(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** 장면들: 첫 장면은 페이지 전체(종이 · 줄 · 그라데이션 · 잡음), 그다음은 움직이는 사각형(일부는 앞과 같음) */
export function fixtureFrames() {
  const { width, height } = FIXTURE
  const rand = random(106)
  const page = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const line = y % 12 === 0
    const blob = (x - 110) ** 2 + (y - 40) ** 2 < 900
    page.set(line ? [60, 80, 120, 255] : blob ? [x * 2, 255 - y * 2, (x * y) & 255, 255] : [250, 245, 232, 255], i)
    if (x < 90 && y > 50) page.set([(rand() * 256) | 0, (rand() * 256) | 0, (rand() * 256) | 0, 255], i) // 잡음 (LZW 표가 차서 비우는 경우)
  }
  const frames = [{ x: 0, y: 0, w: width, h: height, delay: 10, rgba: page }]
  const rect = { x: 20, y: 10, w: 64, h: 48 }
  for (let k = 1; k <= 6; k++) {
    const rgba = new Uint8Array(rect.w * rect.h * 4)
    for (let y = 0; y < rect.h; y++) rgba.set(page.subarray(((rect.y + y) * width + rect.x) * 4, ((rect.y + y) * width + rect.x + rect.w) * 4), y * rect.w * 4)
    // k = 3 은 앞 장면과 같다 (앞 장면을 더 오래 보여 준다)
    if (k !== 3) for (let y = 8; y < 30; y++) for (let x = 0; x < 30; x++) {
      const i = (y * rect.w + x + k * 4) * 4
      rgba.set([(k * 40 + x * 5) & 255, (y * 9) & 255, (k * 70) & 255, 255], i)
    }
    frames.push({ ...rect, delay: k === 2 ? 1 : 7, rgba: k === 3 ? frames.at(-1).rgba : rgba })
  }
  return frames
}

export function encodeFixtureInput(frames) {
  const size = 12 + frames.reduce((sum, f) => sum + 20 + f.rgba.length, 0)
  const out = new Uint8Array(size), view = new DataView(out.buffer)
  let p = 0
  const int = (v) => { view.setInt32(p, v, true); p += 4 }
  int(FIXTURE.width); int(FIXTURE.height); int(frames.length)
  for (const f of frames) { int(f.x); int(f.y); int(f.w); int(f.h); int(f.delay); out.set(f.rgba, p); p += f.rgba.length }
  return out
}

export function encodeFixtureGif(frames) {
  const assembler = createGifAssembler(FIXTURE.width, FIXTURE.height)
  frames.forEach((f) => assembler.addColors(f.rgba))
  frames.forEach((f) => assembler.addFrame(f.rgba, f.delay, { x: f.x, y: f.y, width: f.w, height: f.h }))
  return assembler.end()
}
