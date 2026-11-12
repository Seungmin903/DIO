import { useEffect, useRef, useState } from 'react'
import { AppState, BackHandler, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from './controls/Icon'
import DioButton from '../../shared/DioButton'
import { colors } from '../../shared/theme'
import { capturePage } from '../utils/capturePage'
import { readCaptureBytes } from '../utils/readCaptureBytes'
import { decodeEyedropper, eyedropperDimensions, eyedropperLens, eyedropperSample } from '../utils/canvasEyedropper.js'
import { normalizePaperAppearance } from '../templates/appearance.js'

export default function EyedropperOverlay({ request, captureRef, onCancel, onPick }) {
  const screen = useWindowDimensions(), insets = useSafeAreaInsets()
  const [bounds, setBounds] = useState(screen)
  const [barHeight, setBarHeight] = useState(64)
  const [origin, setOrigin] = useState(null), [image, setImage] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [sample, setSample] = useState(null)
  const root = useRef(null), pixels = useRef(null), pointer = useRef(null), callbacks = useRef({ onCancel, onPick })
  callbacks.current = { onCancel, onPick }
  const pageWidth = request.width * request.zoom, pageHeight = request.height * request.zoom
  const viewport = { x: request.origin.x - (origin?.x ?? 0), y: request.origin.y - (origin?.y ?? 0), ...request.viewport }
  const frame = { x: viewport.x + request.offset.x, y: viewport.y + request.offset.y, width: pageWidth, height: pageHeight }
  const input = useRef(null)
  input.current = { origin, frame, viewport, image }
  useEffect(() => {
    let live = true, result = null, first, second
    pixels.current = null; setImage(null); setError(''); setSample(null)
    const timer = setTimeout(() => { live = false; result?.dispose(); pixels.current = null; setImage(null); setError('화면 준비가 오래 걸려요. 다시 시도해 주세요.') }, 20000)
    first = requestAnimationFrame(() => { second = requestAnimationFrame(async () => {
      try {
        if (!live) return
        const snapshot = { width: pageWidth, height: pageHeight, ...eyedropperDimensions(pageWidth, pageHeight), objects: request.page.objects, background: normalizePaperAppearance(request.page.paperAppearance).backgroundColor }
        result = await capturePage(captureRef.current, snapshot)
        if (!live) { result.dispose(); return }
        const bytes = await readCaptureBytes(result)
        if (!live) { result.dispose(); return }
        const decoded = decodeEyedropper(bytes)
        if (!live) { result.dispose(); return }
        clearTimeout(timer); pixels.current = decoded; setImage({ uri: result.uri, width: decoded.width, height: decoded.height })
      } catch { if (live) { clearTimeout(timer); result?.dispose(); setError('화면의 색상을 읽지 못했어요. 다시 시도해 주세요.') } }
    }) })
    return () => { live = false; clearTimeout(timer); cancelAnimationFrame(first); cancelAnimationFrame(second); pixels.current = null; pointer.current = null; result?.dispose() }
  }, [request, captureRef, attempt])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') callbacks.current.onCancel() })
    const back = BackHandler.addEventListener('hardwareBackPress', () => { callbacks.current.onCancel(); return true })
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); callbacks.current.onCancel() } }
    if (Platform.OS === 'web') document.addEventListener('keydown', escape, true)
    return () => { subscription.remove(); back.remove(); if (Platform.OS === 'web') document.removeEventListener('keydown', escape, true) }
  }, [])
  useEffect(() => { if (screen.width !== request.screen.width || screen.height !== request.screen.height) callbacks.current.onCancel() }, [screen.width, screen.height, request])
  const applyPoint = event => {
    const e = event.nativeEvent ?? event, current = input.current
    if (!current.origin || !current.image) return null
    const x = (Platform.OS === 'web' ? e.clientX : e.pageX) - current.origin.x
    const y = (Platform.OS === 'web' ? e.clientY : e.pageY) - current.origin.y
    const picked = eyedropperSample(pixels.current, { x, y }, current.frame, current.viewport)
    setSample(picked); return picked
  }
  const cancelGesture = () => { if (pointer.current != null) { pointer.current = null; callbacks.current.onCancel() } }
  const finish = event => {
    if (pointer.current == null) return
    pointer.current = null
    const picked = applyPoint(event)
    if (picked) callbacks.current.onPick(picked.color)
    else callbacks.current.onCancel()
  }
  const handlers = Platform.OS === 'web' ? {
    onPointerDown: event => {
      const e = event.nativeEvent
      if (!image || (e.button != null && e.button !== 0)) return
      if (pointer.current != null) { cancelGesture(); return }
      pointer.current = e.pointerId
      event.currentTarget.setPointerCapture?.(e.pointerId)
      event.preventDefault(); applyPoint(event)
    },
    onPointerMove: event => { if (pointer.current === event.nativeEvent.pointerId) applyPoint(event) },
    onPointerUp: event => { if (pointer.current === event.nativeEvent.pointerId) finish(event) },
    onPointerCancel: cancelGesture, onLostPointerCapture: cancelGesture,
  } : {
    onStartShouldSetResponder: () => true,
    onResponderGrant: event => { if (!image) return; if (event.nativeEvent.touches?.length > 1) { callbacks.current.onCancel(); return }; pointer.current = true; applyPoint(event) },
    onResponderStart: event => { if (event.nativeEvent.touches?.length > 1) cancelGesture() },
    onResponderMove: event => { if (event.nativeEvent.touches?.length > 1) { cancelGesture(); return }; if (pointer.current != null) applyPoint(event) },
    onResponderRelease: finish, onResponderTerminate: cancelGesture, onResponderTerminationRequest: () => false,
  }
  const lens = sample && eyedropperLens(sample.point, bounds.width, bounds.height, insets.top + barHeight + 24)
  return <View ref={root} testID="eyedropper-overlay" style={s.root} onLayout={event => { setBounds(event.nativeEvent.layout); root.current?.measureInWindow((x, y) => setOrigin({ x, y })) }}>
      <View testID="eyedropper-input" accessibilityLabel="캔버스에서 색상 선택" style={s.input} {...handlers} />
      {sample && image && <View pointerEvents="none" style={[s.cross, { left: sample.point.x - 10, top: sample.point.y - 10 }]}><View style={s.horizontal} /><View style={s.vertical} /></View>}
      {lens && image && <View pointerEvents="none" testID="eyedropper-lens" style={[s.lens, { left: lens.x, top: lens.y, width: lens.width, height: lens.height }]}>
        <View style={[s.ring, { width: lens.width, height: lens.width, borderColor: sample.color }]}>
          <View style={[s.magnify, { width: lens.width - 20, height: lens.width - 20 }]}>
            <Image source={{ uri: image.uri }} resizeMode="stretch" style={{ position: 'absolute', width: image.width * 8, height: image.height * 8, left: (lens.width - 20) / 2 - (sample.x + .5) * 8, top: (lens.width - 20) / 2 - (sample.y + .5) * 8 }} />
            <View style={s.pipette}><Icon name="eyedropper" size={25} color="#FFFFFF" strokeWidth={1.8} /></View>
          </View>
        </View>
        <View style={s.colorRow}><View style={[s.swatch, { backgroundColor: sample.color }]} /><Text testID="eyedropper-color" style={s.text}>{sample.color}</Text></View>
      </View>}
      <View testID={image && !error ? 'eyedropper-ready' : undefined} onLayout={event => setBarHeight(event.nativeEvent.layout.height)} style={[image && !error ? s.readyControls : s.bar, { top: insets.top + 8 }]}>
        {(!image || error) && <Text accessibilityLiveRegion="polite" style={s.label}>{error || '화면의 색상을 준비하고 있어요.'}</Text>}
        {error ? <DioButton variant="tonal" text="다시 시도" label="스포이트 다시 시도" onPress={() => setAttempt(n => n + 1)} /> : null}
        <DioButton variant="tonal" text="취소" label="스포이트 취소" onPress={() => callbacks.current.onCancel()} />
      </View>
    </View>
}
const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, backgroundColor: 'transparent' },
  input: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, ...(Platform.OS === 'web' ? { touchAction: 'none', cursor: 'crosshair' } : {}) },
  bar: { position: 'absolute', left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
  readyControls: { position: 'absolute', right: 8 },
  label: { flex: 1, minWidth: 120, color: colors.text, fontSize: 13, lineHeight: 20 },
  text: { color: colors.text, fontSize: 12 },
  lens: { position: 'absolute', alignItems: 'center' },
  ring: { borderWidth: 10, borderRadius: 999, backgroundColor: colors.surface, boxShadow: '0px 1px 6px rgba(0,0,0,0.3)' },
  magnify: { overflow: 'hidden', borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF' },
  pipette: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.2)' },
  colorRow: { height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderRadius: 13, backgroundColor: colors.surface },
  swatch: { width: 18, height: 18, borderWidth: 1, borderColor: colors.border },
  cross: { position: 'absolute', width: 20, height: 20 },
  horizontal: { position: 'absolute', top: 9, width: 20, height: 2, backgroundColor: '#FFFFFF', borderWidth: .5, borderColor: '#000000' },
  vertical: { position: 'absolute', left: 9, height: 20, width: 2, backgroundColor: '#FFFFFF', borderWidth: .5, borderColor: '#000000' },
})
