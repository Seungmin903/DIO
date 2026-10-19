import { useEffect, useRef, useState } from 'react'
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../theme'
import { preparePageExport } from '../utils/preparePageExport'
import { capturePage } from '../utils/capturePage'
import ObjectContent, { objectOpacity } from './ObjectView'

/** 선택/격자/패널이 존재하지 않는 별도 렌더링 영역만 캡처한다. */
export default function PageExportPreview({ snapshot, onClose }) {
  const [prepared, setPrepared] = useState(null)
  const [laidOut, setLaidOut] = useState(false)
  const [imagesReady, setImagesReady] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const surface = useRef(null)
  const loaded = useRef(new Set())
  const alive = useRef(true)
  const sourceRef = useRef(null), resultRef = useRef(null)
  const started = useRef(false)
  const failed = useRef(false)

  useEffect(() => {
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
      } catch (failure) { if (alive.current) setError(failure.message || 'PNG를 만들지 못했어요.') }
    }))
  }, [prepared, laidOut, imagesReady, error])

  const onLoad = (id) => {
    loaded.current.add(id)
    if (prepared?.objects.filter((o) => o.src).every((o) => loaded.current.has(o.id))) setImagesReady(true)
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.heading}>
          <Text style={styles.title}>PNG 미리보기</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="PNG 미리보기 닫기" onPress={onClose} style={styles.button}><Text>닫기</Text></Pressable>
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.message}>{error}</Text> : result ? (
          <View style={styles.preview}>
            <Text style={styles.message}>{result.width} × {result.height} · PNG</Text>
            <Image accessibilityLabel="완성 페이지 PNG" source={{ uri: result.uri }} style={styles.image} resizeMode="contain" />
          </View>
        ) : (
          <>
            <Text style={styles.message}>페이지를 이미지로 만들고 있어요…</Text>
            <ScrollView horizontal removeClippedSubviews={false}>
              <ScrollView removeClippedSubviews={false}>
                {prepared && <View ref={surface} collapsable={false} onLayout={() => setLaidOut(true)} testID="page-export-surface" style={{ width: prepared.width, height: prepared.height, backgroundColor: prepared.background, overflow: 'hidden' }}>
                  {prepared.objects.map((object) => <View key={object.id} style={{ position: 'absolute', left: object.x, top: object.y, width: object.w, height: object.h, transform: [{ rotate: `${object.rotation ?? 0}deg` }], opacity: objectOpacity(object) }}>
                    <ObjectContent object={object} zoom={1} still onAssetLoad={() => onLoad(object.id)} onAssetError={() => setError('이미지를 표시하지 못했어요. 원본을 확인해 주세요.')} />
                  </View>)}
                </View>}
              </ScrollView>
            </ScrollView>
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
  image: { flex: 1, width: '100%' },
})
