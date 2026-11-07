import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import EditorModal from '../controls/EditorModal'
import ConfirmDialog from '../controls/ConfirmDialog'
import Icon from '../controls/Icon'
import StickerSplitPreview from './StickerSplitPreview'
import StickerSplitSlider from './StickerSplitSlider'
import StickerSplitTools, { SplitAction as Action, SplitIconAction as IconAction, SplitChoiceGroup as ChoiceGroup, SplitSettingTitle as SettingTitle } from './StickerSplitTools'
import StickerGroupThumbnail from './StickerGroupThumbnail'
import useStickerSplitEditing from '../../hooks/useStickerSplitEditing'
import { brushSelection, materializeGroups, excludeStickerGroup, splitBrushTargets } from '../../utils/stickerSplitGroups.js'
import PenSafeTextInput from '../controls/PenSafeTextInput'
import { FOLDER_NAME_LIMIT } from '../../hooks/useCustomDecor'
import { MakerBar, MakerHeader } from '../../../shared/MakerKit'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'
import { stickerSplit } from '../../services/stickerSplit'
import { FULL_CROP, splitError } from '../../utils/stickerSplit.js'
import { discardGeneratedMedia, importMedia } from '../../services/mediaStore'
import { saveSplitSelection, splitSaveError } from '../../utils/stickerSplitSave.js'
import { initialStickerGrouping } from '../../utils/stickerInitialGrouping.js'

