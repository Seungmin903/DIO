import test from 'node:test'
import assert from 'node:assert/strict'
import { PROMPTS } from '../src/handwriting/protocol.js'
import { buildSimilarityInput, mergeSamples } from '../scripts/handwriting-similarity-prepare.mjs'

const stroke = (x0, y0, x1, y1) => ({ width: 40, points: [{ x: x0, y: y0, pressure: null, time: 0 }, { x: x1, y: y1, pressure: null, time: 10 }] })
const sample = () => ({ coordinateSize: 1024, strokes: [stroke(300, 300, 700, 300), stroke(500, 300, 500, 750)] })
const draft = chars => ({ samples: Object.fromEntries([...chars].map(c => [c, sample()])) })

test('36자는 참조, 그 밖의 글자는 정답으로 나눈다', () => {
  const input = buildSimilarityInput(mergeSamples([draft(PROMPTS.join('')), draft('한글')]))
  assert.equal(input.references.length, 36)
  assert.deepEqual(input.references.map(r => r.character), PROMPTS)
  assert.deepEqual(input.heldOut.map(h => h.character), ['한', '글'])
  for (const row of [...input.references, ...input.heldOut]) assert.equal(row.pixels.length, 128 * 128)
})

test('뒤 파일의 글자가 앞 파일을 덮는다', () => {
  const later = { samples: { 한: { coordinateSize: 1024, strokes: [stroke(200, 500, 800, 500)] } } }
  const merged = mergeSamples([draft('한'), later])
  assert.equal(merged['한'].strokes.length, 1)
})

test('참조가 빠지거나 평가 글자가 없으면 멈춘다', () => {
  assert.throws(() => buildSimilarityInput(mergeSamples([draft(PROMPTS.slice(1).join('') + '한')])), /빠진 글자/)
  assert.throws(() => buildSimilarityInput(mergeSamples([draft(PROMPTS.join(''))])), /평가용 글자/)
  assert.throws(() => mergeSamples([{ samples: { A: sample() } }]), /완성형 한글/)
})
