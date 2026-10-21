import { useState } from 'react'
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { PANEL_RADIUS } from './ToolPanel'
import { normalizeTextLink } from '../utils/textFormats'

// badge: { value, onChange } 를 넘기면 제목 오른쪽에 '링크 배지' 켜기·끄기 스위치를 둔다 (스티커·테이프·사진 링크)
export default function TextLinkDialog({ initialValue = '', onSave, onCancel, badge = null }) {
  const [value, setValue] = useState(initialValue), [error, setError] = useState('')
  const normalized = normalizeTextLink(value)
  return <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" automaticallyAdjustKeyboardInsets={false}>
      <View style={styles.card} accessibilityLabel="텍스트 링크 편집">
        <View style={styles.titleRow}>
          <Text style={styles.title}>링크</Text>
          {badge && (
            <View style={styles.badgeToggle}>
              <Text style={styles.badgeLabel}>배지</Text>
              <Switch accessibilityLabel="링크 배지 표시" value={badge.value} onValueChange={badge.onChange} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.surface} activeThumbColor={colors.surface} />
            </View>
          )}
        </View>
        <TextInput autoFocus accessibilityLabel="텍스트 링크 URL" placeholder="https://example.com" value={value} onChangeText={(next) => { setValue(next); setError('') }} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <View style={styles.row}>
          {initialValue ? <Pressable accessibilityRole="button" onPress={() => onSave('')} style={styles.button}><Text style={styles.error}>링크 제거</Text></Pressable> : null}
          {normalized ? <Pressable accessibilityRole="button" onPress={() => Linking.openURL(normalized).catch(() => setError('링크를 열지 못했어요.'))} style={styles.button}><Text style={styles.text}>열기</Text></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}><Text style={styles.text}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => normalized === null ? setError('http 또는 https 주소를 입력해 주세요.') : onSave(normalized)} style={[styles.button, styles.primary]}><Text style={styles.text}>적용</Text></Pressable>
        </View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,25,87,0.2)' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, flexShrink: 0, gap: 16, padding: 20, borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center' }, badgeToggle: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }, badgeLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }, button: { padding: 10, borderRadius: 10 }, primary: { backgroundColor: colors.primarySoft }, text: { color: colors.text }, error: { color: colors.danger },
})
