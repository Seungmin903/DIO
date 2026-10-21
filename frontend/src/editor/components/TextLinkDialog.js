import { useState } from 'react'
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { normalizeTextLink } from '../utils/textFormats'

export default function TextLinkDialog({ initialValue = '', onSave, onCancel }) {
  const [value, setValue] = useState(initialValue), [error, setError] = useState('')
  const normalized = normalizeTextLink(value)
  return <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop}>
      <View style={styles.card} accessibilityLabel="텍스트 링크 편집">
        <Text style={styles.title}>링크</Text>
        <TextInput autoFocus accessibilityLabel="텍스트 링크 URL" placeholder="https://example.com" value={value} onChangeText={(next) => { setValue(next); setError('') }} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <View style={styles.row}>
          {initialValue ? <Pressable accessibilityRole="button" onPress={() => onSave('')} style={styles.button}><Text style={styles.error}>링크 제거</Text></Pressable> : null}
          {normalized ? <Pressable accessibilityRole="button" onPress={() => Linking.openURL(normalized).catch(() => setError('링크를 열지 못했어요.'))} style={styles.button}><Text style={styles.text}>열기</Text></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}><Text style={styles.text}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => normalized === null ? setError('http 또는 https 주소를 입력해 주세요.') : onSave(normalized)} style={[styles.button, styles.primary]}><Text style={styles.text}>적용</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,25,87,0.2)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: 380, maxWidth: '100%', gap: 16, padding: 20, borderRadius: 20, backgroundColor: colors.surface, ...shadow.float },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }, button: { padding: 10, borderRadius: 10 }, primary: { backgroundColor: colors.primarySoft }, text: { color: colors.text }, error: { color: colors.danger },
})
