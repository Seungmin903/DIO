import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { normalizeTextLink } from '../../utils/textFormats'
import Icon from '../controls/Icon'
import { LINKABLE_TYPES } from './ContextBar'

const linked = (objects) => objects.filter((o) => !o.hidden && o.href && LINKABLE_TYPES.includes(o.type))

const boxStyle = (object, zoom) => ({
  position: 'absolute',
  left: object.x * zoom,
  top: object.y * zoom,
  width: object.w * zoom,
  height: object.h * zoom,
  transform: [{ rotate: `${object.rotation ?? 0}deg` }],
})

/** 읽기 모드: 링크가 걸린 스티커·테이프·사진을 누르면 링크를 연다 */
export function ObjectLinkOverlay({ objects, zoom, onError }) {
  return linked(objects).map((object) => (
    <Pressable
      key={object.id}
      accessibilityRole="link"
      accessibilityLabel="링크 열기"
      onPress={() => Linking.openURL(normalizeTextLink(object.href)).catch(() => onError?.('링크를 열지 못했어요.'))}
      style={boxStyle(object, zoom)}
    />
  ))
}

/**
 * 편집 모드: 링크가 걸린 요소의 오른쪽 위 모서리에 작은 표시를 단다. 선택된 요소는 손잡이와 겹쳐서 숨긴다.
 * 배지를 누르면 그 요소를 골라 선택 바의 '링크 열기' 가 바로 보이게 한다. (요소 자리의 다른 터치는 막지 않는다)
 */
export function LinkBadges({ objects, zoom, selectedIds = [], onSelect }) {
  return linked(objects).filter((object) => !selectedIds.includes(object.id)).map((object) => (
    <View key={object.id} pointerEvents="box-none" style={boxStyle(object, zoom)}>
      <Pressable onPress={() => onSelect?.(object.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="링크가 걸린 요소 선택" style={styles.badge}>
        <Icon name="link" size={11} strokeWidth={2.4} color={colors.surface} />
      </Pressable>
    </View>
  ))
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surface,
    ...shadow.card,
  },
})
