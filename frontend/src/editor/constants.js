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
// 슬림(3~5mm, 선처럼 가는 테이프) · 기본(15mm, 가장 흔한 폭) · 와이드(30mm 이상)
// w·h 는 페이지 논리 좌표의 처음 붙는 크기
export const TAPE_SIZES = [
  { id: 'slim', name: '슬림', hint: '3~5mm', w: 200, h: 9 },
  { id: 'standard', name: '기본', hint: '15mm', w: 180, h: 34 },
  { id: 'wide', name: '와이드', hint: '30mm', w: 200, h: 68 },
]

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
]

// 기본 테이프: 규격마다 6종. pattern 은 무늬 모양(TapeView), palette 는 처음 색
export const TAPES = [
  { id: 'slim-coral', size: 'slim', pattern: 'solid', palette: 'coral', name: '코랄 슬림' },
  { id: 'slim-mint-stripe', size: 'slim', pattern: 'stripe', palette: 'mint', name: '민트 스트라이프 슬림' },
  { id: 'slim-pink-dot', size: 'slim', pattern: 'dot', palette: 'pink', name: '핑크 도트 슬림' },
  { id: 'slim-butter', size: 'slim', pattern: 'solid', palette: 'butter', name: '버터 슬림' },
  { id: 'slim-sky-grid', size: 'slim', pattern: 'grid', palette: 'sky', name: '스카이 모눈 슬림' },
  { id: 'slim-charcoal', size: 'slim', pattern: 'solid', palette: 'charcoal', name: '차콜 슬림' },
  { id: 'mint-stripe', size: 'standard', pattern: 'stripe', palette: 'mint', name: '민트 스트라이프' },
  { id: 'pink-dot', size: 'standard', pattern: 'dot', palette: 'pink', name: '핑크 도트' },
  { id: 'butter-check', size: 'standard', pattern: 'check', palette: 'butter', name: '버터 체크' },
  { id: 'lavender', size: 'standard', pattern: 'solid', palette: 'lavender', name: '라벤더' },
  { id: 'kraft', size: 'standard', pattern: 'kraft', palette: 'kraft', name: '크라프트' },
  { id: 'blue-grid', size: 'standard', pattern: 'grid', palette: 'sky', name: '블루 모눈' },
  { id: 'wide-sky-wave', size: 'wide', pattern: 'wave', palette: 'sky', name: '스카이 웨이브 와이드' },
  { id: 'wide-coral-gingham', size: 'wide', pattern: 'gingham', palette: 'coral', name: '코랄 깅엄 와이드' },
  { id: 'wide-pink-heart', size: 'wide', pattern: 'heart', palette: 'pink', name: '핑크 하트 와이드' },
  { id: 'wide-night-star', size: 'wide', pattern: 'star', palette: 'charcoal', name: '밤하늘 별 와이드' },
  { id: 'wide-mint-plaid', size: 'wide', pattern: 'plaid', palette: 'mint', name: '민트 플래드 와이드' },
  { id: 'wide-butter-stripe', size: 'wide', pattern: 'stripe', palette: 'butter', name: '버터 스트라이프 와이드' },
]

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
export const TAPE_EDGES = [
  { id: 'torn', name: '절취선' },
  { id: 'straight', name: '직선' },
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

// 폴라로이드 틀 여백 (사진 너비 대비)
export const POLAROID_INSETS = { top: 0.06, side: 0.06, bottom: 0.2 }

export const CROP_ZOOM_MIN = 1
export const CROP_ZOOM_MAX = 3

// 폴라로이드 틀 색 (사진 선택 → 더보기)
export const FRAME_COLORS = [
  { id: 'white', name: '화이트', value: '#FFFFFF' },
  { id: 'cream', name: '크림', value: '#FBF3E1' },
  { id: 'sky', name: '하늘', value: '#CED9EE' },
  { id: 'pink', name: '핑크', value: '#F9DDE2' },
  { id: 'black', name: '블랙', value: '#22262F' },
]
