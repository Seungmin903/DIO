// 편집기 정적 데이터

// 페이지 논리 크기 (가로형). 화면에는 zoom 배율을 곱해서 그린다.
export const PAGE_WIDTH = 1188
export const PAGE_HEIGHT = 840

export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 2
export const ZOOM_STEP = 0.1

export const OBJECT_TYPE_LABELS = {
  sticker: '스티커',
  tape: '마스킹테이프',
  photo: '사진',
}

export const TAPES = [
  { pattern: 'mint-stripe', name: '민트 스트라이프' },
  { pattern: 'pink-dot', name: '핑크 도트' },
  { pattern: 'butter-check', name: '버터 체크' },
  { pattern: 'lavender', name: '라벤더' },
  { pattern: 'kraft', name: '크라프트' },
  { pattern: 'blue-grid', name: '블루 모눈' },
  { pattern: 'sky-wave', name: '스카이 웨이브' },
]

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
