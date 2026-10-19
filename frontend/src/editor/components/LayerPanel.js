import { useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '../../theme'
import { OBJECT_TYPE_LABELS } from '../constants'
import { usePan } from '../hooks/usePan'
import { clamp } from '../utils/common'
import { getObjectName } from '../utils/objects'
import Icon from './Icon'
import TapeView from './TapeView'

const ROW_HEIGHT = 62
const ROW_GAP = 6
const ROW_STEP = ROW_HEIGHT + ROW_GAP

const SAVE_TEXT = {
  saving: '저장 중…',
  saved: '이 기기에 자동 저장했어요',
  error: '저장 공간이 부족해 저장하지 못했어요',
}

const ORDER_ACTIONS = [
  { mode: 'forward', label: '앞으로' },
  { mode: 'backward', label: '뒤로' },
  { mode: 'front', label: '맨 앞' },
  { mode: 'back', label: '맨 뒤' },
]

/**
 * 레이어 패널. 위쪽 항목이 앞(objects 배열의 뒤쪽)에 보인다.
 * - 항목 탭: 선택 / 동그라미 탭: 다중 선택에 추가·제외
 * - 오른쪽 손잡이를 끌어 순서 변경
 * - 두 개 이상 선택하면 묶기 (명세: 레이어 그룹화)
 */
export default function LayerPanel({ objects, selectedIds, saveStatus, dispatch }) {
  const layers = [...objects].reverse()
  const [drag, setDrag] = useState(null) // { id, from, dy }
  const selected = objects.filter((o) => selectedIds.includes(o.id))
  const hasSelection = selected.length > 0
  const grouped = selected.length > 1 && selected.every((o) => o.groupId && o.groupId === selected[0].groupId)
  const dropIndex = drag ? clamp(drag.from + Math.round(drag.dy / ROW_STEP), 0, layers.length - 1) : null

  const ids = selected.map((o) => o.id)

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PAGE OBJECTS</Text>
        <Text style={styles.title}>레이어</Text>
        <Text style={styles.hint}>위쪽 항목이 앞에 보여요. 손잡이를 끌어 순서를 바꾸세요.</Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} scrollEnabled={!drag}>
        {layers.length === 0 && <Text style={styles.empty}>아직 올린 요소가 없어요.{'\n'}스티커나 사진을 붙여 보세요.</Text>}
        {layers.map((object, index) => (
          <LayerRow
            key={object.id}
            object={object}
            index={index}
            count={layers.length}
            selected={selectedIds.includes(object.id)}
            dragging={drag?.id === object.id}
            dragOffset={drag?.id === object.id ? drag.dy : 0}
            dropLine={drag && drag.id !== object.id && dropIndex === index ? (dropIndex < drag.from ? 'before' : 'after') : null}
            dispatch={dispatch}
            onDrag={setDrag}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.actions}>
          {ORDER_ACTIONS.map((action) => (
            <ActionButton
              key={action.mode}
              label={action.label}
              disabled={!hasSelection}
              onPress={() => dispatch({ type: 'reorder', ids, mode: action.mode })}
            />
          ))}
          <ActionButton label="복제" disabled={!hasSelection} onPress={() => dispatch({ type: 'duplicateObjects', ids })} />
          <ActionButton
            label={grouped ? '묶음 풀기' : '묶기'}
            disabled={selected.length < 2}
            onPress={() => dispatch({ type: grouped ? 'ungroup' : 'group', ids })}
          />
          <ActionButton
            label="삭제"
            danger
            disabled={!hasSelection}
            onPress={() => dispatch({ type: 'removeObjects', ids: selected.filter((o) => !o.locked).map((o) => o.id) })}
          />
        </View>
        <Text style={[styles.saveStatus, saveStatus === 'error' && styles.saveError]}>{SAVE_TEXT[saveStatus]}</Text>
      </View>
    </View>
  )
}

function LayerRow({ object, index, count, selected, dragging, dragOffset, dropLine, dispatch, onDrag }) {
  const dragRef = useRef(null)
  const gripHandlers = usePan({
    onStart: () => {
      dragRef.current = { dy: 0 }
      onDrag({ id: object.id, from: index, dy: 0 })
    },
    onMove: (dx, dy) => {
      dragRef.current = { dy }
      onDrag({ id: object.id, from: index, dy })
    },
    onEnd: () => {
      const target = clamp(index + Math.round((dragRef.current?.dy ?? 0) / ROW_STEP), 0, count - 1)
      onDrag(null)
      // 화면 목록 인덱스 → objects 배열 인덱스 (목록은 뒤집혀 있음)
      if (target !== index) dispatch({ type: 'moveLayer', id: object.id, toIndex: count - 1 - target })
    },
  })

  const toggle = (key) => dispatch({ type: 'updateObject', id: object.id, patch: { [key]: !object[key] }, record: true })

  return (
    <View style={[styles.rowWrap, dragging && { zIndex: 2, transform: [{ translateY: dragOffset }] }]}>
      {dropLine && <View style={[styles.dropLine, dropLine === 'before' ? styles.dropBefore : styles.dropAfter]} />}
      <Pressable
        onPress={() => dispatch({ type: 'select', ids: [object.id] })}
        style={[styles.row, selected && styles.rowSelected, dragging && styles.rowDragging, object.hidden && styles.rowHidden]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Pressable
          hitSlop={8}
          onPress={() => dispatch({ type: 'toggleSelect', id: object.id })}
          style={[styles.check, selected && styles.checkOn]}
          accessibilityLabel="다중 선택"
        >
          {selected && <Icon name="check" size={12} strokeWidth={3} color={colors.surface} />}
        </Pressable>
        <LayerThumb object={object} />
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {getObjectName(object)}
          </Text>
          <Text style={styles.rowType}>
            {OBJECT_TYPE_LABELS[object.type]}
            {object.groupId ? ' · 묶음' : ''}
          </Text>
        </View>
        <Pressable hitSlop={6} onPress={() => toggle('hidden')} style={styles.toggle} accessibilityLabel={object.hidden ? '보이기' : '숨기기'}>
          <Icon name={object.hidden ? 'eyeOff' : 'eye'} size={16} color={object.hidden ? colors.primary : colors.textMuted} />
        </Pressable>
        <Pressable hitSlop={6} onPress={() => toggle('locked')} style={styles.toggle} accessibilityLabel={object.locked ? '잠금 해제' : '잠그기'}>
          <Icon name={object.locked ? 'lock' : 'unlock'} size={16} color={object.locked ? colors.primary : colors.textMuted} />
        </Pressable>
        <View {...gripHandlers} style={styles.grip} accessibilityLabel="끌어서 순서 바꾸기">
          <Icon name="grip" size={18} color={colors.primary} />
        </View>
      </Pressable>
    </View>
  )
}

function LayerThumb({ object }) {
  let content = null
  if (object.type === 'sticker') {
    content = object.src ? (
      <Image source={{ uri: object.src }} style={styles.thumbImage} resizeMode="contain" />
    ) : (
      <Text style={styles.thumbEmoji}>{object.emoji}</Text>
    )
  } else if (object.type === 'photo') {
    content = <Image source={{ uri: object.src }} style={styles.thumbPhoto} resizeMode="cover" />
  } else {
    content = (
      <View style={styles.thumbTape}>
        <TapeView pattern={object.pattern} src={object.src} edge={object.edge} width={30} height={12} scale={0.6} />
      </View>
    )
  }
  return <View style={styles.thumb}>{content}</View>
}

function ActionButton({ label, disabled, danger, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed, disabled && styles.actionDisabled]}
    >
      <Text style={[styles.actionText, danger && styles.actionDanger, disabled && styles.actionTextDisabled]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  panel: { width: 268, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.87)', overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  eyebrow: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
  title: { marginTop: 2, fontSize: 19, fontWeight: '800', color: colors.text },
  hint: { marginTop: 6, fontSize: 11.5, lineHeight: 17, color: colors.textMuted },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 10, paddingBottom: 12 },
  empty: { paddingVertical: 36, textAlign: 'center', fontSize: 12, lineHeight: 20, color: colors.textMuted },
  rowWrap: { height: ROW_HEIGHT, marginBottom: ROW_GAP },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(11,25,87,0.08)',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: '#E7EEF9' },
  rowDragging: { shadowColor: '#0B1957', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  rowHidden: { opacity: 0.5 },
  dropLine: { position: 'absolute', left: 4, right: 4, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  dropBefore: { top: -ROW_GAP / 2 - 1.5 },
  dropAfter: { bottom: -ROW_GAP / 2 - 1.5 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  thumb: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F6F8FC', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbEmoji: { fontSize: 22 },
  thumbImage: { width: 30, height: 30 },
  thumbPhoto: { width: 38, height: 38 },
  thumbTape: { transform: [{ rotate: '-12deg' }] },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  rowType: { marginTop: 2, fontSize: 10.5, color: colors.textMuted },
  toggle: { padding: 3 },
  grip: { paddingHorizontal: 4, paddingVertical: 10 },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  action: {
    height: 32,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionPressed: { backgroundColor: colors.primarySoft },
  actionDisabled: { backgroundColor: 'transparent' },
  actionText: { fontSize: 12, fontWeight: '600', color: colors.text },
  actionDanger: { color: colors.danger },
  actionTextDisabled: { color: 'rgba(11,25,87,0.3)' },
  saveStatus: { marginTop: 10, fontSize: 10.5, color: colors.textMuted },
  saveError: { color: colors.danger },
})
