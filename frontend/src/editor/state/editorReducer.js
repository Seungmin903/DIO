// 편집기 상태 리듀서
// - doc: 저장 대상 문서. pages[].objects 순서 = 레이어 순서 (마지막이 맨 앞)
// - past / future: 되돌리기·다시 실행용 doc 스냅샷
// - pageId, selectedIds: 화면 상태 (히스토리에 넣지 않음)
//
// 드래그처럼 연속된 변경은 시작할 때 'checkpoint' 를 한 번 보내고
// 이후 update 를 record 없이 보내서 한 번의 되돌리기 단위로 묶는다.

import { clamp, createId } from '../utils/common'
import { createBlankPage } from './defaultDoc'

const HISTORY_LIMIT = 80
const PASTE_OFFSET = 24

export function createInitialState(doc) {
  return { doc, past: [], future: [], pageId: doc.pages[0].id, selectedIds: [] }
}

export function getCurrentPage(state) {
  return state.doc.pages.find((page) => page.id === state.pageId) ?? state.doc.pages[0]
}

const withHistory = (state) => ({
  ...state,
  past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
  future: [],
})

function updateObjects(state, updater) {
  const pageId = getCurrentPage(state).id
  return {
    ...state,
    doc: {
      ...state.doc,
      pages: state.doc.pages.map((page) => (page.id === pageId ? { ...page, objects: updater(page.objects) } : page)),
    },
  }
}

/** 묶음(groupId)에 속한 오브젝트는 함께 선택되도록 펼친다. */
export function expandGroups(objects, ids) {
  const groupIds = new Set(objects.filter((o) => ids.includes(o.id) && o.groupId).map((o) => o.groupId))
  return objects.filter((o) => ids.includes(o.id) || (o.groupId && groupIds.has(o.groupId))).map((o) => o.id)
}

/** 선택된 오브젝트들을 한 덩어리로 앞/뒤로 보낸다. */
function reorder(objects, ids, mode) {
  const selected = new Set(ids)
  const picked = objects.filter((o) => selected.has(o.id))
  const rest = objects.filter((o) => !selected.has(o.id))
  if (mode === 'front') return [...rest, ...picked]
  if (mode === 'back') return [...picked, ...rest]

  const next = [...objects]
  if (mode === 'forward') {
    for (let i = next.length - 2; i >= 0; i -= 1) {
      if (selected.has(next[i].id) && !selected.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]]
    }
  } else {
    for (let i = 1; i < next.length; i += 1) {
      if (selected.has(next[i].id) && !selected.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]]
    }
  }
  return next
}

function cloneObjects(objects, offset) {
  const groupMap = new Map()
  return objects.map((object) => {
    let groupId = object.groupId
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, createId())
      groupId = groupMap.get(groupId)
    }
    return { ...object, id: createId(), x: object.x + offset, y: object.y + offset, locked: false, groupId }
  })
}

/** 되돌리기 후 사라진 페이지·오브젝트를 가리키지 않도록 보정 */
function normalizeSelection(state) {
  const page = getCurrentPage(state)
  const ids = new Set(page.objects.map((o) => o.id))
  return { ...state, pageId: page.id, selectedIds: state.selectedIds.filter((id) => ids.has(id)) }
}

export function editorReducer(state, action) {
  const objects = getCurrentPage(state).objects

  switch (action.type) {
    case 'checkpoint':
      return withHistory(state)

    // 자르기 취소처럼 checkpoint 이후의 변경을 버리고 그 시점으로 돌아간다.
    case 'revertToCheckpoint': {
      if (!state.past.length) return state
      return normalizeSelection({ ...state, doc: state.past[state.past.length - 1], past: state.past.slice(0, -1) })
    }

    case 'select':
      return { ...state, selectedIds: action.ids.length ? expandGroups(objects, action.ids) : [] }

    case 'toggleSelect': {
      const target = expandGroups(objects, [action.id])
      const isSelected = state.selectedIds.includes(action.id)
      const selectedIds = isSelected
        ? state.selectedIds.filter((id) => !target.includes(id))
        : [...new Set([...state.selectedIds, ...target])]
      return { ...state, selectedIds }
    }

    case 'selectPage':
      return { ...state, pageId: action.id, selectedIds: [] }

    case 'addObjects': {
      const next = updateObjects(withHistory(state), (list) => [...list, ...action.objects])
      return { ...next, selectedIds: action.objects.map((o) => o.id) }
    }

    case 'updateObject':
      return updateObjects(action.record ? withHistory(state) : state, (list) =>
        list.map((o) => (o.id === action.id ? { ...o, ...action.patch } : o)),
      )

    // patches: { [id]: patch } — 묶음 이동 등
    case 'updateMany':
      return updateObjects(action.record ? withHistory(state) : state, (list) =>
        list.map((o) => (action.patches[o.id] ? { ...o, ...action.patches[o.id] } : o)),
      )

    case 'removeObjects': {
      const removing = new Set(action.ids)
      const next = updateObjects(withHistory(state), (list) => list.filter((o) => !removing.has(o.id)))
      return { ...next, selectedIds: state.selectedIds.filter((id) => !removing.has(id)) }
    }

    case 'duplicateObjects': {
      const sources = objects.filter((o) => action.ids.includes(o.id))
      if (!sources.length) return state
      const copies = cloneObjects(sources, PASTE_OFFSET)
      const next = updateObjects(withHistory(state), (list) => [...list, ...copies])
      return { ...next, selectedIds: copies.map((o) => o.id) }
    }

    case 'reorder':
      if (!action.ids.length) return state
      return updateObjects(withHistory(state), (list) => reorder(list, action.ids, action.mode))

    case 'moveLayer': {
      const from = objects.findIndex((o) => o.id === action.id)
      const to = clamp(action.toIndex, 0, objects.length - 1)
      if (from < 0 || from === to) return state
      return updateObjects(withHistory(state), (list) => {
        const next = [...list]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
    }

    case 'group': {
      if (action.ids.length < 2) return state
      const groupId = createId()
      return updateObjects(withHistory(state), (list) =>
        list.map((o) => (action.ids.includes(o.id) ? { ...o, groupId } : o)),
      )
    }

    case 'ungroup':
      return updateObjects(withHistory(state), (list) =>
        list.map((o) => (action.ids.includes(o.id) ? { ...o, groupId: undefined } : o)),
      )

    case 'addPage': {
      const page = createBlankPage()
      const index = state.doc.pages.findIndex((p) => p.id === getCurrentPage(state).id)
      const pages = [...state.doc.pages]
      pages.splice(index + 1, 0, page)
      return { ...withHistory(state), doc: { ...state.doc, pages }, pageId: page.id, selectedIds: [] }
    }

    case 'removePage': {
      if (state.doc.pages.length <= 1) return state
      const index = state.doc.pages.findIndex((p) => p.id === action.id)
      const pages = state.doc.pages.filter((p) => p.id !== action.id)
      const pageId = state.pageId === action.id ? pages[Math.max(0, index - 1)].id : state.pageId
      return normalizeSelection({ ...withHistory(state), doc: { ...state.doc, pages }, pageId })
    }

    case 'undo':
      if (!state.past.length) return state
      return normalizeSelection({
        ...state,
        doc: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
      })

    case 'redo':
      if (!state.future.length) return state
      return normalizeSelection({
        ...state,
        doc: state.future[0],
        past: [...state.past, state.doc],
        future: state.future.slice(1),
      })

    case 'load':
      return createInitialState(action.doc)

    default:
      throw new Error(`Unknown editor action: ${action.type}`)
  }
}
