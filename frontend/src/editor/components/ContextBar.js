import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../theme'
import { PAGE_HEIGHT, PAGE_WIDTH, TAPE_EDGES, TAPES } from '../constants'
import { clamp, unionBounds } from '../utils/common'
import Icon from './Icon'
import { outlineOn, photoSupportsShadow, shadowOn } from './ObjectView'

const BAR_HEIGHT = 52
const GAP = 18
/** 선택한 요소 근처에 뜨는 빠른 편집 바. 세부 옵션은 '더보기'(MorePanel) 에서 */
export default function ContextBar({
  objects,
  allObjects,
  zoom,
  dispatch,
  moreOpen,
  onToggleMore,
  onCrop,
  onReplacePhoto,
  onToast,
}) {
  const [barWidth, setBarWidth] = useState(0)
  const [orderOpen, setOrderOpen] = useState(false)
  const ids = objects.map((o) => o.id)
  const editable = objects.filter((o) => !o.locked)
  const single = objects.length === 1 ? objects[0] : null
  const bounds = unionBounds(objects)
  const pageW = PAGE_WIDTH * zoom
  const pageH = PAGE_HEIGHT * zoom
  const below = bounds.bottom * zoom + GAP + BAR_HEIGHT < pageH
  const top = Math.max(-BAR_HEIGHT - 8, below ? bounds.bottom * zoom + GAP : bounds.top * zoom - GAP - BAR_HEIGHT)
  const left = clamp(bounds.cx * zoom - barWidth / 2, 8, Math.max(8, pageW - barWidth - 8))

  const update = (patch) => single && dispatch({ type: 'updateObject', id: single.id, patch, record: true })
  const allLocked = objects.every((o) => o.locked)
  const grouped = objects.length > 1 && objects.every((o) => o.groupId && o.groupId === objects[0].groupId)

  return (
    <View
      style={[styles.bar, { top, left, opacity: barWidth ? 1 : 0 }]}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
    >
      {objects.length > 1 && <Text style={styles.count}>{objects.length}개 선택</Text>}

      {single?.type === 'photo' && !single.locked && (
        <>
          <BarButton icon="crop" label="자르기" primary onPress={() => onCrop(single.id)} />
          <IconButton icon="swap" label="사진 바꾸기" onPress={() => onReplacePhoto(single.id)} />
          {single.frame === 'shape' && (
            <Chip label="흰 테두리" active={outlineOn(single)} onPress={() => update({ outline: !outlineOn(single) })} />
          )}
          {photoSupportsShadow(single) && (
            <Chip label="그림자" active={shadowOn(single)} onPress={() => update({ shadow: !shadowOn(single) })} />
          )}
        </>
      )}
      {single?.type === 'sticker' && !single.locked && (
        <>
          <Chip label="흰 테두리" active={outlineOn(single)} onPress={() => update({ outline: !outlineOn(single) })} />
          <Chip label="그림자" active={shadowOn(single)} onPress={() => update({ shadow: !shadowOn(single) })} />
        </>
      )}
      {single?.type === 'tape' && !single.locked && (
        <>
          {single.src && single.imageWidth && <BarButton icon="crop" label="자르기" primary onPress={() => onCrop(single.id)} />}
          {!single.src && (
            <BarButton
              icon="tape"
              label="패턴"
              onPress={() => {
                const index = TAPES.findIndex((t) => t.pattern === single.pattern)
                update({ pattern: TAPES[(index + 1) % TAPES.length].pattern })
              }}
            />
          )}
          {TAPE_EDGES.map((edge) => (
            <Chip key={edge.id} label={edge.name} active={single.edge === edge.id} onPress={() => update({ edge: edge.id })} />
          ))}
        </>
      )}

      {objects.length > 1 && (
        <BarButton
          icon="folder"
          label={grouped ? '그룹 해제' : '그룹'}
          onPress={() => {
            dispatch({ type: grouped ? 'ungroup' : 'group', ids })
            onToast(grouped ? '그룹을 풀었어요.' : '그룹으로 묶었어요. 레이어에서 폴더로 보여요.')
          }}
        />
      )}

      <View style={styles.divider} />
      <IconButton icon="layers" label="순서" active={orderOpen} onPress={() => setOrderOpen(!orderOpen)} />
      <IconButton icon="more" label="더보기" active={moreOpen} onPress={onToggleMore} />
      <IconButton
        icon={allLocked ? 'unlock' : 'lock'}
        label={allLocked ? '잠금 해제' : '잠그기'}
        onPress={() =>
          dispatch({
            type: 'updateMany',
            record: true,
            patches: Object.fromEntries(ids.map((id) => [id, { locked: !allLocked }])),
          })
        }
      />
      <IconButton icon="copy" label="복제" onPress={() => dispatch({ type: 'duplicateObjects', ids })} />
      <IconButton
        icon="trash"
        label="삭제"
        danger
        onPress={() => {
          if (allLocked) {
            onToast('잠긴 요소예요. 잠금을 풀고 지워 주세요.')
            return
          }
          dispatch({ type: 'removeObjects', ids: editable.map((o) => o.id) })
        }}
      />
      {orderOpen && (
        <OrderMenu
          placement={below ? 'below' : 'above'}
          objects={objects}
          allObjects={allObjects}
          onPick={(mode) => dispatch({ type: 'reorder', ids, mode })}
        />
      )}
    </View>
  )
}

