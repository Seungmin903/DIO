import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { colors, radius, DISABLED_OPACITY } from '../shared/theme'
import { loadedFontFamily } from '../editor/utils/text.js'
import DrawingPad from './DrawingPad'
import { manuscriptLayout } from './manuscriptLayout.js'
import { fontWorkflow as defaultWorkflow, initializeFontWorkflow } from './manager.js'
import { PROMPTS, SAMPLE_TEXT, SYLLABLE_COUNT, validateDraft } from './protocol.js'
import { completedCount, queuePosition } from './workflow.js'
import { correctRegisteredFont, exportDraft, exportFont, importLocalFile, loadFontLibrary } from './storage.js'
import { refreshPersonalFonts } from './library.js'
import { FONT_SPACING_VERSION } from './fontSpacing.js'
import { closeFontStudio, setStudioCloseGuard, studioSnapshot, subscribeStudio } from './studioBus.js'

export function Button({ children, onPress, disabled, primary, label }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }}
    onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, primary && s.primary, (disabled || pressed) && s.dim]}>
    <Text style={[s.buttonText, primary && s.primaryText]}>{children}</Text>
  </Pressable>
}
const statusText = { draft: '작성 중', queued: '생성 대기', processing: '생성 중', paused: '일시 정지', registering: '폰트 저장 중', ready: '생성 완료', failed: '생성 실패', cancelled: '생성 취소' }
const stages = { queued: '준비 중', encoding: '손글씨 분석 중', generating: '글자 생성 중', packing: '폰트 파일 만드는 중', ready: '생성 완료', interrupted: '저장 지점에서 이어 만드는 중' }

export default function HandwritingStudio() {
  const options = useSyncExternalStore(subscribeStudio, studioSnapshot, studioSnapshot)
  // This host stays mounted even when the studio modal closes.
  useEffect(() => { initializeFontWorkflow() }, [])
  return <Modal visible={Boolean(options)} animationType="slide" onRequestClose={closeFontStudio} presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape']}>
    {options ? <StudioContent options={options} /> : null}
  </Modal>
}

