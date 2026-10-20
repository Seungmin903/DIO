import { useEffect, useRef, useState } from 'react'
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { preparePageExport } from '../utils/preparePageExport'
import { capturePage } from '../utils/capturePage'
import { savePngFile } from '../utils/savePngFile'
import { createSaveGate, pngSaveError } from '../utils/pngFileSave.js'
import ObjectContent, { objectOpacity } from './canvas/ObjectView'

/** 선택/격자/패널이 존재하지 않는 별도 렌더링 영역만 캡처한다. */
export default function PageExportPreview({ snapshot, onClose }) {
  const [attempt, setAttempt] = useState(0)
  return <ExportAttempt key={attempt} snapshot={snapshot} onClose={onClose} onRetry={() => setAttempt((value) => value + 1)} />
}

function ExportAttempt({ snapshot, onClose, onRetry }) {
  const [prepared, setPrepared] = useState(null)
  const [laidOut, setLaidOut] = useState(false)
  const [imagesReady, setImagesReady] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(snapshot.errorMessage || null)
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })
  const saving = useRef(false)
  const saveGate = useRef(createSaveGate())
  const [area, setArea] = useState(null)
  const renderScale = Platform.OS === 'web' || !area ? 1 : Math.min(1, area.width / snapshot.width, area.height / snapshot.height)
  const surface = useRef(null)
  const loaded = useRef(new Set())
  const alive = useRef(true)
  const sourceRef = useRef(null), resultRef = useRef(null)
  const started = useRef(false)
  const failed = useRef(false)

  useEffect(() => {
    if (snapshot.errorMessage) return
    alive.current = true
    let cancelled = false
    const timer = setTimeout(() => {
      if (alive.current && !resultRef.current) {
        failed.current = true
        setError((previous) => previous || '이미지 준비가 오래 걸리고 있어요. 닫은 뒤 다시 시도해 주세요.')
      }
    }, 30000)
    preparePageExport(snapshot).then((value) => {
      if (cancelled || failed.current) { value.dispose(); return }
      sourceRef.current = value
      setPrepared(value)
      if (!value.objects.some((o) => o.src)) setImagesReady(true)
    }).catch((failure) => { if (alive.current) setError(failure.message) })
    return () => {
      cancelled = true
      alive.current = false
      clearTimeout(timer)
      sourceRef.current?.dispose()
      resultRef.current?.dispose()
    }
  }, [snapshot])

  useEffect(() => {
    if (!prepared || !laidOut || !imagesReady || error || started.current) return
    started.current = true
    // 이미지의 로드 이벤트 후 레이아웃/합성 프레임을 기다린다.
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      if (!alive.current) return
      try {
        const output = await capturePage(surface.current, prepared)
        if (!alive.current || failed.current) { output.dispose(); return }
        resultRef.current = output
        setResult(output)
        sourceRef.current.dispose()
        sourceRef.current = null
      } catch (failure) { if (alive.current) { failed.current = true; setError(failure.message || 'PNG를 만들지 못했어요.') } }
    }))
  }, [prepared, laidOut, imagesReady, error])

  const onLoad = (id) => {
    loaded.current.add(id)
    if (prepared?.objects.filter((o) => o.src).every((o) => loaded.current.has(o.id))) setImagesReady(true)
  }

  const close = () => { if (!saving.current) onClose() }
  const save = () => saveGate.current(async () => {
    if (!result || error || failed.current || saveState.status === 'saved') return
    saving.current = true
    setSaveState({ status: 'saving', message: Platform.OS === 'web' ? '저장 위치를 선택하고 PNG를 저장하고 있어요…' : '사진첩에 PNG를 저장하고 있어요…' })
    try {
      const outcome = await savePngFile(result, snapshot.fileName)
      if (!alive.current) return
      const message = outcome.status === 'saved' ? outcome.destination === 'photos' ? '사진첩에 저장했어요. 사진 앱에서 확인해 주세요.' : `${outcome.fileName} 저장을 완료했어요.`
        : outcome.status === 'cancelled' ? '저장을 취소했어요. 다시 저장할 수 있어요.'
          : '다운로드를 시작했어요. 브라우저 다운로드 목록에서 저장 결과를 확인해 주세요.'
      setSaveState({ ...outcome, message })
    } catch (failure) {
      if (alive.current) setSaveState({ status: 'error', message: pngSaveError(failure), needsSettings: failure.code === 'PHOTO_PERMISSION_BLOCKED' })
    } finally { saving.current = false }
  })

  return (
    <Modal visible animationType="fade" onRequestClose={close}>
      <View style={styles.root}>
        <View style={styles.heading}>
          <Text style={styles.title}>PNG 내보내기</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="PNG 내보내기 닫기" onPress={close} disabled={saveState.status === 'saving'} accessibilityState={{ disabled: saveState.status === 'saving' }} style={styles.button}><Text>닫기</Text></Pressable>
        </View>
        {error ? <View>
          <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
          <Text style={styles.message}>파일은 저장되지 않았어요. 편집 내용은 그대로 유지돼요.</Text>
          {snapshot.errorMessage ? <Text style={styles.message}>닫고 해당 요소를 확인한 뒤 다시 내보내 주세요.</Text> : <Pressable accessibilityRole="button" accessibilityLabel="PNG 다시 만들기" onPress={onRetry} style={styles.button}><Text>다시 만들기</Text></Pressable>}
        </View> : result ? (
          <View style={styles.preview}>
            <Text style={styles.message}>{result.width} × {result.height} · PNG</Text>
            <Text style={styles.filename} numberOfLines={2}>{snapshot.fileName}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={Platform.OS === 'web' ? 'PNG 파일 저장' : '사진첩에 저장'} accessibilityState={{ disabled: ['saving', 'saved'].includes(saveState.status), busy: saveState.status === 'saving' }} disabled={['saving', 'saved'].includes(saveState.status)} onPress={save} style={[styles.button, styles.saveButton, ['saving', 'saved'].includes(saveState.status) && styles.disabled]}>
              <Text style={styles.saveLabel}>{saveState.status === 'saving' ? '저장 중…' : saveState.status === 'saved' ? '저장 완료' : saveState.status === 'error' || saveState.status === 'cancelled' ? '다시 저장' : saveState.status === 'download-started' ? '다시 다운로드' : Platform.OS === 'web' ? 'PNG 파일 저장' : '사진첩에 저장'}</Text>
            </Pressable>
            {!!saveState.message && <Text accessibilityRole={saveState.status === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.message}>{saveState.message}</Text>}
            {saveState.needsSettings && <Pressable accessibilityRole="button" accessibilityLabel="사진첩 권한 설정 열기" onPress={() => Linking.openSettings().catch(() => setSaveState((previous) => ({ ...previous, message: '설정을 열지 못했어요. 기기 설정에서 DIO의 사진 추가 권한을 허용해 주세요.' })))} style={styles.button}><Text>설정 열기</Text></Pressable>}
            <Image accessibilityLabel="완성 페이지 PNG" source={{ uri: result.uri }} style={styles.image} resizeMode="contain" />
          </View>
        ) : (
          <>
            <Text style={styles.message}>페이지를 이미지로 만들고 있어요…</Text>
            <View style={{ flex: 1 }} onLayout={(event) => setArea(event.nativeEvent.layout)}>
            <ScrollView horizontal removeClippedSubviews={false}>
              <ScrollView removeClippedSubviews={false}>
                {prepared && (Platform.OS === 'web' || area?.width > 0 && area?.height > 0) && <View ref={surface} collapsable={false} onLayout={() => setLaidOut(true)} testID="page-export-surface" style={{ width: prepared.width * renderScale, height: prepared.height * renderScale, backgroundColor: prepared.background, overflow: 'hidden' }}>
                  {prepared.objects.map((object) => <View key={object.id} style={{ position: 'absolute', left: object.x * renderScale, top: object.y * renderScale, width: object.w * renderScale, height: object.h * renderScale, transform: [{ rotate: `${object.rotation ?? 0}deg` }], opacity: objectOpacity(object) }}>
                    <ObjectContent object={object} zoom={renderScale} still onAssetLoad={() => onLoad(object.id)} onAssetError={() => { failed.current = true; setError('이미지를 표시하지 못했어요. 원본을 확인해 주세요.') }} />
                  </View>)}
                </View>}
              </ScrollView>
            </ScrollView>
            </View>
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSoft, padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  button: { padding: 12, backgroundColor: colors.surface, borderRadius: 12 },
  message: { padding: 12, color: colors.text },
  preview: { flex: 1 },
  filename: { paddingHorizontal: 12, color: colors.textMuted, fontSize: 12 },
  saveButton: { alignSelf: 'flex-start', margin: 12, backgroundColor: colors.primary },
  saveLabel: { color: colors.surface, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  image: { flex: 1, width: '100%' },
})
