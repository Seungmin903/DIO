import { useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '../../../shared/theme'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../constants'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import Icon from '../controls/Icon'
import TapCatcher from '../controls/TapCatcher'
import StaticPage from '../canvas/StaticPage'

const THUMB_WIDTH = 124
const THUMB_ZOOM = THUMB_WIDTH / PAGE_WIDTH
const HOLD_MS = 280 // 이만큼 누르고 있으면 끌어서 순서 바꾸기 시작 (그 전에 움직이면 목록 스크롤)
const TAP_SLOP = 8

/**
 * 페이지 목록. 썸네일은 편집 화면과 같은 StaticPage 로 그려 편집 내용을 그대로 비춘다.
 * - 탭: 그 페이지로 이동
 * - 길게 눌러 끌기: 페이지 순서 바꾸기 (놓을 자리에 선이 보인다)
 */
// 왼쪽 페이지 목록 폭. 열고 닫을 때 작업창 크기를 한 번에 맞추는 데도 쓴다 (EditorScreen)
export const PAGE_LIST_WIDTH = 156

export default function PageList({ pages, currentId, cropId, onSelect, onAdd, onRemove, onMove, onEmptyTap, readOnly = false }) {
  const [drag, setDrag] = useState(null) // { id, from, dy }
  const layouts = useRef({}) // id → { y, height } (목록 안 위치)
  const target = drag ? dropIndex(pages, layouts.current, drag) : null

  return (
    <View style={styles.panel}>
      <ScrollView contentContainerStyle={styles.list} scrollEnabled={!drag}>
        {pages.map((page, index) => {
          const active = page.id === currentId
          const dragging = drag?.id === page.id
          return (
            <PageItem
              key={page.id}
              page={page}
              index={index}
              active={active}
              dragging={dragging}
              dy={dragging ? drag.dy : 0}
              dropLine={drag && !dragging && target === index ? (target < drag.from ? 'before' : 'after') : null}
              cropId={active ? cropId : null}
              readOnly={readOnly}
              canRemove={!readOnly && pages.length > 1 && active && !drag}
              onLayout={(layout) => (layouts.current[page.id] = layout)}
              onSelect={() => onSelect(page.id)}
              onRemove={() => onRemove(page.id)}
              onDragStart={() => setDrag({ id: page.id, from: index, dy: 0 })}
              onDragMove={(dy) => setDrag({ id: page.id, from: index, dy })}
              onDragEnd={(dy) => {
                const to = dropIndex(pages, layouts.current, { id: page.id, from: index, dy })
                setDrag(null)
                if (to !== index) onMove(page.id, to)
              }}
            />
          )
        })}
        {/* 목록 아래 빈 곳을 누르면 선택 해제 */}
        {onEmptyTap && <TapCatcher onTap={onEmptyTap} style={styles.emptyArea} />}
      </ScrollView>
      {!readOnly && (
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.add, pressed && styles.addPressed]} accessibilityLabel="페이지 추가">
          <Icon name="plus" size={20} />
        </Pressable>
      )}
    </View>
  )
}

/** 끌고 있는 썸네일의 가운데가 들어간 자리 */
function dropIndex(pages, layouts, drag) {
  const self = layouts[drag.id]
  if (!self) return drag.from
  const center = self.y + self.height / 2 + drag.dy
  let index = drag.from
  pages.forEach((page, i) => {
    const box = layouts[page.id]
    if (!box) return
    if (i < drag.from && center < box.y + box.height / 2) index = Math.min(index, i)
    if (i > drag.from && center > box.y + box.height / 2) index = Math.max(index, i)
  })
  return clamp(index, 0, pages.length - 1)
}

function PageItem({ page, index, active, dragging, dy, dropLine, cropId, readOnly, canRemove, onLayout, onSelect, onRemove, onDragStart, onDragMove, onDragEnd }) {
  const press = useRef(null)
  const handlers = usePan({
    onStart: () => {
      const state = { holding: false, moved: false, dy: 0, timer: null }
      if (!readOnly)
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
      if (state.holding) onDragEnd(cancelled ? 0 : state.dy)
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
        accessibilityLabel={`${index + 1}페이지`}
        accessibilityHint={readOnly ? undefined : '길게 눌러 끌면 순서를 바꿔요'}
        style={[styles.thumb, active && styles.thumbActive, dragging && styles.thumbDragging]}
      >
        {/* 지금 편집 중인 페이지는 움직이는 GIF·자르기 표시까지 편집 화면과 똑같이, 나머지는 첫 장면으로 */}
        <StaticPage page={page} zoom={THUMB_ZOOM} still={!active} cropId={cropId} />
      </View>
      <Text style={[styles.number, active && styles.numberActive]}>{index + 1}</Text>
      {canRemove && (
        <Pressable onPress={onRemove} style={styles.remove} hitSlop={6} accessibilityLabel="페이지 삭제">
          <Icon name="trash" size={13} color={colors.danger} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { width: PAGE_LIST_WIDTH, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.58)', overflow: 'hidden' },
  list: { flexGrow: 1, alignItems: 'center', gap: 16, paddingVertical: 16 },
  emptyArea: { flexGrow: 1, alignSelf: 'stretch', minHeight: 24 },
  item: { alignItems: 'center', gap: 6 },
  thumb: {
    width: THUMB_WIDTH,
    height: PAGE_HEIGHT * THUMB_ZOOM,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(11,25,87,0.1)',
    backgroundColor: '#FFFFFF',
  },
  thumbActive: { borderWidth: 2, borderColor: colors.primary },
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
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
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
