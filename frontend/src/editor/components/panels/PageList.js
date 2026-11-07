import PenPerfProfiler from '../PenPerfProfiler'
import PageBulkDelete from '../controls/PageBulkDelete'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { bubble, colors, radius } from '../../../shared/theme'
import { pageSize } from '../../utils/pageGeometry.js'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import EditorModal from '../controls/EditorModal'
import { ConfirmDialogContent } from '../controls/ConfirmDialog'
import Icon from '../controls/Icon'
import TapCatcher from '../controls/TapCatcher'
import PageThumbnail from './PageThumbnail'

const THUMB_WIDTH = 128 // 코덱스 안: 썸네일 128폭
const THUMB_BORDER = 1
const HOLD_MS = 280 // 이만큼 누르고 있으면 끌어서 순서 바꾸기 시작 (그 전에 움직이면 목록 스크롤)
const TAP_SLOP = 8
const THUMB_BACKGROUND_DELAY_MS = 250
// 끌기 중 자동 스크롤: 목록 위·아래 끝에서 이만큼 안쪽부터 넘기기 시작하고, 끝에 가까울수록(넘어갈수록) 빨라진다
const AUTO_SCROLL_EDGE = 56
const AUTO_SCROLL_MAX_SPEED = 14 // 한 번(16ms)에 넘기는 최대 px

// 왼쪽 페이지 목록 폭. 열고 닫을 때 작업창 크기를 한 번에 맞추는 데도 쓴다 (EditorScreen)
export const PAGE_LIST_WIDTH = 176
// 목록이 뜨기 전 자리 잡기용: 목록 패널과 같은 바깥 크기
export const pageListFrame = edge => [styles.panel, edge && styles.panelEdge]

/**
 * 페이지 목록. 같은 원본으로 표시하되 웹의 무거운 썸네일은 축소 캐시를 재사용한다.
 * - 탭: 그 페이지로 이동
 * - 어느 페이지든 길게 눌러 끌기: 순서 바꾸기 (놓을 자리에 선이 보인다). 길게 눌렀다 움직이지 않고 떼면 그 페이지 작업 메뉴
 *   (굿노트처럼 같은 손짓은 고른 페이지든 아니든 같은 일을 한다)
 * - 여러 개 고르기는 '편집' 으로만 들어간다. 모드 중에는 탭으로 넣고 빼고, 길게 눌러 끌면 고른 페이지를 함께 옮긴다
 *   함께 끄는 페이지에는 개수가 붙는다 (레이어 패널과 같다)
 * - 끄는 손가락이 목록 위·아래 끝 근처나 바깥으로 나가면 목록이 그쪽으로 넘어간다
 * - 위쪽 탭: 전체 / 북마크(책갈피를 단 페이지). 넓게 보기 버튼은 모든 페이지를 크게 펼친다 (GoodNotes 의 페이지 보기처럼)
 * - 페이지 메뉴: 복제, 삭제 (순서는 썸네일을 길게 눌러 끌어서 바꾼다)
 */
