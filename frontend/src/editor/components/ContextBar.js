import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../theme'
import { PAGE_HEIGHT, PAGE_WIDTH, TAPE_EDGES, TAPES } from '../constants'
import { clamp, unionBounds } from '../utils/common'
import Icon from './Icon'

const BAR_HEIGHT = 46
const GAP = 18

/** 선택한 요소 근처에 뜨는 빠른 편집 바 */
export default function ContextBar({ objects, zoom, dispatch, onCrop, onToast }) {
  const [barWidth, setBarWidth] = useState(0)
  const ids = objects.map((o) => o.id)
  const single = objects.length === 1 ? objects[0] : null
  const bounds = unionBounds(objects)
  const pageW = PAGE_WIDTH * zoom
  const below = bounds.bottom * zoom + GAP + BAR_HEIGHT < PAGE_HEIGHT * zoom
  const top = below ? bounds.bottom * zoom + GAP : bounds.top * zoom - GAP - BAR_HEIGHT
  const left = clamp(bounds.cx * zoom - barWidth / 2, 8, Math.max(8, pageW - barWidth - 8))

  const update = (patch) => single && dispatch({ type: 'updateObject', id: single.id, patch, record: true })
  const allLocked = objects.every((o) => o.locked)
  const grouped = objects.length > 1 && objects.every((o) => o.groupId && o.groupId === objects[0].groupId)

  return (
    <View
      style={[styles.bar, { top: Math.max(-BAR_HEIGHT - 8, top), left, opacity: barWidth ? 1 : 0 }]}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
    >
      {objects.length > 1 && <Text style={styles.count}>{objects.length}개 선택</Text>}

      {single?.type === 'photo' && !single.locked && (
        <BarButton icon="crop" label="자르기" primary onPress={() => onCrop(single.id)} />
      )}
      {single && single.type !== 'tape' && !single.locked && (
        <BarButton icon="flip" label="반전" onPress={() => update({ flipX: !single.flipX })} />
      )}
      {single?.type === 'tape' && !single.locked && (
        <>
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
          icon="group"
          label={grouped ? '묶음 풀기' : '묶기'}
          onPress={() => {
            dispatch({ type: grouped ? 'ungroup' : 'group', ids })
            onToast(grouped ? '묶음을 풀었어요.' : '한 묶음으로 만들었어요.')
          }}
        />
      )}

      <View style={styles.divider} />
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
          dispatch({ type: 'removeObjects', ids: objects.filter((o) => !o.locked).map((o) => o.id) })
        }}
      />
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

function IconButton({ icon, label, danger, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.text} />
    </Pressable>
  )
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
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
  count: { paddingHorizontal: 10, fontSize: 12, fontWeight: '800', color: colors.primary },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 10, borderRadius: 11 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  buttonTextPrimary: { color: colors.surface },
  iconButton: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.primarySoft },
  divider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: colors.border },
  chip: { height: 30, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.surfaceSoft },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.text, fontWeight: '800' },
})
