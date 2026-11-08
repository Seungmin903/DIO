import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nearestBook, rowOf } from '../src/diary/utils/bookRow.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('683: 스와이프처럼 한 번에 한 권 — 다이어리마다 화면 폭 한 칸 가운데, 옆 다이어리는 화면 밖(폰 · 태블릿)', () => {
  // 가로 태블릿(양면): 폭 1000, 반쪽 300 · 200
  const wide = rowOf([{ half: 300 }, { half: 200 }], 1000, false)
  assert.deepEqual(wide.offsets, [0, 1000])
  assert.deepEqual(wide.lefts, [200, 1000 + 300])
  assert.equal(wide.content, 2000)
  // 한 면(폰 · 세로 태블릿)
  const one = rowOf([{ half: 300 }, { half: 250 }], 360, true)
  assert.deepEqual(one.lefts, [30, 360 + 55])
  // 첫 권이 가운데일 때 다음 권 왼쪽 끝은 화면 오른쪽 끝 밖
  assert.ok(one.lefts[1] - one.offsets[0] >= 360)
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /rowOf\(sizes, layout\.width, single\)/)
})

test('683: 놓은 자리에서 가장 가까운 다이어리를 고른다', () => {
  assert.equal(nearestBook([0, 400, 800], 190), 0)
  assert.equal(nearestBook([0, 400, 800], 210), 1)
  assert.equal(nearestBook([0, 400, 800], 5000), 2)
})

test('683: 펼쳐서는 가로 스크롤 + 책마다 가운데 맞춤 스냅, 화면 근처만 그리고 앞뒤를 미리 읽는다', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.doesNotMatch(shelf, /PanResponder|ClosedBook/)
  assert.match(shelf, /<Animated\.ScrollView ref=\{scrollRef\} horizontal/)
  assert.match(shelf, /snapToOffsets=\{row\.offsets\} snapToStart=\{false\} snapToEnd=\{false\} decelerationRate="fast" disableIntervalMomentum/)
  assert.match(shelf, /Math\.abs\(at - near\) <= AHEAD \|\| Math\.abs\(at - index\) <= 1/)
  assert.match(shelf, /preloadOpenBooks\(diaries, near, AHEAD\)/)
  // 화살표 · 옆 책은 부드럽게 흘러간 뒤 가운데 다이어리를 바꾼다
  assert.match(shelf, /scrollTo\?\.\(\{ x: row\.offsets\[at\], animated: true \}\)/)
  assert.match(shelf, /if \(at === index\) onOpen\(diary\); else goRef\.current\(at\)/)
})

test('683: 펼친 다이어리 테두리는 스와이프 표지 프레임과 같다(가운데 흰 3px · 옆 라벤더 2px), 별 · ⋯ 는 가운데만', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /active \? s\.coverFrameActive : s\.coverFrameIdle, ringBox\(active \? 3 : 2,/)
  assert.match(shelf, /\{active && <View style=\{styles\.captionTools\}>/)
  // 화면 밖 옆 다이어리는 스크린리더에서 숨긴다
  assert.match(shelf, /accessibilityElementsHidden=\{!active\} importantForAccessibility=\{active \? 'auto' : 'no-hide-descendants'\}/)
  // 처음엔 정한 자리로 옮긴 뒤 보인다(안드로이드 contentOffset 무시 → 첫 다이어리로 돌아가던 문제)
  assert.match(shelf, /const scrollX = useRef\(0\);/)
  assert.match(shelf, /if \(placing\.current != null\) return;/)
  assert.match(shelf, /captionTools: \{ flexDirection: 'row', alignItems: 'center', marginTop: -10, marginRight: -9 \}/)
  assert.match(shelf, /captionTool: \{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' \}/)
  assert.equal((shelf.match(/hitSlop=\{4\} style=\{styles\.captionTool\}/g) || []).length, 2)
})

test('683: 스와이프 별(폰 · 태블릿)은 표지 크기에 맞춰 안쪽으로(한눈에와 같은 비율)', () => {
  const styles = read('../src/diary/styles.js')
  assert.match(styles, /cardFavoriteCarousel: \{ top: 18, right: 18 \}/)
  assert.match(styles, /cardFavoriteCarouselLarge: \{ top: 24, right: 24 \}/)
  const card = read('../src/diary/components/DiaryCard.js')
  assert.match(styles, /cardFavoriteCarouselCompact: \{ top: 14, right: 14 \}/)
  assert.match(card, /layout === 'carousel' && \(compact \? s\.cardFavoriteCarouselCompact : large \? s\.cardFavoriteCarouselLarge : s\.cardFavoriteCarousel\)/)
})

test('683: 넘기는 동안의 움직임은 스와이프 카드와 같다(옆은 작아지고 내려감), 멈춘 가운데 다이어리는 원래 크기 · 자리', async () => {
  const { CAROUSEL_SCALE, CAROUSEL_LIFT, OPEN_BOOK_SCALE, OPEN_BOOK_LIFT } = await import('../src/diary/utils/carouselFollow.js')
  assert.equal(OPEN_BOOK_SCALE[1], 1)
  assert.equal(OPEN_BOOK_LIFT[1], 0)
  // 옆 : 가운데 크기 비율과 높이 차이가 스와이프와 같다
  assert.equal(OPEN_BOOK_SCALE[0], CAROUSEL_SCALE[0] / CAROUSEL_SCALE[1])
  assert.equal(OPEN_BOOK_LIFT[0], CAROUSEL_LIFT[0] - CAROUSEL_LIFT[1])
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /carouselMotion\(scrollValue, at, step \|\| 1, OPEN_BOOK_SCALE, OPEN_BOOK_LIFT\)/)
  assert.match(shelf, /useNativeDriver: true/)
  const screen = read('../src/diary/screens/LibraryScreen.js')
  assert.match(screen, /import \{ carouselMotion \} from '\.\.\/utils\/carouselFollow'/)
  assert.doesNotMatch(screen, /function carouselMotion/)
})

test('683: 한 번에 한 권이라 다이어리마다 가운데를 좌우 화살표 가운데 높이에 맞춘다', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /const middle = layout \? layout\.base - tallest \/ 2 : 0;/)
  assert.match(shelf, /top=\{Math\.round\(middle - sizes\[at\]\.height \/ 2\)\}/)
  assert.match(shelf, /top: lift \+ middle - 24/)
})
