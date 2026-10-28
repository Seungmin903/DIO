import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Image, Keyboard, Pressable, FlatList, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { OBJECT_TYPE_LABELS } from '../../constants'
import { stickerSource } from '../../stickerAssets'
import { useMediaUri } from '../../hooks/useMediaUri'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { isMultiSelectKey } from '../../utils/modifiers'
import { getObjectName, tapeSizeOf } from '../../utils/objects'
import { buildLayerRows } from '../../utils/layerRows'
import Icon from '../controls/Icon'
import TapCatcher from '../controls/TapCatcher'
import TapeView from '../canvas/TapeView'
import ObjectContent from '../canvas/ObjectView'

const ROW_HEIGHT = 62
const ROW_GAP = 2
const ROW_STEP = ROW_HEIGHT + ROW_GAP
// 끌기 중 자동 스크롤: 목록 위·아래 끝에서 이만큼 안쪽부터, 끝에 가까울수록(바깥으로 나갈수록) 빨리 넘긴다 (페이지 목록과 같다)
const AUTO_SCROLL_EDGE = 56
const AUTO_SCROLL_MAX_SPEED = 14 // 한 번(16ms)에 넘기는 최대 px

/**
 * 레이어 패널. 위쪽 항목이 앞(objects 배열의 뒤쪽)에 보인다.
 * - 항목 탭: 선택 (선택된 항목은 색으로만 표시)
 * - 여러 개 선택: 길게 누르기, 길게 누른 채 위아래로 끌면 끈 곳까지 한꺼번에, 캔버스 빈 곳 드래그(영역 선택), 웹에서는 Shift·Ctrl+클릭
 * - 그룹: 캔버스 편집 바의 '그룹'으로 묶는다. 패널에서는 폴더처럼 접고 펼치고, 통째로 끌어 옮긴다.
 * - 그룹 안 요소 행을 누르면 그 요소만 골라 따로 고칠 수 있다.
 * - 복제·삭제·순서 버튼은 선택하면 뜨는 편집 바에 있다. 여기서는 끌어서 순서를 바꾼다.
 * - 선택된 항목(그룹)의 이름을 한 번 더 누르면 이름 바꾸기
 * - 오른쪽 손잡이를 끌어 순서 변경. 그룹 사이에 놓으면 그 그룹에 들어가고, 밖으로 빼면 그룹에서 빠진다.
 */
