import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import EditorModal from '../editor/components/controls/EditorModal'
import Icon from '../editor/components/controls/Icon'
import ConfirmDialog from '../editor/components/controls/ConfirmDialog'
import AppIcon from '../shared/AppIcon'
import useFillGrid from '../shared/useFillGrid'
import DioButton from '../shared/DioButton'
import { MakerBar, MakerHeader, MakerNav, MakerSteps } from '../shared/MakerKit'
import Slider from '../editor/components/controls/Slider'
import Svg, { Circle, Path } from 'react-native-svg'
import { colors, radius, DISABLED_OPACITY } from '../shared/theme'
import { loadedFontFamily } from '../editor/utils/text.js'
import DrawingPad from './DrawingPad'
import { createDraftAutosave } from './draftAutosave.js'
import { manuscriptLayout } from './manuscriptLayout.js'
import { fontWorkflow as defaultWorkflow, initializeFontWorkflow } from './manager.js'
import { PROMPTS, SAMPLE_TEXT, SYLLABLE_COUNT, validateDraft } from './protocol.js'
import { completedCount, isEmptyDraft, listStatus, queuePosition, statusText } from './workflow.js'
import { correctRegisteredFont, exportDraft, exportFont, importLocalFile, loadFontLibrary } from './storage.js'
import { refreshPersonalFonts } from './library.js'
import { FONT_SPACING_VERSION } from './fontSpacing.js'
import { AI_FONT_INPUT_NOTICE, AI_FONT_LABEL, AI_FONT_EXPORT_NOTICE, isAiHandwritingFont } from './aiDisclosure.js'
import { closeFontStudio, setStudioCloseGuard, studioSnapshot, subscribeStudio } from './studioBus.js'

// 제작 화면 문법: 버튼은 DioButton(높이 48). primary 는 채움, 나머지는 토널. chip 은 고르기 칩(높이 36, 고르면 옅은 면 + 체크).
export function Button({ children, onPress, disabled, primary, label, chip = false, icon = null, variant }) {
  const text = typeof children === 'string' ? children : undefined
  if (chip) return <Pressable accessibilityRole="button" accessibilityLabel={label ?? text} accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(primary) }}
    disabled={disabled} onPress={onPress} style={[s.chip, primary && s.chipOn, disabled && s.dim]}>
    {primary ? <AppIcon name="check" size={16} forText={14} color={colors.primaryText} /> : null}
    <Text style={[s.chipText, primary && s.chipTextOn]}>{children}</Text>
  </Pressable>
  return <DioButton variant={variant ?? (primary ? 'filled' : 'tonal')} label={label ?? text} text={text} icon={icon} disabled={Boolean(disabled)} onPress={onPress} />
}
// 새 폰트는 세 단계(코덱스 2026-11-01): 손글씨 입력 → 샘플 확인(이름 정하기) → 생성. 앞 단계로는 헤더 뒤로만 돌아간다
const FONT_STEPS = [{ id: 'input', label: '손글씨 입력' }, { id: 'preview', label: '샘플 확인' }, { id: 'detail', label: '생성' }]
// 펜 굵기는 편집창 펜과 같은 막대(− · + · 숫자). 범위는 얇게 6 ~ 두껍게 24(1024 좌표 기준, 기존 저장 획의 굵기는 유지한다)
// 네이티브에서 받은 지원 불가 사유가 없을 때만 공통 안내를 사용한다.
const UNSUPPORTED = '이 기기에서는 폰트를 만들 수 없어요.'
// 36자 초안 저장은 개발 확인용이라 개발 빌드에서만 보인다. 가져오기는 .ttf 폰트 복원('폰트 파일 저장'의 짝)이라 일반 빌드에도 두고 이름만 '폰트 가져오기'로(초안 json 은 개발 확인용).
// 네이티브가 주는 개발자 문구('개발 빌드에 …', modules/dio-handwriting DioHandwritingModule.kt capabilities.reason)도 일반 빌드에선 일반 문구로 바꾼다 — 그 문구를 바꾸면 이 판별도 같이 바꾼다
const IS_DEV_BUILD = typeof __DEV__ !== 'undefined' && __DEV__
export const supportReason = reason => (!IS_DEV_BUILD && /개발 빌드/.test(reason || '') ? UNSUPPORTED : reason)
const PEN_WIDTH = { min: 6, max: 24, step: 1 }
const stages = { queued: '준비 중', encoding: '손글씨 분석 중', generating: '글자 생성 중', packing: '폰트 파일 만드는 중', ready: '생성 완료', interrupted: '저장 지점에서 이어 만드는 중' }

