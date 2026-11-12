import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import PenSafeTextInput from '../components/controls/PenSafeTextInput'
import { Segmented } from '../components/ToolPanel'
import { ROUTE_NODE_KINDS, ROUTE_NODE_LABEL_MAX, normalizeRouteNode } from './routeNode'

/** 여행 노선 지점의 옵션(옵션 패널 '꾸미기'): 모양(출발 · 방문 · 도착) · 장소 이름(선택 입력). 자리는 노선 위에서 끌어 옮기고, 삭제는 편집 바의 삭제를 쓴다. */
export default function RouteNodeOptions({ object, dispatch }) {
  const node = normalizeRouteNode(object.routeNode)
  const patchNode = (patch, record = true) =>
    dispatch({ type: 'updateObject', id: object.id, record, patch: { routeNode: { ...node, ...patch } } })
  return (
    <>
      <Section title="모양">
        <Segmented items={ROUTE_NODE_KINDS.map(([id, label]) => ({ id, label }))} selected={(id) => node.kind === id} onPress={(kind) => patchNode({ kind })} />
      </Section>
      <Section title="장소 이름 · 비워 둘 수 있어요">
        <PenSafeTextInput
          value={node.label ?? ''}
          maxLength={ROUTE_NODE_LABEL_MAX}
          placeholder="예: 성산일출봉"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="지점 장소 이름"
          onFocus={() => dispatch({ type: 'checkpoint' })}
          onBlur={() => dispatch({ type: 'commitCheckpoint' })}
          onChangeText={(label) => patchNode({ label: label.trim() ? label : undefined }, false)}
          style={styles.input}
        />
      </Section>
    </>
  )
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  sectionTitle: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  input: { height: 40, paddingHorizontal: 12, paddingVertical: 0, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 13, color: colors.text },
})