export default function LayerPanel({ objects, selectedIds, dispatch, onClose, onEmptyTap }) {
  const layers = useMemo(() => [...objects].reverse(), [objects])
  const [drag, setDrag] = useState(null) // { key, from, dy }
  const [collapsed, setCollapsed] = useState(() => new Set())
  const rows = useMemo(() => buildLayerRows(layers, collapsed), [layers, collapsed])
  const dropIndex = drag ? clamp(drag.from + Math.round(drag.dy / ROW_STEP), 0, rows.length - 1) : null
  // 길게 누른 채 끌기. mode 'range': 여러 개 고르기 { anchor, base, startY, captured, last }
  // mode 'move': 여러 개 고른 상태에서 고른 행을 다시 길게 눌러 끌면 고른 것을 모두 함께 옮긴다 { anchor, startY, dy, ids }
  const rangeRef = useRef(null)
  const [ranging, setRanging] = useState(false)
  // 여러 개 고르기 모드 (굿노트·삼성노트의 선택 모드처럼): 길게 눌러 들어가고, 그동안은 탭 한 번으로 넣고 뺀다.
  // 위쪽 'N개 선택 · 해제' 로 끝내고, 고른 것이 하나도 없어도 끝난다.
  const [multi, setMulti] = useState(false)
  useEffect(() => { if (!selectedIds.length) setMulti(false) }, [selectedIds.length])
  const idsOfRow = (row) => (row.kind === 'group' ? row.members.map((o) => o.id) : [row.object.id])
  const keyOfRow = (row) => (row.kind === 'group' ? `g-${row.groupId}` : row.object.id)

  // 끌기(손잡이 끌기·범위 고르기·함께 옮기기) 공통: 손가락이 움직인 만큼(finger)에 자동 스크롤로 넘어간 만큼을 더해 행 위치를 정한다.
  const listRef = useRef(null)
  const scrollOffset = useRef(0)
  const listHeight = useRef(0)
  const contentHeight = useRef(0)
  const gripRef = useRef(null) // 손잡이 끌기 { key, from, finger, scrollStart, pointerStart }
  const autoScroll = useRef(null)
  const follow = (index) => ({ finger: 0, scrollStart: scrollOffset.current, pointerStart: index * ROW_STEP - scrollOffset.current + ROW_STEP / 2 })
  const effectiveDy = (g) => g.finger + scrollOffset.current - g.scrollStart
  const stopAutoScroll = () => {
    clearInterval(autoScroll.current)
    autoScroll.current = null
  }
  useEffect(() => stopAutoScroll, [])
  const startAutoScroll = () => {
    stopAutoScroll()
    autoScroll.current = setInterval(() => {
      const g = rangeRef.current ?? gripRef.current
      if (!g) return
      const pointer = g.pointerStart + g.finger
      const bottomEdge = listHeight.current - AUTO_SCROLL_EDGE
      const depth = pointer < AUTO_SCROLL_EDGE ? pointer - AUTO_SCROLL_EDGE : pointer > bottomEdge ? pointer - bottomEdge : 0
      if (!depth) return
      const speed = clamp((depth / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_SPEED, -AUTO_SCROLL_MAX_SPEED, AUTO_SCROLL_MAX_SPEED)
      const next = clamp(scrollOffset.current + speed, 0, Math.max(0, contentHeight.current - listHeight.current))
      if (next === scrollOffset.current) return
      scrollOffset.current = next
      listRef.current?.scrollToOffset({ offset: next, animated: false })
      followGesture(g)
    }, 16)
  }
  // 손가락·스크롤 위치에 맞춰 끄는 행 위치나 고른 범위를 고친다
  function followGesture(g) {
    const dy = effectiveDy(g)
    if (g === gripRef.current || g.mode === 'move') {
      g.dy = dy
      setDrag({ key: g.key ?? keyOfRow(rows[g.anchor]), from: g.anchor ?? g.from, dy })
      return
    }
    const index = clamp(g.anchor + Math.round(dy / ROW_STEP), 0, rows.length - 1)
    if (index === g.last) return
    g.last = index
    const ids = rows.slice(Math.min(g.anchor, index), Math.max(g.anchor, index) + 1).flatMap(idsOfRow)
    dispatch({ type: 'selectExact', ids: [...new Set([...g.base, ...ids])] })
  }

  function startRange(index, event) {
    const ids = idsOfRow(rows[index])
    const wasSelected = ids.every((id) => selectedIds.includes(id))
    const startY = event.nativeEvent.pageY
    if (wasSelected && selectedIds.length > ids.length) {
      setMulti(true)
      rangeRef.current = { mode: 'move', anchor: index, startY, dy: 0, ids, captured: false, ...follow(index) }
      setDrag({ key: keyOfRow(rows[index]), from: index, dy: 0 })
      setRanging(true)
      startAutoScroll()
      return
    }
    // 길게 누르면 그 행을 넣거나 뺀다(기존과 같다). 이어서 끌면 그 결과에 끈 범위를 더한다.
    const base = wasSelected ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]
    dispatch({ type: 'selectExact', ids: base })
    setMulti(true)
    rangeRef.current = { mode: 'range', anchor: index, base, startY, captured: false, last: index, ...follow(index) }
    setRanging(true)
    startAutoScroll()
  }
  function endRange() {
    const r = rangeRef.current
    rangeRef.current = null
    setRanging(false)
    stopAutoScroll()
    if (r?.mode !== 'move') return
    setDrag(null)
    // 끌지 않고 떼면 아무것도 바꾸지 않는다 (고른 목록에서 빼기는 선택 모드에서 탭으로 한다)
    if (Math.abs(effectiveDy(r)) >= ROW_STEP / 2) drop(r.anchor, clamp(r.anchor + Math.round(effectiveDy(r) / ROW_STEP), 0, rows.length - 1))
  }
  const rangeHandlers = {
    // 길게 누른 뒤 손가락이 움직이면 목록이 터치를 이어받는다. (그 전에는 목록 스크롤·행 누르기를 건드리지 않는다)
    onMoveShouldSetResponderCapture: () => {
      if (!rangeRef.current) return false
      rangeRef.current.captured = true
      return true
    },
    onResponderTerminationRequest: () => false,
    onResponderMove: (event) => {
      const r = rangeRef.current
      if (!r) return
      r.finger = event.nativeEvent.pageY - r.startY
      followGesture(r)
    },
    onResponderRelease: endRange,
    onResponderTerminate: endRange,
  }

  const toggleCollapsed = (groupId) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })

  // 행 동작. 매번 새 함수를 넘기면 요소 하나만 움직여도 모든 행이 다시 그려져서, 고정된 객체 하나로 넘기고 최신 값은 ref 로 읽는다.
  const rowActionsRef = useRef(null)
  rowActionsRef.current = {
    dragStart: (key, index) => {
      gripRef.current = { key, from: index, ...follow(index) }
      setDrag({ key, from: index, dy: 0 })
      startAutoScroll()
    },
    dragMove: (key, index, dy) => {
      const g = gripRef.current
      if (!g) return
      g.finger = dy
      followGesture(g)
    },
    dragEnd: (index) => {
      const g = gripRef.current
      gripRef.current = null
      stopAutoScroll()
      setDrag(null)
      if (g) drop(index, clamp(index + Math.round(effectiveDy(g) / ROW_STEP), 0, rows.length - 1))
    },
    rangeStart: (index, event) => startRange(index, event),
    // 선택 모드에서 탭: 그 행을 고른 목록에 넣거나 뺀다
    toggle: (index) => {
      const ids = idsOfRow(rows[index])
      const on = ids.every((id) => selectedIds.includes(id))
      dispatch({ type: 'selectExact', ids: on ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])] })
    },
    // 길게 누르고 끌지 않은 채 떼면 범위 고르기를 끝낸다. (끌었으면 목록이 이어받아 거기서 끝낸다)
    pressOut: () => {
      if (rangeRef.current && !rangeRef.current.captured) endRange()
    },
  }
  const [rowActions] = useState(() =>
    Object.fromEntries(Object.keys(rowActionsRef.current).map((key) => [key, (...args) => rowActionsRef.current[key](...args)])),
  )

  // 화면 목록에서 from → to 로 끌어 놓은 결과를 reducer 의 moveLayers 로 바꾼다.
  // 고른 행을 끌었고 여러 개를 골라 두었으면 고른 것을 모두 그 자리로 함께 옮긴다. (순서는 그대로)
  function drop(from, to) {
    if (from === to) return
    const row = rows[from]
    const place = to < from ? 'above' : 'below'
    const rowIds = idsOfRow(row)
    if (rowIds.every((id) => selectedIds.includes(id)) && selectedIds.length > rowIds.length) {
      const moving = new Set(selectedIds)
      const step = place === 'above' ? -1 : 1
      // 놓은 자리가 함께 옮기는 행이면 같은 방향으로 처음 만나는 다른 행에 붙인다
      let i = to
      while (i >= 0 && i < rows.length && idsOfRow(rows[i]).every((id) => moving.has(id))) i += step
      if (i < 0 || i >= rows.length) return
      const target = rows[i]
      const targetIds = idsOfRow(target)
      const anchorId = place === 'above' ? targetIds[0] : targetIds.at(-1)
      dispatch({ type: 'moveLayers', ids: selectedIds, anchorId, place })
      return
    }
    const target = rows[to]
    const movingIds = rowIds
    let anchorId
    if (target.kind === 'group') {
      // 그룹 머리 위로 → 그룹 전체 위, 아래로 → 펼쳐져 있으면 그룹 안 맨 위, 아니면 그룹 전체 아래
      const intoGroup = place === 'below' && row.kind === 'object' && !collapsed.has(target.groupId)
      anchorId = place === 'above' || intoGroup ? target.members[0].id : target.members.at(-1).id
    } else if (row.kind === 'group' && target.nested) {
      // 그룹을 다른 그룹 안에 넣지는 않는다. 그 그룹의 바깥쪽 끝에 붙인다.
      const members = layers.filter((o) => o.groupId === target.object.groupId)
      anchorId = place === 'above' ? members[0].id : members.at(-1).id
    } else {
      anchorId = target.object.id
    }
    dispatch({ type: 'moveLayers', ids: movingIds, anchorId, place })
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        {/* 여러 개 고르기 중에는 제목 줄이 'N개 선택 · 해제' 로 바뀐다. 줄을 새로 끼우면 목록이 밀려 누르려던 행이 바뀌어서 같은 자리를 쓴다 */}
        <View style={styles.titleRow}>
          {multi ? (
            <View style={styles.multiBar}>
              <Text style={styles.multiText}>{selectedIds.length}개 선택</Text>
              <Pressable
                onPress={() => { setMulti(false); dispatch({ type: 'selectExact', ids: [] }) }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="여러 개 선택 해제"
                style={styles.multiDone}
              >
                <Text style={styles.multiDoneText}>해제</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.titleGroup}>
              <Text style={styles.title}>레이어</Text>
            </View>
          )}
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="레이어 패널 닫기">
            <Icon name="close" size={18} />
          </Pressable>
        </View>

      </View>

      <View style={styles.listWrap} {...rangeHandlers}>
      <FlatList
        ref={listRef}
        onScroll={(event) => (scrollOffset.current = event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        onLayout={(event) => (listHeight.current = event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => (contentHeight.current = height)}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={rows}
        keyExtractor={(row) => row.kind === 'group' ? `g-${row.groupId}` : row.object.id}
        getItemLayout={(_, index) => ({ length: ROW_STEP, offset: ROW_STEP * index, index })}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        scrollEnabled={!drag && !ranging}
        ListEmptyComponent={<Text style={styles.empty}>표시할 요소 없음</Text>}
        ListFooterComponent={onEmptyTap ? <TapCatcher onTap={onEmptyTap} style={styles.emptyArea} /> : null}
        renderItem={({ item: row, index }) => {
          const key = row.kind === 'group' ? `g-${row.groupId}` : row.object.id
          const common = {
            index,
            dispatch,
            multi,
            dragging: drag?.key === key,
            // 여러 개를 함께 끄는 중이면 끄는 행에 옮기는 개수를 보여 준다 (키노트·굿노트의 겹친 카드 개수처럼)
            dragCount: drag?.key === key && selectedIds.length > idsOfRow(row).length && idsOfRow(row).every((id) => selectedIds.includes(id)) ? selectedIds.length : 0,
            // 여러 개를 함께 옮기는 중: 끄는 행 말고 고른 다른 행들은 흐리게 보여 같이 간다는 걸 알린다
            carried: Boolean(drag && drag.key !== key && selectedIds.length > 1 && idsOfRow(row).every((id) => selectedIds.includes(id))
              && idsOfRow(rows[drag.from] ?? row).every((id) => selectedIds.includes(id))),
            dragOffset: drag?.key === key ? drag.dy : 0,
            dropLine: drag && drag.key !== key && dropIndex === index ? (dropIndex < drag.from ? 'before' : 'after') : null,
          }
          if (row.kind === 'group') {
            const allSelected = row.members.every((o) => selectedIds.includes(o.id))
            return (
              <GroupRow
                key={key}
                {...common}
                {...rowHandlers(rowActions, key, index)}
                row={row}
                selected={allSelected}
                renamable={allSelected && selectedIds.length === row.members.length}
                collapsed={collapsed.has(row.groupId)}
                onToggleCollapsed={() => toggleCollapsed(row.groupId)}
              />
            )
          }
          return (
            <MemoLayerRow
              key={key}
              rowKey={key}
              actions={rowActions}
              {...common}
              object={row.object}
              nested={row.nested}
              selected={selectedIds.includes(row.object.id)}
              renamable={selectedIds.length === 1 && selectedIds[0] === row.object.id}
            />
          )
        }}
      />
      </View>
    </View>
  )
}

function useRowDrag({ onDragStart, onDragMove, onDragEnd }) {
  const dyRef = useRef(0)
  return usePan({
    onStart: () => {
      dyRef.current = 0
      onDragStart()
    },
    onMove: (dx, dy) => {
      dyRef.current = dy
      onDragMove(dy)
    },
    onEnd: () => onDragEnd(dyRef.current),
  })
}

function RowShell({ dragging, dragOffset, dropLine, carried, dragCount = 0, children }) {
  return (
    <View style={[styles.rowWrap, dragging && { zIndex: 2, transform: [{ translateY: dragOffset }] }, carried && styles.rowCarried]}>
      {dragCount > 1 && <View style={styles.countBadge} pointerEvents="none"><Text style={styles.countText}>{dragCount}</Text></View>}
      {dropLine && <View style={[styles.dropLine, dropLine === 'before' ? styles.dropBefore : styles.dropAfter]} />}
      {children}
    </View>
  )
}

function NameField({ name, renamable, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== name) onCommit(next)
  }
  // 다른 행·캔버스를 눌러 이 항목 선택이 풀리면(=포커스가 나가면) 편집을 끝낸다.
  // iPad 는 입력창 밖을 눌러도 포커스가 자동으로 빠지지 않아서 직접 닫는다.
  useEffect(() => {
    if (editing && !renamable) commit()
  })
  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        maxLength={30}
        selectTextOnFocus
        onSubmitEditing={commit}
        onBlur={commit}
        style={styles.nameInput}
        accessibilityLabel="이름"
      />
    )
  }
  return (
    <Pressable
      disabled={!renamable}
      onPress={() => {
        setDraft(name)
        setEditing(true)
      }}
      accessibilityLabel={renamable ? '이름 바꾸기' : undefined}
    >
      <View style={styles.nameRow}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        {renamable && <Icon name="edit" size={13} strokeWidth={2} color={colors.textMuted} />}
      </View>
    </Pressable>
  )
}

