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
import { normalizePaperAppearance } from '../templates/appearance.js'

const HISTORY_LIMIT = 80
const PASTE_OFFSET = 24

export function createInitialState(doc, viewedPageId) {
  return {
    doc,
    past: [],
    future: [],
    pendingCheckpoint: null,
    pageId: (doc.pages.find((page) => page.id === viewedPageId) ?? doc.pages[0]).id,
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
 * 페이지 복제본은 원본과 같은 소재(mediaFileId)는 참조하되, 편집 대상인
 * 속지·배색·플래너 기록 등 페이지 내용을 깊게 복사하고 페이지·요소·그룹 ID는
 * 모두 새로 만든다. 따라서 한쪽 페이지의 요소를
 * 이동·삭제·수정해도 다른 페이지에는 영향을 주지 않는다.
 */
function clonePage(page) {
  const copyPage = JSON.parse(JSON.stringify(page))
  const groupMap = new Map()
  return {
    ...copyPage,
    id: createId(),
    objects: copyPage.objects.map((copy) => {
      let groupId = copy.groupId
      if (groupId) {
        if (!groupMap.has(groupId)) groupMap.set(groupId, createId())
        groupId = groupMap.get(groupId)
      }
      return { ...copy, id: createId(), groupId }
    }),
  }
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
    case 'reconcileServerPages': {
      const ids=new Set(action.pageIds),existing=new Map(state.doc.pages.map(p=>[p.id,p]))
      for(const p of action.pages)if(!existing.has(p.id))existing.set(p.id,p)
      const removed=state.doc.pages.filter(p=>!ids.has(p.id))
      if(!state.serverPagesEmpty&&!removed.length&&!action.pages.length&&action.pageIds.length===state.doc.pages.length&&action.pageIds.every((id,i)=>state.doc.pages[i].id===id))return state
      const recovery=[...(state.doc.pageRecovery??[])]
      for(const page of removed)if(!recovery.some(r=>r.page.id===page.id))recovery.push({page,reason:'NOT_IN_SERVER_PAGE_LIST'})
      const pages=action.pageIds.map(id=>existing.get(id)).filter(Boolean)
      // The editor always needs a visible page. If the server is empty, keep a
      // read-only recovery view rather than inventing a new server page UUID.
      if(!pages.length)return {...state,serverPagesEmpty:true,externalDirty:true,doc:{...state.doc,pageRecovery:recovery},collaborationEdits:[]}
      const selected=ids.has(state.pageId)?state.pageId:pages[0].id
      const adapt=doc=>({...doc,pages:pages.map(p=>doc.pages.find(old=>old.id===p.id)??p)})
      return {...state,serverPagesEmpty:false,externalDirty:true,
        doc:{...state.doc,pages,...(removed.length?{pageRecovery:recovery}:{})},pageId:selected,
        selectedIds:selected===state.pageId?state.selectedIds:[],
        past:state.past.map(adapt),future:state.future.map(adapt),
        pendingCheckpoint:state.pendingCheckpoint?{...state.pendingCheckpoint,doc:adapt(state.pendingCheckpoint.doc)}:null,
        collaborationGesture:state.collaborationGesture&&ids.has(state.collaborationGesture.pageId)?state.collaborationGesture:null,
        collaborationEdits:(state.collaborationEdits??[]).filter(e=>ids.has(e.pageId))}
    }
    case 'importServerPages': {
      const known=new Set(state.doc.pages.map(p=>p.id)),added=action.pages.filter(p=>!known.has(p.id))
      if(!added.length&&!action.selectId)return state
      const pages=[...state.doc.pages,...added]
      return {...state,externalDirty:true,doc:{...state.doc,pages},
        ...(action.selectId&&pages.some(p=>p.id===action.selectId)?{pageId:action.selectId,selectedIds:[]}: {})}
    }
    case 'commitCheckpoint': return state
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

    // replacements: { [id]: 바꿀 요소들 } — 영역 지우개처럼 한 요소를 같은 층 위치의 여러 조각(또는 없음)으로 바꾼다. 되돌리기 한 번.
    case 'replaceObjects': {
      const next = updateObjects(withHistory(state), (list) => list.flatMap((o) => action.replacements[o.id] ?? [o]))
      return { ...next, selectedIds: state.selectedIds.filter((id) => !action.replacements[id]) }
    }

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

    // count 장을 position(after: 지금 페이지 뒤 · before: 앞 · end: 맨 끝)에 넣고 첫 새 페이지로 간다.
    // paperAppearance 를 주면 새 페이지만 그 색으로 칠한다. (없으면 문서 기본 색)
    case 'addPage': {
      const appearance = action.paperAppearance ? normalizePaperAppearance(action.paperAppearance) : state.doc.paperAppearance
      // assetIds: 여러 속지를 섞어 넣을 때 순서대로. 없으면 backgroundAssetId 를 count 장
      const count = Math.max(1, Math.min(50, Math.floor(action.count ?? 1)))
      const ids = Array.isArray(action.assetIds) && action.assetIds.length ? action.assetIds.slice(0, 200) : Array.from({ length: count }, () => action.backgroundAssetId ?? null)
      const added = ids.map((id) => {
        const created = id ? createTemplatePage(id, appearance) : createBlankPage(state.doc.orientation)
        return appearance ? { ...created, paperAppearance: appearance } : created
      })
      const index = state.doc.pages.findIndex((p) => p.id === getCurrentPage(state).id)
      const at = action.position === 'end' ? state.doc.pages.length : action.position === 'before' ? index : index + 1
      const pages = [...state.doc.pages]
      pages.splice(at, 0, ...added)
      return {
        ...withHistory(state),
        doc: { ...state.doc, pages },
        pageId: added[0].id,
        selectedIds: [],
      }
    }

    // 현재 페이지 바로 다음에 복제본을 넣고, 복제본으로 이동한다.
    // 요소 ID를 새로 만들어 두 페이지의 편집 상태가 서로 섞이지 않게 한다.
    case 'duplicatePage': {
      const source = state.doc.pages.find((page) => page.id === (action.id ?? state.pageId))
      if (!source) return state
      const page = clonePage(source)
      const index = state.doc.pages.findIndex((item) => item.id === source.id)
      const pages = [...state.doc.pages]
      pages.splice(index + 1, 0, page)
      return {
        ...withHistory(state),
        doc: { ...state.doc, pages },
        pageId: page.id,
        selectedIds: [],
      }
    }

    // 인덱스는 페이지 자체에 저장한다. 같은 다이어리를 다시 열어도 상단 인덱스에서 바로 찾을 수 있다.
    case 'togglePageIndex': {
      const id = action.id ?? state.pageId
      if (!state.doc.pages.some((page) => page.id === id)) return state
      const next = withHistory(state)
      return {
        ...next,
        doc: {
          ...next.doc,
          pages: next.doc.pages.map((page) => (page.id === id ? { ...page, indexed: !page.indexed } : page)),
        },
      }
    }

    // 페이지 목록에서 썸네일을 끌어 순서를 바꾼다. (지금 보던 페이지는 그대로)
    // 여러 페이지를 순서 그대로 anchorId 페이지 앞(before)이나 뒤(after)로 함께 옮긴다. 되돌리기 한 번.
    // 속지 색: all 이면 모든 페이지와 문서 기본값(새로 추가할 페이지)에, 아니면 지금 페이지에만. 되돌리기 한 번.
    // 스터디 플래너 기록(칠한 칸 · 체크 · 옵션). after: 같은 되돌리기 단위로 먼저 적용할 동작(지우개가 획과 칸을 함께 지울 때)
    case 'setPlanner': {
      const base = action.after ? editorReducer(state, action.after) : withHistory(state)
      const pageId = action.pageId ?? getCurrentPage(state).id
      return { ...base, doc: { ...base.doc, pages: base.doc.pages.map((page) => (page.id === pageId ? { ...page, planner: action.planner } : page)) } }
    }

    case 'setPaperAppearance': {
      const pageId = getCurrentPage(state).id
      const appearance = normalizePaperAppearance(action.appearance)
      const pages = state.doc.pages.map((page) => (action.all || page.id === pageId ? { ...page, paperAppearance: appearance } : page))
      return { ...withHistory(state), doc: { ...state.doc, pages, ...(action.all && { paperAppearance: appearance }) } }
    }

    case 'movePages': {
      const moving = new Set(action.ids)
      if (moving.has(action.anchorId)) return state
      const picked = state.doc.pages.filter((p) => moving.has(p.id))
      const rest = state.doc.pages.filter((p) => !moving.has(p.id))
      const anchor = rest.findIndex((p) => p.id === action.anchorId)
      if (anchor < 0 || !picked.length) return state
      const at = action.place === 'before' ? anchor : anchor + 1
      return { ...withHistory(state), doc: { ...state.doc, pages: [...rest.slice(0, at), ...picked, ...rest.slice(at)] } }
    }

    case 'movePage': {
      const from = state.doc.pages.findIndex((p) => p.id === action.id)
      const to = clamp(action.toIndex, 0, state.doc.pages.length - 1)
      if (from < 0 || from === to) return state
      const pages = [...state.doc.pages]
      const [moved] = pages.splice(from, 1)
      pages.splice(to, 0, moved)
      return { ...withHistory(state), doc: { ...state.doc, pages } }
    }

    case 'resetDiary': {
      const size = pageSize(getCurrentPage(state))
      const page = { ...createBlankPage(state.doc.orientation), canvasWidth: size.width, canvasHeight: size.height,
        ...(state.doc.paperAppearance ? { paperAppearance: state.doc.paperAppearance } : {}) }
      return { ...withHistory(state), doc: { ...state.doc, pages: [page] }, pageId: page.id, selectedIds: [] }
    }

    case 'removePage':
    case 'removePages': {
      const removing = new Set(action.type === 'removePage' ? [action.id] : action.ids)
      const pages = state.doc.pages.filter((p) => !removing.has(p.id))
      // Keep at least one page; stale/empty requests do not create undo entries.
      if (!pages.length || pages.length === state.doc.pages.length) return state
      const index = state.doc.pages.findIndex((p) => p.id === state.pageId)
      const previous = state.doc.pages.slice(0, index).filter((p) => !removing.has(p.id)).at(-1)
      const pageId = removing.has(state.pageId) ? (previous ?? pages[0]).id : state.pageId
      return normalizeSelection({ ...withHistory(state), doc: { ...state.doc, pages }, pageId })
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

    // Server import/recovery never replaces other objects or newer local edits.
    // Keep this outside Undo history so it cannot erase already-made edits.
    case 'importPageTexts': {
      const page = state.doc.pages.find(p => p.id === action.pageId)
      if (!page || page.objects !== action.expectedObjects) return state
      const incoming = new Map(action.objects.map(o => [o.id, o]))
      const objects = page.objects.flatMap(o => {
        if (o.type !== 'text') return [o]
        const next = incoming.get(o.id)
        incoming.delete(o.id)
        return next ? [next] : []
      }).concat([...incoming.values()])
      const currentTexts = page.objects.filter(o => o.type === 'text')
      const nextTexts = objects.filter(o => o.type === 'text')
      if (JSON.stringify(currentTexts) === JSON.stringify(nextTexts)) return state
      return { ...state, externalDirty: true, doc: { ...state.doc, pages: state.doc.pages.map(p => p === page ? { ...p, objects } : p) } }
    }
    case 'load':
      return createInitialState(action.doc, action.pageId)

    default:
      throw new Error(`Unknown editor action: ${action.type}`)
  }
}
