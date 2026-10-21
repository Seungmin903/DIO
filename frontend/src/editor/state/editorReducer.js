// 편집기 상태 리듀서
// - doc: 저장 대상 문서. pages[].objects 순서 = 레이어 순서 (마지막이 맨 앞)
// - past / future: 되돌리기·다시 실행용 doc 스냅샷
// - pageId, selectedIds: 화면 상태 (히스토리에 넣지 않음)
//
// 드래그처럼 연속된 변경은 시작할 때 'checkpoint' 를 한 번 보내고
// 이후 update 를 record 없이 보내서 한 번의 되돌리기 단위로 묶는다.

import { clamp, createId, rotatedBounds, unionBounds } from '../utils/common.js'
import { pageSize } from '../utils/pageGeometry.js'
import { createBlankPage, createTemplatePage } from './defaultDoc.js'

const HISTORY_LIMIT = 80
const PASTE_OFFSET = 24

export function createInitialState(doc) {
  return {
    doc,
    past: [],
    future: [],
    pendingCheckpoint: null,
    pageId: doc.pages[0].id,
    selectedIds: [],
  }
}

export function getCurrentPage(state) {
  return state.doc.pages.find((page) => page.id === state.pageId) ?? state.doc.pages[0]
}

const withHistory = (state) => ({
  ...state,
  past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
  future: [],
  pendingCheckpoint: null,
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

/**
 * 요소 하나를 끌어 옮긴 뒤 그룹 소속을 정리한다.
 * - 같은 그룹 요소 사이에 놓이면 그 그룹에 들어가고
 * - 원래 그룹 요소와 더 이상 붙어 있지 않으면 그룹에서 빠진다.
 */
function settleMembership(list, id) {
  const index = list.findIndex((o) => o.id === id)
  const object = list[index]
  const below = list[index - 1]?.groupId
  const above = list[index + 1]?.groupId
  let groupId = object.groupId
  if (below && below === above) groupId = below
  else if (groupId && below !== groupId && above !== groupId) groupId = undefined
  if (groupId === object.groupId) return list
  const next = list.map((o) => (o.id === id ? { ...o, groupId } : o))
  // 혼자 남은 그룹은 푼다.
  const left = object.groupId && next.filter((o) => o.groupId === object.groupId)
  return left?.length === 1 ? next.map((o) => (o.groupId === object.groupId ? { ...o, groupId: undefined } : o)) : next
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
    return {
      ...object,
      id: createId(),
      x: object.x + offset,
      y: object.y + offset,
      locked: false,
      groupId,
    }
  })
}

/**
 * 정렬: 여러 개면 선택 영역 기준, 하나면 페이지 기준.
 * mode: left | hcenter | right | top | vcenter | bottom | hspace | vspace (간격 맞추기, 3개 이상)
 */
function alignObjects(objects, ids, mode, page) {
  const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = pageSize(page)
  const targets = objects.filter((o) => ids.includes(o.id) && !o.locked)
  if (!targets.length) return objects
  const frame =
    targets.length > 1
      ? unionBounds(targets)
      : {
          left: 0,
          top: 0,
          right: PAGE_WIDTH,
          bottom: PAGE_HEIGHT,
          cx: PAGE_WIDTH / 2,
          cy: PAGE_HEIGHT / 2,
        }
  const moves = new Map()

  if (mode === 'hspace' || mode === 'vspace') {
    if (targets.length < 3) return objects
    const horizontal = mode === 'hspace'
    const sorted = [...targets].sort((a, b) =>
      horizontal ? rotatedBounds(a).cx - rotatedBounds(b).cx : rotatedBounds(a).cy - rotatedBounds(b).cy,
    )
    const sizes = sorted.map((o) => {
      const b = rotatedBounds(o)
      return horizontal ? b.right - b.left : b.bottom - b.top
    })
    const span = horizontal ? frame.right - frame.left : frame.bottom - frame.top
    const gap = (span - sizes.reduce((a, b) => a + b, 0)) / (sorted.length - 1)
    let cursor = horizontal ? frame.left : frame.top
    sorted.forEach((o, i) => {
      const b = rotatedBounds(o)
      const delta = cursor - (horizontal ? b.left : b.top)
      moves.set(o.id, horizontal ? { x: o.x + delta } : { y: o.y + delta })
      cursor += sizes[i] + gap
    })
  } else {
    for (const o of targets) {
      const b = rotatedBounds(o)
      const dx = {
        left: frame.left - b.left,
        hcenter: frame.cx - b.cx,
        right: frame.right - b.right,
      }[mode]
      const dy = {
        top: frame.top - b.top,
        vcenter: frame.cy - b.cy,
        bottom: frame.bottom - b.bottom,
      }[mode]
      moves.set(o.id, dx != null ? { x: o.x + dx } : { y: o.y + dy })
    }
  }
  return objects.map((o) => (moves.has(o.id) ? { ...o, ...moves.get(o.id) } : o))
}