// 숨김·잠금 버튼은 선택한 행에서만, 켜져 있으면 늘 보여 준다.
function ToggleButtons({ show, hidden, locked, onToggle }) {
  return (
    <>
      {(show || hidden) && (
        <Pressable
          hitSlop={6}
          onPress={() => onToggle('hidden', !hidden)}
          style={styles.toggle}
          accessibilityLabel={hidden ? '보이기' : '숨기기'}
        >
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} color={hidden ? colors.primary : colors.textMuted} />
        </Pressable>
      )}
      {(show || locked) && (
        <Pressable
          hitSlop={6}
          onPress={() => onToggle('locked', !locked)}
          style={styles.toggle}
          accessibilityLabel={locked ? '잠금 해제' : '잠그기'}
        >
          <Icon name={locked ? 'lock' : 'unlock'} size={17} color={locked ? colors.primary : colors.textMuted} />
        </Pressable>
      )}
    </>
  )
}

function GroupRow({ row, selected, renamable, collapsed, onToggleCollapsed, dispatch, multi, onToggle, onRangeStart, onPressOut, ...drag }) {
  const gripHandlers = useRowDrag(drag)
  const memberIds = row.members.map((o) => o.id)
  const hidden = row.members.every((o) => o.hidden)
  const locked = row.members.every((o) => o.locked)
  const patchAll = (patch) =>
    dispatch({
      type: 'updateMany',
      record: true,
      patches: Object.fromEntries(memberIds.map((id) => [id, patch])),
    })

  return (
    <RowShell {...drag}>
      <Pressable
        onPress={() => {
          Keyboard.dismiss()
          if (multi) onToggle()
          else dispatch({ type: 'select', ids: memberIds })
        }}
        onLongPress={onRangeStart}
        onPressOut={onPressOut}
        delayLongPress={350}
        style={[styles.row, selected && styles.rowSelected, drag.dragging && styles.rowDragging, hidden && styles.rowHidden]}
        accessibilityRole="button"
        accessibilityState={{ selected, expanded: !collapsed }}
      >
        <Pressable
          onPress={onToggleCollapsed}
          hitSlop={8}
          style={styles.chevron}
          accessibilityLabel={collapsed ? '그룹 펼치기' : '그룹 접기'}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={16} color={colors.textMuted} />
        </Pressable>
        <Icon name="folder" size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <NameField name={row.name} renamable={renamable} onCommit={(groupName) => patchAll({ groupName })} />
          <Text style={styles.rowType} numberOfLines={1}>
            그룹 · {row.members.length}개
          </Text>
        </View>
        <ToggleButtons show={selected} hidden={hidden} locked={locked} onToggle={(key, value) => patchAll({ [key]: value })} />
        <View {...gripHandlers} style={styles.grip} accessibilityLabel="끌어서 순서 바꾸기">
          <Icon name="grip" size={18} color={colors.primary} />
        </View>
      </Pressable>
    </RowShell>
  )
}

