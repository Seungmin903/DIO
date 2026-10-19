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

export const STICKER_GROUPS = [
  {
    id: 'basic',
    title: '기본',
    items: [
      ['🌷', '튤립'], ['🍓', '딸기'], ['☕', '커피'], ['🎀', '리본'], ['⭐', '별'], ['🧸', '곰돌이'],
      ['🌈', '무지개'], ['🍰', '케이크'], ['📷', '카메라'], ['✈️', '비행기'], ['🐱', '고양이'], ['🌙', '달'],
      ['🍀', '네잎클로버'], ['💌', '편지'], ['🎧', '헤드폰'], ['🍒', '체리'], ['🌻', '해바라기'], ['🐰', '토끼'],
    ],
  },
  {
    id: 'autumn',
    title: '가을 피크닉',
    badge: 'NEW',
    items: [['🍂', '낙엽'], ['🍁', '단풍'], ['🍄', '버섯'], ['🌰', '밤'], ['🧺', '바구니'], ['🥐', '크루아상'], ['🍎', '사과'], ['🎃', '호박']],
  },
  {
    id: 'mood',
    title: '오늘의 기분',
    items: [['😊', '웃음'], ['🥹', '감동'], ['😴', '졸림'], ['🥰', '행복'], ['😎', '멋짐'], ['🫠', '녹음']],
  },
].map((group) => ({ ...group, items: group.items.map(([emoji, name]) => ({ emoji, name })) }))

export const TAPES = [
  { pattern: 'mint-stripe', name: '민트 스트라이프' },
  { pattern: 'pink-dot', name: '핑크 도트' },
  { pattern: 'butter-check', name: '버터 체크' },
  { pattern: 'lavender', name: '라벤더' },
  { pattern: 'kraft', name: '크라프트' },
  { pattern: 'blue-grid', name: '블루 모눈' },
  { pattern: 'sky-wave', name: '스카이 웨이브' },
]

// 명세: 테이프는 절취선형 또는 일자형
export const TAPE_EDGES = [
  { id: 'torn', name: '절취선' },
  { id: 'straight', name: '일자' },
]

// 명세: 사진 자르기는 폴라로이드 · 도형 두 방식만 (자유 오리기는 MVP2)
export const CROP_MODES = [
  { id: 'polaroid', name: '폴라로이드' },
  { id: 'shape', name: '도형' },
]

export const POLAROID_RATIOS = [
  { id: '1:1', name: '1:1', value: 1 },
  { id: '4:5', name: '4:5', value: 4 / 5 },
  { id: '3:4', name: '3:4', value: 3 / 4 },
  { id: '4:3', name: '4:3', value: 4 / 3 },
]

export const PHOTO_SHAPES = [
  { id: 'rect', name: '사각형', square: false },
  { id: 'round', name: '라운드', square: false },
  { id: 'circle', name: '원형', square: true },
  { id: 'heart', name: '하트', square: true },
  { id: 'star', name: '별', square: true },
]

// 폴라로이드 틀 여백 (사진 너비 대비)
export const POLAROID_INSETS = { top: 0.06, side: 0.06, bottom: 0.2 }

export const CROP_ZOOM_MIN = 1
export const CROP_ZOOM_MAX = 3

// 백엔드 연결 전 데모용 샘플 사진
export const SAMPLE_PHOTOS = ['cafe-latte', 'sea-trip', 'flower-shop', 'night-city', 'bakery', 'forest-walk'].map((seed) => ({
  id: `sample-${seed}`,
  name: '샘플 사진',
  src: `https://picsum.photos/seed/${seed}/600/750`,
  imageWidth: 600,
  imageHeight: 750,
}))
