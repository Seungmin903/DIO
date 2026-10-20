import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { REUSABLE_TEMPLATES } from '../templates/catalog.js'
import { colors } from '../../shared/theme'

export default function TemplatePicker({ onSelect, onClose }) {
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.card} accessibilityViewIsModal>
        <Text style={styles.title}>페이지 추가</Text>
        <Text style={styles.hint}>날짜를 직접 쓰는 공용 속지를 골라 주세요.</Text>
        <ScrollView>
          {REUSABLE_TEMPLATES.map(item => <Pressable key={item.assetId} accessibilityRole="button" accessibilityLabel={item.name} onPress={() => onSelect(item.assetId)} style={({ pressed }) => [styles.option, pressed && styles.pressed]}><Text style={styles.label}>{item.name}</Text></Pressable>)}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}><Text style={styles.label}>취소</Text></Pressable>
      </View>
    </View>
  </Modal>
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,25,87,0.25)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: 360, maxWidth: '100%', maxHeight: '90%', padding: 20, borderRadius: 20, backgroundColor: colors.surface },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  hint: { marginTop: 8, marginBottom: 12, color: colors.textMuted },
  option: { padding: 13, borderRadius: 8, marginBottom: 5, backgroundColor: colors.surfaceSoft },
  label: { color: colors.text, fontSize: 14 },
  pressed: { backgroundColor: colors.primarySoft },
  cancel: { alignItems: 'center', padding: 12, marginTop: 8 },
})
