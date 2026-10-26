import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import EditorModal from '../controls/EditorModal'
import StickerSplitPreview from './StickerSplitPreview'
import PenSafeTextInput from '../controls/PenSafeTextInput'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'
import { stickerSplit } from '../../services/stickerSplit'
import { FULL_CROP, splitError } from '../../utils/stickerSplit.js'
import { discardGeneratedMedia, importMedia } from '../../services/mediaStore'
import { saveSplitSelection } from '../../utils/stickerSplitSave.js'

function Action({ label, onPress, disabled = false, active = false }) {
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} onPress={onPress}
    style={[s.button, active && s.active, disabled && s.disabled]}><Text style={s.buttonText}>{label}</Text></Pressable>
}

function Checker() {
  return <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%"><Defs><Pattern id="split-checker" width={16} height={16} patternUnits="userSpaceOnUse"><Rect width={16} height={16} fill={colors.surface} /><Rect width={8} height={8} fill={colors.surfaceMuted} /><Rect x={8} y={8} width={8} height={8} fill={colors.surfaceMuted} /></Pattern></Defs><Rect width="100%" height="100%" fill="url(#split-checker)" /></Svg>
}

export default function StickerSplitModal({ folder, initialName = '', onSave, onClose }) {
  const insets = useSafeAreaInsets()
  const list = useRef(null)
  const [name, setName] = useState(folder?.name ?? initialName)
  const [source, setSource] = useState(null)
  const [crop, setCrop] = useState(FULL_CROP)
  const [background, setBackground] = useState(null)
  const [tolerance, setTolerance] = useState(35)
  const [mode, setMode] = useState('crop')
  const [adjusting, setAdjusting] = useState(false)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [interacting, setInteracting] = useState(false)
  const [parts, setParts] = useState([])
  const [selected, setSelected] = useState([])
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [zoomed, setZoomed] = useState(null)
  const [smallOnly, setSmallOnly] = useState(false)
  const [dirty, setDirty] = useState(false)
  const alive = useRef(true), operation = useRef(null), jobIds = useRef([]), sourceRef = useRef(null), closing = useRef(false), busy = useRef(false)
  const working = phase !== 'idle', saving = phase === 'saving'
  useEffect(() => () => {
    alive.current = false
    if (operation.current) stickerSplit.cancel(operation.current)
    stickerSplit.cleanup(jobIds.current).finally(() => {
      if (sourceRef.current) stickerSplit.disposeSource(sourceRef.current.uri)
    })
  }, [])
  async function chooseImage() {
    if (busy.current) return
    busy.current = true; setPhase('picking'); setError('')
    try {
      const next = await stickerSplit.pick()
      if (!next) return
      if (!alive.current) { stickerSplit.disposeSource(next.uri); return }
      await stickerSplit.cleanup(jobIds.current); jobIds.current = []
      if (!alive.current) { stickerSplit.disposeSource(next.uri); return }
      if (sourceRef.current) stickerSplit.disposeSource(sourceRef.current.uri)
      sourceRef.current = next; setSource(next); setParts([]); setSelected([]); setCrop(FULL_CROP); setBackground(null); setMode('crop'); setDirty(false); setAdjusting(false); setView({ zoom: 1, x: 0, y: 0 })
    } catch (failure) { if (alive.current) setError(/이미지|GIF|선택/.test(failure.message) ? failure.message : splitError(failure)) }
    finally { busy.current = false; if (alive.current) setPhase('idle') }
  }
  async function run(kind = 'replace', targetCrop = crop) {
    if (busy.current || !source) return
    busy.current = true; setPhase('analyzing'); setError('')
    if (kind === 'replace') setDirty(true)
    try {
      const job = stickerSplit.analyze(source.uri, { crop: targetCrop, autoBackground: !background, backgroundX: background?.x, backgroundY: background?.y, tolerance })
      jobIds.current.push(job.id); operation.current = job.id
      const result = await job.promise
      if (!alive.current || closing.current) return
      if (!result.parts.length) { setError('분리한 그림이 없어요. 배경이나 허용 범위를 바꿔 주세요.'); return }
      if (kind === 'add' && parts.length + result.parts.length > 4096) { setError(splitError(new Error('TOO_MANY_PARTS'))); await stickerSplit.cleanup([job.id]); return }
      setParts(prev => kind === 'add' ? [...prev, ...result.parts] : result.parts)
      setSelected(prev => kind === 'add' ? [...prev, ...result.parts.map(p => p.id)] : result.parts.map(p => p.id))
      if (kind === 'replace') setDirty(false)
      setMode('review')
    } catch (failure) { if (alive.current && !closing.current) setError(splitError(failure)) }
    finally { operation.current = null; busy.current = false; if (alive.current) setPhase('idle') }
  }
  function point(p) {
    if (working || !source) return
    if (mode === 'review') {
      const x = p.x * source.width, y = p.y * source.height
      const hit = parts.filter(part => x >= part.x && x < part.x + part.width && y >= part.y && y < part.y + part.height).sort((a, b) => a.area - b.area)[0]
      if (hit) setSelected(prev => prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id])
      return
    }
    if (mode === 'background') { setBackground(p); setDirty(parts.length > 0); return }
  }
  async function merge() {
    if (busy.current || selected.length < 2) return
    busy.current = true; setPhase('merging'); setError('')
    try {
      const job = stickerSplit.merge(parts.filter(p => selected.includes(p.id)))
      jobIds.current.push(job.id); operation.current = job.id
      const part = await job.promise
      if (!alive.current || closing.current) return
      setParts(prev => [...prev.filter(p => !selected.includes(p.id)), part]); setSelected([part.id])
    } catch (failure) { if (alive.current && !closing.current) setError(splitError(failure)) }
    finally { busy.current = false; operation.current = null; if (alive.current) setPhase('idle') }
  }
  async function save() {
    if (busy.current || dirty || !selected.length) return
    busy.current = true; setPhase('saving'); setError('')
    try {
      await saveSplitSelection({ parts: parts.filter(p => selected.includes(p.id)), name, folderId: folder?.id,
        importFiles: importMedia, publish: onSave, discard: discardGeneratedMedia })
      if (alive.current) onClose()
    } catch (failure) {
      if (__DEV__) console.warn('스티커 분리 결과 저장 실패', failure.code, failure.cause ?? failure)
      const detail = __DEV__ && failure.cause?.message ? `\n상세: ${failure.cause.message}` : ''
      if (alive.current) setError((failure.message || '저장하지 못했어요. 다시 시도해 주세요.') + detail)
    } finally { busy.current = false; if (alive.current) setPhase('idle') }
  }
  function close() {
    if (saving || phase === 'picking') return
    closing.current = true
    if (operation.current) stickerSplit.cancel(operation.current)
    onClose()
  }
  return <EditorModal visible animationType="slide" onRequestClose={close}>
    <View style={[s.screen, { paddingTop: Math.max(8, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={s.header}><Text style={s.title}>이미지에서 스티커 만들기</Text><Action label="닫기" disabled={saving || phase === 'picking'} onPress={close} /></View>
      <FlatList ref={list} data={smallOnly ? parts.filter(p => p.area <= 64) : parts} numColumns={4} keyExtractor={p => p.id} initialNumToRender={16} windowSize={5}
        contentContainerStyle={s.content} columnWrapperStyle={s.row} scrollEnabled={!interacting}
        ListHeaderComponent={<>
          <PenSafeTextInput value={name} editable={!folder && !working} onChangeText={setName} maxLength={12} placeholder="폴더 이름" accessibilityLabel="스티커 폴더 이름" style={s.input} />
          <Text style={s.hint}>단색 배경의 스티커 시트를 기기에서만 처리해요. 작은 별·점도 모두 후보로 남겨요.</Text>
          <Action label={source ? '다른 이미지 선택' : '이미지 선택'} disabled={working} onPress={chooseImage} />
          {source && <>
            <StickerSplitPreview source={source} parts={parts} selected={selected} crop={crop} background={background} mode={mode} working={working}
              view={view} onView={setView} onInteraction={setInteracting} onPoint={point}
              onCrop={rect => { if (mode === 'add') run('add', rect); else { setCrop(rect); setDirty(parts.length > 0) } }} />
            <Text style={s.hint}>{mode === 'review' ? '경계 상자나 아래 후보를 눌러 선택·제외해요.' : mode === 'background' ? '종이 바깥 여백을 눌러 배경을 보정해요.' : mode === 'pan' ? '한 손가락으로 이미지를 이동해요.' : '드래그해서 사용할 영역을 지정해요.'} 두 손가락으로 확대·축소하고 이동할 수 있어요.</Text>
            <View style={s.row}>
              {!!parts.length && <Action label="분리 영역 확인" disabled={working} active={mode === 'review'} onPress={() => setMode('review')} />}
              <Action label="사용 영역 자르기" disabled={working} active={mode === 'crop'} onPress={() => setMode('crop')} />
              <Action label="이미지 이동" disabled={working} active={mode === 'pan'} onPress={() => setMode('pan')} />
              <Action label="축소" disabled={working || view.zoom <= 1} onPress={() => setView(v => ({ ...v, zoom: Math.max(1, v.zoom / 1.25), x: v.x / 1.25, y: v.y / 1.25 }))} />
              <Action label="확대" disabled={working || view.zoom >= 6} onPress={() => setView(v => ({ ...v, zoom: Math.min(6, v.zoom * 1.25), x: v.x * Math.min(1.25, 6 / v.zoom), y: v.y * Math.min(1.25, 6 / v.zoom) }))} />
              <Action label="화면 맞춤" disabled={working} onPress={() => setView({ zoom: 1, x: 0, y: 0 })} />
              <Action label="전체 영역" disabled={working} onPress={() => { setCrop(FULL_CROP); setDirty(parts.length > 0) }} />
            </View>
            <Action label="분리 결과 조정" active={adjusting} disabled={working} onPress={() => { setAdjusting(v => !v); if (mode === 'background') setMode(parts.length ? 'review' : 'crop') }} />
            {adjusting && <View>
              <Text style={s.hint}>기본은 선택 영역 가장자리의 색으로 배경을 자동 추정해요. 결과가 이상할 때만 보정해 주세요.</Text>
              <View style={s.row}>
                <Action label="배경 자동 추정" active={!background} disabled={working} onPress={() => { setBackground(null); setDirty(parts.length > 0); setMode(parts.length ? 'review' : 'crop') }} />
                <Action label="배경 직접 지정" active={mode === 'background'} disabled={working} onPress={() => setMode('background')} />
              </View>
              <View style={s.row}><Text style={s.hint}>배경 허용 범위 {tolerance}</Text><Action label="줄이기" disabled={working || tolerance <= 5} onPress={() => { setTolerance(tolerance - 5); setDirty(parts.length > 0) }} /><Action label="늘리기" disabled={working || tolerance >= 150} onPress={() => { setTolerance(tolerance + 5); setDirty(parts.length > 0) }} /></View>
            </View>}
            {dirty && <Text style={s.hint}>설정이 바뀌었어요. ‘다시 분리하기’를 눌러 새 결과를 확인해 주세요.</Text>}
            <Action label={parts.length ? '다시 분리하기' : '자동 분리하기'} disabled={working} onPress={() => run()} />
          </>}
          {!!parts.length && <>
            <Text style={s.title}>{parts.length}개 후보 · {selected.length}개 선택</Text>
            <Text style={s.hint}>눌러 선택·제외하고, 길게 눌러 확대해요. 작은 점과 먼지도 함께 확인해 주세요. 흰 내부는 보존되며 내부 빈 구멍은 남을 수 있어요.</Text>
            <View style={s.row}>
              <Action label="모두 선택" disabled={working} onPress={() => setSelected(parts.map(p => p.id))} />
              <Action label="모두 제외" disabled={working} onPress={() => setSelected([])} />
              <Action label="선택 합치기" disabled={working || dirty || selected.length < 2} onPress={merge} />
              <Action label="영역 직접 추가" disabled={working || dirty} active={mode === 'add'} onPress={() => { setMode('add'); list.current?.scrollToOffset({ offset: 0, animated: true }) }} />
              <Action label={smallOnly ? '전체 후보 보기' : '작은 장식만 보기'} disabled={working} active={smallOnly} onPress={() => setSmallOnly(!smallOnly)} />
            </View>
            <Text style={s.hint}>붙은 그림을 나누려면 원래 후보를 제외한 뒤, 각 부분을 ‘영역 직접 추가’로 지정해요. 필터를 바꿔도 선택은 유지돼요.</Text>
          </>}
        </>}
        renderItem={({ item }) => <Pressable disabled={working} accessibilityRole="checkbox" accessibilityLabel={`스티커 후보 ${item.width}×${item.height}, ${item.area}픽셀`} accessibilityState={{ checked: selected.includes(item.id), disabled: working }}
          onPress={() => setSelected(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} onLongPress={() => setZoomed(item)}
          style={[s.part, selected.includes(item.id) && s.active]}><Checker /><Image source={{ uri: item.uri }} resizeMode="contain" style={s.partImage} /><Text style={s.hint}>{selected.includes(item.id) ? '✓ ' : ''}{item.width}×{item.height}</Text></Pressable>} />
      <View style={s.footer}>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {working && <View style={s.row}><ActivityIndicator color={colors.primary} /><Text style={s.hint}>{saving ? '기기에 저장하고 있어요…' : phase === 'picking' ? '이미지를 준비하고 있어요…' : '기기에서 분리하고 있어요…'}</Text>{operation.current && <Action label="작업 취소" onPress={() => stickerSplit.cancel(operation.current)} />}</View>}
        <Action label={`선택한 스티커 ${selected.length}개를 폴더에 저장`} active disabled={working || dirty || !selected.length || !name.trim()} onPress={save} />
      </View>
      {zoomed && <View style={s.zoomOverlay}><View style={s.zoom}><Checker /><Text style={s.title}>선택 후보 확대</Text><Image source={{ uri: zoomed.uri }} resizeMode="contain" style={s.zoomImage} /><Action label="확대 닫기" onPress={() => setZoomed(null)} /></View></View>}
    </View>
  </EditorModal>
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', flexShrink: 1, marginVertical: 8 },
  content: { padding: 16, gap: 8 }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginVertical: 6 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: '700' }, active: { backgroundColor: colors.primarySoft, borderColor: colors.primary }, disabled: { opacity: DISABLED_OPACITY },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, padding: 12, minHeight: 44 },
  image: { height: 280, backgroundColor: colors.surfaceMuted, marginTop: 8 },
  part: { flex: 1, maxWidth: '25%', minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 4, backgroundColor: colors.surfaceMuted },
  partImage: { width: '100%', height: 76 }, footer: { paddingHorizontal: 16, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 },
  error: { color: colors.danger, fontSize: 13, marginVertical: 6 }, zoomOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, justifyContent: 'center', padding: 24 }, zoom: { backgroundColor: colors.surface, padding: 12, borderRadius: radius.lg, overflow: 'hidden' }, zoomImage: { height: 280, width: '100%' },
})