export default function PageList({ phone = false, pages, currentId, cropId, onSelect, onAdd, onDuplicate, onSettings, onToggleIndex, onRemove, onRemovePages, onReset, canUndoDelete = true, onMove, onMovePages, onEmptyTap, readOnly = false, edge = false, qaMeasurement = null, thumbnailWork = null, fillHeight = false }) {
  const openingMeasurement = qaMeasurement
  useLayoutEffect(() => {
    openingMeasurement?.emit('panel-layout')
    if (!openingMeasurement) return
    let second
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => openingMeasurement.emit('panel-frame-opportunity')) })
    return () => { cancelAnimationFrame(first); if (second != null) cancelAnimationFrame(second) }
  }, [openingMeasurement])
  // 태블릿(edge)은 화면 끝까지 붙은 패널 안에서 좌우 여백을 24로 같게 두고 그만큼 썸네일 · 버튼 줄을 넓힌다(144)
  const thumbWidth = edge ? THUMB_WIDTH + EDGE_INSET : THUMB_WIDTH
  const [drag, setDrag] = useState(null) // { id, from, dy, group } — 끌어서 옮기는 중
  // 고른 페이지들. 평소에는 지금 페이지 하나이고, 길게 눌러 여러 개를 고른다.
  const [picked, setPicked] = useState([currentId])
  const [pickMode, setPickMode] = useState(false) // 여러 개 고르기 모드: 탭으로 넣고 뺀다
  const endPickMode = () => { setPickMode(false); setPicked([currentId]) }
  // 모드 중 탭: 넣거나 뺀다. 다 빼면 모드를 끝낸다
  const togglePick = (id) => {
    const next = pickedRef.current.includes(id) ? pickedRef.current.filter((p) => p !== id) : [...pickedRef.current, id]
    setPicked(next)
  }
  const pickedRef = useRef(picked)
  pickedRef.current = picked
  const pickModeRef = useRef(pickMode)
  pickModeRef.current = pickMode
  useEffect(() => { if (!pickedRef.current.includes(currentId)) setPicked([currentId]) }, [currentId])
  const [menuId, setMenuId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteConfirmed = useRef(false)
  const [filter, setFilter] = useState('all') // 'all' | 'bookmarked'
  const shown = filter === 'bookmarked' ? pages.filter((page) => page.indexed) : pages
  const numberOf = (page) => pages.indexOf(page) + 1
  const [scrollY, setScrollY] = useState(0)
  const [panelHeight, setPanelHeight] = useState(0)
  // 썸네일 속지(80KB 안팎 SVG)는 편집 화면 속지가 먼저 그려지도록 잠시 뒤에 그린다.
  // InteractionManager는 편집기의 열린 제스처 핸들 때문에 끝내 실행되지 않을 수 있어 타이머를 쓴다.
  // 네이티브에서는 무거운 페이지 요소를 그리기 전에 패널 틀을 먼저 표시한다.
  const [thumbContentReady, setThumbContentReady] = useState(Platform.OS === 'web')
  useEffect(() => {
    if (Platform.OS === 'web') return undefined
    let second
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setThumbContentReady(true)) })
    return () => { cancelAnimationFrame(first); if (second != null) cancelAnimationFrame(second) }
  }, [])
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
  // 목록을 열면(= 이 목록이 새로 그려지면) 지금 보는 페이지의 썸네일이 바로 보이게 그 자리로 간다. 항목 높이가 제각각이라 못 가면 평균 높이로 먼저 가서 다시 시도한다
  const revealedCurrent = useRef(false)
  const revealCurrent = () => {
    const index = shown.findIndex((page) => page.id === currentId)
    if (index < 0) return
    listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 })
  }
  useEffect(() => {
    if (revealedCurrent.current) return
    revealedCurrent.current = true
    const id = setTimeout(revealCurrent, 0)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const startDrag = (id, from) => {
    const height = layouts.current[id]?.height ?? 0
    // 손가락 위치(목록 화면 기준)는 끄는 썸네일 가운데에서 시작한다고 본다
    const pointerStart = LIST_PADDING + itemTop(pages, layouts.current, id) - scrollOffset.current + height / 2
    // 편집 중이면 고른 페이지를 함께 옮긴다(고르지 않은 페이지를 끌면 그 페이지도 넣는다). 평소에는 끄는 페이지 하나만
    let group = [id]
    if (pickModeRef.current) {
      group = pickedRef.current.includes(id) ? pickedRef.current : [...pickedRef.current, id]
      setPicked(group)
    }
    dragInfo.current = { id, from, finger: 0, scrollStart: scrollOffset.current, pointerStart, group }
    setDrag({ id, from, dy: 0, group: group.length > 1 })
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
      setDrag({ id: info.id, from: info.from, dy: effectiveDy(info), group: info.group.length > 1 })
    }, 16)
  }
  const moveDrag = (fingerDy) => {
    const info = dragInfo.current
    if (!info) return
    info.finger = fingerDy
    setDrag({ id: info.id, from: info.from, dy: effectiveDy(info), group: info.group.length > 1 })
  }
  // moved: 길게 누른 뒤 손가락을 움직였는지. 움직이지 않고 떼면 옮기지 않고 그 페이지 작업 메뉴를 연다(편집 중에는 열지 않는다)
  const endDrag = (fingerDy, cancelled, moved) => {
    const info = dragInfo.current
    dragInfo.current = null
    stopAutoScroll()
    setDrag(null)
    if (!info || cancelled) return
    if (!moved) {
      if (!pickModeRef.current && !readOnly) openMenu(info.id)
      return
    }
    info.finger = fingerDy
    const to = dropIndex(pages, layouts.current, { id: info.id, from: info.from, dy: effectiveDy(info) })
    const group = info.group
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
  const draggedPage = drag ? pages.find(page => page.id === drag.id) : null
  const menuPage = menuId ? pages.find((page) => page.id === menuId) : null
  const menuIndex = menuPage ? pages.findIndex((page) => page.id === menuPage.id) : -1
  const menuActionCount = 1 + Number(pages.length > 1) + Number(Boolean(onSettings))
  const menuHeight = 42 + menuActionCount * 48
  // 작업 메뉴는 패널 밖(캔버스)을 눌러도 닫혀야 해서 창 전체를 덮는 투명 모달로 띄운다(안드로이드 · iOS는 부모 밖 영역의 터치를 받지 못한다).
  // 그래서 패널의 창 안 자리를 재어 두고, 화면 크기(회전)가 바뀌면 자리가 어긋나므로 닫는다.
  const panelRef = useRef(null)
  const [origin, setOrigin] = useState(null)
  const window = useWindowDimensions()
  useEffect(() => {
    if (!menuId) { setOrigin(null); return }
    const node = panelRef.current
    if (node?.measureInWindow) node.measureInWindow((x, y) => setOrigin({ x, y }))
    else setOrigin({ x: 0, y: 0 })
  }, [menuId])
  const windowSize = useRef(`${window.width}x${window.height}`)
  useEffect(() => {
    if (windowSize.current !== `${window.width}x${window.height}`) setMenuId(null)
    windowSize.current = `${window.width}x${window.height}`
  }, [window.width, window.height])
  function openMenu(id) { setConfirmDelete(false); setMenuId((current) => (current === id ? null : id)) }
  // 목록이 패널 안에서 시작하는 y(탭 줄 + 편집 줄 아래). 메뉴를 누른 페이지 높이에 맞추는 기준
  const [listTop, setListTop] = useState(0)
  // 메뉴는 그 페이지 높이에 맞춘다. 항목 위치는 앞 항목들 높이를 더해 구한다 (FlatList 항목의 onLayout y 는 늘 0)
  const menuItemTop = menuId ? itemTop(shown, layouts.current, menuId) : 0
  const rawMenuTop = menuId ? listTop + LIST_PADDING + menuItemTop - scrollY : 8
  // 하단 페이지에서도 메뉴가 잘리지 않도록 패널 안쪽으로만 보정한다.
  const menuTop = Math.max(8, Math.min(rawMenuTop, Math.max(8, panelHeight - menuHeight - 8)))

  return (
    <PenPerfProfiler id="pageList">
    <View ref={panelRef} collapsable={false} style={[styles.panel, edge && styles.panelEdge, phone && styles.panelPhone, fillHeight && { flex: 1 }]} onLayout={(event) => { openingMeasurement?.emit('panel-native-layout'); setPanelHeight(event.nativeEvent.layout.height) }}>
      <View style={[styles.header, phone && styles.headerPhone]}>
        {/* 여러 개 고르기 중에는 탭 줄이 'N개 선택 · 해제' 로 바뀐다 (같은 높이라 목록이 밀리지 않는다) */}
        {pickMode ? (
          <View style={styles.pickBar}>
            <Text style={styles.pickText}>{picked.length}개 선택</Text>
            <Pressable onPress={endPickMode} hitSlop={{ top: 6, bottom: 6, left: 10, right: 12 }} accessibilityRole="button" accessibilityLabel="여러 페이지 선택 해제" style={styles.pickDone}>
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
              hitSlop={{ top: 10, bottom: 10 }}
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
      {!readOnly && <View style={styles.actions}>
        {pickMode ? <PageBulkDelete pages={pages} ids={picked} onDelete={onRemovePages} onReset={onReset} canUndoDelete={canUndoDelete} onDone={endPickMode} />
          : <Pressable accessibilityRole="button" accessibilityLabel="페이지 편집" hitSlop={{ top: 8, bottom: 8 }} style={({ pressed }) => [styles.editButton, pressed && styles.editPressed]} onPress={() => { setMenuId(null); setPicked([]); setPickMode(true) }}><Icon name="edit" size={16} forText={12} /><Text style={styles.editText}>편집</Text></Pressable>}
      </View>}
      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(page) => page.id}
        contentContainerStyle={styles.list}
        scrollEnabled={!drag}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
          setTimeout(revealCurrent, 60)
        }}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y
          setScrollY(event.nativeEvent.contentOffset.y)
        }}
        onLayout={(event) => { listHeight.current = event.nativeEvent.layout.height; setListTop(event.nativeEvent.layout.y) }}
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
            thumbWidth={thumbWidth}
            showBackground={thumbBackgrounds}
            showContent={thumbContentReady}
            thumbnailWork={thumbnailWork}
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
      {draggedPage && <View pointerEvents="none" accessible={false} style={[styles.dragViewport, { top: listTop, height: listHeight.current }]}>
        <PageDragPreview page={draggedPage} number={numberOf(draggedPage)} showBackground={thumbBackgrounds} thumbWidth={thumbWidth}
          count={drag.group ? picked.length : 1}
          top={LIST_PADDING + itemTop(pages, layouts.current, drag.id) - scrollY + drag.dy} />
      </View>}
      {menuPage && origin && (
        <EditorModal transparent animationType="none" statusBarTranslucent onRequestClose={() => { setConfirmDelete(false); setMenuId(null) }}>
          {confirmDelete ? <ConfirmDialogContent title="페이지를 삭제할까요?"
            message={canUndoDelete ? '페이지의 내용이 함께 삭제돼요. 되돌리기로 복구할 수 있어요.' : '페이지의 내용이 함께 삭제되고 공유 멤버에게도 반영돼요. 여기서 되돌릴 수 없어요.'}
            onCancel={() => { setConfirmDelete(false); setMenuId(null) }}
            onConfirm={() => {
              if (deleteConfirmed.current) return
              deleteConfirmed.current = true
              if (pages.length > 1 && pages.some(page => page.id === menuId)) onRemove(menuId)
              setConfirmDelete(false)
              setMenuId(null)
            }} /> : <>
          {/* 메뉴 바깥(캔버스 · 다른 패널 포함)을 누르면 닫는다 */}
          <Pressable accessibilityLabel="페이지 작업 메뉴 닫기" style={StyleSheet.absoluteFill} onPress={() => setMenuId(null)} />
          <View style={[styles.actionMenu, { top: origin.y + menuTop, left: origin.x + RAIL_INSET + thumbWidth - 2 }]}>
            <Text style={styles.actionMenuTitle}>{pages.findIndex((page) => page.id === menuId) + 1}페이지</Text>
            {onSettings && <Pressable accessibilityRole="button" accessibilityLabel="페이지 설정" style={styles.action}
              onPress={() => { onSettings(menuId); setMenuId(null) }}>
              <Icon name="edit" size={18} forText={14} color={colors.primary} /><Text style={styles.actionText}>페이지 설정</Text>
            </Pressable>}
            <Pressable onPress={() => { onDuplicate(menuId); setMenuId(null) }} style={styles.action} accessibilityRole="button" accessibilityLabel="페이지 복제">
              <Icon name="copy" size={18} forText={14} color={colors.primary} /><Text style={styles.actionText}>페이지 복제</Text>
            </Pressable>
            {pages.length > 1 && (
              <Pressable onPress={() => { deleteConfirmed.current = false; setConfirmDelete(true) }} style={styles.action} accessibilityRole="button" accessibilityLabel="페이지 삭제">
                <Icon name="trash" size={18} forText={14} color={colors.danger} /><Text style={styles.deleteText}>페이지 삭제</Text>
              </Pressable>
            )}
          </View>
          </>}
        </EditorModal>
      )}
      {!readOnly && !pickMode && (
        <Pressable onPress={onAdd} hitSlop={1} style={({ pressed }) => [styles.add, phone && styles.addPhone, pressed && styles.addPressed]} accessibilityRole="button" accessibilityLabel="페이지 추가">
          <Icon name="plus" size={20} color={colors.primaryText} />
        </Pressable>
      )}
    </View>
    </PenPerfProfiler>
  )
}

