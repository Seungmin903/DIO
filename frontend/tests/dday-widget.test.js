import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, ddayDateText, createDdayWidget, daysUntil, ddayCaption, ddayText, isDdayAlertDay, monthShift, normalizeWidget, parseDateKey, WIDGET_ITEMS } from '../src/editor/widgets/dday.js'

const today = { y: 2026, m: 10, d: 31 }

test('남은 날을 오늘 기준 달력 날짜로 센다', () => {
  assert.equal(daysUntil('2026-12-07', today), 37)
  assert.equal(daysUntil('2026-10-31', today), 0)
  assert.equal(daysUntil('2026-10-28', today), -3)
  assert.equal(daysUntil('2027-10-31', today), 365)
})
test('서머타임이 있는 달을 지나도 하루가 어긋나지 않는다', () => {
  assert.equal(daysUntil('2026-11-02', { y: 2026, m: 10, d: 31 }), 2)
  assert.equal(daysUntil('2026-03-30', { y: 2026, m: 3, d: 28 }), 2)
})
test('올바르지 않은 날짜는 null 이고 글자는 D-? 로 나온다', () => {
  for (const value of [undefined, '', '2026-02-30', '26-1-1', '2026/10/31']) assert.equal(daysUntil(value, today), null)
  assert.equal(ddayText(null), 'D-?')
})
test('글자: 앞날 D-n, 당일 D-DAY, 지난 날 D+n', () => {
  assert.deepEqual([37, 7, 1, 0, -1, -30].map(ddayText), ['D-37', 'D-7', 'D-1', 'D-DAY', 'D+1', 'D+30'])
})
test('알림은 7일 전 · 1일 전 · 당일만', () => {
  assert.deepEqual([8, 7, 6, 2, 1, 0, -1].filter(isDdayAlertDay), [7, 1, 0])
})
test('티켓 아랫줄은 이름 · 월.일 요일', () => {
  assert.equal(ddayCaption({ title: '콘서트', date: '2026-11-01' }), '콘서트 · 11.1 SUN')
  assert.equal(ddayCaption({ title: '', date: '2026-11-01' }), '11.1 SUN')
})
test('도장 아랫줄은 YYYY.MM.DD', () => {
  assert.equal(ddayDateText('2026-11-29'), '2026.11.29')
  assert.equal(ddayDateText('2026-02-30'), '')
})
test('날짜 옮기기: 일은 달력대로, 월은 짧은 달 끝날로 맞춘다', () => {
  assert.deepEqual(addDays({ y: 2026, m: 1, d: 1 }, -1), { y: 2025, m: 12, d: 31 })
  assert.deepEqual(monthShift({ y: 2026, m: 1, d: 31 }, 1), { y: 2026, m: 2, d: 28 })
  assert.deepEqual(monthShift({ y: 2026, m: 1, d: 15 }, -1), { y: 2025, m: 12, d: 15 })
  assert.deepEqual(monthShift({ y: 2024, m: 2, d: 29 }, 12), { y: 2025, m: 2, d: 28 })
})
test('새 위젯은 30일 뒤 날짜로 시작하고 모양은 세 가지다', () => {
  assert.deepEqual(createDdayWidget('ticket', today), { kind: 'dday', style: 'ticket', title: '', date: '2026-11-30' })
  assert.equal(createDdayWidget('nope', today).style, 'label')
  assert.deepEqual(WIDGET_ITEMS.map((item) => item.style), ['label', 'ticket', 'stamp'])
})
test('저장된 값을 읽을 때 종류가 다르면 버리고 이름은 14자로 자른다', () => {
  assert.equal(normalizeWidget({ kind: 'other' }), null)
  assert.equal(normalizeWidget(undefined), null)
  assert.equal(normalizeWidget({ kind: 'dday', style: 'x', title: '가'.repeat(20), date: '2026-12-01' }).title.length, 14)
  assert.deepEqual(parseDateKey('2026-12-01'), { y: 2026, m: 12, d: 1 })
})
