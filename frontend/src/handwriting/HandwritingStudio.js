import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import EditorModal from '../editor/components/controls/EditorModal'
import Svg, { Circle, Path } from 'react-native-svg'
import UPNG from 'upng-js'
import { colors } from '../shared/theme'
import { loadedFontFamily } from '../editor/utils/text.js'
import { PROMPTS, SAMPLE_TEXT, SYLLABLE_COUNT, prepareSample, jobMatchesModel } from './protocol.js'
import { capabilities, controlJob, createSnapshot, generatePreview, initializeGeneratorLifecycle, refreshJob, startJob } from './generator.js'
import { exportDraft, exportFont, importLocalFile, loadDraft, loadLastJob, registerFontFile, saveDraft } from './storage.js'
import { refreshPersonalFonts } from './library.js'
import { closeFontStudio, setStudioCloseGuard, studioSnapshot, subscribeStudio } from './studioBus.js'
import { toBase64 } from './fontFormat.js'

function Button({ children, onPress, disabled, primary, label }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} onPress={onPress} disabled={disabled} style={[s.button, primary && s.primary, disabled && s.disabled]}><Text style={[s.buttonText, primary && s.primaryText]}>{children}</Text></Pressable>
}
function png(pixels) {
  const rgba = new Uint8Array(16384 * 4)
  for (let i = 0; i < pixels.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = pixels[i]; rgba[i * 4 + 3] = 255 }
  return `data:image/png;base64,${toBase64(new Uint8Array(UPNG.encode([rgba.buffer], 128, 128, 0)))}`
}
function DrawingPad({ character, sample, onChange, width: penWidth, disabled }) {
  const [side, setSide] = useState(300), [preview, setPreview] = useState(null)
  const gesture = useRef(null)
  useEffect(() => { gesture.current = null; setPreview(null) }, [character])
  const point = e => {
    const event = e.nativeEvent, x = event.locationX / side * 1024, y = event.locationY / side * 1024
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x: Math.max(0, Math.min(1024, x)), y: Math.max(0, Math.min(1024, y)), pressure: event.pointerType === 'pen' && Number.isFinite(event.pressure) ? event.pressure : null, time: Date.now() - (gesture.current?.started ?? Date.now()) }
  }
  const end = cancelled => {
    const g = gesture.current; gesture.current = null; setPreview(null)
    if (!cancelled && g?.points.length) onChange({ coordinateSize: 1024, strokes: [...(sample?.strokes ?? []), { width: g.width, points: g.points }] })
  }
  const strokes = [...(sample?.strokes ?? []), ...(preview ? [preview] : [])]
  return <View style={s.pad} onLayout={e => setSide(e.nativeEvent.layout.width)}>
    <Text pointerEvents="none" style={s.guide}>{character}</Text>
    <View accessibilityLabel={`${character} 손글씨 입력칸`} style={{ width: '100%', aspectRatio: 1, touchAction: 'none' }}
      onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={e => { if (disabled || e.nativeEvent.touches?.length > 1) return; const p = point(e); if (!p) return; gesture.current = { width: penWidth, points: [p], started: Date.now() }; setPreview({ ...gesture.current }) }}
      onResponderMove={e => { const g = gesture.current; if (!g) return; if (e.nativeEvent.touches?.length > 1) return end(true); const p = point(e); if (p && Math.hypot(p.x - g.points.at(-1).x, p.y - g.points.at(-1).y) >= .7 && g.points.length < 5000) { g.points.push(p); setPreview({ ...g, points: [...g.points] }) } }}
      onResponderRelease={() => end(false)} onResponderTerminate={() => end(true)} onResponderTerminationRequest={() => false}>
      <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 1024 1024">
        {strokes.map((stroke, i) => stroke.points.length === 1 ? <Circle key={i} cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill="#111" /> : <Path key={i} d={stroke.points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke="#111" strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
      </Svg>
    </View>
  </View>
}

export default function HandwritingStudio() {
  const options = useSyncExternalStore(subscribeStudio, studioSnapshot, studioSnapshot)
  useEffect(() => { initializeGeneratorLifecycle() }, [])
  return <EditorModal visible={Boolean(options)} animationType="slide" onRequestClose={closeFontStudio} presentationStyle="fullScreen">
    {options ? <StudioContent options={options} /> : null}
  </EditorModal>
}

function StudioContent({ options }) {
  const { width } = useWindowDimensions(), narrow = width < 700
  const [draft, setDraft] = useState(null), [index, setIndex] = useState(0), [penWidth, setPenWidth] = useState(9)
  const [support, setSupport] = useState({ available: false, reason: '실행 환경을 확인하고 있어요.' })
  const [fonts, setFonts] = useState([]), [job, setJob] = useState(null), [name, setName] = useState('나의 손글씨')
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [saveStatus, setSaveStatus] = useState('저장한 손글씨를 불러오고 있어요.')
  const [preview, setPreview] = useState(null), [progress, setProgress] = useState(0)
  const saveRevision = useRef(0), lastSave = useRef(Promise.resolve()), prepared = useRef(null)
  useEffect(() => setStudioCloseGuard(async () => {
    try { await lastSave.current; return true } catch { setError('저장하지 못한 입력이 있어요. 저장소를 확인한 뒤 다시 시도하거나 초안 파일로 보관해 주세요.'); return false }
  }), [])
  const character = PROMPTS[index], sample = draft?.samples[character], count = PROMPTS.filter(c => draft?.samples[c]?.strokes.length).length
  const processing = job?.state === 'processing', registered = fonts.some(f => f.sourceJob === job?.id)
  const outdatedJob = Boolean(support.available && job && !['ready', 'cancelled'].includes(job.state) && !jobMatchesModel(job, support.modelVersion))
  useEffect(() => {
    let live = true
    Promise.all([loadDraft(), capabilities(), refreshPersonalFonts(), loadLastJob()]).then(async ([d, c, f, j]) => {
      if (c.available) {
        const { latestJob } = await import('./generator.js')
        j = await latestJob() ?? j
      }
      if (!live) return
      setDraft(d); setSupport(c); setFonts(f); setJob(j); setSaveStatus('이 기기에 저장됨')
    }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [])
  useEffect(() => {
    if (!job?.id || !support.available || ['ready', 'cancelled'].includes(job.state)) return
    let live = true, querying = false
    const poll = async () => {
      if (querying) return
      querying = true
      try { const updated = await refreshJob(job.id); if (live) setJob(updated) } catch (e) { if (live) setError(e.message) } finally { querying = false }
    }
    const timer = setInterval(poll, 1000); poll()
    return () => { live = false; clearInterval(timer) }
  }, [job?.id, job?.state, support.available])
  const inputPreview = useMemo(() => {
    if (!sample) return null
    try { const p = prepareSample(sample); return { original: png(p.original), model: png(p.pixels), ...p.metadata } } catch (e) { return { error: e.message } }
  }, [sample])
  const commit = next => {
    prepared.current = null; setPreview(null); setDraft(next); setSaveStatus('저장 중…')
    const revision = ++saveRevision.current
    lastSave.current = saveDraft(next)
    lastSave.current.then(() => { if (revision === saveRevision.current) setSaveStatus('이 기기에 저장됨') }).catch(e => { if (revision === saveRevision.current) { setSaveStatus('저장하지 못했어요. 현재 입력은 화면에 남아 있어요.'); setError(e.message) } })
  }
  const changeSample = next => commit({ ...draft, updatedAt: new Date().toISOString(), samples: { ...draft.samples, [character]: next } })
  const removeStroke = all => {
    const samples = { ...draft.samples }, strokes = all ? [] : (sample?.strokes ?? []).slice(0, -1)
    if (strokes.length) samples[character] = { coordinateSize: 1024, strokes }; else delete samples[character]
    commit({ ...draft, updatedAt: new Date().toISOString(), samples })
  }
  const run = async (message, action, waitForSave = true) => {
    if (busy) return
    setBusy(message); setError('')
    try { if (waitForSave) await lastSave.current; await action() } catch (e) { setError(e.message || '작업을 마치지 못했어요.') } finally { setBusy('') }
  }
  const snapshot = async () => {
    if (!prepared.current || prepared.current.updatedAt !== draft.updatedAt) prepared.current = { updatedAt: draft.updatedAt, value: await createSnapshot(draft, setProgress) }
    return prepared.current.value
  }
  const doImport = () => run('파일을 가져오고 있어요.', async () => {
    const result = await importLocalFile()
    if (!result) return
    if (result.kind === 'draft') { setDraft(result.draft); setPreview(null); prepared.current = null; setSaveStatus('가져온 초안을 이 기기에 저장했어요.') }
    setFonts(await refreshPersonalFonts())
  })
  const doPreview = () => run('샘플 문구를 만들고 있어요.', async () => setPreview(await generatePreview(await snapshot(), SAMPLE_TEXT)))
  const doStart = () => run('전체 생성을 준비하고 있어요.', async () => setJob(await startJob(await snapshot())))
  const doControl = action => run('진행 상태를 저장하고 있어요.', async () => setJob(await controlJob(action, job.id)))
  const doRegister = () => run('폰트를 등록하고 있어요.', async () => {
    await registerFontFile(job.fontUri, name, job.id); setFonts(await refreshPersonalFonts())
  })
  return <View style={s.screen}>
    <View style={s.header}><View><Text style={s.title}>나만의 폰트 만들기</Text><Text style={s.muted}>내 손글씨 36자로 만드는 한글 폰트</Text></View><Button onPress={closeFontStudio}>닫기</Button></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {!draft ? <Text style={s.muted}>손글씨를 준비하고 있어요.</Text> : <>
        <View style={s.section}><View style={s.row}><Text style={s.heading}>1. 안내 글자 작성</Text><Text style={s.count}>{count} / 36</Text></View>
          <Text style={s.muted}>평소 글씨처럼 써 주세요. 연한 안내 글자는 원본과 모델 입력에 포함되지 않아요.</Text>
          <View style={s.grid}>{PROMPTS.map((c, i) => <Pressable key={c} accessibilityRole="button" accessibilityLabel={`${c} ${draft.samples[c] ? '작성됨' : '미작성'}`} accessibilityState={{ selected: index === i }} onPress={() => setIndex(i)} style={[s.cell, draft.samples[c] && s.cellDone, i === index && s.cellSelected]}><Text style={s.cellText}>{c}</Text></Pressable>)}</View>
          <View style={[s.columns, narrow && s.vertical]}>
            <View style={s.drawing}><DrawingPad character={character} sample={sample} onChange={changeSample} width={penWidth} disabled={Boolean(busy)} />
              <View style={s.row}><Button disabled={!sample || Boolean(busy)} onPress={() => removeStroke(false)}>획 되돌리기</Button><Button disabled={!sample || Boolean(busy)} onPress={() => removeStroke(true)}>다시 쓰기</Button></View>
              <View style={s.row}><Text style={s.muted}>펜 굵기</Text>{[6, 9, 12].map(w => <Button key={w} primary={penWidth === w} onPress={() => setPenWidth(w)}>{w}</Button>)}</View>
              <View style={s.row}><Button disabled={index === 0} onPress={() => setIndex(index - 1)}>이전</Button><Button primary onPress={() => setIndex(Math.min(35, index + 1))}>{index === 35 ? '마지막 글자' : '다음 글자'}</Button></View>
              <Text accessibilityLiveRegion="polite" style={s.muted}>{saveStatus}</Text>
              {saveStatus.startsWith('저장하지 못') ? <Button disabled={Boolean(busy)} onPress={() => commit(draft)}>입력 저장 다시 시도</Button> : null}
            </View>
            <View style={s.prepared}><Text style={s.heading}>2. 자동 크기 맞춤</Text><Text style={s.muted}>원래 중심을 유지하고 여백을 남겨 모델에 전달해요. 원본은 그대로 보관해요.</Text>
              {inputPreview?.error ? <Text style={s.error}>{inputPreview.error}</Text> : inputPreview ? <>
                <View style={s.row}>{[['원본 미리보기', inputPreview.original], ['모델 입력', inputPreview.model]].map(([label, uri]) => <View key={label} style={s.figure}><Image source={{ uri }} style={s.inputImage} accessibilityLabel={label} /><Text style={s.muted}>{label}</Text></View>)}</View>
                <Text style={s.muted}>{inputPreview.scale.toFixed(2)}배 · 128×128 · 최소 여백 {inputPreview.margin}px</Text>
              </> : <Text style={s.empty}>글자를 쓰면 모델 입력을 확인할 수 있어요.</Text>}
            </View>
          </View>
        </View>
        <View style={s.section}><Text style={s.heading}>3. 미리보고 폰트 만들기</Text><Text style={s.muted}>36자를 한 번 읽고 한글 11,172자를 만들어요. 중단해도 완료한 구간부터 이어 만들 수 있어요.</Text>
          {!support.available ? <Text style={s.notice}>{support.reason}</Text> : <Text style={s.muted}>이 기기에서 생성 · 원본과 결과를 서버에 보내지 않음</Text>}
          <View style={s.row}><Button disabled={count !== 36 || !support.available || Boolean(busy) || processing} onPress={doPreview}>샘플 문구 보기</Button><Button primary disabled={!preview || !support.available || Boolean(busy) || Boolean(job && !outdatedJob && (job.state === 'ready' ? !registered : job.state !== 'cancelled'))} onPress={doStart}>한글 전체 폰트 만들기</Button></View>
          {busy ? <Text accessibilityLiveRegion="polite" style={s.notice}>{busy}{progress > 0 && progress < 36 ? ` (${progress}/36)` : ''}</Text> : null}
          {preview ? <View style={s.sentence}>{[...SAMPLE_TEXT].map((c, i) => c === ' ' ? <View key={i} style={{ width: 12 }} /> : preview[c] ? <Image key={i} source={{ uri: preview[c] }} style={s.glyph} accessibilityLabel={c} /> : null)}</View> : null}
          {job ? <View style={s.job}><Text style={s.heading}>{({ processing: '내 폰트를 만들고 있어요', paused: '이어서 만들 수 있어요', ready: '폰트 제작 완료', failed: '생성이 중단됐어요', cancelled: '생성을 취소했어요' })[job.state] ?? '생성 준비 중'}</Text>
            <Text accessibilityLiveRegion="polite" style={s.muted}>{job.completed.toLocaleString()} / {SYLLABLE_COUNT.toLocaleString()}자 · {job.stage === 'encoding' ? '손글씨 읽는 중' : job.stage === 'building' ? '폰트 파일 제작 중' : `${Math.floor(job.completed / SYLLABLE_COUNT * 100)}%`}</Text>
            <View style={s.track}><View style={[s.fill, { width: `${job.completed / SYLLABLE_COUNT * 100}%` }]} /></View>
            {job.error ? <Text style={s.error}>{job.error}</Text> : null}
            {outdatedJob ? <Text style={s.notice}>생성기가 업데이트되어 이 작업은 이어 만들 수 없어요. 저장된 손글씨로 미리본 뒤 새 작업을 시작해 주세요.</Text> : null}
            <View style={s.row}>{processing ? <Button disabled={Boolean(busy)} onPress={() => doControl('pause')}>일시 정지</Button> : ['paused', 'failed'].includes(job.state) ? <Button disabled={outdatedJob || !support.available || Boolean(busy)} onPress={() => doControl('resume')}>저장한 입력으로 이어 만들기</Button> : null}{!['ready', 'cancelled'].includes(job.state) ? <Button disabled={!support.available || Boolean(busy)} onPress={() => doControl('cancel')}>생성 취소</Button> : null}</View>
            {job.state === 'ready' && !registered ? <><TextInput accessibilityLabel="완성한 폰트 이름" value={name} onChangeText={setName} maxLength={30} placeholder="폰트 이름" style={s.name} /><Button primary disabled={!name.trim() || Boolean(busy)} onPress={doRegister}>이 이름으로 저장</Button></> : null}
            {processing ? <Text style={s.muted}>이 창을 닫고 앱을 사용해도 돼요. 다른 앱으로 이동하면 안전한 구간에서 멈춰요.</Text> : null}
          </View> : null}
        </View>
        <View style={s.section}><Text style={s.heading}>내 폰트</Text>{fonts.length ? fonts.map(font => <View key={font.id} style={s.fontRow}>
          <Text style={[s.fontSample, { fontFamily: loadedFontFamily(font.id) ?? undefined }]}>{font.label}</Text>
          <Text style={{ color: colors.text, fontSize: 22, fontFamily: loadedFontFamily(font.id) ?? undefined }}>오늘의 기록을 내 글씨로 남겨요.</Text>
          <Text style={s.muted}>{font.missing ? '폰트 파일을 다시 가져와 주세요.' : '한글 11,172자 · Regular'}</Text>
          <View style={s.row}>{options.onUse ? <Button primary disabled={!loadedFontFamily(font.id)} onPress={() => { options.onUse(font); closeFontStudio() }}>이 폰트 사용</Button> : <Text style={s.muted}>텍스트 도구의 글꼴 목록에서 선택할 수 있어요.</Text>}<Button disabled={Boolean(busy) || font.missing} onPress={() => run('폰트를 파일로 내보내고 있어요.', () => exportFont(font))}>기기 간 확인용 파일 저장</Button></View>
        </View>) : <Text style={s.empty}>완성한 폰트가 여기에 모여요.</Text>}</View>
        <View style={s.section}><Text style={s.heading}>개발 확인용 파일 이관</Text><Text style={s.muted}>Expo Go와 개발 빌드는 저장 공간이 달라요. 초안과 완성 폰트를 기기 내 파일로 옮겨 확인할 수 있어요.</Text><View style={s.row}><Button disabled={Boolean(busy)} onPress={() => run('초안을 파일로 저장하고 있어요.', () => exportDraft(draft), false)}>36자 초안 파일 저장</Button><Button disabled={Boolean(busy)} onPress={doImport}>초안·완성 폰트 가져오기</Button></View></View>
      </>}
    </ScrollView>
  </View>
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6FA', paddingTop: Platform.OS === 'ios' ? 48 : 24 },
  header: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.border },
  title: { fontSize: 21, fontWeight: '800', color: colors.text }, heading: { fontSize: 16, fontWeight: '700', color: colors.text },
  content: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 16, gap: 16, paddingBottom: 50 },
  section: { padding: 18, gap: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, columns: { flexDirection: 'row', gap: 20 }, vertical: { flexDirection: 'column' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 19 }, notice: { color: colors.text, fontSize: 13, lineHeight: 21, padding: 12, borderRadius: 10, backgroundColor: '#EDF2FA' },
  error: { color: '#9E2333', backgroundColor: '#FFF0F0', padding: 10, borderRadius: 8, lineHeight: 20 },
  button: { minHeight: 40, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF' },
  primary: { backgroundColor: '#0B1957', borderColor: '#0B1957' }, buttonText: { fontSize: 12, fontWeight: '600', color: colors.text }, primaryText: { color: '#FFF' }, disabled: { opacity: .4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, cell: { width: 41, height: 41, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cellDone: { backgroundColor: '#DFEBE5' }, cellSelected: { borderColor: '#0B1957', borderWidth: 2 }, cellText: { fontSize: 19, color: colors.text }, count: { fontSize: 14, color: colors.textMuted, marginLeft: 'auto' },
  drawing: { flex: 1, maxWidth: 400, gap: 12, width: '100%' }, pad: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF', overflow: 'hidden', width: '100%', aspectRatio: 1 },
  guide: { position: 'absolute', top: '20%', width: '100%', textAlign: 'center', color: '#E2E6EC', fontSize: 150 }, prepared: { flex: 1, gap: 12 }, figure: { alignItems: 'center', gap: 7 },
  inputImage: { width: 128, height: 128, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF' }, empty: { paddingVertical: 16, color: colors.textMuted, fontSize: 13 },
  sentence: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', backgroundColor: '#FFF', paddingVertical: 12 }, glyph: { width: 48, height: 48 },
  job: { padding: 14, backgroundColor: '#F7F9FC', borderRadius: 10, gap: 12 }, track: { height: 6, borderRadius: 3, backgroundColor: '#DEE4EE', overflow: 'hidden' }, fill: { height: 6, backgroundColor: '#6E92C6' },
  name: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: '#FFF', color: colors.text }, fontRow: { gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 14 }, fontSample: { fontSize: 26, color: colors.text },
})
