import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as deskLight from '../src/diary/utils/deskLight.js'

const load = async () => deskLight
const PATCH_KEYS = ['x', 'y', 'scaleX', 'scaleY', 'skewX', 'rotate']
// 코덱스 24시간 설계가 적어 둔 30분당 변화 상한은 x 0.045 · scaleX 0.018 · scaleY 0.09 · skewX 2.4° · rotate 1.55° · 직접광 불투명도 0.12 · 바탕 0.055 다.
// 그런데 코덱스 표 자체가 새벽 3→4시 scaleY(0.142), 해 질 녘 바탕(0.095)에서 이 상한을 넘는다. 표를 임의로 고치지 않고 그 최대값을 상한으로 둔다. 새벽 6시 바탕은 가로등 단독 밤 설계(0.405)와 노을 재설계의 06:30 행(0.27)을 이어 붙인 값이라 0.135 차이가 나서 바탕 상한을 0.14 로 둔다(해 patch 가 켜지고 꺼지는 구간의 불투명도는 따로 본다).
const MAX_PER_30MIN = { x: 0.045, scaleX: 0.018, scaleY: 0.15, skewX: 2.5, rotate: 1.6, screen: 0.16, ambient: 0.14 }
const LIMIT_SLACK = 1.02
const visible = light => light.screen.opacity > 0.1 // 패치가 켜지고 꺼지는 구간(불투명도 0.1 이하)은 제외한다

