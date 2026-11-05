import test from 'node:test'
import assert from 'node:assert/strict'
import { fontLabel, RETIRED_TEXT_FONTS, TEXT_FONTS, textStyle } from '../src/editor/utils/text.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const text = (font) => ({ id: 't', type: 'text', text: '안녕하세요', font, x: 10, y: 10, w: 200, h: 40, baseWidth: 200, rotation: 0 })

test('글꼴 목록의 모든 글꼴(앱 한국어 글꼴 포함)과 예전 고정폭 글자는 내보낼 수 있다', () => {
  for (const font of [...TEXT_FONTS.map((f) => f.id), ...RETIRED_TEXT_FONTS]) {
    assert.doesNotThrow(() => createExportSnapshot({ id: 'p', objects: [text(font)] }), font)
  }
  assert.throws(() => createExportSnapshot({ id: 'p', objects: [text('없는글꼴')] }))
})

test('기기 글꼴(기본 고딕 · 기본 명조)과 고정폭은 목록에서 빼고 예전 글자는 앱 글꼴로 읽는다', () => {
  assert.ok(!TEXT_FONTS.some((f) => f.id === 'sans' || f.id === 'serif'))
  assert.equal(fontLabel(TEXT_FONTS.find((f) => f.id === 'nanum-gothic'), 'ios'), '나눔고딕')
  assert.equal(fontLabel(TEXT_FONTS.find((f) => f.id === 'poor-story'), 'ios'), '푸어스토리')
  assert.deepEqual(TEXT_FONTS.filter((f) => f.family).map((f) => f.label), ['프리텐다드', '나눔고딕', '나눔명조', '고운돋움', '고운바탕', '마루부리', '나눔손글씨 펜', '푸어스토리'])
  assert.ok(!TEXT_FONTS.some((f) => f.id === 'jua'))
  assert.ok(!TEXT_FONTS.some((f) => f.id === 'mono'))
  // 한글을 일부만 지원하는 검은고딕은 뺐고, 예전 글자는 기본 고딕으로 그린다
  assert.ok(!TEXT_FONTS.some((f) => f.id === 'black-han-sans'))
  assert.equal(textStyle({ font: 'black-han-sans' }, 1, 'android').fontFamily, 'sans-serif')
  // iOS 명조는 한글 명조가 있는 AppleMyungjo
  assert.equal(textStyle({ font: 'serif' }, 1, 'ios').fontFamily, 'AppleMyungjo')
})

test('아직 불러오지 않은 앱 글꼴은 기본 고딕으로 그린다', () => {
  assert.equal(textStyle({ font: 'poor-story' }, 1, 'android').fontFamily, 'sans-serif')
})
