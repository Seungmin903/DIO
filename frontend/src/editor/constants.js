import { TABLET_HEIGHT, TABLET_WIDTH } from '../shared/layout'

// MVP1 기준 캔버스(16:10). 화면에는 zoom 배율을 곱해서 그린다.
export const PAGE_WIDTH = TABLET_WIDTH
export const PAGE_HEIGHT = TABLET_HEIGHT

// 화면 배율: '화면에 맞춤'을 100% 로 보고 50% ~ 200% (손가락 확대·축소, 확대 버튼 공통)
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3
export const PHONE_ZOOM_MAX = 4
export const ZOOM_STEP = 0.1

export const OBJECT_TYPE_LABELS = {
  text: '텍스트',
  shape: '도형',
  stroke: '필기',
  sticker: '스티커',
  tape: '마스킹테이프',
  photo: '사진',
}

// 마스킹테이프 폭 규격. 다꾸에서 흔히 부르는 이름을 따른다.
// 슬림(5mm, 선처럼 가는 테이프) · 기본(15mm, 가장 흔한 폭) · 와이드(30mm)
// w·h 는 페이지 논리 좌표의 처음 붙는 크기. 기본 15mm = 높이 34 를 기준으로 폭을 비례해 정했다. (1mm ≈ 2.27)
export const TAPE_SIZES = [
  { id: 'slim', name: '슬림', hint: '5mm', w: 200, h: 11 },
  { id: 'standard', name: '기본', hint: '15mm', w: 180, h: 34 },
  { id: 'wide', name: '와이드', hint: '30mm', w: 200, h: 68 },
]

// 마스킹테이프 기본 불투명도 (살짝 비친다). 100% 는 완전히 불투명
export const TAPE_DEFAULT_OPACITY = 0.8
// 마스킹테이프 기본값 (색을 고르지 않고 무늬를 고르면 이 색으로 붙는다)
export const TAPE_DEFAULT = { size: 'standard', pattern: 'solid', palette: 'pink', name: '무지' }

// 테이프 색: 바탕(bg) + 무늬(fg) 한 쌍. 무늬는 그대로 두고 색만 바꿀 수 있다.
// hidden: 이미 붙인 테이프는 그대로 그리되 색 고르기에서는 뺀 색 (코랄·크라프트)
export const TAPE_PALETTES = [
  // 테이프 색 12쌍(코덱스 2026-10-31). 프리셋 기본은 7쌍(hidden 이 아닌 것) — 나머지는 이미 붙인 테이프와 고른 색을 위해 남긴다. 이미 붙인 테이프는 ID 로 색을 찾으므로 예전 ID 를 가까운 새 색에 이었다
  // (핑크 → 딸기, 코랄 → 살구, 스카이 → 하늘, 크라프트 → 코코아). 올리브 · 페리 · 자두는 새 ID
  { id: 'pink', name: '딸기', bg: '#F8D9DF', fg: '#C96B7B' },
  { id: 'coral', name: '살구', bg: '#F8DEC9', fg: '#C97B55', hidden: true },
  { id: 'butter', name: '버터', bg: '#FEF0BF', fg: '#D8A93E' },
  { id: 'olive', name: '올리브', bg: '#E1E8C7', fg: '#84944D', hidden: true },
  { id: 'mint', name: '민트', bg: '#D7EDE2', fg: '#65A889' },
  { id: 'sky', name: '하늘', bg: '#D5EAF4', fg: '#5F9BBC' },
  { id: 'peri', name: '페리', bg: '#E1E4F8', fg: '#818AC3' },
  { id: 'lavender', name: '라벤더', bg: '#E8DDF6', fg: '#9A7AC4', hidden: true },
  { id: 'plum', name: '자두', bg: '#E8D8EB', fg: '#9A6699', hidden: true },
  { id: 'kraft', name: '코코아', bg: '#E8DDD2', fg: '#8A6650', hidden: true },
  { id: 'charcoal', name: '차콜', bg: '#424957', fg: '#F3F1EA' },
  { id: 'ivory', name: '아이보리', bg: '#F3F1EA', fg: '#555B68' }, // 차콜을 뒤집은 흰 바탕 + 진한 무늬
]

