// 저장된 문서가 없을 때 보여줄 데모 다이어리
import { SAMPLE_PHOTOS } from '../constants'
import { createId } from '../utils/common'
import { createPhoto, createSticker, createTape } from '../utils/objects'

const [latte, sea, flower, city] = SAMPLE_PHOTOS

const at = (object, patch) => ({ ...object, ...patch })

function osakaPage() {
  return {
    id: createId(),
    objects: [
      createPhoto({ ...city, w: 250, rotation: -4 }, { x: 190, y: 250 }),
      at(createTape({ pattern: 'pink-dot' }, { x: 175, y: 92 }), { rotation: -7 }),
      createPhoto({ ...latte, w: 230, rotation: 5 }, { x: 470, y: 280 }),
      at(createTape({ pattern: 'lavender' }, { x: 470, y: 120 }), { rotation: 6, w: 130 }),
      at(createSticker({ emoji: '✈️', name: '비행기' }, { x: 650, y: 90 }), { rotation: 8 }),
      at(createPhoto({ ...sea, w: 220, rotation: 0, extra: { frame: 'shape', shape: 'circle' } }, { x: 860, y: 330 }), {
        h: 220,
        y: 220,
      }),
      at(createSticker({ emoji: '🍓', name: '딸기' }, { x: 960, y: 220 }), { rotation: 12 }),
      at(createTape({ pattern: 'sky-wave' }, { x: 860, y: 600 }), { w: 260, rotation: -3 }),
      at(createSticker({ emoji: '🍂', name: '낙엽' }, { x: 120, y: 690 }), { rotation: -12 }),
    ],
  }
}

function secondPage() {
  return {
    id: createId(),
    objects: [
      at(createPhoto({ ...flower, w: 300, rotation: -2, extra: { frame: 'shape', shape: 'heart' } }, { x: 300, y: 380 }), {
        h: 280,
        y: 240,
      }),
      at(createTape({ pattern: 'mint-stripe' }, { x: 300, y: 230 }), { rotation: -4 }),
      at(createSticker({ emoji: '🌷', name: '튤립' }, { x: 520, y: 260 }), { rotation: 10 }),
      at(createSticker({ emoji: '💌', name: '편지' }, { x: 900, y: 640 }), { rotation: -6 }),
    ],
  }
}

export function createDefaultDoc() {
  return {
    id: 'demo-diary',
    title: '오사카 여행 영수증 일기',
    coverColor: '#F2A7A0',
    pages: [osakaPage(), secondPage()],
  }
}

export function createBlankPage() {
  return { id: createId(), objects: [] }
}