const ITEM_GAP = 16 // styles.list 의 gap
const EDGE_INSET = 16 // 편집 화면 바깥 여백(EditorScreen BODY_PADDING)
const RAIL_INSET = (PAGE_LIST_WIDTH - THUMB_WIDTH) / 2 // 24: 위아래 버튼 줄을 썸네일 좌우 끝에 맞춘다
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

const PageItem = memo(function PageItem({ page, index, number, canDrag = true, active, picked = false, carried = false, dragCount = 0, pickMode = false, showBackground, showContent, thumbnailWork, dragging, dy, dropLine, cropId, thumbWidth = THUMB_WIDTH, readOnly, menuOpen, canOpenMenu, canToggleIndex, onLayout, onSelect, onMenu, onToggleIndex, onDragStart, onDragMove, onDragEnd }) {
  const { width, height } = pageSize(page)
  // 썸네일 그림은 테두리(1px) 안쪽 크기에 정확히 맞춘다. 넘치면 Android 에서 아래쪽 테두리를 덮었다.
  const thumbZoom = (thumbWidth - THUMB_BORDER * 2) / width
  const press = useRef(null)
  const handlers = usePan({
    onStart: () => {
      const state = { holding: false, moved: false, dragged: false, dy: 0, timer: null }
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
      if (state.holding) {
        if (Math.abs(moveDy) > TAP_SLOP) state.dragged = true
        onDragMove(moveDy)
      }
    },
    onEnd: ({ cancelled }) => {
      const state = press.current
      press.current = null
      if (!state) return
      clearTimeout(state.timer)
      if (state.holding) onDragEnd(state.dy, cancelled, state.dragged)
      else if (!state.moved && !cancelled) onSelect()
    },
  })

  return (
    <View
      style={[styles.item, dragging && styles.dragSource, carried && styles.carried]}
      onLayout={(event) => onLayout(event.nativeEvent.layout)}
    >
      {dropLine && <View style={[styles.dropLine, dropLine === 'before' ? styles.dropBefore : styles.dropAfter]} />}
      {dragCount > 1 && <View style={styles.countBadge} pointerEvents="none"><Text style={styles.countText}>{dragCount}</Text></View>}
      <View
        {...handlers}
        accessibilityRole={pickMode ? "checkbox" : "button"}
        accessibilityState={pickMode ? { checked: picked } : { selected: active }}
        accessibilityLabel={`${number}페이지`}
        accessibilityHint={readOnly ? undefined : '길게 눌러 끌면 순서를 바꿔요'}
        style={[styles.thumb, { width: thumbWidth, height: height * thumbZoom + THUMB_BORDER * 2 }, active && styles.thumbActive, dragging && styles.thumbDragging]}
      >
        {/* 지금 편집 중인 페이지는 움직이는 GIF·자르기 표시까지 편집 화면과 똑같이, 나머지는 첫 장면으로 */}
        <View style={styles.thumbPage} pointerEvents="none">
          {showContent && <PageThumbnail page={page} zoom={thumbZoom} still cropId={cropId} showBackground={showBackground} workQueue={thumbnailWork} />}
        </View>
        {/* 선택 테두리는 썸네일 위에 겹쳐 그린다 (썸네일에 아래쪽 선이 가려지던 문제) */}
        {/* 지금 페이지는 2px 테두리, 편집에서 고른 페이지는 1px 테두리 + 오른쪽 위 체크 칸 (둘 다면 2px 가 앞선다) */}
        {active ? <View style={styles.activeRing} pointerEvents="none" /> : picked && <View style={styles.pickedRing} pointerEvents="none" />}
        {pickMode && <View style={[styles.pickBox, picked && styles.pickBoxOn]} pointerEvents="none">{picked && <Icon name="check" size={14} color={colors.surface} strokeWidth={3} />}</View>}
      </View>
      {canToggleIndex && (
        <Pressable
          onPress={onToggleIndex}
          hitSlop={11}
          accessibilityRole="checkbox"
          accessibilityLabel={`${number}페이지 북마크`}
          accessibilityState={{ checked: Boolean(page.indexed) }}
          style={styles.indexBadge}
        >
          <Icon
            name="bookmark"
            size={17}
            color={colors.primaryText}
            fill={page.indexed ? colors.primaryText : 'none'}
            strokeWidth={2.2}
          />
        </Pressable>
      )}
      <Text style={[styles.number, active && styles.numberActive]}>{number}</Text>
      {canOpenMenu && (
        <Pressable onPress={onMenu} style={[styles.more, menuOpen && styles.moreActive]} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${number}페이지 작업 메뉴`} accessibilityState={{ expanded: menuOpen }}>
          <Icon name="more" size={20} color={colors.primaryText} />
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
  && previous.showContent === next.showContent
  && previous.thumbnailWork === next.thumbnailWork
  && previous.dragging === next.dragging
  && previous.dy === next.dy
  && previous.dropLine === next.dropLine
  && previous.cropId === next.cropId
  && previous.readOnly === next.readOnly
  && previous.menuOpen === next.menuOpen
  && previous.canOpenMenu === next.canOpenMenu
  && previous.canToggleIndex === next.canToggleIndex
  && previous.thumbWidth === next.thumbWidth
))

// 끄는 사본은 목록 썸네일과 같은 폭(태블릿 edge 는 넓다)으로 그린다. 왼쪽은 폰 · 태블릿 모두 패널 안쪽 24
function PageDragPreview({ page, number, top, showBackground, count, thumbWidth = THUMB_WIDTH }) {
  const { width, height } = pageSize(page)
  const zoom = (thumbWidth - THUMB_BORDER * 2) / width
  return <View style={[styles.item, styles.dragPreview, { top }]} testID="page-drag-preview">
    <View style={[styles.thumb, styles.thumbDragging, { width: thumbWidth, height: height * zoom + THUMB_BORDER * 2 }]}>
      <View style={styles.thumbPage}><PageThumbnail page={page} zoom={zoom} still showBackground={showBackground} /></View>
      <View style={styles.activeRing} />
    </View>
    <Text style={[styles.number, styles.numberActive]}>{number}</Text>
    {count > 1 && <View style={styles.countBadge}><Text style={styles.countText}>{count}</Text></View>}
  </View>
}

const styles = StyleSheet.create({
  // 코덱스 안(2026-11-02): 탭 · 편집 · 썸네일 · 추가의 좌우 끝을 모두 썸네일 폭(128, 양쪽 24)에 맞춘다
  actions: { paddingHorizontal: RAIL_INSET, paddingTop: 8, paddingBottom: 8 },
  editButton: { height: 32, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  editText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  editPressed: {}, // 눌림 효과 없음(사용자 지시)
  panel: { width: PAGE_LIST_WIDTH, flexShrink: 0, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.58)', overflow: 'visible', zIndex: 3 },
  // 폰 세로: 레이어 패널과 같은 바탕(앱 바탕색) · 같은 구분선
  // 슬롯이 왼쪽 8 에서 시작하므로 음수 여백을 8 로 줄여 패널 왼쪽을 화면 끝(0)에 맞춘다 → 목록 좌우 여백이 24 · 24 로 같아진다
  panelPhone: { backgroundColor: colors.surfaceSoft, marginLeft: -(EDGE_INSET - 8) },
  // 태블릿: 레이어 패널처럼 화면 왼쪽 · 위아래 끝까지 붙이고 안쪽 끝에 구분선. 바깥 여백(16)만큼 넓혀 덮어 오른쪽 끝은 그대로이고, 안쪽은 좌우 24 로 같게 둔다
  panelEdge: {
    width: PAGE_LIST_WIDTH + EDGE_INSET,
    marginTop: -EDGE_INSET,
    marginBottom: -EDGE_INSET,
    marginLeft: -EDGE_INSET,
    borderRadius: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border, // 레이어 패널 구분선과 같은 값
  },
  list: { flexGrow: 1, alignItems: 'center', gap: 16, paddingVertical: 16 },
  emptyArea: { flexGrow: 1, alignSelf: 'stretch', minHeight: 24 },
  item: { position: 'relative', alignItems: 'center', gap: 6 },
  dragSource: { opacity: 0 }, // Keep the original native gesture target and slot mounted.
  dragViewport: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', zIndex: 4 },
  dragPreview: { position: 'absolute', left: (PAGE_LIST_WIDTH - THUMB_WIDTH) / 2, transform: [{ scale: 1.04 }] },
  thumb: {
    width: THUMB_WIDTH,
    borderRadius: 8,
    overflow: 'visible',
    borderWidth: THUMB_BORDER,
    borderColor: colors.cardBorder,
    backgroundColor: '#FFFFFF',
  },
  thumbPage: { ...StyleSheet.absoluteFill, overflow: 'hidden', borderRadius: 7, backgroundColor: '#FFFFFF' },
  thumbActive: { borderColor: 'transparent' },
  carried: { opacity: 0.4 },
  pickBar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pickText: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text },
  pickDone: { height: 28, justifyContent: 'center' },
  pickDoneText: { fontSize: 12, fontWeight: '700', color: colors.primaryText },
  countBadge: { position: 'absolute', top: -8, right: 4, zIndex: 3, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  countText: { fontSize: 12, fontWeight: '700', color: colors.surface },
  pickBox: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  pickBoxOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  activeRing: { position: 'absolute', top: -THUMB_BORDER, left: -THUMB_BORDER, right: -THUMB_BORDER, bottom: -THUMB_BORDER, borderRadius: 8, borderWidth: 2, borderColor: colors.primaryStrong },
  pickedRing: { position: 'absolute', top: -THUMB_BORDER, left: -THUMB_BORDER, right: -THUMB_BORDER, bottom: -THUMB_BORDER, borderRadius: 8, borderWidth: 1, borderColor: colors.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: RAIL_INSET, paddingTop: 16 },
  tabs: { flex: 1, flexDirection: 'row', gap: 4 },
  tab: { flex: 1, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  tabActive: { borderWidth: 2, borderColor: colors.primaryStrong },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: '800' },
  thumbDragging: {
    shadowColor: colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dropLine: { position: 'absolute', left: -6, right: -6, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  dropBefore: { top: -9.5 },
  dropAfter: { bottom: -9.5 },
  number: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  numberActive: { color: colors.primaryText },
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
  actionMenu: { ...bubble, position: 'absolute', width: 178, padding: 8, gap: 2, elevation: 8, zIndex: 10 }, // 썸네일 · ⋯ 버튼과 8 떨어진 말풍선
  actionMenuTitle: { paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: '700', color: colors.textMuted },
  action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 9 },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.text },
  deleteText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  add: {
    height: 46,
    marginHorizontal: RAIL_INSET,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  addPressed: {}, // 눌림 효과 없음(사용자 지시)
  // 폰 세로: 위(탭 줄) · 아래(+) 여백도 좌우 24 와 같게 맞춘다(실측 후 위 24 · 아래 24)
  headerPhone: { paddingTop: 23 },
  addPhone: { marginBottom: 31 },
})
