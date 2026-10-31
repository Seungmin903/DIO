// 글자 옆 아이콘 크기 규칙 (디자인 가이드 "글자 옆 아이콘")
// 아이콘은 24칸 안에서 그림마다 차지하는 세로 높이가 다르다(레이어 20 · 사람 추가 18 · 내보내기 16 …).
// 같은 size 를 주면 글자와 높이가 달라 보이므로, 그림의 실제 높이(INK 의 첫 값)와 가운데(둘째 값, 12 가 정중앙)를 재어 두고
// 글자 크기에서 아이콘 size · 선 굵기 · 세로 보정을 계산한다. 값은 모든 아이콘을 24px 로 그려 path 경계를 잰 것이다.
// 높이가 14 미만인 기호(가운데 점 · 빼기 · 화살표 · 닫기 · 체크 등)는 글자 높이에 맞추지 않고 원래 size 를 쓴다.
export const EDITOR_INK = {
  alert: [17, 11.5],
  backward: [13, 11.5],
  bell: [19, 11.5],
  book: [18, 12.0],
  bookmark: [18, 12.0],
  check: [10, 12.0],
  chevronDown: [6, 12.0],
  chevronLeft: [12, 12.0],
  chevronRight: [12, 12.0],
  clipboard: [18, 12.0],
  close: [12, 12.0],
  copy: [18, 12.0],
  crop: [20, 12.0],
  cursor: [15, 12.0],
  down: [14, 12.0],
  duplicate: [18, 12.0],
  edit: [14, 12.75],
  eraser: [15, 11.91],
  external: [16, 12.0],
  eye: [14, 12.0],
  eyeOff: [18, 12.0],
  fit: [16, 12.0],
  flip: [18, 12.0],
  focus: [16, 12.0],
  folder: [15, 12.5],
  forward: [13, 12.5],
  frame: [16, 12.0],
  grid: [16, 12.0],
  grip: [12, 12.0],
  group: [18, 12.0],
  guides: [18, 12.0],
  hand: [18, 12.0],
  help: [18, 12.0],
  highlighter: [15, 11.9],
  home: [16, 12.0],
  image: [14, 12.0],
  lasso: [17, 12.0],
  layers: [20, 12.0],
  link: [17, 12.0],
  lock: [16, 12.0],
  minus: [0, 12.0],
  more: [0, 12.0],
  pages: [16, 12.0],
  panel: [16, 12.0],
  pen: [16, 12.19],
  people: [18, 12.0],
  person: [18, 12.0],
  plus: [14, 12.0],
  redo: [15, 11.5],
  reset: [16, 11.91],
  roller: [18, 12.0],
  rotate: [18, 12.0],
  saved: [18, 12.0],
  saving: [18, 12.0],
  search: [16, 12.0],
  shape: [19, 12.5],
  share: [16, 11.0],
  sticker: [18, 12.0],
  swap: [16, 12.0],
  tape: [16, 12.0],
  text: [14, 12.0],
  textLarger: [14, 12.0],
  textSmaller: [14, 12.0],
  toBack: [16, 11.75],
  toFront: [16, 12.25],
  trash: [20, 12.0],
  undo: [15, 11.5],
  unlock: [16, 11.97],
  up: [14, 12.0],
  upload: [16, 12.0],
  userPlus: [18, 12.0],
}
export const APP_INK = {
  'arrow-down': [14, 12.0],
  'arrow-up': [14, 12.0],
  book: [20, 12.0],
  'book-open': [18, 12.0],
  'book-user': [20, 12.0],
  check: [10, 12.5],
  library: [16, 12.0],
  mail: [14, 12.0],
  menu: [10, 12.0],
  moon: [14, 12.51],
  person: [15, 12.4],
  star: [15, 11.43],
  workshop: [20, 12.0],
}

const MIN_OBJECT_INK = 14
// 글자와 크기를 맞추지 않는 기호(방향 · 닫기 · 체크 · 더하기 · 빼기 · 점 · 줄 · 화살표). 글자보다 작게 곁들이는 것이 자연스럽다.
const SYMBOLS = new Set(['chevronLeft', 'chevronRight', 'chevronDown', 'close', 'check', 'plus', 'minus', 'more', 'grip', 'up', 'down', 'forward', 'backward', 'arrow-up', 'arrow-down', 'menu'])

/**
 * 글자 크기 fontSize(px)와 같은 높이로 보이는 아이콘 설정.
 * 글자 그림 높이 = fontSize × 0.92(Pretendard 한글), 아이콘은 선 굵기까지 포함해 글자보다 1px 크게 보이게 한다.
 * 반환: { size, strokeWidth(24칸 기준), dy(24칸 기준 세로 보정) } — 표에 없거나 기호 아이콘이면 null(원래 size 를 쓴다)
 */
export function textIconSpec(table, name, fontSize) {
  const row = table[name]
  if (!row || row[0] < MIN_OBJECT_INK || SYMBOLS.has(name)) return null
  const [h, cy] = row
  const textInk = Math.round(fontSize * 0.92)
  const stroke = fontSize < 12 ? 1.25 : fontSize < 16 ? 1.5 : 1.75
  const size = Math.max(12, Math.round(((textInk + 1 - stroke) * 24) / h))
  return { size, strokeWidth: (stroke * 24) / size, dy: 12 - cy }
}