const ORDER_ACTIONS = [
  { mode: 'front', label: '맨 앞으로', icon: 'toFront', toward: 'front' },
  { mode: 'forward', label: '앞으로', icon: 'forward', toward: 'front' },
  { mode: 'backward', label: '뒤로', icon: 'backward', toward: 'back' },
  { mode: 'back', label: '맨 뒤로', icon: 'toBack', toward: 'back' },
]

/**
 * 순서 메뉴. 선택한 요소 반대쪽(바 너머)으로 펼쳐 요소를 가리지 않는다.
 * 이미 맨 앞/맨 뒤면 그쪽 항목은 흐리게 막아 둔다. 메뉴는 열어 둔 채 여러 번 누를 수 있다.
 */
function OrderMenu({ placement, objects, allObjects, onPick }) {
  const selected = new Set(objects.map((o) => o.id))
  const indexes = allObjects.map((o, i) => (selected.has(o.id) ? i : -1)).filter((i) => i >= 0)
  const atFront = indexes.every((index, k) => index === allObjects.length - indexes.length + k)
  const atBack = indexes.every((index, k) => index === k)
  return (
    <View style={[styles.menu, placement === 'below' ? { top: BAR_HEIGHT + 6 } : { bottom: BAR_HEIGHT + 6 }]}>
      {ORDER_ACTIONS.map((action) => {
        const disabled = action.toward === 'front' ? atFront : atBack
        return (
          <Pressable
            key={action.mode}
            onPress={() => onPick(action.mode)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
          >
            <Icon name={action.icon} size={18} color={disabled ? colors.border : colors.text} />
            <Text style={[styles.menuText, disabled && styles.menuTextDisabled]}>{action.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function BarButton({ icon, label, primary, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, pressed && styles.pressed]}
    >
      <Icon name={icon} size={17} color={primary ? colors.surface : colors.text} />
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  )
}

function IconButton({ icon, label, danger, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.text} />
    </Pressable>
  )
}

function Chip({ label, active, boxed, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, boxed && styles.chipBoxed, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    borderRadius: 16,
    backgroundColor: colors.surface,
    ...shadow.float,
  },
  menu: {
    position: 'absolute',
    right: 181, // '순서' 버튼 오른쪽 끝에 맞춤 (뒤의 아이콘 4개 × 44 + 바 안쪽 여백 5)
    width: 148,
    padding: 5,
    borderRadius: 14,
    backgroundColor: colors.surface,
    ...shadow.float,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 10, borderRadius: 10 },
  menuText: { fontSize: 13, fontWeight: '700', color: colors.text },
  menuTextDisabled: { color: 'rgba(11,25,87,0.3)' },
  count: { paddingHorizontal: 10, fontSize: 12, fontWeight: '800', color: colors.primary },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 42, paddingHorizontal: 10, borderRadius: 11 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  buttonTextPrimary: { color: colors.surface },
  iconButton: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.primarySoft },
  divider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: colors.border },
  chip: { minHeight: 40, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center' },
  chipBoxed: { borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.surfaceSoft },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.text, fontWeight: '800' },
})