export default function HandwritingStudio() {
  const options = useSyncExternalStore(subscribeStudio, studioSnapshot, studioSnapshot)
  // This host stays mounted even when the studio modal closes.
  useEffect(() => { initializeFontWorkflow() }, [])
  return <EditorModal visible={Boolean(options)} animationType="none" onRequestClose={closeFontStudio} presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape']}>
    {options ? <StudioContent options={options} /> : null}
  </EditorModal>
}

export function StudioContent({ options = {}, controller = defaultWorkflow }) {
  const workflow = controller
  const state = useSyncExternalStore(workflow.subscribe, workflow.getSnapshot, workflow.getSnapshot)
  const { width } = useWindowDimensions(), narrow = width < 700
  // 공방 폰트 탭에서 열면(options.create · options.open) 이 화면의 자체 목록을 거치지 않고 새 폰트 입력 · 고른 폰트 화면으로 바로 들어간다
  const direct = Boolean(options.create || options.open)
  const [route, setRoute] = useState({ screen: direct ? 'launch' : 'home' }), [fonts, setFonts] = useState([])
  const launched = useRef(false)
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [more, setMore] = useState(false)
  const inputSave = useRef(null), scrollRef = useRef(null)
  const [inputActive, setInputActive] = useState(false)
  // 입력 화면이 알려 주는 하단 바 상태(글자 수 · 저장 상태 · 샘플 확인 가능 여부)와 샘플 확인에서 정하는 폰트 이름
  const [inputBar, setInputBar] = useState(null), [fontName, setFontName] = useState('')
  const [removing, setRemoving] = useState(null)
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
  // 헤더 < 는 이 제작 흐름에서 나가기(목록 → 공방, 그 밖 → 목록). 샘플 확인 → 손글씨 입력은 하단 `이전` · 단계 표시가 맡는다(코덱스 2026-11-01)
  // 아무것도 쓰지 않고 입력 화면을 나가면 그 새 폰트는 저장하지 않는다(닫기는 InputScreen 의 닫기 가드가 같은 일을 한다)
  const discardEmpty = async id => {
    const latest = id && workflow.getSnapshot().entries.find(e => e.id === id)
    if (latest && isEmptyDraft(latest)) await workflow.removeDraft(id)
  }
  const back = () => run('입력을 저장하고 있어요.', async () => {
    if (route.screen === 'home' || direct) await closeFontStudio()
    else {
      const leaving = route.screen === 'input' ? route.id : null
      await navigate({ screen: 'home' })
      await discardEmpty(leaving)
    }
  })
  const toInput = () => run('입력으로 돌아가고 있어요.', () => navigate({ screen: 'input', id: route.id }))
  const open = item => run('폰트를 열고 있어요.', () => navigate({ screen: item.status === 'draft' ? 'input' : 'detail', id: item.id }))
  useEffect(() => {
    if (!direct || launched.current || !state.loaded) return
    launched.current = true
    const item = options.open && state.entries.find(e => e.id === options.open)
    if (options.create) start()
    else if (item) open(item)
    else setRoute({ screen: 'home' })
  }, [state.loaded]) // eslint-disable-line react-hooks/exhaustive-deps
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
    await inputSave.current?.(); await workflow.preview(value.id); setFontName(value.name); await navigate({ screen: 'preview', id: value.id })
  })
  // 이름은 샘플을 본 뒤 마지막에 정한다: 바꿨으면 이름부터 저장하고 생성을 확정한다
  const confirmFont = () => run('생성을 예약하고 있어요.', async () => {
    if (fontName.trim() && fontName !== value.name) await workflow.rename(value.id, fontName)
    await workflow.confirm(value.id); await navigate({ screen: 'detail', id: value.id })
  })
  const title = route.screen === 'detail' ? '내 폰트' : '내 폰트 만들기'
  const stepIndex = FONT_STEPS.findIndex(step => step.id === route.screen)
  const steps = stepIndex >= 0 && value ? <MakerSteps steps={FONT_STEPS} current={route.screen} onStep={route.screen === 'preview' ? toInput : null} disabled={Boolean(busy)} label={`${stepIndex + 1}단계 ${FONT_STEPS[stepIndex].label}`} /> : null
  return <SafeAreaView style={s.screen}>
    <MakerHeader title={title} compact={narrow} busy={Boolean(busy)} onBack={back} backLabel="폰트 화면 뒤로가기">
      {width >= 600 && steps}
      <DioButton variant="icon" icon="more" label="폰트 보조 메뉴" selected={more} disabled={Boolean(busy)} onPress={() => setMore(!more)} />
    </MakerHeader>
    {width < 600 && steps ? <View style={s.stepsRow}>{steps}</View> : null}
    <ScrollView ref={scrollRef} testID="handwriting-input-scroll" scrollEnabled={!inputActive} canCancelContentTouches={!inputActive} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, !narrow && s.contentWide, route.screen === 'home' && s.homeContent]}>
      {(error || state.error) ? <Text accessibilityRole="alert" style={s.error}>{error || state.error}</Text> : null}
      {busy ? <Text accessibilityLiveRegion="polite" style={s.notice}>{busy}</Text> : null}
      {more && <View style={s.panel}><Text accessibilityRole="header" style={s.heading}>파일 및 폰트 관리</Text><View style={s.row}>
        <Button onPress={importFile} disabled={Boolean(busy)}>{IS_DEV_BUILD ? '초안·폰트 가져오기' : '폰트 가져오기'}</Button>
        {IS_DEV_BUILD && value?.draft && <Button disabled={Boolean(busy)} onPress={() => run('초안을 저장하고 있어요.', async () => { await inputSave.current?.(); await exportDraft(workflow.getSnapshot().entries.find(e => e.id === value.id).draft) })}>36자 초안 파일 저장</Button>}
        {font && <Button disabled={Boolean(busy) || font.missing} onPress={() => run('폰트를 저장하고 있어요.', () => exportFont(font))}>폰트 파일 저장</Button>}
        {font && <Button disabled={Boolean(busy) || font.missing || font.spacingVersion === FONT_SPACING_VERSION || font.spacingSupported === false} onPress={() => run('글자 간격을 보정하고 있어요.', async () => { await correctRegisteredFont(font); await refreshPersonalFonts(); await workflow.refresh(); setFonts(await loadFontLibrary()) })}>글자 간격 보정</Button>}
      </View>{isAiHandwritingFont(font) && <Text style={s.muted}>{AI_FONT_EXPORT_NOTICE}</Text>}</View>}
      {!state.loaded ? <View style={s.card}><Text style={s.muted}>내 폰트를 불러오고 있어요.</Text><Button onPress={() => run('다시 불러오고 있어요.', () => workflow.init())}>다시 불러오기</Button></View> : route.screen === 'home' ? <View style={[s.home, narrow && s.vertical]}>
        <View style={[s.intro, narrow && s.auto]}><View style={s.eyebrowChip}><Text style={s.eyebrow}>나만의 손글씨</Text></View><Text accessibilityRole="header" style={s.hero}>나만의 폰트 만들기</Text><Text style={s.description}>36자의 손글씨가 한글 11,172자로 이어져요.</Text></View>
        <View style={[s.card, s.library, narrow && s.auto]}><Text accessibilityRole="header" style={s.heading}>내 폰트</Text>{state.entries.length ? state.entries.map(item => <View key={item.id} style={s.libraryRow}><Pressable accessibilityRole="button" accessibilityLabel={`${item.name} ${listStatus(state.entries, item)}`} onPress={() => open(item)} style={s.libraryOpen}>
          <View style={s.grow}><Text style={s.fontName} numberOfLines={2}>{item.name}</Text><Text style={s.muted}>{listStatus(state.entries, item)}</Text>{item.status === 'ready' && (item.jobId || isAiHandwritingFont(fonts.find(f => f.id === item.fontId))) ? <Text style={s.muted}>{AI_FONT_LABEL}</Text> : null}</View><Icon name="chevronRight" size={22} color={colors.textMuted} />
        </Pressable>{/* 작성 중(생성 확정 전)인 폰트만 지울 수 있다 */}{item.status === 'draft' && <DioButton variant="icon" icon="trash" label={`${item.name} 삭제`} disabled={Boolean(busy)} onPress={() => setRemoving(item)} />}</View>) : <Text style={s.empty}>완성할 폰트가 여기에 모여요.</Text>}<Button primary icon="add" label="+ 새로 만들기" onPress={() => start()} disabled={Boolean(busy)}>새로 만들기</Button></View>
      </View> : route.screen === 'launch' ? null : !value ? <Text style={s.error}>폰트 항목을 찾지 못했어요.</Text> : route.screen === 'input' ? <InputScreen key={value.id} workflow={workflow} onInputActiveChange={onInputActiveChange} value={value} narrow={narrow} busy={busy} support={state.support} inputSave={inputSave} onBar={setInputBar} /> : route.screen === 'preview' ? <View style={s.card}>
        <Text accessibilityRole="header" style={s.title}>내 글씨로 만든 샘플이에요</Text><Text style={s.muted}>{AI_FONT_LABEL}</Text><Sample entry={value} />
        <Text style={s.toolLabel}>폰트 이름</Text>
        <TextInput accessibilityLabel="새 폰트 이름" placeholder="폰트 이름" placeholderTextColor={colors.textMuted} value={fontName} onChangeText={setFontName} maxLength={30} style={s.name} editable={!busy} />
      </View> : <View style={s.card}>
        <FontName key={`${value.id}:${value.name}`} entry={value} busy={busy} rename={name => run('이름을 저장하고 있어요.', () => workflow.rename(value.id, name))} />
        {value.status === 'ready' && (value.jobId || isAiHandwritingFont(font)) ? <Text style={s.muted}>{AI_FONT_LABEL}</Text> : null}
        <Text style={s.heading}>샘플 문장</Text><Sample entry={value} font={font} />
        {value.status !== 'ready' && <View style={s.notice}><Text accessibilityLiveRegion="polite" style={s.heading}>{value.status === 'queued' ? `대기 ${queuePosition(state.entries, value.id)}번째` : statusText[value.status]}</Text><Text style={s.muted}>{stages[value.job?.stage] || '진행 상태를 저장해요.'}</Text><Text style={s.progressText}>{completedCount(value).toLocaleString()} / 11,172</Text><View style={s.track}><View style={[s.fill, { width: `${completedCount(value) / SYLLABLE_COUNT * 100}%` }]} /></View></View>}
        {value.error && <Text style={s.error}>{value.error}</Text>}
        {!state.support.available && ['paused', 'failed'].includes(value.status) ? <Text style={s.muted}>{supportReason(state.support.reason) || UNSUPPORTED}</Text> : null}
        <View style={s.row}>{['processing', 'queued'].includes(value.status) && <Button disabled={Boolean(busy)} onPress={() => run('생성을 멈추고 있어요.', () => workflow.control(value.id, 'pause'))}>일시 정지</Button>}{['paused', 'failed'].includes(value.status) && <Button disabled={Boolean(busy) || !state.support.available || value.incompatible} onPress={() => run('생성을 이어가고 있어요.', () => workflow.control(value.id, 'resume'))}>{value.status === 'failed' ? '다시 시도' : '이어서 만들기'}</Button>}{['processing', 'queued', 'paused', 'failed', 'registering'].includes(value.status) && <Button disabled={Boolean(busy)} onPress={() => run('생성을 취소하고 있어요.', () => workflow.control(value.id, 'cancel'))}>생성 취소</Button>}</View>
        <Text style={s.heading}>생성에 사용한 36자</Text>
        {value.draft ? <InputSamples draft={value.draft} /> : <Text style={s.muted}>이 폰트의 원래 입력 기록이 없어 입력을 표시하거나 수정할 수 없어요.</Text>}
        {value.status === 'cancelled' || value.incompatible ? <Button primary disabled={Boolean(busy) || !value.draft} onPress={() => start(value.id)}>입력 수정</Button> : null}
        {value.status === 'ready' && font && <View style={s.row}>{font.missing ? <Text style={s.error}>폰트 파일을 다시 가져와 주세요.</Text> : options.onUse ? <Button primary disabled={!loadedFontFamily(font.id)} onPress={() => { options.onUse(font); closeFontStudio() }}>이 폰트 사용</Button> : <Text style={s.muted}>다이어리 텍스트 도구의 내 폰트에서 선택할 수 있어요.</Text>}</View>}
      </View>}
    </ScrollView>
    {/* 단계 주 버튼은 다른 제작 화면처럼 화면 아래 고정 바에 둔다 */}
    {state.loaded && value && route.screen === 'input' && inputBar ? <MakerBar stacked={narrow} note={<Text testID="handwriting-ai-input-notice" style={s.muted}>{AI_FONT_INPUT_NOTICE}</Text>} left={
      <Text accessibilityLiveRegion="polite" style={s.muted}>{state.support.available ? `${inputBar.count} / 36 · ${inputBar.status}` : supportReason(state.support.reason) || UNSUPPORTED}</Text>}><MakerNav><Button primary disabled={Boolean(busy) || inputBar.disabled || !state.support.available} onPress={showSample}>샘플 확인</Button></MakerNav></MakerBar> : null}
    <ConfirmDialog open={Boolean(removing)} title="이 폰트를 지울까요?" message="작성 중인 손글씨가 모두 사라져요." confirmLabel="삭제" danger
      onCancel={() => setRemoving(null)} onConfirm={() => { const item = removing; setRemoving(null); run('폰트를 지우고 있어요.', () => workflow.removeDraft(item.id)) }} />
    {state.loaded && value && route.screen === 'preview' ? <MakerBar stacked={narrow}>
      <MakerNav onPrev={toInput} prevDisabled={Boolean(busy)}><Button primary disabled={Boolean(busy) || !state.support.available || !fontName.trim()} onPress={confirmFont}>생성 확정</Button></MakerNav>
    </MakerBar> : null}
  </SafeAreaView>
}

