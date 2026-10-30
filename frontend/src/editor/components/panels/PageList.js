import PageBulkDelete from '../controls/PageBulkDelete'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '../../../shared/theme'
import { pageSize } from '../../utils/pageGeometry.js'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import Icon from '../controls/Icon'
import TapCatcher from '../controls/TapCatcher'
import PageThumbnail from './PageThumbnail'

const THUMB_WIDTH = 124
const THUMB_BORDER = 1
const HOLD_MS = 280 // 이만큼 누르고 있으면 끌어서 순서 바꾸기 시작 (그 전에 움직이면 목록 스크롤)
const TAP_SLOP = 8
const THUMB_BACKGROUND_DELAY_MS = 250
// 끌기 중 자동 스크롤: 목록 위·아래 끝에서 이만큼 안쪽부터 넘기기 시작하고, 끝에 가까울수록(넘어갈수록) 빨라진다
const AUTO_SCROLL_EDGE = 56
const AUTO_SCROLL_MAX_SPEED = 14 // 한 번(16ms)에 넘기는 최대 px

// 왼쪽 페이지 목록 폭. 열고 닫을 때 작업창 크기를 한 번에 맞추는 데도 쓴다 (EditorScreen)
export const PAGE_LIST_WIDTH = 156

/**
 * 페이지 목록. 같은 원본으로 표시하되 웹의 무거운 썸네일은 축소 캐시를 재사용한다.
 * - 탭: 그 페이지로 이동 (고른 페이지도 그 하나만)
 * - 고른 페이지(지금 페이지 포함)를 길게 눌러 끌기: 순서 바꾸기. 여러 개 골라 두었으면 함께 옮긴다 (놓을 자리에 선이 보인다)
 * - 고르지 않은 페이지를 길게 누르기: 여러 개 고르기 모드에 들어가 그 페이지를 넣는다. 이어서 위아래로 끌면 그 사이를 모두 고른다
 *   모드 중에는 탭으로 넣고 빼고, 위쪽이 'N개 선택 · 해제' 로 바뀐다. 함께 끄는 페이지에는 개수가 붙는다 (레이어 패널과 같다)
 * - 끄는 손가락이 목록 위·아래 끝 근처나 바깥으로 나가면 목록이 그쪽으로 넘어간다
 * - 위쪽 탭: 전체 / 북마크(책갈피를 단 페이지). 넓게 보기 버튼은 모든 페이지를 크게 펼친다 (GoodNotes 의 페이지 보기처럼)
 * - 페이지 메뉴: 복제, 삭제 (순서는 썸네일을 길게 눌러 끌어서 바꾼다)
 */
