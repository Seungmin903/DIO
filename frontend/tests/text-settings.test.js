import test from 'node:test'
import assert from 'node:assert/strict'
import { createText, textSettings, textStyle, textFormatPatch, DEFAULT_TEXT_SETTINGS } from '../src/editor/utils/text.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

test('서식 없는 이전 텍스트는 28을 유지하고 새 텍스트는 설정을 복사한다', () => {
  const old = createText({ id: 'old', x: 0, y: 0, text: '한글' })
  assert.equal(textSettings(old).fontSize, 28)
  const settings = { ...DEFAULT_TEXT_SETTINGS, font: 'serif', fontSize: 24, color: '#DD887A' }
  const next = createText({ id: 'new', x: 0, y: 0, width: 200, text: '한글\n둘째 줄', ...settings })
  settings.fontSize = 60
  assert.equal(next.fontSize, 24)
  assert.equal(next.baseWidth, 200)
  assert.equal(old.fontSize, undefined)
})

test('전체 서식 변경은 문자열·위치·너비를 보존하며 리사이즈된 요소 높이를 계산한다', () => {
  const original = createText({ id: 't', x: 50, y: 30, text: '한글\n둘째 줄' })
  const resized = { ...original, w: original.w * 2 }
  const settings = { ...DEFAULT_TEXT_SETTINGS, font: 'mono', fontSize: 36, bold: true, italic: true, underline: true, textAlign: 'center' }
  const patch = textFormatPatch(resized, settings)
  assert.equal(patch.text, original.text)
  assert.equal(patch.x, undefined)
  assert.equal(patch.w, undefined)
  const style = textStyle({ ...resized, ...patch }, 2)
  assert.equal(style.fontSize, 72)
  assert.equal(style.fontFamily, 'monospace')
  assert.equal(style.textDecorationLine, 'underline')
  assert.equal(style.fontWeight, '700')
  assert.equal(style.fontStyle, 'italic')
  assert.equal(style.textAlign, 'center')
  assert.ok(patch.h > original.h)
})

test('출력 스냅샷은 전체 서식을 보존하고 잘못된 크기·글꼴·정렬을 거부한다', () => {
  const object = createText({ id: 't', x: 0, y: 0, text: '출력', ...DEFAULT_TEXT_SETTINGS })
  const snapshot = createExportSnapshot({ id: 'p', objects: [object] })
  assert.equal(snapshot.objects[0].fontSize, 18)
  for (const patch of [{ fontSize: NaN }, { fontSize: 0 }, { font: 'missing' }, { textAlign: 'invalid' }]) {
    assert.throws(() => createExportSnapshot({ objects: [{ ...object, ...patch }] }), { code: 'EXPORT_GEOMETRY_INVALID' })
  }
})
