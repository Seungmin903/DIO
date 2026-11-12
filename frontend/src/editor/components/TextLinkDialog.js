import EditorModal from './controls/EditorModal'
import { useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SettingSwitch } from '../../diary/components/SettingRow'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { colors, shadow } from '../../shared/theme'
import { PANEL_RADIUS } from './ToolPanel'
import { normalizeTextLink } from '../utils/textFormats'

// badge: { value, onChange } 를 넘기면 제목 오른쪽에 '링크 배지' 켜기·끄기 스위치를 둔다 (스티커·테이프·사진 링크)
// 모양은 앱 확인창(ConfirmDialog)과 한 가족이다: 검정 막(scrim) · 폭 380 카드 · 채운 버튼은 '적용' 하나(코덱스 명세 2026-11-01).
// 버튼 줄: 왼쪽 끝 [링크 제거][열기] (있을 때만) · 오른쪽 [취소][적용]
export default function TextLinkDialog({ initialValue = '', onSave, onCancel, badge = null }) {
  const [value, setValue] = useState(initialValue), [error, setError] = useState(''), [focused, setFocused] = useState(false)
  const normalized = normalizeTextLink(value)
  return <EditorModal visible transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={onCancel}>
    <SafeAreaProvider>
      <SafeAreaView style={styles.backdrop}>
        <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
            <View style={styles.card} accessibilityLabel="텍스트 링크 편집">
              <View style={styles.titleRow}>
                <Text style={styles.title}>링크</Text>
                {badge && (
                  <View style={styles.badgeToggle}>
                    <Text style={styles.badgeLabel}>배지</Text>
                    <SettingSwitch label="링크 배지 표시" on={badge.value} onToggle={badge.onChange} />
                  </View>
                )}
              </View>
              <View style={styles.field}>
                <TextInput autoFocus accessibilityLabel="텍스트 링크 URL" placeholder="https://example.com" placeholderTextColor={colors.primary} value={value}
                  onChangeText={(next) => { setValue(next); setError('') }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.input, focused && styles.inputFocused]} />
                {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
              </View>
              <View style={styles.row}>
                {initialValue ? <Pressable accessibilityRole="button" onPress={() => onSave('')} style={[styles.button, styles.wide]}><Text style={[styles.label, styles.remove]}>링크 제거</Text></Pressable> : null}
                {normalized ? <Pressable accessibilityRole="button" onPress={() => Linking.openURL(normalized).catch(() => setError('링크를 열지 못했어요.'))} style={styles.button}><Text style={[styles.label, styles.open]}>열기</Text></Pressable> : null}
                <View style={styles.spacer} />
                <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}><Text style={[styles.label, styles.cancel]}>취소</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => normalized === null ? setError('http 또는 https 주소를 입력해 주세요.') : onSave(normalized)} style={[styles.button, styles.primary]}><Text style={[styles.label, styles.primaryLabel]}>적용</Text></Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  </EditorModal>
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  keyboardArea: { flex: 1 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: 380, maxWidth: '100%', gap: 16, padding: 20, borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  titleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  badgeToggle: { marginLeft: 'auto', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeLabel: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  field: { gap: 6 },
  // 입력칸: 높이 48 · 모서리 10, 누르면 2px primaryStrong 테두리(안쪽 여백을 1 줄여 글자가 움직이지 않게)
  input: { height: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 15, ...(Platform.OS === 'web' && { outlineStyle: 'none' }) },
  inputFocused: { borderWidth: 2, borderColor: colors.primaryStrong, paddingHorizontal: 11 },
  error: { color: colors.dangerStrong, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  row: { marginTop: 2, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
  spacer: { flex: 1 },
  // 버튼: 높이 44 · 모서리 12, 눌림 효과 없음
  button: { minWidth: 52, height: 48, paddingHorizontal: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wide: { minWidth: 76 },
  primary: { backgroundColor: colors.primaryStrong },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  remove: { color: colors.dangerStrong },
  open: { color: colors.primaryText },
  cancel: { color: colors.textMuted },
  primaryLabel: { color: colors.surface },
})
