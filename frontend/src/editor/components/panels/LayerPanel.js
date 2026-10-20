import { useEffect, useRef, useState } from 'react'
import { Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { OBJECT_TYPE_LABELS } from '../../constants'
import { stickerSource } from '../../stickerAssets'
import { useMediaUri } from '../../hooks/useMediaUri'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { isMultiSelectKey } from '../../utils/modifiers'
import { getObjectName } from '../../utils/objects'
import Icon from '../controls/Icon'
import TapCatcher from '../controls/TapCatcher'
import TapeView from '../canvas/TapeView'
import ObjectContent from '../canvas/ObjectView'

const ROW_HEIGHT = 62
const ROW_GAP = 2
const ROW_STEP = ROW_HEIGHT + ROW_GAP

/**
 * 레이어 패널. 위쪽 항목이 앞(objects 배열의 뒤쪽)에 보인다.
 * - 항목 탭: 선택 (선택된 항목은 색으로만 표시)
 * - 여러 개 선택: 길게 누르기, 캔버스 빈 곳 드래그(영역 선택), 웹에서는 Shift·Ctrl+클릭
 * - 그룹: 캔버스 편집 바의 '그룹'으로 묶는다. 패널에서는 폴더처럼 접고 펼치고, 통째로 끌어 옮긴다.
 * - 그룹 안 요소 행을 누르면 그 요소만 골라 따로 고칠 수 있다.
 * - 복제·삭제·순서 버튼은 선택하면 뜨는 편집 바에 있다. 여기서는 끌어서 순서를 바꾼다.
 * - 선택된 항목(그룹)의 이름을 한 번 더 누르면 이름 바꾸기
 * - 오른쪽 손잡이를 끌어 순서 변경. 그룹 사이에 놓으면 그 그룹에 들어가고, 밖으로 빼면 그룹에서 빠진다.
 */
export default function LayerPanel({ objects, selectedIds, dispatch, onClose, onEmptyTap }) {
  const layers = [...objects].reverse()
  const [drag, setDrag] = useState(null) // { key, from, dy }
  const [collapsed, setCollapsed] = useState(() => new Set())
  const selected = objects.filter((o) => selectedIds.includes(o.id))
  const grouped = selected.length > 1 && selected.every((o) => o.groupId && o.groupId === selected[0].groupId)
  const rows = buildRows(layers, collapsed)
  const dropIndex = drag ? clamp(drag.from + Math.round(drag.dy / ROW_STEP), 0, rows.length - 1) : null

  const toggleCollapsed = (groupId) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })

  // 화면 목록에서 from → to 로 끌어 놓은 결과를 reducer 의 moveLayers 로 바꾼다.
  function drop(from, to) {
    if (from === to) return
    const row = rows[from]
    const target = rows[to]
    const place = to < from ? 'above' : 'below'
    const movingIds = row.kind === 'group' ? row.members.map((o) => o.id) : [row.object.id]
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>레이어</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="레이어 패널 닫기">
            <Icon name="close" size={18} />
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {selected.length > 1 && !grouped
            ? `${selected.length}개를 골랐어요. 편집 바의 '그룹'으로 묶을 수 있어요.`
            : '위쪽이 앞에 보여요. 끌어서 순서를 바꾸고, 길게 누르면 여러 개를 고를 수 있어요.'}
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} scrollEnabled={!drag}>
        {layers.length === 0 && <Text style={styles.empty}>아직 올린 요소가 없어요.{'\n'}스티커나 사진을 붙여 보세요.</Text>}
        {rows.map((row, index) => {
          const key = row.kind === 'group' ? `g-${row.groupId}` : row.object.id
          const common = {
            index,
            dispatch,
            dragging: drag?.key === key,
            dragOffset: drag?.key === key ? drag.dy : 0,
            dropLine: drag && drag.key !== key && dropIndex === index ? (dropIndex < drag.from ? 'before' : 'after') : null,
            onDragStart: () => setDrag({ key, from: index, dy: 0 }),
            onDragMove: (dy) => setDrag({ key, from: index, dy }),
            onDragEnd: (dy) => {
              setDrag(null)
              drop(index, clamp(index + Math.round(dy / ROW_STEP), 0, rows.length - 1))
            },
          }
          if (row.kind === 'group') {
            const allSelected = row.members.every((o) => selectedIds.includes(o.id))
            return (
              <GroupRow
                key={key}
                {...common}
                row={row}
                selected={allSelected}
                renamable={allSelected && selectedIds.length === row.members.length}
                collapsed={collapsed.has(row.groupId)}
                onToggleCollapsed={() => toggleCollapsed(row.groupId)}
              />
            )
          }
          return (
            <LayerRow
              key={key}
              {...common}
              object={row.object}
              nested={row.nested}
              selected={selectedIds.includes(row.object.id)}
              renamable={selectedIds.length === 1 && selectedIds[0] === row.object.id}
            />
          )
        })}
        {/* 행 아래 빈 곳을 누르면 선택 해제 */}
        {onEmptyTap && <TapCatcher onTap={onEmptyTap} style={styles.emptyArea} />}
      </ScrollView>
    </View>
  )
}

