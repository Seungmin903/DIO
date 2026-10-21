import test from 'node:test'
import assert from 'node:assert/strict'
import { createText, textPatch, textLayoutKey, fitTextHeightPatch } from '../src/editor/utils/text.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

test('실측 높이 보정은 사용자 여백을 보존하고 내용 부족만 보완한다', () => {
  const object = createText({ id: 'text', x: 20, y: 40, text: '두 줄\n텍스트' })
  assert.deepEqual(fitTextHeightPatch({ ...object, h: 10 }, 76), { h: 76 })
  assert.equal(fitTextHeightPatch({ ...object, h: 120 }, 76), null)
  const restored = JSON.parse(JSON.stringify({ ...object, h: 120 }))
  assert.equal(fitTextHeightPatch(restored, 76), null)
  for (const value of [NaN, Infinity, -1, 0]) assert.equal(fitTextHeightPatch(object, value), null)
  assert.equal(fitTextHeightPatch({ ...object, type: 'photo' }, 100), null)
})

test('이전 내용·폭·글꼴의 측정은 재사용하지 않고 위치·상자 높이만 달라지면 재사용한다', () => {
  const object = createText({ id: 'text', x: 20, y: 40, text: 'Dynamic\n한글' })
  const key = textLayoutKey(object)
  for (const patch of [{ text: '변경' }, { w: 100 }, { baseWidth: 100 }, { font: 'serif' }, { fontSize: 40 }, { lineSpacing: 2 }, { styleRanges: [{ start: 0, end: 2, fontSize: 50 }] }]) {
    assert.notEqual(textLayoutKey({ ...object, ...patch }), key)
  }
  assert.equal(textLayoutKey({ ...object, x: 80, y: 70, h: 200, rotation: 90 }), key)
})

test('한글·자모·줄바꿈·공백·이모지를 변경하지 않고 저장하고 재편집한다', () => {
  const value = '한글 조합 ㄱㅏ\n둘째 줄 👩‍💻  '
  const first = createText({ id: 'text', x: 20, y: 40, text: value })
  const restored = JSON.parse(JSON.stringify(first))
  assert.equal(restored.text, value)
  const edited = { ...restored, ...textPatch('한글 수정\n삭제 후 입력', restored.baseWidth) }
  assert.equal(edited.text, '한글 수정\n삭제 후 입력')
  assert.equal(first.text, value)
  assert.equal(edited.x, 20)
  assert.ok(edited.h >= 76)
})

test('여러 줄·빈 줄과 긴 문장의 영역을 확보하고 출력 스냅샷에서 문자열을 보존한다', () => {
  const object = createText({ id: 'a', x: 0, y: 0, text: '첫줄\r\n\r\n끝줄' })
  assert.equal(object.text, '첫줄\n\n끝줄')
  assert.equal(object.h, 114)
  assert.ok(textPatch('가'.repeat(40)).h > 38)
  const snapshot = createExportSnapshot({ id: 'p', objects: [object] })
  object.text = '바뀜'
  assert.equal(snapshot.objects[0].text, '첫줄\n\n끝줄')
  assert.throws(() => createExportSnapshot({ objects: [{ ...object, text: null }] }), { code: 'EXPORT_GEOMETRY_INVALID' })
})
