import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { TAPE_EDGES } from '../../constants'

/**
 * 붙인 마스킹테이프의 옵션(선택 바 옵션 창): 끝선.
 * 넣을 때 정하는 색 · 무늬는 편집기 보관함 테이프 칸(칩 · 색 줄 · 무늬 칸)에서 고른다(2026-11-02, 스티커 칸과 같은 문법으로 옮김).
 */
export default function TapeOptions({ tape, dispatch }) {
  const update = (patch, record = true) => dispatch({ type: 'updateObject', id: tape.id, record, patch })
  return (
    <Section title="끝선">
      <View style={styles.segment}>
        {TAPE_EDGES.map((edge) => {
          const active = (tape.edge ?? 'straight') === edge.id
          return (
            <Pressable
              key={edge.id}
              onPress={() => update({ edge: edge.id })}
              accessibilityRole="button"
              accessibilityLabel={`끝선 ${edge.name}`}
              accessibilityState={{ selected: active }}
              style={[styles.segmentItem, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{edge.name}</Text>
            </Pressable>
          )
        })}
      </View>
    </Section>
  )
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  title: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  segment: { flexDirection: 'row', gap: 6 },
  segmentItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  segmentActive: { borderColor: colors.primaryStrong, borderWidth: 2 },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
})