export default function PageList({ pages, currentId, cropId, onSelect, onAdd, onDuplicate, onToggleIndex, onRemove, onRemovePages, onReset, canUndoDelete = true, onMove, onMovePages, onEmptyTap, readOnly = false, qaMeasurement = null }) {
  useLayoutEffect(() => {
    qaMeasurement?.emit('panel-layout')
    if (!qaMeasurement) return
    let second
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => qaMeasurement.emit('panel-frame-opportunity')) })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [qaMeasurement])
  const [drag, setDrag] = useState(null) // { id, from, dy, group } — 끌어서 옮기는 중
  // 고른 페이지들. 평소에는 지금 페이지 하나이고, 길게 눌러 여러 개를 고른다.
  const [picked, setPicked] = useState([currentId])
  const [ranging, setRanging] = useState(false) // 길게 눌러 범위 고르는 중 (목록이 손가락을 스크롤로 가져가지 않게)
  const [pickMode, setPickMode] = useState(false) // 여러 개 고르기 모드: 탭으로 넣고 뺀다
  const endPickMode = () => { setPickMode(false); setPicked([currentId]) }
  // 모드 중 탭: 넣거나 뺀다. 다 빼면 모드를 끝낸다
  const togglePick = (id) => {
    const next = pickedRef.current.includes(id) ? pickedRef.current.filter((p) => p !== id) : [...pickedRef.current, id]
    setPicked(next)
  }
  const pickedRef = useRef(picked)
  pickedRef.current = picked
  useEffect(() => { if (!pickedRef.current.includes(currentId)) setPicked([currentId]) }, [currentId])
  const [menuId, setMenuId] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'bookmarked'
  const shown = filter === 'bookmarked' ? pages.filter((page) => page.indexed) : pages
  const numberOf = (page) => pages.indexOf(page) + 1
  const [scrollY, setScrollY] = useState(0)
  const [panelHeight, setPanelHeight] = useState(0)
  // 썸네일 속지(80KB 안팎 SVG)는 편집 화면 속지가 먼저 그려지도록 잠시 뒤에 그린다.
  // InteractionManager는 편집기의 열린 제스처 핸들 때문에 끝내 실행되지 않을 수 있어 타이머를 쓴다.
  const [thumbBackgrounds, setThumbBackgrounds] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setThumbBackgrounds(true), THUMB_BACKGROUND_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])
  const layouts = useRef({}) // id → { y, height } (목록 안 위치)
  // 끌기 중 자동 스크롤. 손가락은 화면에 그대로인데 목록이 넘어가므로, 넘어간 만큼 끄는 썸네일 위치(dy)에 더한다.
  const listRef = useRef(null)
  const scrollOffset = useRef(0)
  const listHeight = useRef(0)
  const contentHeight = useRef(0)
  const dragInfo = useRef(null) // { id, from, finger, scrollStart, pointerStart }
  const autoScroll = useRef(null)
  const effectiveDy = (info) => info.finger + scrollOffset.current - info.scrollStart
  const stopAutoScroll = () => {
    clearInterval(autoScroll.current)
    autoScroll.current = null
  }
  useEffect(() => stopAutoScroll, [])
  // 범위 고르기: 길게 누른 페이지(from)부터 손가락이 있는 페이지까지를 처음 고른 것(base)에 더한다
  const pickRange = (info) => {
    const to = dropIndex(pages, layouts.current, { id: info.id, from: info.from, dy: effectiveDy(info) })
    const ids = pages.slice(Math.min(info.from, to), Math.max(info.from, to) + 1).map((page) => page.id)
    setPicked([...new Set([...info.base, ...ids])])
  }
  const startDrag = (id, from) => {
    const height = layouts.current[id]?.height ?? 0
    // 손가락 위치(목록 화면 기준)는 끄는 썸네일 가운데에서 시작한다고 본다
    const pointerStart = LIST_PADDING + itemTop(pages, layouts.current, id) - scrollOffset.current + height / 2
    const current = pickedRef.current
    const mode = current.includes(id) ? 'move' : 'range'
    const base = mode === 'range' ? [...current, id] : current
    dragInfo.current = { id, from, finger: 0, scrollStart: scrollOffset.current, pointerStart, mode, base }
    if (mode === 'range') { setPicked(base); setRanging(true); setPickMode(true) }
    else setDrag({ id, from, dy: 0, group: current.length > 1 })
    stopAutoScroll()
    autoScroll.current = setInterval(() => {
      const info = dragInfo.current
      if (!info) return
      const pointer = info.pointerStart + info.finger
      const bottomEdge = listHeight.current - AUTO_SCROLL_EDGE
      const depth = pointer < AUTO_SCROLL_EDGE ? pointer - AUTO_SCROLL_EDGE : pointer > bottomEdge ? pointer - bottomEdge : 0
      if (!depth) return
      const speed = clamp((depth / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_SPEED, -AUTO_SCROLL_MAX_SPEED, AUTO_SCROLL_MAX_SPEED)
      const maxOffset = Math.max(0, contentHeight.current - listHeight.current)
      const next = clamp(scrollOffset.current + speed, 0, maxOffset)
      if (next === scrollOffset.current) return
      scrollOffset.current = next
      listRef.current?.scrollToOffset({ offset: next, animated: false })
      if (info.mode === 'range') pickRange(info)
      else setDrag({ id: info.id, from: info.from, dy: effectiveDy(info), group: pickedRef.current.length > 1 })
    }, 16)
  }
  const moveDrag = (fingerDy) => {
    const info = dragInfo.current
    if (!info) return
    info.finger = fingerDy
    if (info.mode === 'range') pickRange(info)
    else setDrag({ id: info.id, from: info.from, dy: effectiveDy(info), group: pickedRef.current.length > 1 })
  }
  const endDrag = (fingerDy, cancelled) => {
    const info = dragInfo.current
    dragInfo.current = null
    stopAutoScroll()
    setDrag(null)
    setRanging(false)
    if (!info || cancelled || info.mode === 'range') return
    info.finger = fingerDy
    const to = dropIndex(pages, layouts.current, { id: info.id, from: info.from, dy: effectiveDy(info) })
    const group = pickedRef.current
    if (group.length > 1) {
      // 고른 페이지를 모두 놓은 자리로 함께 옮긴다. 놓은 자리가 함께 옮기는 페이지면 같은 방향으로 처음 만나는 다른 페이지에 붙인다
      const place = to < info.from ? 'before' : 'after'
      const step = place === 'before' ? -1 : 1
      let i = to
      while (i >= 0 && i < pages.length && group.includes(pages[i].id)) i += step
      if (to === info.from || i < 0 || i >= pages.length) return
      onMovePages?.(pages.filter((page) => group.includes(page.id)).map((page) => page.id), pages[i].id, place)
      return
    }
    if (to !== info.from) onMove(info.id, to)
  }
  const target = drag ? dropIndex(pages, layouts.current, drag) : null
  const menuPage = menuId ? pages.find((page) => page.id === menuId) : null
  const menuIndex = menuPage ? pages.findIndex((page) => page.id === menuPage.id) : -1
  const menuActionCount = 1 + Number(pages.length > 1)
  const menuHeight = 42 + menuActionCount * 48
  const openMenu = (id) => setMenuId((current) => (current === id ? null : id))
  const [headerHeight, setHeaderHeight] = useState(0)
  // 메뉴는 그 페이지 높이에 맞춘다. 항목 위치는 앞 항목들 높이를 더해 구한다 (FlatList 항목의 onLayout y 는 늘 0)
  const menuItemTop = menuId ? itemTop(shown, layouts.current, menuId) : 0
  const rawMenuTop = menuId ? headerHeight + LIST_PADDING + menuItemTop - scrollY : 8
  // 하단 페이지에서도 메뉴가 잘리지 않도록 패널 안쪽으로만 보정한다.
  const menuTop = Math.max(8, Math.min(rawMenuTop, Math.max(8, panelHeight - menuHeight - 8)))

  return (
    <View style={styles.panel} onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)}>
      <View style={styles.header} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
        {/* 여러 개 고르기 중에는 탭 줄이 'N개 선택 · 해제' 로 바뀐다 (같은 높이라 목록이 밀리지 않는다) */}
        {pickMode ? (
          <View style={styles.pickBar}>
            <Text style={styles.pickText}>{picked.length}개 선택</Text>
            <Pressable onPress={endPickMode} hitSlop={8} accessibilityRole="button" accessibilityLabel="여러 페이지 선택 해제" style={styles.pickDone}>
              <Text style={styles.pickDoneText}>완료</Text>
            </Pressable>
          </View>
        ) : (
        <View style={styles.tabs}>
          {[['all', '전체'], ['bookmarked', '북마크']].map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => { setMenuId(null); endPickMode(); setFilter(id) }}
              accessibilityRole="button"
              accessibilityLabel={`${label} 페이지 보기`}
              accessibilityState={{ selected: filter === id }}
              style={[styles.tab, filter === id && styles.tabActive]}
            >
              <Text style={[styles.tabText, filter === id && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        )}
      </View>
      {!readOnly && <View style={{ paddingHorizontal: 8 }}>
        {pickMode ? <PageBulkDelete pages={pages} ids={picked} onDelete={onRemovePages} onReset={onReset} canUndoDelete={canUndoDelete} onDone={endPickMode} />
          : <View style={styles.editRow}><Pressable accessibilityRole="button" accessibilityLabel="페이지 편집" hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => [styles.editButton, pressed && styles.editPressed]} onPress={() => { setMenuId(null); setPicked([]); setPickMode(true) }}><Icon name="pen" size={14} /><Text style={styles.editText}>편집</Text></Pressable></View>}
      </View>}
      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(page) => page.id}
        contentContainerStyle={styles.list}
        scrollEnabled={!drag && !ranging}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y
          setScrollY(event.nativeEvent.contentOffset.y)
        }}
        onLayout={(event) => (listHeight.current = event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => (contentHeight.current = height)}
        scrollEventThrottle={32}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        windowSize={5}
        // 끄는 동안에는 원래 칸이 스크롤로 화면 밖에 나가도 끄는 썸네일이 잘려 사라지지 않게 끈다
        removeClippedSubviews={!drag}
        extraData={[filter, picked]}
        renderItem={({ item: page, index }) => {
          const active = page.id === currentId
          const dragging = drag?.id === page.id
          const multi = pickMode && picked.includes(page.id)
          return <PageItem
            page={page}
            index={index}
            number={numberOf(page)}
            // 북마크만 볼 때는 끌어서 순서를 바꾸지 않는다 (사이에 숨은 페이지가 있어서)
            canDrag={filter === 'all'}
            active={active}
            picked={multi}
            pickMode={pickMode}
            // 여러 개를 함께 옮기는 중: 끄는 페이지 말고 고른 페이지들은 흐리게
            carried={Boolean(drag?.group && multi && !dragging)}
            dragCount={dragging && drag.group ? picked.length : 0}
            dragging={dragging}
            dy={dragging ? drag.dy : 0}
            dropLine={drag && !dragging && target === index ? (target < drag.from ? 'before' : 'after') : null}
            cropId={active ? cropId : null}
            showBackground={thumbBackgrounds}
            readOnly={readOnly}
            menuOpen={!readOnly && menuId === page.id}
            canOpenMenu={!readOnly && !drag && !pickMode}
            canToggleIndex={!readOnly && !drag && !pickMode}
            onLayout={(layout) => (layouts.current[page.id] = layout)}
            onSelect={() => {
              setMenuId(null)
              if (pickMode) return togglePick(page.id)
              setPicked([page.id])
              onSelect(page.id)
            }}
            onMenu={() => openMenu(page.id)}
            onToggleIndex={() => onToggleIndex(page.id)}
            onDragStart={() => startDrag(page.id, index)}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
          />
        }}
        ListFooterComponent={onEmptyTap ? <TapCatcher onTap={onEmptyTap} style={styles.emptyArea} /> : null}
      />
      {menuPage && (
        <View style={[styles.actionMenu, { top: menuTop }]}>
          <Text style={styles.actionMenuTitle}>{pages.findIndex((page) => page.id === menuId) + 1}페이지</Text>
          <Pressable onPress={() => { onDuplicate(menuId); setMenuId(null) }} style={styles.action} accessibilityLabel="페이지 복제">
            <Icon name="copy" size={18} color={colors.primary} /><Text style={styles.actionText}>페이지 복제</Text>
          </Pressable>
          {pages.length > 1 && (
            <Pressable onPress={() => { onRemove(menuId); setMenuId(null) }} style={styles.action} accessibilityLabel="페이지 삭제">
              <Icon name="trash" size={18} color={colors.danger} /><Text style={styles.deleteText}>페이지 삭제</Text>
            </Pressable>
          )}
        </View>
      )}
      {!readOnly && (
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.add, pressed && styles.addPressed]} accessibilityLabel="페이지 추가">
          <Icon name="plus" size={20} />
        </Pressable>
      )}
    </View>
  )
}

