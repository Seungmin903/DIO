import test from 'node:test'
import assert from 'node:assert/strict'
import { colorTextRange, remapTextRanges, textSegments } from '../src/editor/utils/textRanges.js'
import { createText } from '../src/editor/utils/text.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const red = '#DD887A', blue = '#A3C5F0'
test('색상 경계 삽입은 왼쪽 글자를 따르고 문서 맨 앞만 오른쪽 색을 따른다', () => {
  assert.deepEqual(remapTextRanges('abcdeRED', 'abcdeXRED', [{ start: 5, end: 8, color: red }]), [{ start: 6, end: 9, color: red }])
  assert.deepEqual(remapTextRanges('REDabc', 'XREDabc', [{ start: 0, end: 3, color: red }]), [{ start: 0, end: 4, color: red }])
  assert.deepEqual(remapTextRanges('abCD', 'abXCD', [{ start: 0, end: 2, color: blue }, { start: 2, end: 4, color: red }]), [{ start: 0, end: 3, color: blue }, { start: 3, end: 5, color: red }])
  assert.deepEqual(remapTextRanges('REDabc', 'REDXabc', [{ start: 0, end: 3, color: red }]), [{ start: 0, end: 4, color: red }])
})

test('범위 내부·줄바꿈·이모지 뒤 삽입 및 선택 교체의 색상은 보존한다', () => {
  assert.deepEqual(remapTextRanges('RED', 'RXED', [{ start: 0, end: 3, color: red }]), [{ start: 0, end: 4, color: red }])
  assert.deepEqual(remapTextRanges('aRED', 'a\nRED', [{ start: 1, end: 4, color: red }]), [{ start: 2, end: 5, color: red }])
  assert.deepEqual(remapTextRanges('😀RED', '😀XRED', [{ start: 0, end: 2, color: blue }, { start: 2, end: 5, color: red }]), [{ start: 0, end: 3, color: blue }, { start: 3, end: 6, color: red }])
  assert.deepEqual(remapTextRanges('abRED', 'abX', [{ start: 2, end: 5, color: red }]), [{ start: 2, end: 3, color: red }])
})

test('겹친 범위에 새 색상을 적용해도 나머지 문자열 색상과 원본을 보존한다', () => {
  const ranges = [{ start: 0, end: 5, color: red }]
  const next = colorTextRange('가나다라마바', ranges, { start: 1, end: 3 }, blue)
  assert.deepEqual(next, [{ start: 0, end: 1, color: red }, { start: 1, end: 3, color: blue }, { start: 3, end: 5, color: red }])
  assert.equal(ranges.length, 1)
  assert.equal(textSegments('가나다라마바', next).map((s) => s.text).join(''), '가나다라마바')
})

test('한글 조합·앞 삽입·삭제·줄바꿈 편집 뒤에도 범위를 이동하고 새 문자는 주변 색상을 따른다', () => {
  let text = '안녕\n세상', ranges = [{ start: 3, end: 5, color: blue }]
  for (const next of ['ㄱ안녕\n세상', '가안녕\n세상', '가\n세상', '가\n세상아']) {
    ranges = remapTextRanges(text, next, ranges); text = next
  }
  assert.deepEqual(ranges, [{ start: 2, end: 5, color: blue }])
  assert.deepEqual(remapTextRanges(text, '', ranges), [])
})

test('이모지 UTF-16 경계를 포함하고 빈 선택은 색상을 바꾸지 않는다', () => {
  const text = '가😀나'
  const ranges = colorTextRange(text, [], { start: 2, end: 3 }, red)
  assert.deepEqual(ranges, [{ start: 1, end: 3, color: red }])
  assert.deepEqual(colorTextRange(text, ranges, { start: 0, end: 0 }, blue), ranges)
  assert.deepEqual(remapTextRanges('가😀나', '가😄나', ranges), ranges)
})

test('저장·복원·출력은 범위를 깊게 복사하고 손상된 범위를 거부한다', () => {
  const object = createText({ id: 't', x: 0, y: 0, text: '한글\n색상', colorRanges: [{ start: 3, end: 5, color: red }] })
  const restored = JSON.parse(JSON.stringify(object))
  const snapshot = createExportSnapshot({ id: 'p', objects: [restored] })
  restored.colorRanges[0].color = blue
  assert.equal(snapshot.objects[0].colorRanges[0].color, red)
  for (const colorRanges of [[{ start: 0, end: 99, color: red }], [{ start: 0, end: 2, color: red }, { start: 1, end: 3, color: blue }]]) {
    assert.throws(() => createExportSnapshot({ objects: [{ ...object, colorRanges }] }), { code: 'EXPORT_GEOMETRY_INVALID' })
  }
})
