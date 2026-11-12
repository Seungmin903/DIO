import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GifReader } from 'omggif'
import { createGifAssembler, decodeGifFrames, gifFrameDelays, gifFrames, planGifTimeline } from '../src/editor/utils/gifExport.js'

const love = new Uint8Array(readFileSync(new URL('./fixtures/gifs/n-love.gif', import.meta.url)))

test('여러 GIF 의 장면을 한 시간축에 맞추고, 같은 장면이 이어지면 합친다', () => {
  const plan = planGifTimeline([[100, 100, 100, 100], [200, 200]])
  assert.deepEqual(plan.steps.map((s) => s.indices), [[0, 0], [1, 0], [2, 1], [3, 1]])
  assert.equal(plan.steps.reduce((sum, s) => sum + s.delay, 0), 40)
  // 짧은 GIF 는 한 바퀴를 넘으면 처음 장면으로 돌아간다
  const loop = planGifTimeline([[100, 100, 100, 100], [100, 100]])
  assert.deepEqual(loop.steps.map((s) => s.indices[1]), [0, 1, 0, 1])
  assert.deepEqual([...loop.needed[1]], [0, 1])
  // 장면이 하나뿐이면 한 프레임으로 합친다
  assert.equal(planGifTimeline([[500]]).steps.length, 1)
  // 너무 길거나 촘촘하면 프레임 수를 줄인다
  const long = planGifTimeline([Array(300).fill(40)])
  assert.ok(long.steps.length <= 40)
  assert.equal(long.steps.reduce((sum, s) => sum + s.delay, 0), 600)
})

test('장면을 하나씩 꺼내 풀어도 한꺼번에 푼 것과 같다', () => {
  const needed = planGifTimeline([gifFrameDelays(love)]).needed[0]
  const all = new Map()
  decodeGifFrames(love, needed, (index, rgba) => all.set(index, rgba.slice()))
  const oneByOne = new Map()
  for (const { index, rgba } of gifFrames(love, needed)) oneByOne.set(index, rgba.slice())
  assert.deepEqual([...oneByOne.keys()], [...needed].sort((a, b) => a - b))
  for (const [index, rgba] of all) assert.deepEqual(oneByOne.get(index), rgba)
})

test('기본 GIF 스티커를 장면별로 풀고 다시 GIF 로 묶는다', () => {
  const delays = gifFrameDelays(love)
  assert.ok(delays.length > 1)
  const plan = planGifTimeline([delays])
  const reader = new GifReader(love)
  const assembler = createGifAssembler(reader.width, reader.height)
  const frames = new Map()
  decodeGifFrames(love, plan.needed[0], (index, rgba) => frames.set(index, rgba.slice()))
  assert.equal(frames.size, plan.needed[0].size)
  // 투명 부분은 흰 종이 위에 놓인 것처럼 합성
  const onPaper = (rgba) => { const out = new Uint8Array(rgba.length); for (let i = 0; i < rgba.length; i += 4) { const a = rgba[i + 3] / 255; for (let c = 0; c < 3; c++) out[i + c] = Math.round(rgba[i + c] * a + 255 * (1 - a)); out[i + 3] = 255 } return out }
  for (const step of plan.steps) assembler.addColors(onPaper(frames.get(step.indices[0])))
  for (const step of plan.steps) assembler.addFrame(onPaper(frames.get(step.indices[0])), step.delay)
  const gif = assembler.end()
  const out = new GifReader(gif)
  assert.equal(out.width, reader.width)
  assert.ok(out.numFrames() > 1)
  assert.equal(out.loopCount(), 0)
  // 마지막 장면을 다시 풀면 원래 색과 거의 같다
  const pixels = new Uint8Array(out.width * out.height * 4)
  for (let i = 0; i < out.numFrames(); i++) out.decodeAndBlitFrameRGBA(i, pixels)
  const last = onPaper(frames.get(plan.steps.at(-1).indices[0]))
  let error = 0
  for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) error += Math.abs(pixels[i + c] - last[i + c])
  assert.ok(error / (pixels.length / 4 * 3) < 6, `평균 색 차이 ${error / (pixels.length / 4 * 3)}`)
})

test('바뀐 곳이 없는 장면은 앞 장면 시간에 더한다', () => {
  const assembler = createGifAssembler(2, 1)
  const a = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]), b = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255])
  for (const f of [a, a, b]) assembler.addColors(f)
  assembler.addFrame(a, 10); assembler.addFrame(a, 10); assembler.addFrame(b, 10)
  const out = new GifReader(assembler.end())
  assert.equal(out.numFrames(), 2)
  assert.equal(out.frameInfo(0).delay, 20)
  assert.deepEqual([out.frameInfo(1).x, out.frameInfo(1).width], [1, 1])
})

test('비슷한 색이 많아도 자주 쓰인 글자 회색은 팔레트에 남는다', () => {
  // 갈색·주황 계열 1024색이 넓게 쓰이고, 회색 글자는 그 옆에 조금 있다 (움직이는 이모지 + 속지 글자)
  const warm = []
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) warm.push([Math.min(255, r * 8 + 40), g * 6, 16])
  const width = 64, height = warm.length / 64 * 20 + 20
  const rgba = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    const color = p < warm.length * 20 ? warm[p % warm.length] : [41, 41, 41]
    rgba.set([...color, 255], p * 4)
  }
  const assembler = createGifAssembler(width, height)
  assembler.addColors(rgba); assembler.addFrame(rgba, 10)
  const out = new GifReader(assembler.end()), pixels = new Uint8Array(width * height * 4)
  out.decodeAndBlitFrameRGBA(0, pixels)
  const last = (width * height - 1) * 4
  assert.deepEqual([...pixels.slice(last, last + 3)], [41, 41, 41])
})