// 기본 테이프: 규격마다 6종, 18종 모두 다른 무늬. pattern 은 무늬 모양(TapeView), palette 는 처음 색
// 바탕·무늬 두 색만 쓰는 심플·모던한 기하 무늬. 슬림은 가는 폭에 맞는 선·점, 와이드는 큼직한 도형.
// 테이프 폭은 규격으로 정해지고 길이만 늘이고 줄인다. 이름에는 색을 넣지 않는다. (색은 바꿀 수 있음)
export const TAPES = [
  { id: 'slim-solid', size: 'slim', pattern: 'solid', palette: 'coral', name: '무지' },
  { id: 'slim-dash', size: 'slim', pattern: 'dash', palette: 'charcoal', name: '대시' },
  { id: 'slim-dotline', size: 'slim', pattern: 'dotline', palette: 'pink', name: '도트 라인' },
  { id: 'slim-double', size: 'slim', pattern: 'doubleline', palette: 'sky', name: '더블 라인' },
  { id: 'slim-zigzag', size: 'slim', pattern: 'zigzag', palette: 'mint', name: '지그재그' },
  { id: 'slim-pin', size: 'slim', pattern: 'pinstripe', palette: 'butter', name: '핀스트라이프' },
  { id: 'std-stripe', size: 'standard', pattern: 'stripe', palette: 'mint', name: '사선 스트라이프' },
  { id: 'std-dot', size: 'standard', pattern: 'dot', palette: 'pink', name: '도트' },
  { id: 'std-gingham', size: 'standard', pattern: 'gingham', palette: 'sky', name: '깅엄' },
  { id: 'std-grid', size: 'standard', pattern: 'grid', palette: 'lavender', name: '모눈' },
  { id: 'std-wave', size: 'standard', pattern: 'wave', palette: 'butter', name: '웨이브' },
  { id: 'std-plaid', size: 'standard', pattern: 'plaid', palette: 'coral', name: '플래드' },
  { id: 'wide-checker', size: 'wide', pattern: 'checker', palette: 'charcoal', name: '체커보드' },
  { id: 'wide-houndstooth', size: 'wide', pattern: 'houndstooth', palette: 'sky', name: '하운드투스' },
  { id: 'wide-plus', size: 'wide', pattern: 'plus', palette: 'mint', name: '플러스' },
  { id: 'wide-star', size: 'wide', pattern: 'star', palette: 'charcoal', name: '별' },
  { id: 'wide-awning', size: 'wide', pattern: 'awning', palette: 'butter', name: '어닝 스트라이프' },
  { id: 'wide-border', size: 'wide', pattern: 'border', palette: 'lavender', name: '보더' },
]

// 테이프 무늬 21종 (붙인 뒤 어떤 규격에서도 고를 수 있다). 레이스 3종은 구멍이 뚫려 밑이 비치고 규격 높이를 꽉 채운다. (도안은 laceTapes.js)
export const TAPE_PATTERN_NAMES = {
  solid: '무지',
  dash: '대시',
  dotline: '도트 라인',
  doubleline: '더블 라인',
  zigzag: '지그재그',
  pinstripe: '핀스트라이프',
  stripe: '사선 스트라이프',
  dot: '도트',
  gingham: '깅엄',
  grid: '모눈',
  wave: '웨이브',
  plaid: '플래드',
  checker: '체커보드',
  houndstooth: '하운드투스',
  plus: '플러스',
  star: '별',
  awning: '어닝 스트라이프',
  border: '보더',
  'lace-flower': '아이렛 레이스',
  'lace-net': '크로셰 레이스',
  'lace-chain': '데이지 레이스',
}

// 예전 문서에서 이름 없이 저장된 테이프의 이름
export const LEGACY_TAPE_NAMES = {
  'mint-stripe': '스트라이프',
  'pink-dot': '도트',
  'butter-check': '체크',
  lavender: '무지',
  kraft: '크라프트',
  'blue-grid': '모눈',
  'sky-wave': '웨이브',
}

