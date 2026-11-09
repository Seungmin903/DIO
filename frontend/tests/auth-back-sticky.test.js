import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('702: 폰 가입 화면의 이전 버튼은 스크롤 밖 머리줄이고, 태블릿은 카드 안 그대로', () => {
  const src = read('src/auth/AuthScreen.js')
  assert.match(src, /const\s+stickyBack\s*=\s*isPhone\s*&&\s*hasBack/)
  // 폰: 머리줄이 ScrollView 바로 앞(형제)에 있어 스크롤과 함께 움직이지 않는다
  assert.match(src, /\{\s*stickyBack\s*&&\s*<View\s+style=\{\s*s\.phoneBackBar\s*\}>\s*\{\s*backButton\s*\}\s*<\/View>\s*\}\s*<ScrollView/)
  // 태블릿: 카드 안 처음 자리 그대로
  assert.match(src, /\{\s*hasBack\s*&&\s*!stickyBack\s*&&\s*backButton\s*\}/)
  // 머리줄도 SafeAreaView 안이라 상단 안전 영역 아래에서 시작한다
  const bar = src.indexOf('s.phoneBackBar}>')
  const safeAt = src.lastIndexOf('<SafeAreaView', bar)
  assert.ok(safeAt > 0 && src.indexOf('</SafeAreaView>', bar) > bar)
  const styles = read('src/auth/styles.js')
  assert.match(styles, /phoneBackBar:\s*\{[^}]*backgroundColor:\s*c\.surface/)
  assert.match(styles, /phoneCardBelowBack:\s*\{\s*paddingTop:\s*20\s*\}/)
})
