import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SettingSwitch } from '../../../diary/components/SettingRow'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'
import EditorModal from '../controls/EditorModal'
import { normalizePageSettings, pageSettingsChanges } from '../../../collaboration/pageSettings.js'
import { DEFAULT_GRID_COLOR } from '../../utils/pageGrid.js'

export default function PageSettingsDialog({ pageId, onLoad, onSave, onClose }) {
  const [page, setPage] = useState(null), [title, setTitle] = useState('')
  const [width, setWidth] = useState(''), [height, setHeight] = useState('')
  const [grid, setGrid] = useState(false), [color, setColor] = useState(DEFAULT_GRID_COLOR)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0)
  const alive = useRef(true), saving = useRef(false)
  useEffect(() => {
    alive.current = true
    let cancelled = false
    setError('')
    Promise.resolve().then(() => onLoad(pageId)).then(normalizePageSettings).then(value => {
      if (cancelled) return
      setPage(value); setTitle(value.title ?? ''); setWidth(String(value.canvasWidth)); setHeight(String(value.canvasHeight))
      setGrid(value.gridVisible); setColor(value.gridColor)
    }).catch(e => { if (!cancelled) setError(e.message || '페이지 설정을 불러오지 못했어요.') })
    return () => { cancelled = true; alive.current = false }
  }, [pageId, attempt])
  const close = () => { if (!saving.current) onClose() }
  const save = async () => {
    if (!page || saving.current) return
    try {
      const body = pageSettingsChanges(page, { title, width, height, grid, color })
      if (!body) { onClose(); return }
      saving.current = true; setBusy(true); setError('')
      await onSave(pageId, body)
      if (alive.current) onClose()
    } catch (e) { if (alive.current) setError(e.message || '페이지 설정을 저장하지 못했어요. 다시 시도해 주세요.') }
    finally { saving.current = false; if (alive.current) setBusy(false) }
  }
  return <EditorModal visible transparent animationType="none" onRequestClose={close}>
    <SafeAreaProvider><SafeAreaView style={styles.backdrop}>
      <KeyboardAvoidingView style={styles.area} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card} accessibilityViewIsModal accessibilityLabel="페이지 설정">
            <Text style={styles.title}>페이지 설정</Text>
            {!page && !error && <Text style={styles.label}>설정을 불러오고 있어요.</Text>}
            {page && <>
              <Text style={styles.label}>페이지 이름</Text>
              <TextInput accessibilityLabel="페이지 이름" value={title} onChangeText={setTitle} maxLength={100} editable={!busy} style={styles.input} placeholder="페이지 이름" />
              <Text style={styles.label}>캔버스 크기</Text>
              <View style={styles.row}>
                <View style={styles.column}><Text style={styles.label}>가로</Text><TextInput accessibilityLabel="캔버스 가로 크기" keyboardType="decimal-pad" value={width} onChangeText={setWidth} editable={!busy} style={styles.input} /></View>
                <View style={styles.column}><Text style={styles.label}>세로</Text><TextInput accessibilityLabel="캔버스 세로 크기" keyboardType="decimal-pad" value={height} onChangeText={setHeight} editable={!busy} style={styles.input} /></View>
              </View>
              <Text style={styles.hint}>크기를 바꿔도 작성한 내용의 위치와 크기는 유지돼요.</Text>
              <View style={styles.row}><Text style={[styles.label, styles.column]}>페이지 격자</Text><SettingSwitch label="페이지 격자 표시" disabled={busy} on={grid} onToggle={setGrid} /></View>
              {grid && <><Text style={styles.label}>격자 색</Text><TextInput accessibilityLabel="페이지 격자 색" value={color} onChangeText={setColor} autoCapitalize="none" autoCorrect={false} maxLength={7} editable={!busy} style={styles.input} placeholder="#DCE5F1" /></>}
              <Text style={styles.hint}>격자는 편집 화면에만 표시돼요.</Text>
            </>}
            {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            {!page && !!error && <Pressable accessibilityRole="button" style={styles.button} onPress={() => setAttempt(n => n + 1)}><Text style={styles.label}>다시 불러오기</Text></Pressable>}
            <View style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={close} style={[styles.button, styles.column, busy && styles.disabled]}><Text style={styles.label}>취소</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !page }} disabled={busy || !page} onPress={save} style={[styles.button, styles.primary, styles.column, (busy || !page) && styles.disabled]}><Text style={styles.primaryText}>{busy ? '저장 중' : '저장'}</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView></SafeAreaProvider>
  </EditorModal>
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim }, area: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 480, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' }, label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12 }, error: { color: colors.dangerStrong, fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, color: colors.text, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, column: { flex: 1, minWidth: 0, gap: 8 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 12 },
  primary: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong }, primaryText: { color: colors.surface, fontSize: 14, fontWeight: '700' }, disabled: { opacity: DISABLED_OPACITY },
})