/** 행 하나의 끌기·범위 고르기 핸들러 (고정된 actions 에 행 key·위치를 붙인다) */
function rowHandlers(actions, key, index) {
  return {
    onDragStart: () => actions.dragStart(key, index),
    onDragMove: (dy) => actions.dragMove(key, index, dy),
    onDragEnd: (dy) => actions.dragEnd(index, dy),
    onRangeStart: (event) => actions.rangeStart(index, event),
    onToggle: () => actions.toggle(index),
    onPressOut: actions.pressOut,
  }
}

// 요소 행은 그 요소·선택·끌기 상태가 바뀔 때만 다시 그린다.
const MemoLayerRow = memo(function MemoLayerRow({ rowKey, actions, index, ...props }) {
  return <LayerRow index={index} {...props} {...rowHandlers(actions, rowKey, index)} />
})

function LayerRow({ object, nested, selected, renamable, dispatch, multi, onToggle, onRangeStart, onPressOut, ...drag }) {
  const gripHandlers = useRowDrag(drag)
  return (
    <RowShell {...drag}>
      <Pressable
        onPress={() => {
          Keyboard.dismiss()
          if (multi) onToggle()
          else if (isMultiSelectKey()) dispatch({ type: 'toggleSelect', id: object.id, exact: nested })
          else dispatch({ type: nested ? 'selectExact' : 'select', ids: [object.id] })
        }}
        onLongPress={onRangeStart}
        onPressOut={onPressOut}
        delayLongPress={350}
        style={[
          styles.row,
          nested && styles.rowNested,
          selected && styles.rowSelected,
          drag.dragging && styles.rowDragging,
          object.hidden && styles.rowHidden,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        {nested && <View style={styles.nestLine} />}
        <LayerThumb object={object} />
        <View style={styles.rowText}>
          <NameField
            name={getObjectName(object)}
            renamable={renamable}
            onCommit={(name) =>
              dispatch({
                type: 'updateObject',
                id: object.id,
                patch: { name },
                record: true,
              })
            }
          />
          <Text style={styles.rowType}>{OBJECT_TYPE_LABELS[object.type]}</Text>
        </View>
        <ToggleButtons
          show={selected}
          hidden={object.hidden}
          locked={object.locked}
          onToggle={(key, value) =>
            dispatch({
              type: 'updateObject',
              id: object.id,
              patch: { [key]: value },
              record: true,
            })
          }
        />
        <View {...gripHandlers} style={styles.grip} accessibilityLabel="끌어서 순서 바꾸기">
          <Icon name="grip" size={18} color={colors.primary} />
        </View>
      </Pressable>
    </RowShell>
  )
}

const LayerThumb = memo(function LayerThumb({ object }) {
  const uri = useMediaUri(object, { still: true })
  let content = null
  if (object.type === 'text') {
    content = <Text style={{ color: object.color, fontSize: 22 }}>T</Text>
  } else if (object.type === 'stroke' || object.type === 'shape') {
    content = <ObjectContent object={object} zoom={Math.min(30 / object.w, 30 / object.h)} still />
  } else if (object.type === 'sticker') {
    const source = stickerSource(object, true, uri)
    content = source ? (
      <Image source={source} style={styles.thumbImage} resizeMode="contain" />
    ) : (
      <Text style={styles.thumbEmoji}>{object.emoji}</Text>
    )
  } else if (object.type === 'photo') {
    content = <Image source={uri ? { uri } : null} style={styles.thumbPhoto} resizeMode="cover" />
  } else {
    // 테이프는 기울이지 않고 가로로. 실제 테이프의 가로:세로 비율을 썸네일 폭에 맞춘다.
    const tapeW = 34
    const tapeH = clamp((tapeW * object.h) / object.w, 4, 18)
    content = (
      <View>
        <TapeView
          pattern={object.pattern}
          palette={object.palette}
          segmentRatio={object.segmentW ? object.segmentW / object.h : undefined}
          src={object.src}
          mediaFileId={object.mediaFileId}
          crop={object.crop}
          imageWidth={object.imageWidth}
          imageHeight={object.imageHeight}
          edge={object.edge}
          width={tapeW}
          height={tapeH}
          scale={tapeH / tapeSizeOf(object).h}
        />
      </View>
    )
  }
  return <View style={styles.thumb}>{content}</View>
})

// 레이어 패널 폭. 열고 닫을 때 작업창 크기를 한 번에 맞추는 데도 쓴다 (EditorScreen)
export const LAYER_PANEL_WIDTH = 280

const styles = StyleSheet.create({
  rowCarried: { opacity: 0.4 },
  multiBar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: 10, paddingVertical: 2, paddingLeft: 12, paddingRight: 4, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  multiText: { fontSize: 13, fontWeight: '700', color: colors.text },
  multiDone: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surface },
  multiDoneText: { fontSize: 13, fontWeight: '700', color: colors.primaryStrong },
  countBadge: { position: 'absolute', top: -6, right: 8, zIndex: 3, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  countText: { fontSize: 12, fontWeight: '700', color: colors.surface },
  // 화면 오른쪽 끝에 붙는 패널 (EditorScreen 의 바깥 여백을 음수 여백으로 덮는다)
  panel: {
    width: LAYER_PANEL_WIDTH,
    marginTop: -16,
    marginBottom: -16,
    marginRight: -16,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(11,25,87,0.08)',
    backgroundColor: '#E4ECF7',
  },
  close: { padding: 4 },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    height: 36, // 여러 개 고르기 막대로 바뀌어도 높이가 같아 목록이 밀리지 않게
  },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 19, fontWeight: '700', color: colors.text },
  nameInput: {
    height: 30,
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    marginTop: 6,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textMuted,
  },
  listWrap: { flex: 1 },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: 12 },
  emptyArea: { flexGrow: 1, minHeight: 24 },
  empty: {
    paddingVertical: 36,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 20,
    color: colors.textMuted,
  },
  rowWrap: { height: ROW_HEIGHT, marginBottom: ROW_GAP },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  rowNested: { paddingLeft: 40 },
  nestLine: {
    position: 'absolute',
    left: 27,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(110,146,198,0.35)',
  },
  chevron: { marginLeft: -6, marginRight: -4, padding: 2 },
  rowSelected: { backgroundColor: 'rgba(110,146,198,0.24)' },
  rowDragging: {
    backgroundColor: '#F4F7FC',
    shadowColor: colors.text,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  rowHidden: { opacity: 0.5 },
  dropLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  dropBefore: { top: -ROW_GAP / 2 - 1.5 },
  dropAfter: { bottom: -ROW_GAP / 2 - 1.5 },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbEmoji: { fontSize: 22 },
  thumbImage: { width: 30, height: 30 },
  thumbPhoto: { width: 40, height: 40 },
  rowText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: colors.text },
  rowType: { marginTop: 2, fontSize: 10.5, color: colors.textMuted },
  toggle: { padding: 7 },
  grip: { paddingHorizontal: 8, paddingVertical: 14 },
})
