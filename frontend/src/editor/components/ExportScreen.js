import EditorModal from './controls/EditorModal'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, DISABLED_OPACITY } from '../../shared/theme'
import Icon from './controls/Icon'
import { toolPanelStyles } from './ToolPanel'

/** 내보내기 화면의 버튼. 도구 옵션 창과 같은 모양 (회색 칩, 고르면 흰 바탕 + 파란 테두리). primary 는 채운 파란 버튼 */
export function ExportButton({ title, label = title, onPress, disabled, selected, primary, ...props }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, primary && styles.primary, selected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]} {...props}>
    <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>
}

/** 이름 · 값 한 줄 (크기, 파일 이름 등) */
export function InfoRow({ label, value, selectable = false }) {
  return <View style={styles.info}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text selectable={selectable} style={styles.infoValue} numberOfLines={2}>{value}</Text>
  </View>
}

/** 안내·경고 문구. tone 'alert' 는 읽어 주기에서도 알림으로 다룬다 */
export function Note({ children, tone }) {
  return <Text accessibilityRole={tone === 'alert' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.note, tone === 'alert' && styles.noteAlert]}>{children}</Text>
}

/**
 * PNG 미리보기·PDF 만들기·영역 선택처럼 화면을 다 덮는 내보내기 화면의 공용 틀.
 * 편집 화면처럼 위쪽 바(닫기 + 제목), 가운데 작업 영역(preview), 오른쪽 옵션 카드(children). 폰처럼 좁으면 카드가 아래로 간다.
 */
export default function ExportScreen({ title, onClose, closeLabel, closeDisabled = false, preview, children, visible = true, stablePreview = false }) {
  const { width } = useWindowDimensions()
  const wide = width >= 720
  return <EditorModal visible={visible} animationType="none" onRequestClose={onClose}>
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} disabled={closeDisabled} hitSlop={8} accessibilityRole="button" accessibilityLabel={closeLabel ?? `${title} 닫기`} accessibilityState={{ disabled: closeDisabled }}
          style={({ pressed }) => [styles.close, pressed && styles.closePressed, closeDisabled && styles.disabled]}>
          <Icon name="close" size={18} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <View style={[styles.body, !wide && styles.bodyNarrow]}>
        <View style={[styles.stage, !wide && stablePreview && styles.stableStageNarrow]}>{preview}</View>
        <View style={[toolPanelStyles.card, styles.side, !wide && styles.sideNarrow, !wide && stablePreview && styles.stableSideNarrow]}>
          <ScrollView contentContainerStyle={[toolPanelStyles.content, styles.sideContent]}>{children}</ScrollView>
        </View>
      </View>
    </SafeAreaView>
  </EditorModal>
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.9)' },
  close: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  closePressed: {}, // 눌림 효과 없음(사용자 지시)
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  body: { flex: 1, flexDirection: 'row', gap: 16, padding: 16 },
  bodyNarrow: { flexDirection: 'column' },
  // 작업 영역: 편집 화면의 작업창처럼 둥근 판 위에 미리보기를 가운데 둔다
  stage: { flex: 1, minWidth: 0, minHeight: 200, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(255,255,255,0.35)' },
  sideContent: { paddingTop: 18, paddingBottom: 18 },
  side: { width: 320, alignSelf: 'flex-start', maxHeight: '100%' },
  sideNarrow: { width: '100%', maxHeight: '45%' },
  // 영역 조절 중 안내가 나타나도 미리보기의 크기·좌표가 바뀌지 않게 공간을 예약한다.
  // 긴 안내·큰 글자는 안쪽 ScrollView에서 확인한다. 다른 내보내기 화면은 기존 높이를 쓴다.
  stableSideNarrow: { height: '45%', flexShrink: 0 },
  stableStageNarrow: { minHeight: 0 }, // 짧은 화면에서도 예약한 옵션 영역이 화면 아래로 밀리지 않게 한다.
  button: { minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  selected: { backgroundColor: colors.surface, borderColor: colors.primaryStrong, borderWidth: 2 },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  disabled: { opacity: DISABLED_OPACITY },
  primary: { minHeight: 48, borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong }, // 만들기 버튼 48 · 모서리 10
  primaryText: { fontSize: 14, fontWeight: '700', color: colors.surface },
  info: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  infoLabel: { flexShrink: 0, fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: colors.text },
  note: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  noteAlert: { color: colors.danger },
  // 작업 영역 안에서 그림·캡처 영역이 판 전체를 쓰게 한다
  fill: { alignSelf: 'stretch', flex: 1, width: '100%' },
})

/** 작업 영역을 꽉 채우는 칸 (미리보기 그림·캡처 영역) */
export function StageFill({ children }) {
  return <View style={styles.fill}>{children}</View>
}
