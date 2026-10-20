import test from 'node:test'
import assert from 'node:assert/strict'
import { createText, textPatch } from '../src/editor/utils/text.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

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