function FontName({ entry, busy, rename }) {
  const [name, setName] = useState(entry.name)
  return <View style={s.row}><TextInput accessibilityLabel="폰트 이름 수정" value={name} maxLength={30} onChangeText={setName} style={[s.name, s.grow]} editable={!busy} /><Button disabled={Boolean(busy) || name === entry.name || !name.trim()} onPress={() => rename(name)}>이름 저장</Button></View>
}
function InputScreen({ workflow, value, narrow, busy, support, inputSave, onBar, onInputActiveChange }) {
  // 이름은 샘플 확인 단계에서 정한다. 입력 중에는 지금 이름을 그대로 저장한다
  const [draft, setDraft] = useState(value.draft), name = value.name, [index, setIndex] = useState(0), [penWidth, setPenWidth] = useState(9)
  const [active, setActive] = useState(false), [saveError, setSaveError] = useState(''), [saving, setSaving] = useState(false)
  // 획 다시 실행: 글자 칸마다 되돌린 획을 쌓는다. 그 칸에 새 획을 쓰거나 다시 쓰기를 하면 비운다
  const [redo, setRedo] = useState({})
  const latest = useRef({ draft, name }), autosave = useRef(null)
  if (!autosave.current) autosave.current = createDraftAutosave({
    save: ({draft,name}) => workflow.saveDraft(value.id,draft,name.trim()?name:value.name),
    onStatus: ({pending,error}) => {setSaving(pending);setSaveError(error)},
  })
  const writingCharacter = useRef(null)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [sheetWidth, setSheetWidth] = useState(Math.min(1036, windowWidth - insets.left - insets.right - 64))
  // 원고지 높이: 창 높이에서 상단 바 · 여백 · 펜 굵기 줄 · 하단 바를 뺀 만큼(넓은 화면은 펜 굵기 한 줄 + 하단 바 72, 바 위에 여백이 남게)
  const layout = manuscriptLayout(sheetWidth, Math.max(80, Math.min(520, windowHeight - insets.top - insets.bottom - (narrow ? 274 : 384))), PROMPTS.length)
  const persist = (next, nextName) => {
    latest.current = { draft: next, name: nextName }; setDraft(next)
    autosave.current.update({draft:next,name:nextName})
  }

  useEffect(() => {
    const flush = async () => { await autosave.current.flush(); if (!latest.current.name.trim()) throw new Error('폰트 이름을 입력해 주세요.'); validateDraft(latest.current.draft) }
    inputSave.current = flush
    const remove = setStudioCloseGuard(async () => {
      try {
        await flush()
        // 화면이 닫힌 뒤에 지워야 '폰트 항목을 찾지 못했어요'가 잠깐 비치지 않는다
        if (isEmptyDraft({ ...value, draft: latest.current.draft })) setTimeout(() => { workflow.removeDraft(value.id).catch(() => {}) }, 0)
        return true
      } catch (e) { setSaveError(e.message); return false }
    })
    return () => { if (inputSave.current === flush) inputSave.current = null; remove() }
  }, [value.id, inputSave])
  useEffect(() => {
    autosave.current.activate()
    const subscription = AppState.addEventListener('change',state => {
      if(state !== 'active') autosave.current.flush().catch(()=>{})
    })
    return () => { subscription.remove(); autosave.current.dispose().catch(()=>{}) }
  }, [])
  const character = PROMPTS[index], sample = draft.samples[character], count = PROMPTS.filter(c => draft.samples[c]?.strokes.length).length
  const slider = <Slider label="펜 굵기" minusLabel="펜 가늘게" plusLabel="펜 굵게" {...PEN_WIDTH} value={penWidth} onChange={w => setPenWidth(Math.round(w))} />
  // 하단 바(화면 아래 고정, StudioContent 가 그린다)에 글자 수 · 저장 상태 · 샘플 확인 가능 여부를 알린다
  const barStatus = saving ? '저장 중…' : saveError ? '입력을 저장하지 못했어요. 화면의 입력은 유지돼요.' : '이 기기에 저장됨'
  const barDisabled = count !== 36 || active || saving || Boolean(saveError)
  useEffect(() => { onBar?.({ count, status: barStatus, disabled: barDisabled }) }, [count, barStatus, barDisabled])
  const change = (character, next) => {
    const current = latest.current.draft, samples = { ...current.samples }
    if (next?.strokes.length) samples[character] = next; else delete samples[character]
    persist({ ...current, samples, updatedAt: new Date().toISOString() }, latest.current.name)
  }
  // DrawingPad 는 함수 props 가 바뀌어도 다시 그리지 않는다(DrawingPad.js sameProps). 아래 입력 콜백은 늘 ref(latest · writingCharacter)나 안정된 setState · useCallback 만 읽어야 한다. 렌더마다 바뀌는 state 를 직접 읽으면 첫 렌더 값으로 동작한다.
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
    autosave.current.setWriting(writing)
    setActive(writing)
    onInputActiveChange(writing)
  }
  // 회색 작업 판에는 원고지만 둔다. 도구는 사진 오리기처럼 판 아래 흰 바탕에 둔다(세그먼트 회색 트랙이 판에 묻히지 않게)
  return <View style={s.inputScreen}><View style={s.stage}>
    <View testID="handwriting-sheet-area" style={s.sheetArea} onLayout={event => setSheetWidth(event.nativeEvent.layout.width)}>
      <View testID="handwriting-manuscript" style={{ width: layout.width, height: layout.height }}>
        {Array.from({ length: layout.rows }, (_, row) => <View key={row} style={[s.sheetRow, { height: layout.cell, marginBottom: row + 1 < layout.rows ? layout.gap : 0 }]}>
          {Array.from({ length: layout.columns }, (_, column) => {
            const i = row * layout.columns + column, c = PROMPTS[i]
            return <View key={c || `blank-${i}`} testID={c ? 'handwriting-manuscript-cell' : undefined} style={[s.manuscriptCell, { width: layout.cell, height: layout.cell }, c && index === i && s.manuscriptSelected]}>
              {c && <DrawingPad character={c} sample={draft.samples[c]} onChange={next => { setRedo(value => ({ ...value, [c]: [] })); change(c, next) }} width={penWidth} seamless guideRatio={.5} size={layout.cell}
                disabled={Boolean(busy)}
                canStartInput={() => canStart(c)} onInputStart={() => claimInput(c)} onInputActiveChange={writing => setWriting(c, writing)} />}
            </View>
          })}
        </View>)}
      </View>
    </View></View>
    {/* 펜 굵기: 넓은 화면은 이름 · 편집창 펜과 같은 굵기 막대 · 되돌리기 · 다시 쓰기를 한 줄로, 폰은 이름 줄(오른쪽 되돌리기 · 다시 쓰기) 아래에 막대 */}
    <View style={[s.tools, !narrow && s.toolsWide]}>
      <View style={[s.toolRow, !narrow && s.toolRowWide]}>
        <Text style={s.toolLabel}>펜 굵기</Text>
        {narrow ? <View style={s.grow} /> : null}
        {narrow ? null : <View style={s.slider}>{slider}</View>}
        {narrow ? null : <View style={s.grow} />}
        <DioButton variant="icon" icon="undo" label="획 되돌리기" disabled={Boolean(busy) || !sample || active} onPress={() => {
          setRedo(value => ({ ...value, [character]: [...(value[character] ?? []), sample.strokes.at(-1)] }))
          change(character, { ...sample, strokes: sample.strokes.slice(0, -1) })
        }} />
        <DioButton variant="icon" icon="redo" label="획 다시 실행" disabled={Boolean(busy) || !redo[character]?.length || active} onPress={() => {
          const stroke = redo[character].at(-1)
          setRedo(value => ({ ...value, [character]: value[character].slice(0, -1) }))
          change(character, { coordinateSize: 1024, ...sample, strokes: [...(sample?.strokes ?? []), stroke] })
        }} />
        <DioButton variant="ghost" outline icon="reset" label="다시 쓰기" disabled={Boolean(busy) || !sample || active} onPress={() => { setRedo(value => ({ ...value, [character]: [] })); change(character, null) }} />
      </View>
      {narrow ? <View style={s.slider}>{slider}</View> : null}
    </View>
    {saveError ? <><Text accessibilityRole="alert" style={s.error}>{saveError}</Text><Button onPress={() => { persist(latest.current.draft, latest.current.name); autosave.current.flush().catch(()=>{}) }}>입력 저장 다시 시도</Button></> : null}
  </View>
}
function Sample({ entry, font }) {
  if (font && !font.missing && loadedFontFamily(font.id)) return <Text style={[s.sampleText, { fontFamily: loadedFontFamily(font.id) }]}>{SAMPLE_TEXT}</Text>
  return entry.preview ? <View style={s.sentence}>{[...SAMPLE_TEXT].map((c, i) => c === ' ' ? <View key={i} style={{ width: 12 }} /> : entry.preview[c] ? <Image key={i} accessibilityLabel={c} source={{ uri: entry.preview[c] }} style={s.glyph} /> : null)}</View> : <Text style={s.muted}>{font?.missing ? '폰트 파일을 불러올 수 없어요.' : entry.status === 'ready' ? '샘플을 불러오고 있어요.' : '샘플은 생성 후 확인할 수 있어요.'}</Text>
}
function InputSamples({ draft }) {
  // 칸을 늘려 좌우 끝을 맞춘다(useFillGrid)
  const grid = useFillGrid({ cell: 52, gap: 6 })
  return <View style={s.grid} onLayout={grid.onLayout}>{PROMPTS.map(c => <View key={c} style={[s.thumbnail, { width: grid.cellWidth }]} accessibilityLabel={`${c} 원본 손글씨`}><Svg width={48} height={48} viewBox="0 0 1024 1024">{(draft.samples[c]?.strokes || []).map((stroke, i) => stroke.points.length === 1 ? <Circle key={i} cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill={colors.text} /> : <Path key={i} d={stroke.points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.text} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}</Svg><Text style={s.muted}>{c}</Text></View>)}</View>
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { width: '100%', maxWidth: 1184, alignSelf: 'center', padding: 16, gap: 20, paddingBottom: 40 }, contentWide: { padding: 32, gap: 28 }, homeContent: { flexGrow: 1, justifyContent: 'center' },
  home: { flexDirection: 'row', gap: 32, alignItems: 'center' }, vertical: { flexDirection: 'column', alignItems: 'stretch', gap: 24 },
  intro: { flex: 7, justifyContent: 'center', gap: 14 }, eyebrowChip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.butter }, eyebrow: { color: colors.text, fontSize: 13, fontWeight: '800' },
  hero: { color: colors.text, fontSize: 28, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 }, description: { color: colors.textMuted, fontSize: 15, lineHeight: 24, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: 20, gap: 16 }, stage: { backgroundColor: colors.surfaceMuted, borderRadius: radius.xl, padding: 16, gap: 16 },
  panel: { backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, padding: 16, gap: 12 },
  // 좁은 폰은 세로로 쌓으므로 좌우 비율(flex)을 풀고 내용 높이대로 둔다
  auto: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }, library: { flex: 5 }, libraryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 64, borderBottomWidth: 1, borderColor: colors.border }, libraryOpen: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 }, fontName: { color: colors.text, fontSize: 15, fontWeight: '700' }, grow: { flex: 1, minWidth: 0, gap: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20, fontWeight: '600' }, empty: { color: colors.textMuted, fontSize: 14, fontWeight: '600', paddingVertical: 24, lineHeight: 22 },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '700' }, chipTextOn: { color: colors.primaryText, fontWeight: '800' }, dim: { opacity: DISABLED_OPACITY },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, toolRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, toolLabel: { color: colors.text, fontSize: 14, fontWeight: '800', marginRight: 4 },
  name: { minHeight: 48, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: colors.surface, color: colors.text, fontSize: 16, fontWeight: '700' },
  notice: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 14, color: colors.text, lineHeight: 22, gap: 10 }, error: { color: colors.dangerStrong, fontSize: 14, fontWeight: '700', padding: 12, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, backgroundColor: colors.surface, lineHeight: 21 },
  sheetArea: { width: '100%', alignItems: 'center' }, sheetRow: { flexDirection: 'row' }, manuscriptCell: { borderWidth: .5, borderColor: colors.border, backgroundColor: colors.surface }, manuscriptSelected: { backgroundColor: colors.primarySoft },
  stepsRow: { paddingHorizontal: 16, paddingTop: 10 }, inputScreen: { gap: 20 }, tools: { gap: 10 }, toolsWide: { paddingBottom: 4 }, toolRowWide: { flexWrap: 'nowrap', gap: 16 }, slider: { flexGrow: 1, flexShrink: 1, maxWidth: 420 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, thumbnail: { width: 52, alignItems: 'center', paddingVertical: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  sentence: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 12 }, glyph: { width: 40, height: 40 }, sampleText: { color: colors.text, fontSize: 28, lineHeight: 44, paddingVertical: 16 }, progressText: { color: colors.text, fontSize: 20, fontWeight: '700' }, track: { height: 6, borderRadius: 3, backgroundColor: colors.primarySoft, overflow: 'hidden' }, fill: { height: 6, backgroundColor: colors.primaryStrong },
})