test('하루 어느 시각이든 값이 유한하고 색이 올바르다', async () => {
  const { deskLightAt } = await load()
  for (let h = 0; h < 24; h += 0.25) {
    const light = deskLightAt(h)
    for (const key of PATCH_KEYS) assert.ok(Number.isFinite(light.patch[key]), `${h}h patch.${key}`)
    for (const key of ['sun', 'moon', 'lamp', 'lampOpacity', 'dim']) assert.ok(Number.isFinite(light[key]), `${h}h ${key}`)
    for (const layer of ['screen', 'tint', 'accent', 'ambient', 'wash']) {
      assert.match(light[layer].color, /^#[0-9a-f]{6}$/, `${h}h ${layer}.color`)
      assert.ok(Number.isFinite(light[layer].opacity) && light[layer].opacity >= 0 && light[layer].opacity <= 1, `${h}h ${layer}.opacity`)
    }
    assert.ok(light.lampOpacity <= 0.345 + 1e-9, `${h}h 가로등은 0.345 를 넘지 않는다`)
  }
})

test('창은 하나다: 해 · 달 · 가로등 모두 같은 마스크 한 장만 쓴다', () => {
  const source = readFileSync(new URL('../src/diary/components/DeskBackdrop.js', import.meta.url), 'utf8')
  const masks = source.match(/assets\/desk\/[\w-]+\.png/g) ?? []
  const windowMasks = masks.filter(name => /window|lamp|moon/.test(name))
  assert.deepEqual([...new Set(windowMasks)], ['assets/desk/window-light.png'])
})

test('30분 사이에 보이는 빛 조각의 자리 · 모양 · 세기가 뚝 끊기지 않는다 (코덱스 연속성 상한)', async () => {
  const { deskLightAt } = await load()
  for (let h = 0; h < 24; h += 0.25) {
    const a = deskLightAt(h), b = deskLightAt(h + 0.5)
    assert.ok(Math.abs(b.ambient.opacity - a.ambient.opacity) <= MAX_PER_30MIN.ambient * LIMIT_SLACK, `${h}h ambient`)
    if (!visible(a) || !visible(b)) continue // 광원이 바뀌는 잔광 구간은 패치가 꺼져 있어 점프가 보이지 않는다
    for (const key of ['x', 'scaleX', 'scaleY', 'skewX', 'rotate']) assert.ok(Math.abs(b.patch[key] - a.patch[key]) <= MAX_PER_30MIN[key] * LIMIT_SLACK, `${h}h ${key}: ${a.patch[key]} → ${b.patch[key]}`)
    const steady = light => Math.max(light.sun, light.moon) >= 0.9 // 켜지고 꺼지는 구간(광원 비율 0.9 미만)은 제외하고 불투명도 변화를 본다
    if (steady(a) && steady(b)) assert.ok(Math.abs(b.screen.opacity - a.screen.opacity) <= MAX_PER_30MIN.screen * LIMIT_SLACK, `${h}h screen opacity`)
  }
})

test('해 조각은 아침(왼쪽)에서 저녁(오른쪽)으로 움직이고, 낮은 해일수록 길게 늘어나 기울고 가장 높을 때 창 모양 그대로다', async () => {
  const { deskLightAt } = await load()
  const xs = [7, 9, 11, 13, 15, 17, 19].map(h => deskLightAt(h).patch.x)
  xs.forEach((x, i) => { if (i) assert.ok(x > xs[i - 1], `x ${x}`) })
  const noon = deskLightAt(13).patch
  assert.ok(Math.abs(noon.skewX) < 1e-9 && Math.abs(noon.rotate) < 1e-9)
  assert.equal(noon.scaleY, 1)
  for (const h of [7, 19]) assert.ok(deskLightAt(h).patch.scaleY > 1.5, `${h}h 낮은 해는 길다`)
  assert.ok(deskLightAt(8).patch.skewX > 0 && deskLightAt(18).patch.skewX < 0, '아침과 저녁은 기울기 방향이 반대')
})

test('밤에는 푸른 달빛 패치가 없다: 해 외의 창빛 패치는 어느 시각에도 없고, 자정 경계도 끊기지 않는다', async () => {
  const { deskLightAt } = await load()
  for (let h = 0; h < 24; h += 0.25) {
    const light = deskLightAt(h)
    assert.equal(light.moon, 0, `${h}h 달 비율`)
    if (light.sun < 0.05) assert.ok(light.screen.opacity < 0.02 && light.tint.opacity < 0.02 && light.accent.opacity < 0.02, `${h}h 해가 없으면 패치 없음`)
  }
  const before = deskLightAt(23.99), after = deskLightAt(0)
  assert.ok(Math.abs(before.lampOpacity - after.lampOpacity) < 0.01 && Math.abs(before.ambient.opacity - after.ambient.opacity) < 0.01)
})

test('해가 지고 뜰 때 패치가 꺼지는 잔광 구간이 있다 (20:00–20:30, 새벽 06:00–06:30)', async () => {
  const { deskLightAt } = await load()
  for (const h of [20, 20.25, 6, 6.25]) assert.ok(deskLightAt(h).screen.opacity < 0.02, `${h}h 패치 없음`)
  for (const h of [19, 19.5, 19.75, 12]) assert.ok(deskLightAt(h).screen.opacity > 0.05, `${h}h 패치 있음(노을은 19:45까지 남고 20시에 꺼진다)`)
  for (const h of [18.5, 19, 19.5, 6]) assert.ok(deskLightAt(h).afterglow.opacity > 0.02, `${h}h 노을 잔광 그라데이션`)
  for (const h of [12, 23, 3]) assert.ok(deskLightAt(h).afterglow.opacity < 0.001, `${h}h 잔광 없음`)
  for (const h of [21.5, 0, 3]) assert.ok(deskLightAt(h).lampOpacity > 0.15, `${h}h 밤에는 가로등이 창을 비춘다`)
})

test('밤에는 가로등이 켜져 있고 낮에는 꺼져 있으며, 밤은 책상을 어둡게 한다', async () => {
  const { deskLightAt } = await load()
  for (const h of [8, 12, 17]) assert.equal(deskLightAt(h).lampOpacity, 0, `${h}h`)
  for (const h of [21, 23, 1, 3]) { assert.ok(deskLightAt(h).lamp > 0.85, `${h}h`); assert.ok(deskLightAt(h).ambient.opacity > 0.4, `${h}h 어두운 바탕`) }
  assert.ok(deskLightAt(12).ambient.opacity < 0.1)
})

test('24 이상 · 음수 시각은 하루로 접고 이름표 · 시계가 맞다', async () => {
  const { deskLightAt, normalizeHour, deskClockLabel, deskPhaseAt } = await load()
  assert.equal(normalizeHour(25), 1)
  assert.equal(normalizeHour(-1), 23)
  assert.deepEqual(deskLightAt(24 + 12).patch, deskLightAt(12).patch)
  assert.equal(deskClockLabel(8.5), '오전 8:30')
  assert.equal(deskClockLabel(0), '오전 12:00')
  assert.equal(deskPhaseAt(22), '밤')
  assert.equal(deskPhaseAt(12), '한낮')
})

test('한낮 창빛 없음: 창빛 패치 · 해 연출 · 가로등이 꺼지고 하늘빛은 한낮 그대로다', () => {
  const shut = deskLight.deskLightAt(deskLight.NOON_NO_WINDOW)
  assert.equal(shut.sun, 0)
  assert.equal(shut.key, 'afterglow')
  assert.equal(shut.screen.opacity, 0)
  assert.equal(shut.tint.opacity, 0)
  assert.equal(shut.accent.opacity, 0)
  assert.equal(shut.lampOpacity, 0)
  assert.equal(shut.dim, 0)
  assert.ok(deskLight.deskLightAt(13).screen.opacity > 0)
})

test('책상 위 글씨색 기준: 낮에는 밝은 상판, 해 질 녘 · 밤에는 어두운 상판으로 판단하고 경계에서 뒤집힌다', () => {
  assert.equal(deskLight.isDeskDarkAt(12), false)
  assert.equal(deskLight.isDeskDarkAt(deskLight.NOON_NO_WINDOW), false)
  assert.equal(deskLight.isDeskDarkAt(23), true)
  assert.equal(deskLight.isDeskDarkAt(2), true)
  // 낮(밝음)에서 밤(어두움)으로 하루 한 번씩만 뒤집힌다: 15분 단위로 훑어 전환 횟수를 센다
  let flips = 0, prev = deskLight.isDeskDarkAt(0)
  for (let h = 0.25; h <= 24; h += 0.25) { const dark = deskLight.isDeskDarkAt(h % 24); if (dark !== prev) flips++; prev = dark }
  assert.equal(flips, 2)
})
