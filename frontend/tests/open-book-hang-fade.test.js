import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('637: 세로 태블릿 펼쳐서에서 왼쪽으로 걸친 면은 바탕색으로 흐려지며 사라진다(폰 · 가로 태블릿 제외)', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /import \{ Defs, LinearGradient, Rect, Stop \} from 'react-native-svg'/)
  assert.match(shelf, /stopColor=\{C\.canvas\} stopOpacity="1"/)
  assert.match(shelf, /stopColor=\{C\.canvas\} stopOpacity="0"/)
  assert.match(shelf, /\{upright && !compact && layout && sizes\[index\] && !\(current\?\.spread && current\.spread\.latest % 2 === 0\) && <HangFade/)
  // 덮개는 화살표보다 먼저 그려 화살표가 그 위에 보인다
  assert.ok(shelf.indexOf('<HangFade width') < shelf.indexOf('{!compact && arrows}'))
  // 높이 맞춤 값은 그대로
  assert.match(shelf, /const SWIPE_CENTER_UP = 79;/)
  assert.match(shelf, /const PHONE_SWIPE_CENTER_UP = 49;/)
  assert.match(shelf, /hangFade: \{ position: 'absolute', left: 0, top: 0, bottom: 0 \}/)
})

test('637: 캡션은 가운데 면의 실제 왼쪽 끝에 맞춘다', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /const captionLeft = peek == null \? 0 : board\.side \+ \(spread && spread\.latest % 2 === 0 \? 0 : leaf\.width\)/)
})

test('636: 프로필 수정 창의 표지는 보관함 다이어리의 방향 · 표지 설정을 이어 받는다', () => {
  const hub = read('../src/sharing/SharingHub.js')
  assert.match(hub, /cover: diary\.cover \?\? request\.diary\.cover, pageSize: request\.diary\.pageSize, templateConfig: request\.diary\.templateConfig/)
})
