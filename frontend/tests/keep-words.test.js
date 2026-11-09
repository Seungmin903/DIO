import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keepKoreanWords } from '../src/shared/keepWords.js'

const WJ = '\u2060'
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('655: 안드로이드는 낱말 안 글자 사이에만 단어 결합자를 넣고 띄어쓰기는 그대로 둔다', () => {
  assert.equal(keepKoreanWords('작성한 내용', 'android'), ['작', '성', '한'].join(WJ) + ' ' + ['내', '용'].join(WJ))
  // 한글에 붙은 문장 부호 · 영문 · 숫자도 같은 낱말로 묶는다
  assert.equal(keepKoreanWords('PNG를 2권.', 'android'), `PNG${WJ}를 2${WJ}권${WJ}.`)
  assert.equal(keepKoreanWords('남고\n기존', 'android'), `남${WJ}고\n기${WJ}존`)
  assert.equal(keepKoreanWords('a b', 'android'), 'a b')
})

test('655: 확인창(가운뎃점 옵션 없음)은 · 앞뒤도 붙여 둔다', () => {
  assert.equal(keepKoreanWords('양도·제외', 'android'), `양${WJ}도${WJ}·${WJ}제${WJ}외`)
})

test('655: iOS · 웹과 문자열이 아닌 값은 그대로 둔다', () => {
  assert.equal(keepKoreanWords('작성한 내용', 'ios'), '작성한 내용')
  assert.equal(keepKoreanWords('작성한 내용', 'web'), '작성한 내용')
  assert.equal(keepKoreanWords(undefined, 'android'), undefined)
})

test('655: 공용 확인창은 제목 · 설명 모두 낱말 단위로 줄을 바꾼다', () => {
  const src = read('src/editor/components/controls/ConfirmDialog.js')
  assert.match(src, /lineBreakStrategyIOS="hangul-word"[^>]*style=\{styles\.title\}>\{keepKoreanWords\(title, Platform\.OS\)\}/)
  assert.match(src, /lineBreakStrategyIOS="hangul-word"[^>]*style=\{styles\.message\}>\{keepKoreanWords\(message, Platform\.OS\)\}/)
  assert.match(src, /title: \{[^}]*wordBreak: 'keep-all'/)
})

test('655: 확인창은 안드로이드에서 화면 읽기용 원문을 따로 준다(결합자 없이 읽게)', () => {
  const src = read('src/editor/components/controls/ConfirmDialog.js')
  assert.match(src, /accessibilityLabel=\{Platform\.OS === 'android' && typeof title === 'string' \? title : undefined\}/)
  assert.match(src, /accessibilityLabel=\{Platform\.OS === 'android' && typeof message === 'string' \? message : undefined\}/)
})
