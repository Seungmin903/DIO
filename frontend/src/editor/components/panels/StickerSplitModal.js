import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import EditorModal from '../controls/EditorModal'
import StickerSplitPreview from './StickerSplitPreview'
import StickerSplitSlider from './StickerSplitSlider'
import StickerSplitTools, { SplitAction as Action, SplitIconAction as IconAction } from './StickerSplitTools'
import StickerGroupThumbnail from './StickerGroupThumbnail'
import useStickerSplitEditing from '../../hooks/useStickerSplitEditing'
import { brushSelection, materializeGroups, excludeStickerGroup } from '../../utils/stickerSplitGroups.js'
import PenSafeTextInput from '../controls/PenSafeTextInput'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'
import { stickerSplit } from '../../services/stickerSplit'
import { FULL_CROP, splitError } from '../../utils/stickerSplit.js'
import { discardGeneratedMedia, importMedia } from '../../services/mediaStore'
import { saveSplitSelection, splitSaveError } from '../../utils/stickerSplitSave.js'
import { initialStickerGrouping } from '../../utils/stickerInitialGrouping.js'

export default function StickerSplitModal({ folder, initialName = '', onSave, onClose }) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const columns = Math.max(2, Math.min(6, Math.floor((width - insets.left - insets.right - 32) / 100)))
  const list = useRef(null)
  const longPressGroup = useRef(null)
  const [name, setName] = useState(folder?.name ?? initialName)
  const [source, setSource] = useState(null)
  const previewHeight = Math.max(140, Math.min(width < 600 ? 380 : 480, height * 0.42, height - insets.top - insets.bottom - 220,
    source ? (width - insets.left - insets.right - 32) * source.height / source.width : height * 0.42))
  const [crop, setCrop] = useState(FULL_CROP)
  const [cropDefined, setCropDefined] = useState(true)
  const [addCrop, setAddCrop] = useState(null)
  const [sourceReady, setSourceReady] = useState(false)
  const [background, setBackground] = useState(null)
  const [tolerance, setTolerance] = useState(35)
  const [toleranceDraft, setToleranceDraft] = useState(null)
  const [mode, setMode] = useState('crop')
  const [section, setSection] = useState('region')
  const [more, setMore] = useState(false)
  const [manualMerge, setManualMerge] = useState(false)
  const [mergeTargets, setMergeTargets] = useState([])
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [interacting, setInteracting] = useState(false)
  const [parts, setParts] = useState([])
  const alive = useRef(true), operation = useRef(null), jobIds = useRef([]), sourceRef = useRef(null), closing = useRef(false), busy = useRef(false)
  const runCancelled = useRef(false)
  const editing = useStickerSplitEditing(parts, source, crop, jobIds)
  const { selected, setSelected } = editing
  const groups = editing.groups
  const [brushSize, setBrushSize] = useState(24)
  const [brushDraftSize, setBrushDraftSize] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [zoomed, setZoomed] = useState(null)
  const [smallOnly, setSmallOnly] = useState(false)
  const [dirty, setDirty] = useState(false)
  const working = phase !== 'idle', saving = phase === 'saving' || phase === 'composing'
  useEffect(() => () => {
    alive.current = false
    if (operation.current) stickerSplit.cancel(operation.current)
    stickerSplit.cleanup(jobIds.current).finally(() => {
      if (sourceRef.current) stickerSplit.disposeSource(sourceRef.current)
    })
  }, [])
  async function chooseImage() {
    if (busy.current) return
    busy.current = true; setPhase('picking'); setError('')
    try {
      const next = await stickerSplit.pick()
      if (!next) return
      if (!alive.current) { stickerSplit.disposeSource(next); return }
      for (const id of jobIds.current) stickerSplit.cancel(id)
      await stickerSplit.cleanup(jobIds.current); jobIds.current = []
      if (!alive.current) { stickerSplit.disposeSource(next); return }
      if (sourceRef.current) stickerSplit.disposeSource(sourceRef.current)
      sourceRef.current = next; setSourceReady(false); setSource(next); setParts([]); editing.reset(); setCrop(FULL_CROP); setCropDefined(true); setAddCrop(null); setBackground(null); setToleranceDraft(null); setMode('crop'); setDirty(false); setSection('region'); setManualMerge(false); setMergeTargets([]); setMore(false); setSmallOnly(false); setZoomed(null); setView({ zoom: 1, x: 0, y: 0 })
    } catch (failure) { if (alive.current) setError(/이미지|GIF|선택/.test(failure.message) ? failure.message : splitError(failure)) }
    finally { busy.current = false; if (alive.current) setPhase('idle') }
  }
  async function run(kind = 'replace', targetCrop = crop) {
    if (busy.current || !source || !sourceReady) return
    busy.current = true; setPhase('analyzing'); setError('')
    runCancelled.current = false
    if (kind === 'replace') setDirty(true)
    try {
      const job = stickerSplit.analyze(source.uri, { crop: targetCrop, autoBackground: !background, backgroundX: background?.x, backgroundY: background?.y, tolerance })
      jobIds.current.push(job.id); operation.current = job.id
      const result = await job.promise
      if (!alive.current || closing.current) return
      if (!result.parts.length) { setError(stickerSplit.completeRegions ? '영역 안에서 분리할 그림이 없어요. 가로·세로 모두 3px 이상인 그림이 들어오도록 영역을 조정하거나 배경 설정을 확인해 주세요.' : '분리한 그림이 없어요. 배경이나 허용 범위를 바꿔 주세요.'); return }
      if (kind === 'add' && parts.length + result.parts.length > 4096) { setError(splitError(new Error('TOO_MANY_PARTS'))); await stickerSplit.cleanup([job.id]); return }
      let initial = null
      const checkRun = () => { if (!alive.current || closing.current || runCancelled.current) throw new Error('CANCELLED') }
      checkRun()
      if (kind === 'replace' && !parts.length && editing.enabled) {
        setPhase('grouping')
        initial = await initialStickerGrouping(result.parts, Math.min(source.width * targetCrop.width, source.height * targetCrop.height), async pixels => {
          checkRun()
          const query = stickerSplit.groupEdges(result.parts, pixels)
          operation.current = query.id; jobIds.current.push(query.id)
          try { return await query.promise } finally { await stickerSplit.cleanup([query.id]) }
        }, checkRun)
      }
      checkRun()
      setParts(prev => kind === 'add' ? [...prev, ...result.parts] : result.parts)
      if (kind === 'add') setSelected(prev => [...prev, ...result.parts.map(p => p.id)])
      else editing.reset(result.parts.map(p => p.id), initial ? { ...initial, parts: result.parts } : { distance: editing.distance })
      if (kind === 'replace') setDirty(false)
      setAddCrop(null)
      setMode('review')
      setSection(null); setManualMerge(false); setMergeTargets([]); setMore(false); setZoomed(null)
    } catch (failure) { if (alive.current && !closing.current) setError(splitError(failure)) }
    finally { operation.current = null; busy.current = false; if (alive.current) setPhase('idle') }
  }
  function point(p) {
    if (working || !source || !editing.ready || manualMerge) return
    if (mode === 'review') {
      if (dirty) return
      const x = p.x * source.width, y = p.y * source.height
      const hit = parts.filter(part => x >= part.x && x < part.x + part.width && y >= part.y && y < part.y + part.height).sort((a, b) => a.area - b.area)[0]
      if (hit) setSelected(prev => prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id])
      return
    }
    if (mode === 'background') { setBackground(p); setDirty(parts.length > 0); return }
  }
  function merge() {
    const targets = groups.filter(group => mergeTargets.includes(group.id))
    if (busy.current || !editing.ready || dirty || (manualMerge === 'split' ? !targets.length || targets.some(group => group.members.length < 2) : targets.length < 2)) return
    const mergingIds = targets.flatMap(group => group.members.map(part => part.id))
    if (manualMerge === 'split') editing.splitSelected(mergingIds)
    else editing.mergeSelected(mergingIds)
    setManualMerge(false); setMergeTargets([]); setSection(null); setMode('review')
  }
  async function brush(path, brushRadius, add) {
    if (busy.current || dirty || !editing.enabled || !editing.ready || manualMerge) return
    busy.current = true; setPhase('brushing'); setError('')
    try {
      const job = stickerSplit.brushHits(parts, path, brushRadius)
      operation.current = job.id; jobIds.current.push(job.id)
      const hits = await job.promise
      if (alive.current && !closing.current) setSelected(previous => brushSelection(previous, hits, add))
    } catch (failure) { if (alive.current && !closing.current) setError(splitError(failure)) }
    finally { operation.current = null; busy.current = false; if (alive.current) setPhase('idle') }
  }
  function requestRun() {
    if (parts.length && editing.enabled) Alert.alert('분리 결과를 새로 만들까요?', '다시 분리하면 선택·묶음과 실행 취소 기록이 초기화돼요.', [
      { text: '취소', style: 'cancel' }, { text: '다시 분리하기', onPress: () => run() },
    ])
    else return run()
  }
  const saveCount = groups.length
  async function save() {
    if (busy.current || dirty || !selected.length || !editing.ready || interacting || !sourceReady || manualMerge || (mode === 'add' && addCrop)) return
    busy.current = true; setPhase(editing.enabled ? 'composing' : 'saving'); setError('')
    const attemptIds = []
    try {
      const output = await materializeGroups(groups, members => stickerSplit.merge(members), job => { attemptIds.push(job.id); jobIds.current.push(job.id); operation.current = job.id })
      if (!alive.current || closing.current) return
      operation.current = null; setPhase('saving')
      await saveSplitSelection({ parts: output, name, folderId: folder?.id,
        importFiles: importMedia, publish: onSave, discard: discardGeneratedMedia })
      if (alive.current) onClose()
    } catch (failure) {
      // Failed attempts may have made large PNGs. Keep original candidates and
      // editing state for retry, but reclaim only this attempt's composites.
      await stickerSplit.cleanup(attemptIds)
      jobIds.current = jobIds.current.filter(id => !attemptIds.includes(id))
      if (__DEV__) console.warn('스티커 분리 결과 저장 실패', failure.code, failure.cause ?? failure)
      if (alive.current) setError(splitSaveError(failure))
    } finally { operation.current = null; busy.current = false; if (alive.current) setPhase('idle') }
  }
  function close() {
    if (saving || phase === 'picking') return
    runCancelled.current = true
    closing.current = true
    if (operation.current) stickerSplit.cancel(operation.current)
    onClose()
  }
  const locked = working || !editing.ready || dirty
  const visibleGroups = smallOnly ? groups.filter(group => group.width * group.height <= 64) : groups
  const adding = mode === 'add' && !!stickerSplit.completeRegions
  const mustAnalyze = !parts.length || dirty
  function changeSection(next) {
    setSection(next); setMore(false); setManualMerge(false); setMergeTargets([]); setAddCrop(null); setToleranceDraft(null)
    setMode(next === 'region' ? 'crop' : 'review')
  }
  function chooseGroup(group) {
    if (locked) return
    if (manualMerge === 'split' && group.members.length < 2) return
    if (manualMerge) setMergeTargets(previous => previous.includes(group.id) ? previous.filter(id => id !== group.id) : [...previous, group.id])
    else setSelected(previous => excludeStickerGroup(previous, group))
  }
  function menuSelect(all) {
    if (locked || manualMerge) return
    setSelected(all ? parts.map(part => part.id) : []); setMore(false)
  }
  const primaryLabel = working ? (saving ? '저장 중' : phase === 'analyzing' ? '분리 중' : phase === 'grouping' ? '초기 묶음 계산 중' : phase === 'picking' ? '이미지 준비 중' : '처리 중')
    : manualMerge ? (manualMerge === 'split' ? '선택한 묶음 분리' : '선택한 항목 묶기') : adding ? '이 영역 추가' : mustAnalyze ? (parts.length ? '다시 분리하기' : '분리하기') : `${saveCount}개 저장`
  const primaryDisabled = working || !sourceReady || interacting ||
    (manualMerge ? locked || mergeTargets.length < (manualMerge === 'split' ? 1 : 2) : adding ? !addCrop : mustAnalyze ? false : !editing.ready || !selected.length || !name.trim())
  const primaryAction = () => manualMerge ? merge() : adding ? run('add', addCrop) : mustAnalyze ? requestRun() : save()
  const tileWidth = (width - insets.left - insets.right - 32 - (columns - 1) * 8) / columns
  return <EditorModal visible animationType="slide" onRequestClose={() => zoomed ? setZoomed(null) : close()}>
    <View style={[s.screen, { paddingTop: Math.max(8, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>스티커 만들기</Text>
        <IconAction label="실행 취소" icon="undo" disabled={locked || manualMerge || !editing.canUndo} onPress={editing.undo} />
        <IconAction label="다시 실행" icon="redo" disabled={locked || manualMerge || !editing.canRedo} onPress={editing.redo} />
        <IconAction label="닫기" icon="close" disabled={saving || phase === 'picking'} onPress={close} />
      </View>
      <FlatList key={`columns-${columns}`} ref={list} style={s.list} data={visibleGroups} numColumns={columns} keyExtractor={group => group.id}
        extraData={{ manualMerge, mergeTargets, locked }} initialNumToRender={12} windowSize={5} keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content} columnWrapperStyle={s.cardRow} scrollEnabled={!interacting}
        ListHeaderComponent={<>
          {!source ? <View style={s.empty}><Action label="이미지 선택" primary disabled={working} onPress={chooseImage} /></View> : <>
            <View style={s.imageHeader}><Action label="이미지 바꾸기" disabled={working} onPress={chooseImage} /></View>
            <View style={s.preview}>
              <StickerSplitPreview key={source.uri} source={source} parts={parts} selected={selected} groups={groups}
                crop={adding ? addCrop ?? FULL_CROP : crop} background={background} mode={mode} working={working || !editing.ready || manualMerge}
                height={previewHeight} adjustableCrop={!!stickerSplit.completeRegions} cropDefined={adding ? !!addCrop : cropDefined}
                onReady={(uri, ready) => { if (alive.current && sourceRef.current?.uri === uri) setSourceReady(ready) }}
                brushSize={brushDraftSize ?? brushSize} onBrush={brush} view={view} onView={setView} onInteraction={setInteracting} onPoint={point}
                onCrop={rect => { if (mode === 'add') { if (stickerSplit.completeRegions) setAddCrop(rect); else run('add', rect) } else { setCrop(rect); setCropDefined(true); setDirty(parts.length > 0) } }} />
              <View style={s.previewActions}>
                <IconAction label="이미지 이동" icon="hand" active={mode === 'pan'} disabled={working || !sourceReady || manualMerge} onPress={() => setMode(current => current === 'pan' ? (section === 'region' ? 'crop' : 'review') : 'pan')} />
                <IconAction label="화면 맞춤" icon="fit" disabled={working || !sourceReady} onPress={() => setView({ zoom: 1, x: 0, y: 0 })} />
              </View>
            </View>
            <StickerSplitTools section={section} onChange={changeSection} disabled={working || !sourceReady} hasResults={!!parts.length}>
              {section === 'region' && <View style={s.row}>
                <Action label="영역 조정" active={mode === 'crop'} disabled={working} onPress={() => { setAddCrop(null); setMode('crop') }} />
              </View>}
              {section === 'selection' && <>
                <View style={s.row}>
                  <Action label="개별 선택" active={mode === 'review'} disabled={locked} onPress={() => setMode('review')} />
                  {editing.enabled && <>
                    <Action label="추가 브러시" active={mode === 'brush-add'} disabled={locked} onPress={() => setMode('brush-add')} />
                    <Action label="제외 브러시" active={mode === 'brush-remove'} disabled={locked} onPress={() => setMode('brush-remove')} />
                  </>}
                </View>
                {mode.startsWith('brush-') && <>
                  <Text style={s.body}>브러시 굵기 {Math.round(brushDraftSize ?? brushSize)}</Text>
                  <StickerSplitSlider label="선택 브러시 굵기" min={8} max={80} step={1} value={brushDraftSize ?? brushSize} disabled={locked}
                    onPreview={setBrushDraftSize} onCommit={value => { setBrushSize(value); setBrushDraftSize(null) }} onCancel={() => setBrushDraftSize(null)} onInteraction={setInteracting} />
                </>}
              </>}
              {section === 'grouping' && <>
                {manualMerge ? <View style={s.row}><Text style={s.body}>{manualMerge === 'split' ? '분리할 묶음' : '묶을 스티커'} {mergeTargets.length}개 선택</Text><Action label={manualMerge === 'split' ? '분리 취소' : '묶기 취소'} disabled={working} onPress={() => { setManualMerge(false); setMergeTargets([]) }} /></View> : <>
                  {editing.enabled && <>
                    <Text style={s.body}>가까운 객체 묶기 · {editing.distance === 0 ? '묶지 않음' : `${editing.distance.toFixed(1)}%`}</Text>
                    <StickerSplitSlider label="가까운 객체 묶기" min={0} max={5} step={0.1} value={editing.distance} disabled={working || dirty}
                      onPreview={editing.previewDistance} onCommit={editing.setDistance} onCancel={editing.cancelDistance} onInteraction={setInteracting} />
                  </>}
                  <Action label="직접 묶기" disabled={locked || groups.length < 2} onPress={() => { setManualMerge('merge'); setMergeTargets([]); setSmallOnly(false); setMode('review') }} />
                  <Action label="직접 분리" disabled={locked || !groups.some(group => group.members.length > 1)} onPress={() => { setManualMerge('split'); setMergeTargets([]); setSmallOnly(false); setMode('review') }} />
                </>}
              </>}
              {section === 'background' && <>
                <View style={s.row}>
                  <Action label="자동 배경" active={!background && mode !== 'background'} disabled={working} onPress={() => { setBackground(null); setDirty(parts.length > 0); setMode('review') }} />
                  <Action label="배경 직접 지정" active={mode === 'background' || !!background} disabled={working} onPress={() => setMode('background')} />
                </View>
                <Text style={s.body}>배경 허용 범위 {toleranceDraft ?? tolerance}</Text>
                <StickerSplitSlider label="배경 허용 범위" min={5} max={150} step={5} value={toleranceDraft ?? tolerance} disabled={working}
                  onPreview={setToleranceDraft} onCommit={value => { setTolerance(value); setToleranceDraft(null); setDirty(parts.length > 0) }}
                  onCancel={() => setToleranceDraft(null)} onInteraction={setInteracting} />
              </>}
            </StickerSplitTools>
          </>}
          {!!parts.length && <>
            <View style={s.resultHeader}>
              <Text accessibilityRole="header" style={s.sectionTitle}>{manualMerge ? (manualMerge === 'split' ? '분리할 묶음 선택' : '묶을 스티커 선택') : `${saveCount}개 스티커`}</Text>
              <IconAction label="목록 더보기" icon="more" active={more} disabled={locked || manualMerge} onPress={() => setMore(value => !value)} />
            </View>
            {more && <View style={s.menu}>
              <Action label="모두 선택" disabled={locked || manualMerge} onPress={() => menuSelect(true)} />
              <Action label="모두 제외" disabled={locked || manualMerge} onPress={() => menuSelect(false)} />
              <Action label={smallOnly ? '전체 스티커 보기' : '작은 스티커만 보기'} active={smallOnly} disabled={locked || manualMerge} onPress={() => { setSmallOnly(value => !value); setMore(false) }} />
            </View>}
            {!visibleGroups.length && <Text style={s.emptyText}>{editing.pending ? '묶음 계산 중' : smallOnly ? '작은 스티커 없음' : '선택된 스티커 없음'}</Text>}
          </>}
        </>}
        renderItem={({ item }) => <Pressable disabled={locked || (manualMerge === 'split' && item.members.length < 2)} accessibilityRole="checkbox"
          accessibilityLabel={manualMerge ? `스티커 ${item.number} ${manualMerge === 'split' ? '분리' : '묶기'} 대상으로 선택` : `스티커 ${item.number} 제외`}
          accessibilityState={{ checked: manualMerge ? mergeTargets.includes(item.id) : true, disabled: locked || (manualMerge === 'split' && item.members.length < 2) }}
          aria-checked={manualMerge ? mergeTargets.includes(item.id) : true} aria-disabled={locked || (manualMerge === 'split' && item.members.length < 2)}
          onPressIn={() => { longPressGroup.current = null }}
          onPress={() => { if (longPressGroup.current === item.id) { longPressGroup.current = null; return }; chooseGroup(item) }}
          onLongPress={() => { longPressGroup.current = item.id; setZoomed(item) }}
          style={[s.card, { maxWidth: tileWidth }, (!manualMerge || mergeTargets.includes(item.id)) && s.cardSelected, (locked || (manualMerge === 'split' && item.members.length < 2)) && s.disabled]}>
          <StickerGroupThumbnail group={item} style={s.thumbnail} />
          <View pointerEvents="none" style={s.number}><Text style={s.badgeText}>{item.number}</Text></View>
          <View pointerEvents="none" style={[s.check, (!manualMerge || mergeTargets.includes(item.id)) && s.checked]}><Text style={[s.badgeText, (!manualMerge || mergeTargets.includes(item.id)) && s.checkedText]}>{!manualMerge || mergeTargets.includes(item.id) ? '✓' : ''}</Text></View>
        </Pressable>} />
      {(!!source || !!error) && <View style={s.footer}>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!editing.error && <View><Text accessibilityRole="alert" style={s.error}>{editing.error}</Text><Action label="묶음 계산 다시 시도" disabled={working || dirty} onPress={editing.retry} /></View>}
        {(working || editing.pending) && <View accessibilityLiveRegion="polite" style={s.row}><ActivityIndicator color={colors.primary} /><Text style={s.body}>{working ? primaryLabel : '묶음 계산 중'}</Text>{operation.current && phase !== 'saving' && <Action label="작업 취소" onPress={() => { runCancelled.current = true; stickerSplit.cancel(operation.current) }} />}</View>}
        {!!parts.length && !mustAnalyze && !manualMerge && !adding && (folder ? <Text style={s.body}>{folder.name}</Text> : <PenSafeTextInput value={name} editable={!working} onChangeText={setName} maxLength={12} placeholder="폴더 이름" placeholderTextColor={colors.text} accessibilityLabel="스티커 폴더 이름" style={s.input} />)}
        {!!source && <Action label={primaryLabel} primary disabled={primaryDisabled} onPress={primaryAction} />}
      </View>}
      {zoomed && <View accessibilityViewIsModal style={s.zoomOverlay}><View style={s.zoom}>
        <View style={s.zoomHeader}><Text style={s.sectionTitle}>스티커 {zoomed.number}</Text><IconAction label="확대 닫기" icon="close" onPress={() => setZoomed(null)} /></View>
        <StickerGroupThumbnail group={zoomed} style={{ width: '100%', height: Math.max(120, Math.min(520, height - insets.top - insets.bottom - 140)) }} />
      </View></View>}
    </View>
  </EditorModal>
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, list: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 8 },
  title: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, fontWeight: '800' },
  content: { padding: 16, gap: 10 }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  imageHeader: { alignItems: 'flex-end', marginBottom: 8 }, preview: { position: 'relative', overflow: 'hidden', borderRadius: radius.md },
  previewActions: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  empty: { minHeight: 200, justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 24 },
  body: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 21, flexShrink: 1 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  resultHeader: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menu: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8, gap: 8 },
  emptyText: { color: colors.text, fontSize: 14, fontWeight: '600', paddingVertical: 24, textAlign: 'center' },
  cardRow: { gap: 8 }, card: { flex: 1, minWidth: 0, aspectRatio: 1, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 }, thumbnail: { width: '100%', height: '100%' },
  number: { position: 'absolute', top: 4, left: 4, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.surface },
  check: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.surface },
  checked: { backgroundColor: colors.primary }, badgeText: { fontSize: 14, fontWeight: '800', color: colors.text }, checkedText: { color: colors.surface },
  disabled: { opacity: DISABLED_OPACITY },
  footer: { flexShrink: 0, paddingHorizontal: 16, paddingTop: 12, gap: 8, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: 14, padding: 12, minHeight: 44 },
  error: { color: colors.danger, fontSize: 14, fontWeight: '600', lineHeight: 21 },
  zoomOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, justifyContent: 'center', padding: 20 },
  zoom: { backgroundColor: colors.surface, padding: 12, borderRadius: radius.lg, overflow: 'hidden' }, zoomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
})
