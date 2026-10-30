import test from 'node:test'
import assert from 'node:assert/strict'
import * as deskLight from '../src/diary/utils/deskLight.js'

const load = async () => deskLight

test('하루 어느 시각이든 창빛이 나오고 값이 유한하다', async () => {
  const { deskLightAt } = await load()
  for (let h = 0; h < 24; h += 0.25) {
    const light = deskLightAt(h)
    for (const key of ['opacity', 'x', 'y', 'dim', 'shadowOpacity']) assert.ok(Number.isFinite(light[key]), `${h}h ${key}`)
    assert.match(light.color, /^#[0-9a-f]{6}$/)
  }
})

test('창 모양은 고정이고 한 칸(15분) 사이에 빛이 뚝 끊기지 않는다', async () => {
  const { deskLightAt } = await load()
  let previous = deskLightAt(0)
  for (let h = 0.25; h <= 24; h += 0.25) {
    const light = deskLightAt(h)
    assert.ok(Math.abs(light.opacity - previous.opacity) < 0.2, `opacity ${h}`)
    assert.ok(Math.abs(light.x - previous.x) < 0.2, `x ${h}`)
    previous = light
  }
})

test('오후는 왼쪽에서 오른쪽 아래로, 아침은 오른쪽에서 왼쪽으로 그림자가 진다', async () => {
  const { deskLightAt } = await load()
  assert.ok(deskLightAt(8).shadow[0] < 0 && deskLightAt(8).x > deskLightAt(15).x)
  assert.ok(deskLightAt(15).shadow[0] > 0)
  assert.ok(deskLightAt(17.5).shadow[0] > deskLightAt(15).shadow[0], '해 질 녘 그림자가 더 길다')
})

test('밤은 상판을 어둡게 하고 달빛은 푸르다', async () => {
  const { deskLightAt } = await load()
  const night = deskLightAt(23)
  assert.ok(night.dim > 0.1)
  assert.equal(deskLightAt(12).dim, 0)
  const [r, , b] = [1, 3, 5].map(i => parseInt(night.color.slice(i, i + 2), 16))
  assert.ok(b > r)
})

test('24 이상 · 음수 시각은 하루로 접는다', async () => {
  const { deskLightAt, normalizeHour, deskClockLabel, deskPhaseAt } = await load()
  assert.equal(normalizeHour(25), 1)
  assert.equal(normalizeHour(-1), 23)
  assert.equal(deskLightAt(24 + 12).color, deskLightAt(12).color)
  assert.equal(deskClockLabel(8.5), '오전 8:30')
  assert.equal(deskClockLabel(0), '오전 12:00')
  assert.equal(deskPhaseAt(22), '밤')
  assert.equal(deskPhaseAt(12), '한낮')
})

test('창 크기 · 각도는 시각마다 달라지지 않는다 (자리 · 세기 · 색만 변한다)', async () => {
  const { deskLightAt } = await load()
  for (const h of [0, 6, 12, 18, 22]) {
    const keys = Object.keys(deskLightAt(h))
    assert.ok(!keys.includes('scale') && !keys.includes('rotate') && !keys.includes('tone') && !keys.includes('leaf'))
  }
})

test('하루 종일 빛이 보인다 (19시 45분에도 사라지지 않는다)', async () => {
  const { deskLightAt } = await load()
  for (let h = 0; h < 24; h += 0.25) assert.ok(deskLightAt(h).opacity >= 0.3, `${h}h opacity ${deskLightAt(h).opacity}`)
  assert.ok(deskLightAt(19.75).opacity >= 0.4)
})

test('새벽 · 아침은 8시와 같은 자리에 놓인다 (세기와 색만 달라진다)', async () => {
  const { deskLightAt } = await load()
  for (const h of [6.5, 7, 7.5]) {
    assert.equal(deskLightAt(h).x, deskLightAt(8).x)
    assert.equal(deskLightAt(h).y, deskLightAt(8).y)
  }
  assert.ok(deskLightAt(7).opacity < deskLightAt(8).opacity)
})
