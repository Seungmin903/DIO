// 저장된 문서가 없을 때 보여줄 데모 다이어리 (사진은 사용자가 직접 불러온다)
import { createId } from '../utils/common'
import { createSticker, createTape } from '../utils/objects'

const at = (object, patch) => ({ ...object, ...patch })

function firstPage() {
  return {
    id: createId(),
    objects: [
      at(createTape({ pattern: 'pink-dot' }, { x: 230, y: 120 }), { rotation: -7 }),
      at(createSticker({ asset: 'airplane', name: '비행기' }, { x: 650, y: 140 }), { rotation: 8 }),
      at(createSticker({ asset: 'strawberry', name: '딸기' }, { x: 960, y: 260 }), { rotation: 12 }),
      at(createTape({ pattern: 'sky-wave' }, { x: 860, y: 620 }), { w: 260, rotation: -3 }),
      at(createSticker({ asset: 'leaf', name: '낙엽' }, { x: 160, y: 680 }), { rotation: -12 }),
    ],
  }
}

export function createDefaultDoc() {
  return {
    id: 'demo-diary',
    title: '오사카 여행 영수증 일기',
    coverColor: '#F2A7A0',
    pages: [firstPage(), createBlankPage()],
  }
}

export function createBlankPage() {
  return { id: createId(), objects: [] }
}
