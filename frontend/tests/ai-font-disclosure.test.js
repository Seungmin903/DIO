import test from 'node:test'
import assert from 'node:assert/strict'
import { isAiHandwritingFont, AI_FONT_LABEL, AI_FONT_INPUT_NOTICE } from '../src/handwriting/aiDisclosure.js'
import { registerPersonalTextFonts, getTextFonts } from '../src/editor/utils/text.js'

test('생성 작업 또는 검증된 DIO 형식만 AI 폰트로 구분하고 외부·미확인 폰트는 표시하지 않는다', () => {
  assert.equal(isAiHandwritingFont(null), false)
  assert.equal(isAiHandwritingFont({ personal: true }), false)
  assert.equal(isAiHandwritingFont({ spacingSupported: false }), false)
  assert.equal(isAiHandwritingFont({ sourceJob: 'native-job' }), true)
  assert.equal(isAiHandwritingFont({ spacingSupported: true }), true)
  const id = 'personal-11111111-2222-4333-8444-555555555555'
  const font = { id, family: 'DIOHW_11111111222243338444555555555555', label: '시험 폰트', sourceJob: 'job' }
  try {
    registerPersonalTextFonts([font])
    assert.equal(getTextFonts().find(f => f.id === id).aiGenerated, true)
    registerPersonalTextFonts([{ ...font, sourceJob: undefined }])
    assert.equal(getTextFonts().find(f => f.id === id).aiGenerated, false)
  } finally { registerPersonalTextFonts([]) }
  assert.equal(AI_FONT_LABEL, 'AI 생성 손글씨 폰트')
  assert.equal(AI_FONT_INPUT_NOTICE, '입력한 손글씨를 바탕으로 AI가 나머지 글자를 생성해요.')
})
