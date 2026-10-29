import test from 'node:test'
import assert from 'node:assert/strict'
import { initialStickerGrouping } from '../src/editor/utils/stickerInitialGrouping.js'

const parts = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, x: i * 3, y: 0, width: 1, height: 1 }))
const edgesForCount = count => parts.slice(1, parts.length - count + 1).map(part => [parts[0].id, part.id])

test('50개 이하와 유효하지 않은 영역은 조회 없이 묶지 않음으로 유지한다', async () => {
  for (const count of [0, 10, 20, 50]) {
    const result = await initialStickerGrouping(parts.slice(0, count), 1000, () => assert.fail('unneeded query'))
    assert.deepEqual(result, { distance: 0, edges: [], count })
  }
  for (const size of [0, NaN, -1]) assert.equal((await initialStickerGrouping(parts, size, () => assert.fail())).distance, 0)
})
test('20~50개가 되는 가장 작은 0.1% 거리를 최대 8회 조회로 찾는다', async () => {
  const calls = [], snapshot = structuredClone(parts)
  const result = await initialStickerGrouping(parts, 1000, async pixels => {
    calls.push(pixels)
    return edgesForCount(pixels < 23 ? 100 : pixels < 30 ? 40 : 20)
  })
  assert.equal(result.distance, 2.3); assert.equal(result.count, 40)
  assert.ok(calls.length <= 8); assert.ok(calls.every(p => p > 0 && p <= 50))
  assert.deepEqual(parts, snapshot)
})
test('5%에서도 50개를 넘으면 최대 거리의 실제 결과를 사용한다', async () => {
  const calls = []
  const result = await initialStickerGrouping(parts, 1000, async pixels => { calls.push(pixels); return edgesForCount(75) })
  assert.equal(result.count, 75); assert.equal(result.distance, 5)
  assert.deepEqual(calls, [50])
})
test('20개 미만으로 급감하면 직전 거리의 50개 초과 결과를 보존한다', async () => {
  const result = await initialStickerGrouping(parts, 1000, async pixels => edgesForCount(pixels < 16 ? 70 : 8))
  assert.equal(result.distance, 1.5); assert.equal(result.count, 70)
  const immediate = await initialStickerGrouping(parts, 1000, async () => edgesForCount(1))
  assert.equal(immediate.distance, 0); assert.equal(immediate.count, 200)
})
test('20·50개 경계를 포함하며 짧은 변에 비례한 원본 픽셀 거리로 조회한다', async () => {
  for (const count of [20, 50]) {
    const result = await initialStickerGrouping(parts, 500, async pixels => edgesForCount(pixels < 5 ? 51 : count))
    assert.equal(result.distance, 1); assert.equal(result.count, count)
  }
})
test('연쇄 연결은 같은 묶음으로 세며 투명 여백은 네이티브 픽셀 판정을 따른다', async () => {
  const chain = parts.slice(1, 161).map((p, i) => [parts[i].id, p.id])
  const result = await initialStickerGrouping(parts, 1000, async pixels => pixels >= 10 ? chain : [])
  assert.equal(result.count, 40); assert.equal(result.distance, 1)
  assert.deepEqual(result.edges, chain)
})
test('취소·이미지 교체 검사 실패와 네이티브 오류는 이후 조회·결과 적용을 중단한다', async () => {
  let cancelled = false, calls = 0
  await assert.rejects(initialStickerGrouping(parts, 1000, async () => { calls++; cancelled = true; return edgesForCount(40) }, () => {
    if (cancelled) throw Error('CANCELLED')
  }), /CANCELLED/)
  assert.equal(calls, 1)
  await assert.rejects(initialStickerGrouping(parts, 1000, async () => { throw Error('READ_FAILED') }), /READ_FAILED/)
})