const ITEM_GAP = 16 // styles.list 의 gap
const LIST_PADDING = 16 // styles.list 의 paddingVertical

/** 목록 안에서 id 항목의 위쪽 위치 (앞 항목들 높이 + 간격의 합) */
function itemTop(pages, layouts, id) {
  let y = 0
  for (const page of pages) {
    if (page.id === id) return y
    y += (layouts[page.id]?.height ?? 0) + ITEM_GAP
  }
  return y
}

/**
 * 끌고 있는 썸네일의 가운데가 들어간 자리.
 * FlatList 항목의 onLayout 위치는 항목 칸 기준(y 가 늘 0)이라, 목록 안 위치는 앞 항목들의 높이를 더해 구한다.
 * (잰 높이가 없는 항목은 끄는 항목 높이로 어림한다)
 */
function dropIndex(pages, layouts, drag) {
  const self = layouts[drag.id]
  if (!self) return drag.from
  const tops = []
  let y = 0
  for (const page of pages) {
    tops.push(y)
    y += (layouts[page.id]?.height ?? self.height) + ITEM_GAP
  }
  const heightOf = (i) => layouts[pages[i].id]?.height ?? self.height
  const center = tops[drag.from] + self.height / 2 + drag.dy
  let index = drag.from
  pages.forEach((page, i) => {
    const middle = tops[i] + heightOf(i) / 2
    if (i < drag.from && center < middle) index = Math.min(index, i)
    if (i > drag.from && center > middle) index = Math.max(index, i)
  })
  return clamp(index, 0, pages.length - 1)
}

