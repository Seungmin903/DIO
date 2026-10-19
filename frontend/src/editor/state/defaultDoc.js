import { createId } from '../utils/common'

export function createDefaultDoc(diary) {
  return {
    id: diary?.id ?? createId(),
    title: diary?.title ?? '새 다이어리',
    coverColor: diary?.color ?? '#CED9EE',
    pages: [createBlankPage()],
  }
}

export function createBlankPage() {
  return { id: createId(), objects: [] }
}
