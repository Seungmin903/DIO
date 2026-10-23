import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTextRange, resizeTextRange, remapTextFormats, safeTextSelection, normalizeTextLink, richTextSegments, resizeTextObject } from '../src/editor/utils/textFormats.js'
import { createText } from '../src/editor/utils/text.js'

test('부분 크기는 선택 범위만 바꾸고 URL과 나머지 크기를 유지한다', () => {
  const ranges = [{ start: 0, end: 4, fontSize: 28, href: 'https://example.com/' }]
  assert.deepEqual(resizeTextRange('가나다라', ranges, { start: 1, end: 3 }, 28, 2), [
    { start: 0, end: 1, fontSize: 28, href: 'https://example.com/' },
    { start: 1, end: 3, fontSize: 30, href: 'https://example.com/' },
    { start: 3, end: 4, fontSize: 28, href: 'https://example.com/' },
  ])
})
test('링크 제거는 크기를 보존하고 URL은 http(s)만 허용한다', () => {
  assert.equal(normalizeTextLink('example.com/test'), 'https://example.com/test')
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.com']) assert.equal(normalizeTextLink(url), null)
  assert.deepEqual(formatTextRange('ab', [{ start: 0, end: 2, fontSize: 30, href: 'https://example.com/' }], { start: 0, end: 2 }, { href: null }), [{ start: 0, end: 2, fontSize: 30 }])
})
test('선택 삭제·새 입력 시 범위를 옮기고 새 글자에는 URL을 상속하지 않는다', () => {
  const ranges = [{ start: 0, end: 4, fontSize: 30, href: 'https://example.com/' }]
  assert.deepEqual(remapTextFormats('abcd', 'ad', ranges), [{ start: 0, end: 2, fontSize: 30, href: 'https://example.com/' }])
  assert.deepEqual(remapTextFormats('abcd', 'abXcd', ranges), [
    { start: 0, end: 2, fontSize: 30, href: 'https://example.com/' }, { start: 2, end: 3, fontSize: 30 }, { start: 3, end: 5, fontSize: 30, href: 'https://example.com/' },
  ])
  assert.deepEqual(safeTextSelection('a😀b', { start: 2, end: 3 }), { start: 1, end: 3 })
})
test('색상과 크기·링크를 합쳐 렌더링하고 전체 크기 변경도 부분 크기를 함께 조정한다', () => {
  assert.deepEqual(richTextSegments('abc', [{ start: 0, end: 2, color: '#DD887A' }], [{ start: 1, end: 3, fontSize: 30 }]), [
    { text: 'a', color: '#DD887A' }, { text: 'b', color: '#DD887A', fontSize: 30 }, { text: 'c', fontSize: 30 },
  ])
  const o = createText({ text: 'abc', fontSize: 28, styleRanges: [{ start: 0, end: 1, fontSize: 30 }] })
  const patch = resizeTextObject(o, 2)
  assert.equal(patch.fontSize, 30); assert.equal(patch.styleRanges[0].fontSize, 32)
})
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'

test('부분 크기·URL은 저장·출력·Undo에 보존되고 손상된 범위는 거부한다', () => {
  const original = createText({ id: 't', x: 0, y: 0, text: '한글', styleRanges: [{ start: 0, end: 1, fontSize: 30, href: 'https://example.com/' }] })
  const restored = JSON.parse(JSON.stringify(original))
  const snapshot = createExportSnapshot({ objects: [restored] })
  restored.styleRanges[0].fontSize = 50
  assert.equal(snapshot.objects[0].styleRanges[0].fontSize, 30)
  const initial = createInitialState({ pages: [{ id: 'p', objects: [original] }] })
  const changed = editorReducer(initial, { type: 'updateObject', id: 't', record: true, patch: resizeTextObject(original, 2) })
  assert.deepEqual(editorReducer(changed, { type: 'undo' }).doc.pages[0].objects[0], original)
  for (const range of [{ start: 0, end: 4, fontSize: 30 }, { start: 0, end: 1, href: 'javascript:alert(1)' }, { start: 0, end: 1, fontSize: 200 }]) {
    assert.throws(() => createExportSnapshot({ objects: [{ ...original, styleRanges: [range] }] }), { code: 'EXPORT_GEOMETRY_INVALID' })
  }
})
