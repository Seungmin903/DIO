// 글자 옆 아이콘 크기 규칙 (디자인 가이드 "글자 옆 아이콘")
// 아이콘은 24칸 안에서 그림마다 차지하는 세로 높이가 다르다(레이어 20 · 사람 추가 18 · 내보내기 16 …).
// 같은 size 를 주면 글자와 높이가 달라 보이므로, 그림의 실제 높이(INK 의 첫 값)와 가운데(둘째 값, 12 가 정중앙)를 재어 두고
// 글자 크기에서 아이콘 size · 선 굵기 · 세로 보정을 계산한다. 값은 모든 아이콘을 24px 로 그려 path 경계를 잰 것이다.
// 높이가 14 미만인 기호(가운데 점 · 빼기 · 화살표 · 닫기 · 체크 등)는 글자 높이에 맞추지 않고 원래 size 를 쓴다.
export const EDITOR_INK = {
  alert: [18, 11.99],
  backward: [14, 12.0],
  bell: [20, 12.0],
  book: [20, 12.0],
  bookmark: [18, 12.0],
  check: [11, 11.5],
  chevronDown: [6, 12.0],
  chevronLeft: [12, 12.0],
  chevronRight: [12, 12.0],
  clipboard: [20, 12.0],
  close: [12, 12.0],
  copy: [20, 12.0],
  crop: [20, 12.0],
  cursor: [17, 12.5],
  down: [14, 12.0],
  duplicate: [20, 12.0],
  edit: [20, 12.0],
  eraser: [18, 12.0],
  external: [18, 12.0],
  eye: [14, 12.0],
  eyeOff: [20, 12.0],
  fit: [18, 12.0],
  flip: [20, 12.0],
  focus: [18, 12.0],
  folder: [17, 11.5],
  forward: [14, 12.0],
  frame: [18, 12.0],
  grid: [18, 12.0],
  grip: [12, 12.0],
  group: [18, 12.0],
  guides: [20, 12.0],
  hand: [20, 12.0],
  help: [20, 12.0],
  highlighter: [17, 12.27],
  home: [18, 12.0],
  image: [18, 12.0],
  lasso: [20, 12.0],
  layers: [20, 12.0],
  link: [20, 12.0],
  lock: [20, 12.0],
  mail: [16, 12.0],
  menu: [10, 12.0],
  minus: [0, 12.0],
  moon: [18, 12.01],
  more: [0, 12.0],
  pages: [18, 12.0],
  paper: [20, 12.0],
  panel: [18, 12.0],
  pen: [14, 10.7],
  people: [18, 12.0],
  person: [18, 12.0],
  plus: [14, 12.0],
  redo: [16, 12.0],
  reset: [18, 12.0],
  roller: [20, 12.0],
  rotate: [18, 12.0],
  saved: [20, 12.0],
  saving: [20, 12.0],
  scissors: [18, 12.0],
  search: [18, 12.0],
  shape: [18, 11.82],
  share: [20, 12.0],
  star: [19, 11.54],
  sticker: [18, 12.0],
  swap: [18, 12.0],
  tape: [15, 11.5],
  text: [16, 12.0],
  textLarger: [10, 11.0],
  textSmaller: [10, 11.0],
  toBack: [18, 12.0],
  toFront: [18, 12.0],
  trash: [20, 12.0],
  undo: [16, 12.0],
  unlock: [20, 12.0],
  up: [14, 12.0],
  upload: [18, 12.0],
  userPlus: [18, 12.0],
}
export const APP_INK = {
  'book-open': [18, 12.0],
  camera: [16, 12.0],
  'book-user': [20, 12.0],
  library: [16, 12.0],
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
