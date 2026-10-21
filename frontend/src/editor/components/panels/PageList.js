import { memo, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '../../../shared/theme'
import { pageSize } from '../../utils/pageGeometry.js'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import Icon from '../controls/Icon'
import TapCatcher from '../controls/TapCatcher'
import StaticPage from '../canvas/StaticPage'

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
 * 페이지 목록. 썸네일은 편집 화면과 같은 StaticPage 로 그려 편집 내용을 그대로 비춘다.
 * - 탭: 그 페이지로 이동
 * - 길게 눌러 끌기: 페이지 순서 바꾸기 (놓을 자리에 선이 보인다)
 * - 위쪽 탭: 전체 / 북마크(책갈피를 단 페이지). 넓게 보기 버튼은 모든 페이지를 크게 펼친다 (GoodNotes 의 페이지 보기처럼)
 * - 페이지 메뉴: 복제, 삭제 (순서는 썸네일을 길게 눌러 끌어서 바꾼다)
 */
export default function PageList({ pages, currentId, cropId, onSelect, onAdd, onDuplicate, onToggleIndex, onRemove, onMove, onEmptyTap, onOpenOverview, readOnly = false }) {
  const [drag, setDrag] = useState(null) // { id, from, dy }
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
  const startDrag = (id, from) => {
    const height = layouts.current[id]?.height ?? 0
    // 손가락 위치(목록 화면 기준)는 끄는 썸네일 가운데에서 시작한다고 본다
    const pointerStart = LIST_PADDING + itemTop(pages, layouts.current, id) - scrollOffset.current + height / 2
    dragInfo.current = { id, from, finger: 0, scrollStart: scrollOffset.current, pointerStart }
    setDrag({ id, from, dy: 0 })
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
      setDrag({ id: info.id, from: info.from, dy: effectiveDy(info) })
    }, 16)
  }
  const moveDrag = (fingerDy) => {
    const info = dragInfo.current
    if (!info) return
    info.finger = fingerDy
    setDrag({ id: info.id, from: info.from, dy: effectiveDy(info) })
  }
  const endDrag = (fingerDy, cancelled) => {
    const info = dragInfo.current
    dragInfo.current = null
    stopAutoScroll()
    setDrag(null)
    if (!info || cancelled) return
    info.finger = fingerDy
    const to = dropIndex(pages, layouts.current, { id: info.id, from: info.from, dy: effectiveDy(info) })
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
        <View style={styles.tabs}>
          {[['all', '전체'], ['bookmarked', '북마크']].map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => { setMenuId(null); setFilter(id) }}
              accessibilityRole="button"
              accessibilityLabel={`${label} 페이지 보기`}
              accessibilityState={{ selected: filter === id }}
              style={[styles.tab, filter === id && styles.tabActive]}
            >
              <Text style={[styles.tabText, filter === id && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {onOpenOverview && (
          <Pressable onPress={() => onOpenOverview(filter)} hitSlop={6} accessibilityRole="button" accessibilityLabel="페이지 넓게 보기" style={({ pressed }) => [styles.expand, pressed && styles.addPressed]}>
            <Icon name="pages" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(page) => page.id}
        contentContainerStyle={styles.list}
        scrollEnabled={!drag}
        extraData={filter}
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
        renderItem={({ item: page, index }) => {
          const active = page.id === currentId
          const dragging = drag?.id === page.id
          return <PageItem
            page={page}
            index={index}
            number={numberOf(page)}
            // 북마크만 볼 때는 끌어서 순서를 바꾸지 않는다 (사이에 숨은 페이지가 있어서)
            canDrag={filter === 'all'}
            active={active}
            dragging={dragging}
            dy={dragging ? drag.dy : 0}
            dropLine={drag && !dragging && target === index ? (target < drag.from ? 'before' : 'after') : null}
            cropId={active ? cropId : null}
            showBackground={thumbBackgrounds}
            readOnly={readOnly}
            menuOpen={!readOnly && menuId === page.id}
            canOpenMenu={!readOnly && !drag}
            canToggleIndex={!readOnly && !drag}
            onLayout={(layout) => (layouts.current[page.id] = layout)}
            onSelect={() => { setMenuId(null); onSelect(page.id) }}
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

const PageItem = memo(function PageItem({ page, index, number, canDrag = true, active, showBackground, dragging, dy, dropLine, cropId, readOnly, menuOpen, canOpenMenu, canToggleIndex, onLayout, onSelect, onMenu, onToggleIndex, onDragStart, onDragMove, onDragEnd }) {
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
      style={[styles.item, dragging && { zIndex: 2, transform: [{ translateY: dy }, { scale: 1.04 }] }]}
      onLayout={(event) => onLayout(event.nativeEvent.layout)}
    >
      {dropLine && <View style={[styles.dropLine, dropLine === 'before' ? styles.dropBefore : styles.dropAfter]} />}
      <View
        {...handlers}
        accessibilityRole="button"
        accessibilityLabel={`${number}페이지`}
        accessibilityHint={readOnly ? undefined : '길게 눌러 끌면 순서를 바꿔요'}
        style={[styles.thumb, { height: height * thumbZoom + THUMB_BORDER * 2 }, active && styles.thumbActive, dragging && styles.thumbDragging]}
      >
        {/* 지금 편집 중인 페이지는 움직이는 GIF·자르기 표시까지 편집 화면과 똑같이, 나머지는 첫 장면으로 */}
        <View style={styles.thumbPage} pointerEvents="none">
          <StaticPage page={page} zoom={thumbZoom} still={!active} cropId={cropId} showBackground={showBackground} />
        </View>
        {/* 선택 테두리는 썸네일 위에 겹쳐 그린다 (썸네일에 아래쪽 선이 가려지던 문제) */}
        {active && <View style={styles.activeRing} pointerEvents="none" />}
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
  panel: { width: PAGE_LIST_WIDTH, flexShrink: 0, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.58)', overflow: 'visible', zIndex: 3 },
  list: { flexGrow: 1, alignItems: 'center', gap: 16, paddingVertical: 16 },
  emptyArea: { flexGrow: 1, alignSelf: 'stretch', minHeight: 24 },
  item: { position: 'relative', alignItems: 'center', gap: 6 },
  thumb: {
    width: THUMB_WIDTH,
    borderRadius: 8,
    overflow: 'visible',
    borderWidth: THUMB_BORDER,
    borderColor: 'rgba(11,25,87,0.1)',
    backgroundColor: '#FFFFFF',
  },
  thumbPage: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 7, backgroundColor: '#FFFFFF' },
  thumbActive: { borderColor: 'transparent' },
  activeRing: { position: 'absolute', top: -THUMB_BORDER, left: -THUMB_BORDER, right: -THUMB_BORDER, bottom: -THUMB_BORDER, borderRadius: 8, borderWidth: 2, borderColor: colors.primary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 10 },
  tabs: { flex: 1, flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: 'rgba(11,25,87,0.06)' },
  tab: { flex: 1, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text },
  expand: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  thumbDragging: {
    shadowColor: '#0B1957',
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
  actionMenu: { position: 'absolute', left: THUMB_WIDTH + 14, width: 178, padding: 8, gap: 2, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(11,25,87,0.12)', elevation: 8, zIndex: 10 },
  actionMenuTitle: { paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: '800', color: colors.textMuted },
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
    borderColor: 'rgba(110,146,198,0.34)',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  addPressed: { backgroundColor: colors.primarySoft },
})
