import test from 'node:test'
import assert from 'node:assert/strict'
import { inputArrivalArea } from '../qa/input-arrival.js'

test('최초 도착 지점은 입력·글상자·버튼·캔버스·바깥을 구분하고 문자열을 노출하지 않는다', () => {
  const target = matches => ({ closest: selector => matches.includes(selector) ? {} : null })
  assert.equal(inputArrivalArea(target(['[aria-label="펜 입력 영역"]', '[aria-label$=" 캔버스"]'])), 'pen-input')
  assert.equal(inputArrivalArea(target(['[aria-label="지우개 입력 영역"]'])), 'eraser-input')
  assert.equal(inputArrivalArea(target(['[role="button"],button'])), 'control')
  assert.equal(inputArrivalArea(target(['input,textarea,[contenteditable]:not([contenteditable="false"])'])), 'editable')
  assert.equal(inputArrivalArea(target(['[aria-label$=" 캔버스"]'])), 'canvas-other')
  assert.equal(inputArrivalArea(target([])), 'outside-canvas')
  assert.equal(inputArrivalArea(null), 'unknown')
})
