import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '../../theme'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import Icon from './Icon'
import StaticPage from './StaticPage'

const THUMB_WIDTH = 124
const THUMB_ZOOM = THUMB_WIDTH / PAGE_WIDTH

export default function PageList({ pages, currentId, onSelect, onAdd, onRemove }) {
  return (
    <View style={styles.panel}>
      <ScrollView contentContainerStyle={styles.list}>
        {pages.map((page, index) => {
          const active = page.id === currentId
          return (
            <View key={page.id} style={styles.item}>
              <Pressable
                onPress={() => onSelect(page.id)}
                accessibilityLabel={`${index + 1}페이지`}
                style={[styles.thumb, active && styles.thumbActive]}
              >
                <StaticPage page={page} zoom={THUMB_ZOOM} />
              </Pressable>
              <Text style={[styles.number, active && styles.numberActive]}>{index + 1}</Text>
              {pages.length > 1 && active && (
                <Pressable onPress={() => onRemove(page.id)} style={styles.remove} hitSlop={6} accessibilityLabel="페이지 삭제">
                  <Icon name="trash" size={13} color={colors.danger} />
                </Pressable>
              )}
            </View>
          )
        })}
      </ScrollView>
      <Pressable onPress={onAdd} style={({ pressed }) => [styles.add, pressed && styles.addPressed]} accessibilityLabel="페이지 추가">
        <Icon name="plus" size={20} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { width: 156, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.58)', overflow: 'hidden' },
  list: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  item: { alignItems: 'center', gap: 6 },
  thumb: {
    width: THUMB_WIDTH,
    height: PAGE_HEIGHT * THUMB_ZOOM,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(11,25,87,0.1)',
  },
  thumbActive: { borderWidth: 2, borderColor: colors.primary },
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