const PageItem = memo(function PageItem({ page, index, number, canDrag = true, active, picked = false, carried = false, dragCount = 0, pickMode = false, showBackground, dragging, dy, dropLine, cropId, readOnly, menuOpen, canOpenMenu, canToggleIndex, onLayout, onSelect, onMenu, onToggleIndex, onDragStart, onDragMove, onDragEnd }) {
  const { width, height } = pageSize(page)
  // 썸네일 그림은 테두리(1px) 안쪽 크기에 정확히 맞춘다. 넘치면 Android 에서 아래쪽 테두리를 덮었다.
  const thumbZoom = (THUMB_WIDTH - THUMB_BORDER * 2) / width
  const press = useRef(null)
  const handlers = usePan({
    onStart: () => {
      const state = { holding: false, moved: false, dy: 0, timer: null }
      if (!readOnly && canDrag)
        state.timer = setTimeout(() => {
          if (state.moved) return
          state.holding = true
          onDragStart()
        }, HOLD_MS)
      press.current = state
    },
    onMove: (dx, moveDy) => {
      const state = press.current
      if (!state) return
      state.dy = moveDy
      if (!state.holding && Math.hypot(dx, moveDy) > TAP_SLOP) state.moved = true
      if (state.holding) onDragMove(moveDy)
    },
    onEnd: ({ cancelled }) => {
      const state = press.current
      press.current = null
      if (!state) return
      clearTimeout(state.timer)
      if (state.holding) onDragEnd(state.dy, cancelled)
      else if (!state.moved && !cancelled) onSelect()
    },
  })

  return (
    <View
      style={[styles.item, dragging && { zIndex: 2, transform: [{ translateY: dy }, { scale: 1.04 }] }, carried && styles.carried]}
      onLayout={(event) => onLayout(event.nativeEvent.layout)}
    >
      {dropLine && <View style={[styles.dropLine, dropLine === 'before' ? styles.dropBefore : styles.dropAfter]} />}
      {dragCount > 1 && <View style={styles.countBadge} pointerEvents="none"><Text style={styles.countText}>{dragCount}</Text></View>}
      <View
        {...handlers}
        accessibilityRole={pickMode ? "checkbox" : "button"}
        accessibilityState={pickMode ? { checked: picked } : undefined}
        accessibilityLabel={`${number}페이지`}
        accessibilityHint={readOnly ? undefined : '길게 눌러 끌면 순서를 바꿔요'}
        style={[styles.thumb, { height: height * thumbZoom + THUMB_BORDER * 2 }, active && styles.thumbActive, dragging && styles.thumbDragging]}
      >
        {/* 지금 편집 중인 페이지는 움직이는 GIF·자르기 표시까지 편집 화면과 똑같이, 나머지는 첫 장면으로 */}
        <View style={styles.thumbPage} pointerEvents="none">
          <PageThumbnail page={page} zoom={thumbZoom} still cropId={cropId} showBackground={showBackground} />
        </View>
        {/* 선택 테두리는 썸네일 위에 겹쳐 그린다 (썸네일에 아래쪽 선이 가려지던 문제) */}
        {(pickMode ? picked : active) && <View style={styles.activeRing} pointerEvents="none" />}
        {picked && <View style={styles.pickedCheck} pointerEvents="none"><Icon name="check" size={12} color={colors.surface} strokeWidth={3} /></View>}
      </View>
      {canToggleIndex && (
        <Pressable
          onPress={onToggleIndex}
          hitSlop={11}
          accessibilityRole="button"
          accessibilityLabel={page.indexed ? '인덱스 해제' : '인덱스 추가'}
          accessibilityState={{ selected: Boolean(page.indexed) }}
          style={styles.indexBadge}
        >
          <Icon
            name="bookmark"
            size={17}
            color={page.indexed ? colors.primary : colors.textMuted}
            fill={page.indexed ? colors.primary : 'none'}
            strokeWidth={2.2}
          />
        </Pressable>
      )}
      <Text style={[styles.number, active && styles.numberActive]}>{number}</Text>
      {canOpenMenu && (
        <Pressable onPress={onMenu} style={[styles.more, menuOpen && styles.moreActive]} hitSlop={8} accessibilityLabel="페이지 작업 메뉴" accessibilityState={{ expanded: menuOpen }}>
          <Icon name="more" size={18} color={menuOpen ? colors.primary : colors.textMuted} />
        </Pressable>
      )}
    </View>
  )
}, (previous, next) => (
  previous.page === next.page
  && previous.index === next.index
  && previous.number === next.number
  && previous.canDrag === next.canDrag
  && previous.active === next.active
  && previous.picked === next.picked
  && previous.pickMode === next.pickMode
  && previous.dragCount === next.dragCount
  && previous.carried === next.carried
  && previous.showBackground === next.showBackground
  && previous.dragging === next.dragging
  && previous.dy === next.dy
  && previous.dropLine === next.dropLine
  && previous.cropId === next.cropId
  && previous.readOnly === next.readOnly
  && previous.menuOpen === next.menuOpen
  && previous.canOpenMenu === next.canOpenMenu
  && previous.canToggleIndex === next.canToggleIndex
))