// 예전 문서의 테이프 무늬 이름 → 지금의 무늬 + 색
export const LEGACY_TAPE_PATTERNS = {
  'mint-stripe': { pattern: 'stripe', palette: 'mint' },
  'pink-dot': { pattern: 'dot', palette: 'pink' },
  'butter-check': { pattern: 'check', palette: 'butter' },
  lavender: { pattern: 'solid', palette: 'lavender' },
  kraft: { pattern: 'kraft', palette: 'kraft' },
  'blue-grid': { pattern: 'grid', palette: 'sky' },
  'sky-wave': { pattern: 'wave', palette: 'sky' },
}

// 명세: 테이프 끝은 절취선형 또는 직선형
// 테이프 끝선 (옵션 패널 '꾸미기'의 끝선)
export const TAPE_EDGES = [
  { id: 'torn', name: '절취선' },
  { id: 'straight', name: '직선' },
  { id: 'diagonal', name: '사선' }, // 가위로 비스듬히 자른 끝
]

// 명세: 사진 자르기는 폴라로이드 · 도형 두 방식만 (자유 오리기는 MVP2)
export const CROP_MODES = [
  { id: 'polaroid', name: '폴라로이드' },
  { id: 'shape', name: '도형' },
]

// value 가 null 인 '원본'은 사진 원래 비율 (ratioValueOf 로 계산)
export const POLAROID_RATIOS = [
  { id: 'original', name: '원본', value: null },
  { id: '1:1', name: '1:1', value: 1 },
  { id: '4:5', name: '4:5', value: 4 / 5 },
  { id: '3:4', name: '3:4', value: 3 / 4 },
  { id: '4:3', name: '4:3', value: 4 / 3 },
]

// 사각·라운드 사진 자르기 비율. 정해진 비율 없이 자르려면 캔버스의 자르기 손잡이를 끈다. (PPT 자르기처럼, ratio: 'free')
export const CROP_RATIOS = [...POLAROID_RATIOS, { id: '16:9', name: '16:9', value: 16 / 9 }]

export const PHOTO_SHAPES = [
  { id: 'rect', name: '사각형', square: false },
  { id: 'round', name: '라운드', square: false },
  { id: 'circle', name: '원형', square: true },
  { id: 'heart', name: '하트', square: true },
  { id: 'star', name: '별', square: true },
]

// 사진 보관함에서 고르는 '붙일 모양' (붙인 뒤에도 자르기에서 바꿀 수 있다)
export const PHOTO_STYLES = [
  { id: 'rect', name: '사각' },
  { id: 'polaroid', name: '폴라로이드' },
  { id: 'round', name: '라운드' },
  { id: 'circle', name: '원형' },
  { id: 'heart', name: '하트' },
]

// 여백이 있는 사진 프레임: 틀 여백 (사진 너비 대비). 안쪽 사진은 네모로 들어간다. right 가 없으면 좌우가 side 로 같다.
export const FRAME_INSETS = {
  polaroid: { top: 0.06, side: 0.06, bottom: 0.2 },
  film: { top: 0.13, side: 0.03, bottom: 0.13 }, // 위아래 필름 구멍 띠
  stamp: { top: 0.09, side: 0.09, bottom: 0.09 }, // 톱니 가장자리 우표
  // 티켓: 사진은 작게, 나머지는 글자 · 바코드 · 절취선 칸 (실제 티켓처럼). 탑승권은 사진이 글자 아래 가운데.
  ticketConcert: { top: 0.04, side: 0.035, right: 0.605, bottom: 0.04 },
  ticketCinema: { top: 0.04, side: 0.035, right: 0.605, bottom: 0.04 },
  ticketMatch: { top: 0.04, side: 0.035, right: 0.605, bottom: 0.04 },
  ticketBoarding: { top: 0.26, side: 0.45, right: 0.33, bottom: 0.05 },
  frame: { top: 0.13, side: 0.13, bottom: 0.13 }, // 액자: 예전 문서 표시용 (이제 고르지 않는다)
}
export const POLAROID_INSETS = FRAME_INSETS.polaroid