/** 화면 목록 행: 그룹은 머리 행 + (펼쳐져 있으면) 들여 쓴 요소 행들. 그룹 번호는 위에서부터 매긴다. */
function buildRows(layers, collapsed) {
  const rows = []
  let groupNo = 0
  for (let i = 0; i < layers.length;) {
    const object = layers[i]
    if (!object.groupId) {
      rows.push({ kind: 'object', object })
      i += 1
      continue
    }
    let end = i
    while (end < layers.length && layers[end].groupId === object.groupId) end += 1
    const members = layers.slice(i, end)
    groupNo += 1
    rows.push({
      kind: 'group',
      groupId: object.groupId,
      members,
      name: object.groupName ?? `그룹 ${groupNo}`,
    })
    if (!collapsed.has(object.groupId)) members.forEach((m) => rows.push({ kind: 'object', object: m, nested: true }))
    i = end
  }
  return rows
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

function RowShell({ dragging, dragOffset, dropLine, children }) {
  return (
    <View style={[styles.rowWrap, dragging && { zIndex: 2, transform: [{ translateY: dragOffset }] }]}>
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

function GroupRow({ row, selected, renamable, collapsed, onToggleCollapsed, dispatch, ...drag }) {
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
          dispatch({ type: 'select', ids: memberIds })
        }}
        onLongPress={() => dispatch({ type: 'toggleSelect', id: memberIds[0] })}
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

function LayerRow({ object, nested, selected, renamable, dispatch, ...drag }) {
  const gripHandlers = useRowDrag(drag)
  return (
    <RowShell {...drag}>
      <Pressable
        onPress={() => {
          Keyboard.dismiss()
          if (isMultiSelectKey()) dispatch({ type: 'toggleSelect', id: object.id, exact: nested })
          else dispatch({ type: nested ? 'selectExact' : 'select', ids: [object.id] })
        }}
        onLongPress={() => dispatch({ type: 'toggleSelect', id: object.id, exact: nested })}
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

function LayerThumb({ object }) {
  const uri = useMediaUri(object, { still: true })
  let content = null
  if (object.type === 'text') {
    content = <Text style={{ color: object.color, fontSize: 22 }}>T</Text>
  } else if (object.type === 'stroke') {
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
    content = (
      <View style={styles.thumbTape}>
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
          width={30}
          height={12}
          scale={0.6}
        />
      </View>
    )
  }
  return <View style={styles.thumb}>{content}</View>
}

const styles = StyleSheet.create({
  // 화면 오른쪽 끝에 붙는 패널 (EditorScreen 의 바깥 여백을 음수 여백으로 덮는다)
  panel: {
    width: 280,
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
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
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
    shadowColor: '#0B1957',
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
  thumbTape: { transform: [{ rotate: '-12deg' }] },
  rowText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: colors.text },
  rowType: { marginTop: 2, fontSize: 10.5, color: colors.textMuted },
  toggle: { padding: 7 },
  grip: { paddingHorizontal: 8, paddingVertical: 14 },
})