export function StudioContent({ options = {}, controller = defaultWorkflow }) {
  const workflow = controller
  const state = useSyncExternalStore(workflow.subscribe, workflow.getSnapshot, workflow.getSnapshot)
  const { width } = useWindowDimensions(), narrow = width < 700
  const [route, setRoute] = useState({ screen: 'home' }), [fonts, setFonts] = useState([])
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [more, setMore] = useState(false)
  const inputSave = useRef(null), scrollRef = useRef(null)
  const [inputActive, setInputActive] = useState(false)
  const onInputActiveChange = useCallback(active => {
    // Block native scrolling immediately; state keeps subsequent renders in sync.
    scrollRef.current?.setNativeProps?.({ scrollEnabled: !active })
    setInputActive(active)
  }, [])
  const value = state.entries.find(e => e.id === route.id), font = fonts.find(f => f.id === value?.fontId)
  const fontKey = state.entries.filter(e => e.fontId).map(e => `${e.fontId}:${e.name}`).join('|')
  useEffect(() => { let live = true; refreshPersonalFonts().then(list => { if (live) setFonts(list) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [fontKey])
  const run = async (message, action) => {
    if (busy) return
    setBusy(message); setError('')
    try { await action() } catch (e) { setError(e.message || '작업을 마치지 못했어요.') } finally { setBusy('') }
  }
  const navigate = async next => { if (inputSave.current) await inputSave.current(); setMore(false); setRoute(next) }
  const start = source => run('입력을 준비하고 있어요.', async () => {
    const id = await workflow.create(source); await navigate({ screen: 'input', id })
  })
  const back = () => run('입력을 저장하고 있어요.', async () => {
    if (route.screen === 'home') await closeFontStudio()
    else await navigate(route.screen === 'preview' ? { screen: 'input', id: route.id } : { screen: 'home' })
  })
  const open = item => run('폰트를 열고 있어요.', () => navigate({ screen: item.status === 'draft' ? 'input' : 'detail', id: item.id }))
  const importFile = () => run('파일을 가져오고 있어요.', async () => {
    const result = await importLocalFile()
    if (!result) return
    if (result.kind === 'draft') {
      const id = await workflow.create(); await workflow.saveDraft(id, result.draft, '가져온 손글씨')
      await navigate({ screen: 'input', id })
    }
    await refreshPersonalFonts(); await workflow.refresh(); setFonts(await loadFontLibrary())
  })
  const showSample = () => run('샘플 문장을 만들고 있어요.', async () => {
    await inputSave.current?.(); await workflow.preview(value.id); await navigate({ screen: 'preview', id: value.id })
  })
  const title = ({ home: '나만의 폰트 만들기', input: '손글씨 입력', preview: '샘플 확인', detail: '내 폰트' })[route.screen]
  return <SafeAreaView style={s.screen}>
    <View style={s.header}><Button label="폰트 화면 뒤로가기" onPress={back} disabled={Boolean(busy)}>‹ 뒤로가기</Button><Text style={s.headerTitle} numberOfLines={1}>{title}</Text><Button onPress={() => setMore(!more)} disabled={Boolean(busy)} label="폰트 보조 메뉴">더보기</Button></View>
    <ScrollView ref={scrollRef} testID="handwriting-input-scroll" scrollEnabled={!inputActive} canCancelContentTouches={!inputActive} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, route.screen === 'home' && s.homeContent]}>
      {(error || state.error) ? <Text accessibilityRole="alert" style={s.error}>{error || state.error}</Text> : null}
      {busy ? <Text accessibilityLiveRegion="polite" style={s.notice}>{busy}</Text> : null}
      {more && <View style={s.card}><Text style={s.heading}>파일 및 폰트 관리</Text><Text style={s.muted}>파일은 이 기기에 보관해요. Expo Go와 개발 빌드는 저장 공간이 달라요.</Text><View style={s.row}>
        <Button onPress={importFile} disabled={Boolean(busy)}>초안·폰트 가져오기</Button>
        {value?.draft && <Button disabled={Boolean(busy)} onPress={() => run('초안을 저장하고 있어요.', async () => { await inputSave.current?.(); await exportDraft(workflow.getSnapshot().entries.find(e => e.id === value.id).draft) })}>36자 초안 파일 저장</Button>}
        {font && <Button disabled={Boolean(busy) || font.missing} onPress={() => run('폰트를 저장하고 있어요.', () => exportFont(font))}>폰트 파일 저장</Button>}
        {font && <Button disabled={Boolean(busy) || font.missing || font.spacingVersion === FONT_SPACING_VERSION || font.spacingSupported === false} onPress={() => run('글자 간격을 보정하고 있어요.', async () => { await correctRegisteredFont(font); await refreshPersonalFonts(); await workflow.refresh(); setFonts(await loadFontLibrary()) })}>글자 간격 보정</Button>}
      </View></View>}
      {!state.loaded ? <View style={s.card}><Text style={s.muted}>내 폰트를 불러오고 있어요.</Text><Button onPress={() => run('다시 불러오고 있어요.', () => workflow.init())}>다시 불러오기</Button></View> : route.screen === 'home' ? <View style={[s.home, narrow && s.vertical]}>
        <View style={s.intro}><Text style={s.eyebrow}>나만의 손글씨</Text><Text style={s.hero}>나만의 폰트 만들기</Text><Text style={s.description}>손글씨를 폰트로 만들어 다이어리에 활용해 보세요!</Text><Text style={s.muted}>36자의 손글씨가 한글 11,172자로 이어져요.</Text></View>
        <View style={[s.card, s.library]}><Text style={s.heading}>내 폰트</Text>{state.entries.length ? state.entries.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} ${statusText[item.status] || '상태 확인 중'}`} onPress={() => open(item)} style={({ pressed }) => [s.libraryRow, pressed && s.dim]}>
          <View style={s.grow}><Text style={s.fontName} numberOfLines={2}>{item.name}</Text><Text style={s.muted}>{item.status === 'queued' ? `대기 ${queuePosition(state.entries, item.id)}번째` : statusText[item.status]}{item.status === 'processing' ? ` · ${completedCount(item).toLocaleString()} / 11,172` : ''}</Text></View><Text style={s.chevron}>›</Text>
        </Pressable>) : <Text style={s.empty}>완성할 폰트가 여기에 모여요.</Text>}<Button primary onPress={() => start()} disabled={Boolean(busy)}>+ 새로 만들기</Button></View>
      </View> : !value ? <Text style={s.error}>폰트 항목을 찾지 못했어요.</Text> : route.screen === 'input' ? <InputScreen key={value.id} workflow={workflow} onInputActiveChange={onInputActiveChange} value={value} narrow={narrow} busy={busy} support={state.support} inputSave={inputSave} onSample={showSample} /> : route.screen === 'preview' ? <View style={s.card}>
        <Text style={s.eyebrow}>{value.name}</Text><Text style={s.title}>내 글씨로 만든 샘플이에요</Text><Sample entry={value} /><Text style={s.muted}>글씨를 확인한 뒤 확정하면 전체 폰트를 만들어요. 다른 폰트를 만들고 있다면 대기열에 추가돼요.</Text>
        <View style={s.row}><Button disabled={Boolean(busy)} onPress={() => run('입력으로 돌아가고 있어요.', () => navigate({ screen: 'input', id: value.id }))}>입력 수정</Button><Button primary disabled={Boolean(busy) || !state.support.available} onPress={() => run('생성을 예약하고 있어요.', async () => { await workflow.confirm(value.id); await navigate({ screen: 'detail', id: value.id }) })}>생성 확정</Button></View>
      </View> : <View style={s.card}>
        <FontName key={`${value.id}:${value.name}`} entry={value} busy={busy} rename={name => run('이름을 저장하고 있어요.', () => workflow.rename(value.id, name))} />
        <Text style={s.heading}>샘플 문장</Text><Sample entry={value} font={font} />
        {value.status !== 'ready' && <View style={s.notice}><Text accessibilityLiveRegion="polite" style={s.heading}>{value.status === 'queued' ? `대기 ${queuePosition(state.entries, value.id)}번째` : statusText[value.status]}</Text><Text style={s.muted}>{stages[value.job?.stage] || '진행 상태를 저장해요.'}</Text><Text style={s.progressText}>{completedCount(value).toLocaleString()} / 11,172</Text><View style={s.track}><View style={[s.fill, { width: `${completedCount(value) / SYLLABLE_COUNT * 100}%` }]} /></View></View>}
        {value.error && <Text style={s.error}>{value.error}</Text>}
        {!state.support.available && <Text style={s.notice}>{state.support.reason}</Text>}
        <View style={s.row}>{['processing', 'queued'].includes(value.status) && <Button disabled={Boolean(busy)} onPress={() => run('생성을 멈추고 있어요.', () => workflow.control(value.id, 'pause'))}>일시 정지</Button>}{['paused', 'failed'].includes(value.status) && <Button disabled={Boolean(busy) || !state.support.available || value.incompatible} onPress={() => run('생성을 이어가고 있어요.', () => workflow.control(value.id, 'resume'))}>{value.status === 'failed' ? '다시 시도' : '이어서 만들기'}</Button>}{['processing', 'queued', 'paused', 'failed', 'registering'].includes(value.status) && <Button disabled={Boolean(busy)} onPress={() => run('생성을 취소하고 있어요.', () => workflow.control(value.id, 'cancel'))}>생성 취소</Button>}</View>
        <Text style={s.heading}>생성에 사용한 36자</Text>
        {value.draft ? <InputSamples draft={value.draft} /> : <Text style={s.muted}>이 폰트의 원래 입력 기록이 없어 입력을 표시하거나 수정할 수 없어요.</Text>}
        {['ready', 'cancelled'].includes(value.status) || value.incompatible ? <Button primary disabled={Boolean(busy) || !value.draft} onPress={() => start(value.id)}>입력 수정</Button> : null}
        {value.status === 'ready' && font && <View style={s.row}>{font.missing ? <Text style={s.error}>폰트 파일을 다시 가져와 주세요.</Text> : options.onUse ? <Button primary disabled={!loadedFontFamily(font.id)} onPress={() => { options.onUse(font); closeFontStudio() }}>이 폰트 사용</Button> : <Text style={s.muted}>다이어리 텍스트 도구의 내 폰트에서 선택할 수 있어요.</Text>}</View>}
      </View>}
    </ScrollView>
  </SafeAreaView>
}

function FontName({ entry, busy, rename }) {
  const [name, setName] = useState(entry.name)
  return <View style={s.row}><TextInput accessibilityLabel="폰트 이름 수정" value={name} maxLength={30} onChangeText={setName} style={[s.name, s.grow]} editable={!busy} /><Button disabled={Boolean(busy) || name === entry.name || !name.trim()} onPress={() => rename(name)}>이름 저장</Button></View>
}
function InputScreen({ workflow, value, narrow, busy, support, inputSave, onSample, onInputActiveChange }) {
  const [draft, setDraft] = useState(value.draft), [name, setName] = useState(value.name), [index, setIndex] = useState(0), [penWidth, setPenWidth] = useState(9)
  const [active, setActive] = useState(false), [saveError, setSaveError] = useState(''), [saving, setSaving] = useState(false)
  const pending = useRef(Promise.resolve()), latest = useRef({ draft, name }), revision = useRef(0)
  const writingCharacter = useRef(null)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [sheetWidth, setSheetWidth] = useState(Math.min(1036, windowWidth - insets.left - insets.right - 64))
  const layout = manuscriptLayout(sheetWidth, Math.max(80, Math.min(520, windowHeight - insets.top - insets.bottom - 230)), PROMPTS.length)
  const persist = (next, nextName) => {
    latest.current = { draft: next, name: nextName }; setDraft(next); setName(nextName); setSaving(true)
    const version = ++revision.current
    const task = workflow.saveDraft(value.id, next, nextName.trim() ? nextName : value.name)
    pending.current = task
    task.then(() => { if (version === revision.current) { setSaveError(''); setSaving(false) } }).catch(e => { if (version === revision.current) { setSaveError(e.message); setSaving(false) } })
  }
  useEffect(() => {
    const flush = async () => { await pending.current; if (!latest.current.name.trim()) throw new Error('폰트 이름을 입력해 주세요.'); validateDraft(latest.current.draft) }
    inputSave.current = flush
    const remove = setStudioCloseGuard(async () => { try { await flush(); return true } catch (e) { setSaveError(e.message); return false } })
    return () => { if (inputSave.current === flush) inputSave.current = null; remove() }
  }, [value.id, inputSave])
  const character = PROMPTS[index], sample = draft.samples[character], count = PROMPTS.filter(c => draft.samples[c]?.strokes.length).length
  const change = (character, next) => {
    const current = latest.current.draft, samples = { ...current.samples }
    if (next?.strokes.length) samples[character] = next; else delete samples[character]
    persist({ ...current, samples, updatedAt: new Date().toISOString() }, latest.current.name)
  }
  const canStart = c => writingCharacter.current == null || writingCharacter.current === c
  const claimInput = c => {
    if (!canStart(c)) return false
    writingCharacter.current = c
    setIndex(PROMPTS.indexOf(c))
    return true
  }
  const setWriting = (c, writing) => {
    if (writing && !canStart(c)) return
    if (!writing && writingCharacter.current !== c) return
    writingCharacter.current = writing ? c : null
    setActive(writing)
    onInputActiveChange(writing)
  }
  return <View style={s.card}>
    <View style={s.row}><TextInput accessibilityLabel="새 폰트 이름" placeholder="폰트 이름" value={name} onChangeText={next => persist(draft, next)} maxLength={30} style={[s.name, s.grow]} editable={!busy && !active} /><Text style={s.muted}>{count} / 36</Text></View>
    <View testID="handwriting-sheet-area" style={s.sheetArea} onLayout={event => setSheetWidth(event.nativeEvent.layout.width)}>
      <View testID="handwriting-manuscript" style={{ width: layout.width, height: layout.height }}>
        {Array.from({ length: layout.rows }, (_, row) => <View key={row} style={[s.sheetRow, { height: layout.cell, marginBottom: row + 1 < layout.rows ? layout.gap : 0 }]}>
          {Array.from({ length: layout.columns }, (_, column) => {
            const i = row * layout.columns + column, c = PROMPTS[i]
            return <View key={c || `blank-${i}`} testID={c ? 'handwriting-manuscript-cell' : undefined} style={[s.manuscriptCell, { width: layout.cell, height: layout.cell }, c && index === i && s.manuscriptSelected]}>
              {c && <DrawingPad character={c} sample={draft.samples[c]} onChange={next => change(c, next)} width={penWidth} seamless guideRatio={.5} size={layout.cell}
                disabled={Boolean(busy) || (active && writingCharacter.current !== c)}
                canStartInput={() => canStart(c)} onInputStart={() => claimInput(c)} onInputActiveChange={writing => setWriting(c, writing)} />}
            </View>
          })}
        </View>)}
      </View>
    </View>
    <View style={s.row}><Text style={s.muted}>펜 굵기</Text>{[[6, '얇게'], [9, '중간'], [12, '두껍게']].map(([w, label]) => <Button key={w} primary={penWidth === w} disabled={Boolean(busy) || active} onPress={() => setPenWidth(w)} label={`펜 굵기 ${label}`}>{label}</Button>)}</View>
    <View style={s.row}><Button disabled={Boolean(busy) || !sample || active} onPress={() => change(character, { ...sample, strokes: sample.strokes.slice(0, -1) })}>획 되돌리기</Button><Button disabled={Boolean(busy) || !sample || active} onPress={() => change(character, null)}>다시 쓰기</Button></View>
    <Text accessibilityLiveRegion="polite" style={s.muted}>{saving ? '저장 중…' : saveError ? '입력을 저장하지 못했어요. 화면의 입력은 유지돼요.' : '이 기기에 저장됨'}</Text>
    {saveError ? <><Text style={s.error}>{saveError}</Text><Button onPress={() => persist(latest.current.draft, latest.current.name)}>입력 저장 다시 시도</Button></> : null}
    {!support.available && <Text style={s.notice}>{support.reason}</Text>}
    <Button primary disabled={count !== 36 || !name.trim() || Boolean(busy) || active || saving || Boolean(saveError) || !support.available} onPress={onSample}>샘플 확인</Button>
  </View>
}
function Sample({ entry, font }) {
  if (font && !font.missing && loadedFontFamily(font.id)) return <Text style={[s.sampleText, { fontFamily: loadedFontFamily(font.id) }]}>{SAMPLE_TEXT}</Text>
  return entry.preview ? <View style={s.sentence}>{[...SAMPLE_TEXT].map((c, i) => c === ' ' ? <View key={i} style={{ width: 12 }} /> : entry.preview[c] ? <Image key={i} accessibilityLabel={c} source={{ uri: entry.preview[c] }} style={s.glyph} /> : null)}</View> : <Text style={s.muted}>{font?.missing ? '폰트 파일을 불러올 수 없어요.' : entry.status === 'ready' ? '샘플을 불러오고 있어요.' : '샘플은 생성 후 확인할 수 있어요.'}</Text>
}
function InputSamples({ draft }) {
  return <View style={s.grid}>{PROMPTS.map(c => <View key={c} style={s.thumbnail} accessibilityLabel={`${c} 원본 손글씨`}><Svg width={48} height={48} viewBox="0 0 1024 1024">{(draft.samples[c]?.strokes || []).map((stroke, i) => stroke.points.length === 1 ? <Circle key={i} cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill={colors.text} /> : <Path key={i} d={stroke.points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.text} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}</Svg><Text style={s.muted}>{c}</Text></View>)}</View>
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSoft }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border }, headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.text },
  content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 16, gap: 16, paddingBottom: 40 }, homeContent: { flexGrow: 1, justifyContent: 'center' }, home: { flexDirection: 'row', gap: 24, alignItems: 'stretch' }, vertical: { flexDirection: 'column' },
  intro: { flex: 1, justifyContent: 'center', padding: 20, gap: 20 }, eyebrow: { color: colors.primaryStrong, fontSize: 13, fontWeight: '700' }, hero: { color: colors.text, fontSize: 34, lineHeight: 46, fontWeight: '700' }, description: { color: colors.text, fontSize: 17, lineHeight: 28 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, gap: 16 }, library: { flex: 1 }, libraryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, minHeight: 64, borderBottomWidth: 1, borderColor: colors.border }, fontName: { color: colors.text, fontSize: 16, fontWeight: '600' }, chevron: { color: colors.textMuted, fontSize: 24 }, grow: { flex: 1, minWidth: 0, gap: 12 },
  title: { color: colors.text, fontSize: 23, fontWeight: '700' }, heading: { color: colors.text, fontSize: 16, fontWeight: '700' }, muted: { color: colors.textMuted, fontSize: 13, lineHeight: 21 }, empty: { color: colors.textMuted, paddingVertical: 24, lineHeight: 22 },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, buttonText: { color: colors.text, fontSize: 13, fontWeight: '600' }, primary: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong }, primaryText: { color: colors.surface }, dim: { opacity: DISABLED_OPACITY },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, columns: { flexDirection: 'row', gap: 20 }, drawing: { width: '100%', maxWidth: 360, flexShrink: 1, gap: 12 }, name: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
  notice: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 14, color: colors.text, lineHeight: 22, gap: 10 }, error: { color: colors.danger, padding: 12, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.sm, lineHeight: 22 },
  sheetArea: { width: '100%', alignItems: 'center' }, sheetRow: { flexDirection: 'row' }, manuscriptCell: { borderWidth: .5, borderColor: colors.border, backgroundColor: colors.surface }, manuscriptSelected: { backgroundColor: colors.primarySoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, cell: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, cellDone: { backgroundColor: colors.primarySoft }, cellSelected: { borderColor: colors.primaryStrong, borderWidth: 2 }, cellText: { color: colors.text, fontSize: 19 }, thumbnail: { width: 52, alignItems: 'center', paddingVertical: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  sentence: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 12 }, glyph: { width: 40, height: 40 }, sampleText: { color: colors.text, fontSize: 28, lineHeight: 44, paddingVertical: 16 }, progressText: { color: colors.text, fontSize: 20, fontWeight: '600' }, track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }, fill: { height: 6, backgroundColor: colors.primary },
})