const styles = StyleSheet.create({
  editRow: { minHeight: 44, marginVertical: 2, justifyContent: 'center' },
  editButton: { height: 32, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  editText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },
  editPressed: { opacity: 0.65 },
  panel: { width: PAGE_LIST_WIDTH, flexShrink: 0, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.58)', overflow: 'visible', zIndex: 3 },
  list: { flexGrow: 1, alignItems: 'center', gap: 16, paddingVertical: 16 },
  emptyArea: { flexGrow: 1, alignSelf: 'stretch', minHeight: 24 },
  item: { position: 'relative', alignItems: 'center', gap: 6 },
  thumb: {
    width: THUMB_WIDTH,
    borderRadius: 8,
    overflow: 'visible',
    borderWidth: THUMB_BORDER,
    borderColor: 'rgba(11,23,102,0.1)',
    backgroundColor: '#FFFFFF',
  },
  thumbPage: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 7, backgroundColor: '#FFFFFF' },
  thumbActive: { borderColor: 'transparent' },
  carried: { opacity: 0.4 },
  pickBar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 32, padding: 2, borderRadius: 9, backgroundColor: 'rgba(11,23,102,0.06)' },
  pickText: { flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  pickDone: { height: 28, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: colors.surface },
  pickDoneText: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  countBadge: { position: 'absolute', top: -8, right: 4, zIndex: 3, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  countText: { fontSize: 12, fontWeight: '700', color: colors.surface },
  pickedCheck: { position: 'absolute', right: 6, bottom: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  activeRing: { position: 'absolute', top: -THUMB_BORDER, left: -THUMB_BORDER, right: -THUMB_BORDER, bottom: -THUMB_BORDER, borderRadius: 8, borderWidth: 2, borderColor: colors.primary },
  // 탭 줄은 아래 썸네일보다 양쪽으로 조금(6) 더 넓게
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: (PAGE_LIST_WIDTH - THUMB_WIDTH) / 2 - 6, paddingTop: 10 },
  tabs: { flex: 1, flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: 'rgba(11,23,102,0.06)' },
  tab: { flex: 1, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text },
  thumbDragging: {
    shadowColor: colors.text,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dropLine: { position: 'absolute', left: -6, right: -6, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  dropBefore: { top: -9.5 },
  dropAfter: { bottom: -9.5 },
  number: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  numberActive: { color: colors.text },
  more: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  moreActive: { backgroundColor: colors.primarySoft },
  indexBadge: { position: 'absolute', top: 6, left: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', zIndex: 4 },
  actionMenu: { position: 'absolute', left: THUMB_WIDTH + 14, width: 178, padding: 8, gap: 2, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(11,23,102,0.12)', elevation: 8, zIndex: 10 },
  actionMenuTitle: { paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: '700', color: colors.textMuted },
  action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 9 },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.text },
  deleteText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  add: {
    height: 46,
    margin: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(129,138,195,0.34)',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  addPressed: { backgroundColor: colors.primarySoft },
})