/** 되돌리기 후 사라진 페이지·오브젝트를 가리키지 않도록 보정 */
function normalizeSelection(state) {
  const page = getCurrentPage(state)
  const ids = new Set(page.objects.map((o) => o.id))
  return {
    ...state,
    pageId: page.id,
    selectedIds: state.selectedIds.filter((id) => ids.has(id)),
  }
}

export function editorReducer(state, action) {
  const objects = getCurrentPage(state).objects

  switch (action.type) {
    case 'checkpoint':
      return {
        ...withHistory(state),
        // 취소한 드래그는 새 편집이 아니므로 이전 Redo와 이력 상한 이전의 Past도 복원한다.
        pendingCheckpoint: { doc: state.doc, past: state.past, future: state.future },
      }

    // 자르기 취소처럼 checkpoint 이후의 변경을 버리고 그 시점으로 돌아간다.
    case 'revertToCheckpoint': {
      if (state.pendingCheckpoint) return normalizeSelection({
        ...state,
        ...state.pendingCheckpoint,
        pendingCheckpoint: null,
      })
      if (!state.past.length) return state
      return normalizeSelection({
        ...state,
        doc: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
      })
    }

    case 'select':
      return {
        ...state,
        selectedIds: action.ids.length ? expandGroups(objects, action.ids) : [],
      }

    case 'selectAll':
      return {
        ...state,
        selectedIds: objects.filter((o) => !o.hidden).map((o) => o.id),
      }

    // 그룹을 펼치지 않고 그대로 선택 (그룹 안 요소 하나만 고칠 때)
    case 'selectExact':
      return { ...state, selectedIds: action.ids }

    case 'toggleSelect': {
      const target = action.exact ? [action.id] : expandGroups(objects, [action.id])
      const isSelected = state.selectedIds.includes(action.id)
      const selectedIds = isSelected
        ? state.selectedIds.filter((id) => !target.includes(id))
        : [...new Set([...state.selectedIds, ...target])]
      return { ...state, selectedIds }
    }

    // 다이어리 이름 바꾸기 (상단바). 되돌리기로 돌아갈 수 있다.
    case 'renameDoc': {
      const next = withHistory(state)
      return { ...next, doc: { ...next.doc, title: action.title } }
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
      return {
        ...next,
        selectedIds: state.selectedIds.filter((id) => !removing.has(id)),
      }
    }

    case 'duplicateObjects': {
      const sources = objects.filter((o) => action.ids.includes(o.id))
      if (!sources.length) return state
      const copies = cloneObjects(sources, PASTE_OFFSET)
      const next = updateObjects(withHistory(state), (list) => [...list, ...copies])
      return { ...next, selectedIds: copies.map((o) => o.id) }
    }

    // 다른 페이지에서 복사한 것도 붙여 넣을 수 있도록 오브젝트 자체를 받는다.
    case 'pasteObjects': {
      if (!action.objects.length) return state
      const copies = cloneObjects(action.objects, action.offset ?? PASTE_OFFSET)
      const next = updateObjects(withHistory(state), (list) => [...list, ...copies])
      return { ...next, selectedIds: copies.map((o) => o.id) }
    }

    case 'align':
      return updateObjects(withHistory(state), (list) => alignObjects(list, action.ids, action.mode, getCurrentPage(state)))

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

    // 묶을 때 레이어도 맨 위 요소 자리로 모아 한 덩어리로 만든다. (레이어 패널에서 폴더처럼 보인다)
    case 'group': {
      if (action.ids.length < 2) return state
      const groupId = createId()
      return updateObjects(withHistory(state), (list) => {
        const picked = new Set(action.ids)
        const top = Math.max(...list.map((o, i) => (picked.has(o.id) ? i : -1)))
        const below = list.slice(0, top + 1).filter((o) => !picked.has(o.id))
        const above = list.slice(top + 1)
        const members = list.filter((o) => picked.has(o.id)).map((o) => ({ ...o, groupId }))
        return [...below, ...members, ...above]
      })
    }

    // 레이어 패널 끌어 놓기: ids 를 anchorId 바로 위(앞) 또는 아래(뒤)로 옮긴다.
    case 'moveLayers': {
      const moving = new Set(action.ids)
      if (moving.has(action.anchorId)) return state
      return updateObjects(withHistory(state), (list) => {
        const picked = list.filter((o) => moving.has(o.id))
        const rest = list.filter((o) => !moving.has(o.id))
        const anchor = rest.findIndex((o) => o.id === action.anchorId)
        if (anchor < 0) return list
        const at = action.place === 'above' ? anchor + 1 : anchor
        const next = [...rest.slice(0, at), ...picked, ...rest.slice(at)]
        return action.ids.length === 1 ? settleMembership(next, action.ids[0]) : next
      })
    }

    case 'ungroup':
      return updateObjects(withHistory(state), (list) =>
        list.map((o) => (action.ids.includes(o.id) ? { ...o, groupId: undefined } : o)),
      )

    case 'addPage': {
      const page = action.backgroundAssetId ? createTemplatePage(action.backgroundAssetId) : createBlankPage()
      const index = state.doc.pages.findIndex((p) => p.id === getCurrentPage(state).id)
      const pages = [...state.doc.pages]
      pages.splice(index + 1, 0, page)
      return {
        ...withHistory(state),
        doc: { ...state.doc, pages },
        pageId: page.id,
        selectedIds: [],
      }
    }

    // 페이지 목록에서 썸네일을 끌어 순서를 바꾼다. (지금 보던 페이지는 그대로)
    case 'movePage': {
      const from = state.doc.pages.findIndex((p) => p.id === action.id)
      const to = clamp(action.toIndex, 0, state.doc.pages.length - 1)
      if (from < 0 || from === to) return state
      const pages = [...state.doc.pages]
      const [moved] = pages.splice(from, 1)
      pages.splice(to, 0, moved)
      return { ...withHistory(state), doc: { ...state.doc, pages } }
    }

    case 'removePage': {
      if (state.doc.pages.length <= 1) return state
      const index = state.doc.pages.findIndex((p) => p.id === action.id)
      const pages = state.doc.pages.filter((p) => p.id !== action.id)
      const pageId = state.pageId === action.id ? pages[Math.max(0, index - 1)].id : state.pageId
      return normalizeSelection({
        ...withHistory(state),
        doc: { ...state.doc, pages },
        pageId,
      })
    }

    case 'undo':
      if (!state.past.length) return state
      return normalizeSelection({
        ...state,
        doc: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        pendingCheckpoint: null,
      })

    case 'redo':
      if (!state.future.length) return state
      return normalizeSelection({
        ...state,
        doc: state.future[0],
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        pendingCheckpoint: null,
      })

    case 'load':
      return createInitialState(action.doc)

    default:
      throw new Error(`Unknown editor action: ${action.type}`)
  }
}
