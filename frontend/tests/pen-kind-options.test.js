// 펜 종류마다 고른 옵션이 다른 종류로 새지 않아야 한다(사용자 2026-11-10:
// "불투명도 옵션이 다른 쪽에도 영향 주는데 펜 각각이 각자 옵션 선택한 거 다른 펜에 영향 안 가게 해줘")
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { applyPenKind, DEFAULT_GLASS_INK, penDefaultOpacity, rememberPen, sanitizePenKinds } from '../src/editor/utils/penSettings.js'
import { createStroke } from '../src/editor/utils/strokes.js'

const base = { kind: 'ball', color: '#18224D', width: 2.5, opacity: 1 }

test('불투명도는 종류마다 따로 기억한다 — 한 펜에서 바꿔도 다른 펜은 그대로다', () => {
  const faint = { ...base, opacity: 0.4 }
  const memory = rememberPen({}, faint)
  // 처음 쓰는 종류는 그 종류의 기본값이다(볼펜에서 낮춘 값이 따라오지 않는다)
  const calligraphy = applyPenKind(memory, faint, 'calligraphy')
  assert.equal(calligraphy.opacity, penDefaultOpacity('calligraphy'))
  // 연필은 기본이 따로 있다
  assert.equal(applyPenKind(memory, faint, 'pencil').opacity, penDefaultOpacity('pencil'))
  // 되돌아오면 그 종류가 기억하던 값이 살아난다
  assert.equal(applyPenKind(rememberPen(memory, calligraphy), calligraphy, 'ball').opacity, 0.4)
})

test('색도 종류마다 따로 기억한다 — 한 펜에서 고른 색이 다른 펜을 바꾸지 않는다', () => {
  const red = { ...base, color: '#C0392B' }
  let memory = rememberPen({}, red)
  // 처음 쓰는 종류는 지금 색을 이어받는다(굵기와 같은 규칙)
  const pencil = applyPenKind(memory, red, 'pencil')
  assert.equal(pencil.color, '#C0392B')
  // 연필에서 다른 색을 고른 뒤 볼펜으로 돌아오면 볼펜은 제 색 그대로다
  const blue = { ...pencil, color: '#2E6B9E' }
  memory = rememberPen(memory, blue)
  assert.equal(applyPenKind(memory, blue, 'ball').color, '#C0392B')
  assert.equal(applyPenKind(memory, red, 'pencil').color, '#2E6B9E')
})

test('잉크펜 잉크 옵션은 잉크펜에만 남는다', () => {
  const glass = { ...base, kind: 'glass', inkGlitter: false, inkFilm: 125, inkAmount: 0.5, inkSheen: true, inkSheenColor: null, inkSheenAmount: 1 }
  const memory = rememberPen({}, glass)
  const ball = applyPenKind(memory, glass, 'ball')
  for (const key of Object.keys(DEFAULT_GLASS_INK)) assert.equal(key in ball, false, `${key} 가 볼펜 설정에 남았다`)
  const back = applyPenKind(rememberPen(memory, ball), ball, 'glass')
  assert.equal(back.inkGlitter, false)
  assert.equal(back.inkFilm, 125)
  assert.equal(back.inkAmount, 0.5)
})

test('점선 패턴도 점선에만 남는다', () => {
  const dashed = { ...base, kind: 'dashed', dashLength: 4, dashGap: 2 }
  const memory = rememberPen({}, dashed)
  const ball = applyPenKind(memory, dashed, 'ball')
  assert.equal('dashLength' in ball, false)
  assert.equal('dashGap' in ball, false)
})

test('저장된 기억을 읽을 때도 종류 전용 옵션을 검사한다', () => {
  const saved = sanitizePenKinds({ glass: { width: 8, opacity: 1, inkFilm: 9999, inkAmount: 5 } })
  assert.equal(saved.glass.inkFilm, DEFAULT_GLASS_INK.inkFilm)
  assert.equal(saved.glass.inkAmount, 1)
})

// 2026-11-10: 직접 고른 글리터 색이 획에 안 남아, 쓰는 중에만 보이고 손을 떼면 견본 색으로 돌아갔다.
// createStroke 가 inkGlitterColor 를 아예 안 받고 있었고, 코팅 두께는 '맞춤'이어도 55(은)로 박혔다.
test('잉크펜 획은 고른 글리터 색을 그대로 들고 간다', () => {
  const points = [{ x: 0, y: 0 }, { x: 20, y: 10 }]
  const picked = createStroke(points, { id: 'a', kind: 'glass', color: '#18224D', width: 4, inkGlitterColor: '#F3D4D4' })
  assert.equal(picked.inkGlitterColor, '#F3D4D4')
  // 견본(코팅 두께)을 고른 경우
  const film = createStroke(points, { id: 'b', kind: 'glass', color: '#18224D', width: 4, inkFilm: 125 })
  assert.equal(film.inkFilm, 125)
  assert.equal(film.inkGlitterColor, undefined)
  // '맞춤'은 아무것도 안 적는다 → 그릴 때 펜 색에서 자동으로 고른다(55 로 박으면 늘 은빛이 된다)
  const auto = createStroke(points, { id: 'c', kind: 'glass', color: '#18224D', width: 4 })
  assert.equal(auto.inkFilm, undefined)
  assert.equal(auto.inkGlitterColor, undefined)
  // 잉크펜이 아니면 잉크 설정은 아예 안 붙는다
  const ball = createStroke(points, { id: 'd', kind: 'ball', color: '#18224D', width: 4, inkGlitterColor: '#F3D4D4' })
  assert.equal(ball.inkGlitterColor, undefined)
})