export default function StickerSplitModal({ folder, initialName = '', onSave, onClose }) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const wide = width - insets.left - insets.right >= 768 && height - insets.top - insets.bottom >= 500
  const [paneWidth, setPaneWidth] = useState(0)
  const contentWidth = paneWidth || (width - insets.left - insets.right) * (wide ? 0.5 : 1)
  const columns = Math.max(2, Math.min(6, Math.floor((contentWidth - 32) / 100)))
  const list = useRef(null)
  const listHeaderHeight = useRef(0)
  const headerSection = useRef(null)
  const pendingScroll = useRef(null)
  const longPressGroup = useRef(null)
  const initialPickerOpened = useRef(false)
  const [name, setName] = useState(folder?.name ?? initialName)
  const [source, setSource] = useState(null)
  const previewHeight = wide ? Math.max(180, height - insets.top - insets.bottom - 152)
    : Math.max(140, Math.min(380, height * 0.42, height - insets.top - insets.bottom - 220,
      source ? (width - insets.left - insets.right - 32) * source.height / source.width : height * 0.42))
  const [focusedPart, setFocusedPart] = useState(null)
  const [crop, setCrop] = useState(FULL_CROP)
  const [cropDefined, setCropDefined] = useState(true)
  const [addCrop, setAddCrop] = useState(null)
  const [sourceReady, setSourceReady] = useState(false)
  const [background, setBackground] = useState(null)
  const [tolerance, setTolerance] = useState(10)
  const [toleranceDraft, setToleranceDraft] = useState(null)
  const [mode, setMode] = useState('review')
  const [section, setSection] = useState('background')
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
  function openInitialPicker() {
    if (initialPickerOpened.current) return
    initialPickerOpened.current = true
    return chooseImage()
  }
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
      sourceRef.current = next; setSourceReady(false); setSource(next); setParts([]); editing.reset(); setCrop(FULL_CROP); setCropDefined(true); setAddCrop(null); setBackground(null); setToleranceDraft(null); setMode('review'); setDirty(false); setSection('background'); setManualMerge(false); setMergeTargets([]); setMore(false); setSmallOnly(false); setZoomed(null); setFocusedPart(null); setView({ zoom: 1, x: 0, y: 0 })
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
      setSection('results'); setFocusedPart(null); setManualMerge(false); setMergeTargets([]); setMore(false); setZoomed(null)
    } catch (failure) { if (alive.current && !closing.current) setError(splitError(failure)) }
    finally { operation.current = null; busy.current = false; if (alive.current) setPhase('idle') }
  }
  function point(p) {
    if (working || !source || !editing.ready) return
    if (mode === 'review' || mode === 'toggle') {
      if (dirty) return
      const x = p.x * source.width, y = p.y * source.height
      const hit = parts.filter(part => x >= part.x && x < part.x + part.width && y >= part.y && y < part.y + part.height).sort((a, b) => a.area - b.area)[0]
      if (hit) {
        if (mode === 'toggle') setSelected(prev => prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id])
        else {
          const group = groups.find(group => group.members.some(part => part.id === hit.id))
          if (group) chooseGroup(group, true)
          else { setFocusedPart(hit.id); setSection('selection') }
        }
      }
      return
    }
    if (mode === 'background') { setBackground(p); setDirty(parts.length > 0); return }
  }
  function merge() {
    const targets = groups.filter(group => mergeTargets.includes(group.id))
    if (busy.current || !editing.ready || dirty || targets.length < 2) return
    const mergingIds = targets.flatMap(group => group.members.map(part => part.id))
    editing.mergeSelected(mergingIds)
    setManualMerge(false); setMergeTargets([]); setSection('results'); setMode('review')
  }
  async function brush(path, brushRadius, action) {
    if (busy.current || dirty || !editing.enabled || !editing.ready || manualMerge) return
    busy.current = true; setPhase('brushing'); setError('')
    try {
      const job = stickerSplit.brushHits(parts, path, brushRadius)
      operation.current = job.id; jobIds.current.push(job.id)
      const hits = await job.promise
      if (alive.current && !closing.current) {
        if (action === 'split') editing.splitSelected(splitBrushTargets(groups, hits))
        else setSelected(previous => brushSelection(previous, hits, action))
      }
    } catch (failure) { if (alive.current && !closing.current) setError(splitError(failure)) }
    finally { operation.current = null; busy.current = false; if (alive.current) setPhase('idle') }
  }
  const [rerunAsk, setRerunAsk] = useState(false)
  function requestRun() {
    if (parts.length && editing.enabled) setRerunAsk(true)
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
    setMode('review')
  }
  function chooseGroup(group, reveal = false) {
    if (locked) return
    if (manualMerge) setMergeTargets(previous => previous.includes(group.id) ? previous.filter(id => id !== group.id) : [...previous, group.id])
    else {
      setFocusedPart(group.members[0].id)
      if (reveal) { setSmallOnly(false); setSection('results'); pendingScroll.current = group.id; if (section === 'results' && !smallOnly) revealPending() }
      else setView({ zoom: 1, x: 0, y: 0 })
    }
  }
  function menuSelect(all) {
    if (locked || manualMerge) return
    setSelected(all ? parts.map(part => part.id) : []); setMore(false)
  }
  const primaryLabel = working ? (saving ? '저장 중' : phase === 'analyzing' ? '분리 중' : phase === 'grouping' ? '초기 묶음 계산 중' : phase === 'picking' ? '이미지 준비 중' : '처리 중')
    : manualMerge ? '선택한 항목 묶기' : adding ? '이 영역 추가' : mustAnalyze ? (parts.length ? '다시 분리하기' : '분리하기') : `${saveCount}개 저장`
  const primaryDisabled = working || !sourceReady || interacting ||
    (manualMerge ? locked || mergeTargets.length < 2 : adding ? !addCrop : mustAnalyze ? false : !editing.ready || !selected.length || !name.trim())
  const primaryAction = () => manualMerge ? merge() : adding ? run('add', addCrop) : mustAnalyze ? requestRun() : save()
  const tileWidth = (contentWidth - 32 - (columns - 1) * 8) / columns
  const focusedGroup = groups.find(group => group.members.some(part => part.id === focusedPart))
  const excludedFocus = parts.find(part => part.id === focusedPart && !selected.includes(part.id))
  const summaries = {
    grouping: editing.distance === 0 ? '묶지 않음' : `${editing.distance.toFixed(1)}%`,
    selection: `${parts.length - selected.length}개 제외`,
    background: background ? '직접 지정' : '자동',
    results: `${saveCount}개`,
  }
  const toolLabel = manualMerge ? '묶을 스티커 선택'
    : ({ crop: '영역 조정', 'brush-add': '추가 브러시', 'brush-remove': '제외 브러시', 'brush-split': '직접 분리 브러시', toggle: '개별 포함·제외', pan: '이미지 이동', background: '배경 직접 지정' })[mode]
  function revealPending() {
    if (!pendingScroll.current || section !== 'results' || headerSection.current !== 'results' || !listHeaderHeight.current) return
    const index = visibleGroups.findIndex(group => group.id === pendingScroll.current)
    if (index < 0) return
    list.current?.scrollToOffset({ offset: listHeaderHeight.current + Math.floor(index / columns) * (tileWidth + 10), animated: false })
    pendingScroll.current = null
  }
  const preview = source && <View style={[s.previewPane, wide && s.previewPaneWide]}>
    <View style={s.imageHeader}>
      <Action label="이미지 바꾸기" disabled={working} onPress={chooseImage} />
    </View>
    <View style={s.preview}>
      <StickerSplitPreview key={source.uri} source={source} parts={parts} selected={selected} groups={groups}
        focusedGroupId={focusedGroup?.id} focusedPartId={excludedFocus?.id} targetGroupIds={mergeTargets}
        crop={crop} background={background} mode={mode} working={working || !editing.ready}
        height={previewHeight} adjustableCrop={!!stickerSplit.completeRegions} cropDefined={cropDefined}
        onReady={(uri, ready) => { if (alive.current && sourceRef.current?.uri === uri) setSourceReady(ready) }}
        brushSize={brushDraftSize ?? brushSize} onBrush={brush} view={view} onView={setView} onInteraction={setInteracting} onPoint={point}
        onCrop={rect => { setCrop(rect); setCropDefined(true); setDirty(parts.length > 0) }} />
      {!!toolLabel && <View pointerEvents="none" testID="sticker-active-tool" style={s.toolLabel}><Text style={s.body}>{toolLabel}</Text></View>}
      <View style={s.previewActions}>
        <Action label="영역 조정" onGray active={mode === 'crop'} disabled={working || !sourceReady || manualMerge}
          onPress={() => setMode(current => current === 'crop' ? 'review' : 'crop')} />
        <IconAction label="이미지 이동" icon="hand" onGray active={mode === 'pan'} disabled={working || !sourceReady || manualMerge}
          onPress={() => setMode(current => current === 'pan' ? 'review' : 'pan')} />
        <IconAction label="화면 맞춤" icon="fit" onGray disabled={working || !sourceReady} onPress={() => setView({ zoom: 1, x: 0, y: 0 })} />
      </View>
    </View>
  </View>
  const hasNotes = !!error || !!editing.error || working || editing.pending || (!!parts.length && !mustAnalyze && !manualMerge) || (dirty && !!parts.length)
  const footer = (!!source || !!error) && <View style={s.footer}>
    {hasNotes && <View style={s.footerNotes}>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!editing.error && <View><Text accessibilityRole="alert" style={s.error}>{editing.error}</Text><Action label="묶음 계산 다시 시도" disabled={working || dirty} onPress={editing.retry} /></View>}
    {(working || editing.pending) && <View accessibilityLiveRegion="polite" style={s.row}>
      <ActivityIndicator color={colors.primary} /><Text style={s.body}>{working ? primaryLabel : '묶음 계산 중'}</Text>
      {operation.current && phase !== 'saving' && <Action label="작업 취소" onPress={() => { runCancelled.current = true; stickerSplit.cancel(operation.current) }} />}
    </View>}
    {!!parts.length && !mustAnalyze && !manualMerge && (folder
      ? <Text style={s.body}>{folder.name}</Text>
      : <PenSafeTextInput value={name} editable={!working} onChangeText={setName} maxLength={FOLDER_NAME_LIMIT} placeholder="폴더 이름" placeholderTextColor={colors.text} accessibilityLabel="스티커 폴더 이름" style={s.input} />)}
    {dirty && !!parts.length && <Text accessibilityLiveRegion="polite" style={s.body}>영역·배경 변경됨 · 다시 분리 필요</Text>}
    </View>}
    {/* 하단 줄(MakerBar): 왼쪽 상태, 오른쪽 끝 주 버튼 하나 */}
    {!!source && <View testID="sticker-save-row">
      <MakerBar left={!!parts.length ? <Text accessibilityLiveRegion="polite" style={s.total}>총 {saveCount}개</Text> : null}>
        <Action label={primaryLabel} displayLabel={!working && !manualMerge && !mustAnalyze ? '저장' : primaryLabel} primary disabled={primaryDisabled} onPress={primaryAction} />
      </MakerBar>
    </View>}
  </View>
  return <EditorModal visible animationType="slide" onShow={openInitialPicker} onRequestClose={() => zoomed ? setZoomed(null) : close()}>
    <View style={[s.screen, { paddingTop: Math.max(8, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: insets.left, paddingRight: insets.right }]}>
      {/* 제작 화면 문법(디자인 가이드 5.8): 높이 64 상단 바, 왼쪽 `<` 가 이 흐름에서 나가기, 오른쪽엔 되돌리기 · 다시 실행만 */}
      <MakerHeader title="스티커 시트 분리" onBack={close} backLabel="닫기" busy={saving || phase === 'picking'}>
        <IconAction label="실행 취소" icon="undo" disabled={locked || manualMerge || !editing.canUndo} onPress={editing.undo} />
        <IconAction label="다시 실행" icon="redo" disabled={locked || manualMerge || !editing.canRedo} onPress={editing.redo} />
      </MakerHeader>
      <View style={[s.workspace, wide && s.workspaceWide]}>
        {wide && preview}
        <View style={[s.controlsPane, wide && !!source && s.controlsPaneWide]}
          onLayout={event => setPaneWidth(event.nativeEvent.layout.width)}>
          <FlatList key={`columns-${columns}`} ref={list} style={s.list} data={section === 'results' ? visibleGroups : []}
            numColumns={columns} keyExtractor={group => group.id}
            extraData={{ manualMerge, mergeTargets, locked, focusedPart }} initialNumToRender={12} windowSize={5}
            keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} columnWrapperStyle={s.cardRow}
            scrollEnabled={!interacting} onContentSizeChange={revealPending}
            ListHeaderComponent={<View onLayout={event => { headerSection.current = section; listHeaderHeight.current = event.nativeEvent.layout.height + 10; revealPending() }}>
              {!source ? <View style={s.empty}><Action label="이미지 선택" primary disabled={working} onPress={chooseImage} /></View> : <>
                {!wide && preview}
                <StickerSplitTools section={section} onChange={changeSection} disabled={working || !sourceReady}
                  hasResults={!!parts.length} summaries={summaries}>
              {section === 'selection' && <>
                <ChoiceGroup label="객체 포함·제외 도구">
                  <Action label="개별 포함·제외" displayLabel="개별" icon="cursor" choice active={mode === 'toggle'} disabled={locked} onPress={() => setMode('toggle')} />
                  {editing.enabled && <>
                    <Action label="추가 브러시" displayLabel="추가" icon="plus" choice active={mode === 'brush-add'} disabled={locked} onPress={() => setMode('brush-add')} />
                    <Action label="제외 브러시" displayLabel="제외" icon="minus" choice active={mode === 'brush-remove'} disabled={locked} onPress={() => setMode('brush-remove')} />
                  </>}
                </ChoiceGroup>
                {mode.startsWith('brush-') && <>
                  <SettingTitle title="브러시 굵기" value={Math.round(brushDraftSize ?? brushSize)} />
                  <StickerSplitSlider label="선택 브러시 굵기" min={8} max={80} step={1} value={brushDraftSize ?? brushSize} disabled={locked}
                    onPreview={setBrushDraftSize} onCommit={value => { setBrushSize(value); setBrushDraftSize(null) }} onCancel={() => setBrushDraftSize(null)} onInteraction={setInteracting} />
                </>}
              </>}
              {section === 'grouping' && <>
                {manualMerge ? <View style={s.row}><Text style={s.body}>묶을 스티커 {mergeTargets.length}개 선택</Text><Action label="묶기 취소" disabled={working} onPress={() => { setManualMerge(false); setMergeTargets([]) }} /></View> : <>
                  {editing.enabled && <>
                    <SettingTitle title="가까운 객체 묶기" value={editing.distance === 0 ? '묶지 않음' : `${editing.distance.toFixed(1)}%`} />
                    <StickerSplitSlider label="가까운 객체 묶기" min={0} max={5} step={0.1} value={editing.distance} disabled={working || dirty}
                      onPreview={editing.previewDistance} onCommit={editing.setDistance} onCancel={editing.cancelDistance} onInteraction={setInteracting} />
                  </>}
                  <ChoiceGroup label="직접 묶기·분리 도구">
                  <Action label="직접 묶기" icon="link" choice disabled={locked || groups.length < 2} onPress={() => { setManualMerge(true); setMergeTargets([]); setSmallOnly(false); setSection('results'); setMode('review') }} />
                  <Action label="직접 분리" icon="scissors" choice active={mode === 'brush-split'} disabled={locked || !editing.enabled || (mode !== 'brush-split' && !groups.some(group => group.members.length > 1))}
                    onPress={() => { setManualMerge(false); setMergeTargets([]); setMode(current => current === 'brush-split' ? 'review' : 'brush-split') }} />
                  </ChoiceGroup>
                  {mode === 'brush-split' && <>
                    <SettingTitle title="분리 브러시 굵기" value={Math.round(brushDraftSize ?? brushSize)} />
                    <StickerSplitSlider label="분리 브러시 굵기" min={8} max={80} step={1} value={brushDraftSize ?? brushSize} disabled={locked}
                      onPreview={setBrushDraftSize} onCommit={value => { setBrushSize(value); setBrushDraftSize(null) }} onCancel={() => setBrushDraftSize(null)} onInteraction={setInteracting} />
                  </>}
                </>}
              </>}
              {section === 'background' && <>
                <ChoiceGroup label="배경 지정 도구">
                  <Action label="자동 배경" displayLabel="자동" icon="check" choice active={!background && mode !== 'background'} disabled={working} onPress={() => { setBackground(null); setDirty(parts.length > 0); setMode('review') }} />
                  <Action label="배경 직접 지정" displayLabel="직접 지정" icon="cursor" choice active={mode === 'background' || !!background} disabled={working} onPress={() => setMode('background')} />
                </ChoiceGroup>
                <SettingTitle title="배경 허용 범위" value={toleranceDraft ?? tolerance} />
                <StickerSplitSlider label="배경 허용 범위" min={0} max={150} step={5} value={toleranceDraft ?? tolerance} disabled={working}
                  onPreview={setToleranceDraft} onCommit={value => { setTolerance(value); setToleranceDraft(null); setDirty(parts.length > 0) }}
                  onCancel={() => setToleranceDraft(null)} onInteraction={setInteracting} />
              </>}

                  {section === 'selection' && !!excludedFocus && <Action label="이 객체 포함" disabled={locked}
                    onPress={() => setSelected(previous => brushSelection(previous, [excludedFocus.id], true))} />}
                  {section === 'results' && <>
                    <View style={s.resultHeader}>
                      <Text style={s.body}>{manualMerge ? `묶을 스티커 ${mergeTargets.length}개 선택` : smallOnly ? '작은 스티커' : '저장할 스티커'}</Text>
                      {manualMerge ? <Action label="묶기 취소" disabled={working}
                        onPress={() => { setManualMerge(false); setMergeTargets([]) }} />
                        : <IconAction label="목록 더보기" icon="more" active={more} disabled={locked} onPress={() => setMore(value => !value)} />}
                    </View>
                    {more && <View style={s.menu}>
                      <Action label="모두 선택" disabled={locked} onPress={() => menuSelect(true)} />
                      <Action label="모두 제외" disabled={locked} onPress={() => menuSelect(false)} />
                      <Action label={smallOnly ? '전체 스티커 보기' : '작은 스티커만 보기'} active={smallOnly} disabled={locked}
                        onPress={() => { setSmallOnly(value => !value); setMore(false) }} />
                    </View>}
                    {!visibleGroups.length && <Text style={s.emptyText}>{smallOnly ? '작은 스티커 없음' : '선택된 스티커 없음'}</Text>}
                  </>}
                </StickerSplitTools>
              </>}
            </View>}
            renderItem={({ item }) => {
              const disabled = locked
              const target = manualMerge ? mergeTargets.includes(item.id) : true
              return <View style={[s.card, { maxWidth: tileWidth },
                (manualMerge ? target : focusedGroup?.id === item.id) && s.cardFocused, disabled && s.disabled]}>
                <Pressable disabled={disabled} accessibilityRole="button"
                  accessibilityLabel={manualMerge ? `스티커 ${item.number} 묶기 대상으로 선택` : `스티커 ${item.number} 확인`}
                  accessibilityState={{ disabled, selected: manualMerge ? target : focusedGroup?.id === item.id }}
                  onPressIn={() => { longPressGroup.current = null }}
                  onPress={() => { if (longPressGroup.current === item.id) { longPressGroup.current = null; return }; chooseGroup(item) }}
                  onLongPress={() => { longPressGroup.current = item.id; setZoomed(item) }} style={s.thumbnail}>
                  <StickerGroupThumbnail group={item} style={s.thumbnail} />
                  <View pointerEvents="none" style={s.number}><Text style={s.badgeText}>{item.number}</Text></View>
                </Pressable>
                <Pressable disabled={disabled} accessibilityRole="checkbox"
                  accessibilityLabel={`스티커 ${item.number} ${manualMerge ? '대상 선택' : '저장 포함'}`}
                  accessibilityState={{ checked: target, disabled }} aria-checked={target}
                  onPress={() => manualMerge ? chooseGroup(item) : setSelected(previous => excludeStickerGroup(previous, item))}
                  style={s.checkTouch}>
                  <View style={[s.check, target && s.checked]}>{target && <Icon name="check" size={16} color={colors.surface} />}</View>
                </Pressable>
              </View>
            }} />
          {footer}
        </View>
      </View>
      {zoomed && <View accessibilityViewIsModal style={s.zoomOverlay}><View style={s.zoom}>
        <View style={s.zoomHeader}><Text style={s.sectionTitle}>스티커 {zoomed.number}</Text><IconAction label="확대 닫기" icon="close" onPress={() => setZoomed(null)} /></View>
        <StickerGroupThumbnail group={zoomed} style={{ width: '100%', height: Math.max(120, Math.min(520, height - insets.top - insets.bottom - 140)) }} />
      </View></View>}
    </View>
    <ConfirmDialog open={rerunAsk} danger={false} title="분리 결과를 새로 만들까요?" message="다시 분리하면 선택·묶음과 실행 취소 기록이 초기화돼요."
      confirmLabel="다시 분리하기" onCancel={() => setRerunAsk(false)} onConfirm={() => { setRerunAsk(false); run() }} />
  </EditorModal>
}

// Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V4 · DIO existing theme
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, list: { flex: 1 },
  workspace: { flex: 1, minHeight: 0 }, workspaceWide: { flexDirection: 'row' },
  controlsPane: { flex: 1, minWidth: 0, minHeight: 0 },
  controlsPaneWide: { borderLeftWidth: 1, borderColor: colors.cardBorder },
  previewPane: { marginBottom: 16 }, previewPaneWide: { flex: 1, minWidth: 0, padding: 16, marginBottom: 0 },
  content: { padding: 16, gap: 10 }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  imageHeader: { alignItems: 'flex-end', marginBottom: 8 }, preview: { position: 'relative', overflow: 'hidden', borderRadius: radius.lg },
  previewActions: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 4 },
  toolLabel: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: radius.md },
  empty: { minHeight: 200, justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, padding: 24 },
  body: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 21, flexShrink: 1 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  menu: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: 8, gap: 8 },
  emptyText: { color: colors.text, fontSize: 14, fontWeight: '600', paddingVertical: 24, textAlign: 'center' },
  cardRow: { gap: 8 }, card: { flex: 1, minWidth: 0, aspectRatio: 1, overflow: 'hidden', borderWidth: 2, borderColor: colors.cardBorder, borderRadius: radius.lg },
  cardFocused: { borderColor: colors.primaryStrong }, thumbnail: { width: '100%', height: '100%' },
  number: { position: 'absolute', bottom: 4, left: 4, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.surface },
  checkTouch: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primaryStrong, borderRadius: 12, backgroundColor: colors.surface },
  checked: { backgroundColor: colors.primaryStrong }, badgeText: { fontSize: 14, fontWeight: '800', color: colors.text }, checkedText: { color: colors.surface },
  disabled: { opacity: DISABLED_OPACITY },
  footer: { flexShrink: 0, backgroundColor: colors.surface },
  footerNotes: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: 1, borderColor: colors.cardBorder },
  total: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, color: colors.text, fontSize: 14, padding: 12, minHeight: 48 },
  error: { color: colors.dangerStrong, fontSize: 14, fontWeight: '600', lineHeight: 21 },
  zoomOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, justifyContent: 'center', padding: 20 },
  zoom: { backgroundColor: colors.surface, padding: 12, borderRadius: radius.xl, overflow: 'hidden' }, zoomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
})