// 사진 틀 (사진 보관함에서 누르면 빈 틀이 붙고, 옵션 패널에서는 붙인 사진의 틀을 바꾼다). 오프라인 에셋 '④ 사진 틀'.
// border 는 여백 있는 한 장 틀, strip 은 여러 칸 틀(utils/photoStrip). ratio 는 빈 틀의 안쪽 비율. group 은 보관함 묶음.
export const PHOTO_FRAME_GROUPS = [
  { id: 'basic', name: '사진 틀' },
  { id: 'ticket', name: '티켓' },
  { id: 'multi', name: '네컷' },
]
export const PHOTO_FRAME_ASSETS = [
  { id: 'polaroid', name: '폴라로이드', group: 'basic', kind: 'border', colored: true, ratio: '1:1' },
  { id: 'film', name: '필름', group: 'basic', kind: 'border', ratio: '4:3' },
  { id: 'stamp', name: '우표', group: 'basic', kind: 'border', colored: true, ratio: '4:5' },
  { id: 'ticketConcert', name: '공연', group: 'ticket', kind: 'border', colored: true, ratio: '1:1' },
  { id: 'ticketCinema', name: '영화', group: 'ticket', kind: 'border', colored: true, ratio: '1:1' },
  { id: 'ticketMatch', name: '경기', group: 'ticket', kind: 'border', colored: true, ratio: '1:1' },
  { id: 'ticketBoarding', name: '탑승권', group: 'ticket', kind: 'border', colored: true, ratio: '4:3' },
  { id: 'fourcut', name: '인생네컷', group: 'multi', kind: 'strip', colored: true, cells: 4 },
  { id: 'filmstrip', name: '필름 4컷', group: 'multi', kind: 'strip', cells: 4 },
]

// 틀에 인쇄된 글자 (티켓 · 인생네컷). 처음엔 기본 글자가 들어 있고 옵션 패널에서 고친다 (photo.frameText).
// fields 의 순서가 옵션 패널 입력칸 순서다.
export const FRAME_TEXT = {
  ticketConcert: {
    defaults: { label: 'CONCERT', title: 'WORLD TOUR', info: '2026.12.01 18:00', detail: '2F · F구역 12열' },
    fields: [{ key: 'label', name: '종류' }, { key: 'title', name: '공연 이름' }, { key: 'info', name: '일시' }, { key: 'detail', name: '좌석' }],
  },
  ticketCinema: {
    defaults: { label: 'CINEMA', title: 'MOVIE NIGHT', info: 'SCREEN 7 · 19:30', detail: 'SEAT F12' },
    fields: [{ key: 'label', name: '종류' }, { key: 'title', name: '영화 제목' }, { key: 'info', name: '상영 정보' }, { key: 'detail', name: '좌석' }],
  },
  ticketMatch: {
    defaults: { label: 'MATCH DAY', title: 'HOME vs AWAY', detail: 'GATE 3 · BLOCK 112' },
    fields: [{ key: 'label', name: '종류' }, { key: 'title', name: '경기' }, { key: 'detail', name: '입장 정보' }],
  },
  ticketBoarding: {
    defaults: { label: 'BOARDING PASS', title: 'ICN → CDG', info: 'DIO AIR · 10:25', seat: '12A', gate: 'GATE 23' },
    fields: [{ key: 'label', name: '종류' }, { key: 'title', name: '구간' }, { key: 'info', name: '항공편' }, { key: 'seat', name: '좌석' }, { key: 'gate', name: '게이트' }],
  },
  fourcut: {
    defaults: { caption: 'DIO 네컷' },
    fields: [{ key: 'caption', name: '아래 글자' }],
  },
  // 칸마다 위에 필름 이름, 아래에 번호 (번호의 맨 앞 숫자는 칸마다 하나씩 늘어난다)
  filmstrip: {
    defaults: { brand: 'DIO 400', number: '12A' },
    fields: [{ key: 'brand', name: '필름 이름' }, { key: 'number', name: '첫 번호' }],
  },
}

export const CROP_ZOOM_MIN = 1
// 사진·테이프 자르기 확대는 900% 까지 (자유 자르기도 같은 한도)
export const CROP_ZOOM_MAX = 9
