import { TABLET_HEIGHT, TABLET_WIDTH } from '../shared/layout'

// MVP1 기준 캔버스(16:10). 화면에는 zoom 배율을 곱해서 그린다.
export const PAGE_WIDTH = TABLET_WIDTH
export const PAGE_HEIGHT = TABLET_HEIGHT

// 화면 배율: '화면에 맞춤'을 100% 로 보고 50% ~ 200% (손가락 확대·축소, 확대 버튼 공통)
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2
export const ZOOM_STEP = 0.1

export const OBJECT_TYPE_LABELS = {
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
export const TAPE_PALETTES = [
  { id: 'pink', name: '핑크', bg: '#FAD3DC', fg: '#F59AB2' },
  { id: 'coral', name: '코랄', bg: '#FDE0D8', fg: '#F2917C' },
  { id: 'butter', name: '버터', bg: '#FFF1C2', fg: '#EFC04F' },
  { id: 'mint', name: '민트', bg: '#E3F4EC', fg: '#8FD3B6' },
  { id: 'sky', name: '스카이', bg: '#DCEBFA', fg: '#6E92C6' },
  { id: 'lavender', name: '라벤더', bg: '#ECE5FB', fg: '#B39DED' },
  { id: 'kraft', name: '크라프트', bg: '#D9B98F', fg: '#A27B4E' },
  { id: 'charcoal', name: '차콜', bg: '#3E4350', fg: '#F3F1EA' },
  { id: 'ivory', name: '아이보리', bg: '#F3F1EA', fg: '#3E4350' }, // 차콜을 뒤집은 흰 바탕 + 검은 무늬
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

// 테이프 무늬 18종 (붙인 뒤 어떤 규격에서도 고를 수 있다)
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

// 여백이 있는 사진 프레임: 틀 여백 (사진 너비 대비). 안쪽 사진은 네모로 들어간다.
export const FRAME_INSETS = {
  polaroid: { top: 0.06, side: 0.06, bottom: 0.2 },
  film: { top: 0.13, side: 0.03, bottom: 0.13 }, // 위아래 필름 구멍 띠
  stamp: { top: 0.09, side: 0.09, bottom: 0.09 }, // 톱니 가장자리 우표
  frame: { top: 0.13, side: 0.13, bottom: 0.13 }, // 액자 (틀 띠 + 흰 매트)
}
export const POLAROID_INSETS = FRAME_INSETS.polaroid

// 프레임 고르기 (옵션 패널 '꾸미기'). shape 는 사진 자체를 그 모양으로 자르고, border 는 여백 있는 틀에 넣는다.
export const PHOTO_FRAMES = [
  { id: 'rect', name: '없음', kind: 'shape' },
  { id: 'round', name: '라운드', kind: 'shape' },
  { id: 'circle', name: '원형', kind: 'shape' },
  { id: 'heart', name: '하트', kind: 'shape' },
  { id: 'star', name: '별', kind: 'shape' },
  { id: 'polaroid', name: '폴라로이드', kind: 'border', colored: true },
  { id: 'film', name: '필름', kind: 'border' },
  { id: 'stamp', name: '우표', kind: 'border', colored: true },
  { id: 'frame', name: '액자', kind: 'border', colored: true },
]

export const CROP_ZOOM_MIN = 1
// 사진·테이프 자르기 확대는 900% 까지 (자유 자르기도 같은 한도)
export const CROP_ZOOM_MAX = 9

