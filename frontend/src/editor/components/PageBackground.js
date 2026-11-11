import { Component, Fragment, memo, useMemo, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SvgAst, SvgXml, parse } from 'react-native-svg'
import { templateReference } from '../templates/catalog.js'
import { loadTemplateAst, peekTemplateAst } from '../templates/loadTemplate'
import { colorTemplateAst, normalizePaperAppearance } from '../templates/appearance.js'
import { pageSize } from '../utils/pageGeometry.js'
import { plannerFor, paperDeviceFontIds } from '../templates/planners.js'
import { inkRecordValue, isInkRecordId } from '../templates/inkRecord.js'
import { isTastingId } from '../templates/tastingGeometry.js'
import { tastingElementValue } from '../templates/tastingElements.js'
import { subscribeTemplateLoaded } from '../templates/templateLoadedSignal.js'
import { swapPaperFont } from '../templates/paperFont.js'
import { useTextFont } from '../hooks/useTextFont'
import { colors } from '../../shared/theme'
import { KeepFont } from '../../shared/fontScope'
import { omitFilledAlbumBordersAst } from '../templates/photoAlbumAst.js'
import { visibleAlbumSlotIndices } from '../templates/photoAlbumSlots.js'

// 속지 · 특수 속지 · 캔버스 요소는 정해진 글꼴을 그대로 쓴다(앱 UI 글꼴 Pretendard 를 넣지 않는다). 가짜 모듈인 테스트에서는 Fragment 로 그린다
const Keep = KeepFont ?? Fragment

class SvgBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { this.props.onError(error) }
  render() { return this.state.error ? null : this.props.children }
}

function throwSvgError(error) { throw error }
// 요소가 바뀌어 BackgroundAttempt 가 다시 그려져도 속지 SVG 는 그대로 둔다(onReady 는 매번 새 함수라 비교에서 뺀다 — 최신 값은 ref 로 부른다)
const RenderedSvg = memo(function RenderedSvg({ xml, ast, width, height, onReady }) {
  const callback = useRef(onReady)
  callback.current = onReady
  // 렌더링이 성공해 커밋된 다음에만 출력 준비 완료를 알린다.
  useEffect(() => { callback.current?.() }, [xml, ast])
  // 내보내기는 준비된 XML을, 편집 화면·썸네일은 캐시의 해석된 SVG(AST)를 그린다.
  return ast
    ? <SvgAst ast={ast} override={{ width, height }} />
    : <SvgXml xml={xml} width={width} height={height} onError={throwSvgError} />
}, (previous, next) => previous.xml === next.xml && previous.ast === next.ast && previous.width === next.width && previous.height === next.height)

// 속지 글꼴을 골랐으면 그 글꼴로 바꾼 속지를 불러온다(캐시 키가 다르다)
const referenceOf = page => { const reference = templateReference(page); return reference ? { ...reference, font: normalizePaperAppearance(page.paperAppearance).font } : null }

function cachedAst(page) {
  try {
    const reference = referenceOf(page)
    return reference ? peekTemplateAst(reference) ?? null : null
  } catch { return null }
}

function BackgroundAttempt({ page, zoom, preparedXml, onReady, onError, onRetry, compact, underlay }) {
  // svg: 내보내기면 { xml }(준비된 원본), 화면 표시면 { ast }(캐시의 해석 결과)
  const [svg, setSvg] = useState(() => {
    if (preparedXml != null) return { xml: preparedXml }
    const ast = cachedAst(page)
    return ast ? { ast } : null
  })
  const [error, setError] = useState(null)
  const callbacks = useRef({ onReady, onError })
  callbacks.current = { onReady, onError }
  const { width, height } = pageSize(page)
  const fail = failure => { setError(failure); callbacks.current.onError?.(failure) }
  useEffect(() => {
    let active = true
    if (preparedXml != null || svg) return undefined
    let reference
    try { reference = referenceOf(page) }
    catch (failure) { fail(failure); return undefined }
    if (!reference) { callbacks.current.onReady?.(); return undefined }
    loadTemplateAst(reference).then(ast => { if (active) setSvg({ ast }) }).catch(failure => { if (active) fail(failure) })
    return () => { active = false }
  }, [page.backgroundAssetId, page.templateVersion, preparedXml])

  // 축소 표시(compact: 페이지 목록 썸네일 · 정적 페이지)는 실패해도 문구 · 재시도 버튼을 두지 않는다 — 작은 칸에서 페이지 선택과 경쟁했다(S15P31F106-724).
  // 빈 종이로 두고, 본문 캔버스의 '다시 시도'로 캐시가 채워지면 그 캐시로 스스로 복구한다: 캐시 채움 신호를 구독해(다시 그려지기를 기다리지 않는다) 실패 상태를 푼다.
  // 실패 안내와 재시도는 본문 캔버스 한 곳에서만 보인다.
  useEffect(() => {
    if (!compact || !error || preparedXml != null) return undefined
    return subscribeTemplateLoaded(() => {
      const ast = cachedAst(page)
      if (ast) { setSvg({ ast }); setError(null) }
    })
  }, [compact, error, preparedXml, page.backgroundAssetId, page.templateVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const recovered = error && compact && preparedXml == null ? cachedAst(page) : null
  const shown = recovered ? { ast: recovered } : svg
  const failed = Boolean(error) && !recovered
  const appearance = normalizePaperAppearance(page.paperAppearance)
  // 가이드는 종이 바탕과 속지 글씨 사이에만 넣는다. 출력용 XML 경로에는 가이드를 넣지 않는다.
  const guideUnderlay = preparedXml == null ? underlay : null
  const transparentPaper = Boolean(guideUnderlay)
  // 스터디 · 데일리 플래너: 바탕은 캐시한 속지 그대로 두고, 칠한 칸 · 일정 · 체크 · 합계는 작은 덮개 SVG로 위에 겹친다.
  // 기록이 바뀌어도 덮개만 다시 만들어 지우기 · 칠하기가 가볍다. 시간표 시작 시각을 바꾼 페이지만 바탕을 다시 만든다.
  const plannerApi = useMemo(() => preparedXml == null ? plannerFor(page.backgroundAssetId) : null, [page.backgroundAssetId, preparedXml])
  // 테이스팅 속지만 채움이 요소(page.objects)에 있다. 다른 플래너는 요소가 바뀔 때마다 덮개를 다시 만들지 않는다(끌기 · 편집 매 프레임 파싱 방지, MR !503 리뷰)
  const tastingObjects = isTastingId(page.backgroundAssetId) && !page.tastingDraft ? page.objects : null
  // 발색 기록도 값이 요소에서 나온다 — 병을 칠한 획의 색을 읽는다(page.planner 에 저장하지 않는다).
  // **획만** 본다. 사진 · 스티커를 끄는 동안에도 page.objects 는 매 프레임 새로 생기는데, 그때마다
  // 여섯 칸 x 모든 획 x 병 윤곽을 다시 재면 끌기가 끊긴다(코드리뷰 2026-11-11).
  const strokesRef = useRef([])
  const inkRecordStrokes = useMemo(() => {
    if (!isInkRecordId(page.backgroundAssetId)) return null
    const next = (page.objects ?? []).filter(object => object?.type === 'stroke' && !object.hidden)
    const previous = strokesRef.current
    if (previous.length === next.length && previous.every((object, i) => object === next[i])) return previous
    strokesRef.current = next
    return next
  }, [page.backgroundAssetId, page.objects])
  const objectValue = tastingObjects ?? inkRecordStrokes
  const planner = useMemo(() => !plannerApi ? null
    : tastingObjects ? tastingElementValue(page)
    : inkRecordStrokes ? inkRecordValue(page.backgroundAssetId, inkRecordStrokes)
    : page.planner ?? null, [plannerApi, preparedXml, page.backgroundAssetId, page.planner, tastingObjects, inkRecordStrokes]) // eslint-disable-line react-hooks/exhaustive-deps
  // 요소에서 나온 값은 요소가 바뀔 때마다 객체가 새로 생기므로, 채움 내용(문자열)이 같으면 덮개를 그대로 둔다
  const plannerKey = objectValue ? JSON.stringify(planner) : planner
  // 데일리 플래너는 할 일 글(글상자)을 막대 · 종일 칸에 비춰 그리므로, 글이 바뀌면 덮개도 다시 만든다.
  const titles = plannerApi?.titles(page.objects) ?? null, titleKey = titles ? JSON.stringify(titles) : ''
  const startHour = planner ? plannerApi.startHour(planner) : 6
  const shiftedBase = useMemo(() => !plannerApi || startHour === 6 ? null : parse(swapPaperFont(plannerApi.baseSvg(startHour), appearance.font)), [plannerApi, preparedXml, startHour, appearance.font])
  const plannerAst = useMemo(() => !plannerApi || !(planner || (titleKey && titleKey !== '{}')) ? null : parse(swapPaperFont(plannerApi.overlaySvg(planner, page.objects), appearance.font)), [plannerApi, preparedXml, plannerKey, titleKey, appearance.font]) // eslint-disable-line react-hooks/exhaustive-deps
  const baseAst = shiftedBase ?? shown?.ast
  const filledAlbumKey = visibleAlbumSlotIndices(page).join(',')
  const styledAst = useMemo(() => baseAst ? omitFilledAlbumBordersAst(colorTemplateAst(baseAst, appearance, { transparentPaper }), page) : null, [baseAst, appearance.backgroundColor, appearance.layoutColor, transparentPaper, filledAlbumKey])
  const styledPlanner = useMemo(() => plannerAst ? colorTemplateAst(plannerAst, appearance) : null, [plannerAst, appearance.backgroundColor, appearance.layoutColor])
  if (page.backgroundAssetId == null) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: appearance.backgroundColor }]}>{guideUnderlay}</View>
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: appearance.backgroundColor }]} pointerEvents="box-none">
    {guideUnderlay}
    {shown && !failed && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <SvgBoundary onError={fail}><RenderedSvg xml={shown.xml} ast={styledAst} width={width * zoom} height={height * zoom} onReady={() => callbacks.current.onReady?.()} /></SvgBoundary>
    </View>}
    {shown && !failed && styledPlanner && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <SvgBoundary onError={fail}><SvgAst ast={styledPlanner} override={{ width: width * zoom, height: height * zoom }} /></SvgBoundary>
    </View>}
    {/* 속지는 기기에 있는 파일이라 곧바로 준비된다. 준비 전에는 빈 종이로 두고 로딩 문구를 띄우지 않는다. */}
    {failed && !compact && <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.notice}>{error.message}</Text>
      {onRetry && <Pressable accessibilityRole="button" accessibilityLabel="속지 다시 불러오기" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable>}
    </View>}
  </View>
}

// 글꼴 상태 문자열(useTextFont)을 한 번만 바뀌는 값으로 줄인다. 하나라도 불러오는 중이면 'loading', 모두 끝나면(실패 포함) 'settled', 쓰는 글꼴이 없으면 ''.
// 마루부리 Regular · Bold 가 따로 도착해도 속지는 한 번만 다시 그리고, 처음부터 불러와 있으면 다시 그리지 않는다.
export const fontPhase = (snapshot) => snapshot.includes(':loading') ? 'loading' : snapshot ? 'settled' : ''

// 속지를 처음부터 다시 그리는 키. 글꼴 상태(printedFont)가 들어 있어, 속지가 쓰는 글꼴을 불러오면 속지를 다시 그린다(SVG 는 글꼴이 늦게 와도 저절로 바뀌지 않는다).
export const backgroundKey = (page, printedFont, attempt) => [page.id, page.backgroundAssetId, page.templateVersion, normalizePaperAppearance(page.paperAppearance).font ?? '', printedFont, attempt].join(':')

function PageBackground(props) {
  const [attempt, setAttempt] = useState(0)
  // 속지가 앱 글꼴로 그리는 글 — 데일리 플래너가 비추는 글(마루부리)과, 원본이 아닌 속지 글꼴로 바뀐 인쇄 글자.
  // 쓰일 때 불러오고, 불러오면(아래 key 가 바뀌어) 속지를 다시 그린다. 글꼴은 많아야 둘이라 훅도 둘로 고정한다.
  const fontIds = paperDeviceFontIds(props.page.backgroundAssetId, normalizePaperAppearance(props.page.paperAppearance).font)
  // 두 상태 문자열('가족:loaded|가족:loading')을 | 로 이어 fontPhase 가 받는 모양 그대로 넘긴다.
  // 글꼴이 둘을 넘지 않는다는 것은 tests/paper-font.test.js 가 지킨다(셋째부터는 불러오지 않게 된다).
  const printedFont = fontPhase([useTextFont(fontIds[0] ?? null, true), useTextFont(fontIds[1] ?? null, true)].filter(Boolean).join('|'))
  // 속지 글꼴이 바뀌면 처음부터 다시 불러온다
  const key = backgroundKey(props.page, printedFont, attempt)
  return <Keep><BackgroundAttempt key={key} {...props} onRetry={props.preparedXml == null ? () => setAttempt(value => value + 1) : undefined} /></Keep>
}
export default memo(PageBackground)

const styles = StyleSheet.create({
  // 실패 칸도 앱 색(옅은 면 + 보라 글자)으로: 예전 분홍(#FFF2F0) 상자 · 시스템 글자는 색 규칙 밖이었다
  notice: { color: colors.primaryText, fontSize: 12, fontWeight: '600', padding: 8 },
  error: { alignSelf: 'center', margin: 12, backgroundColor: colors.surfaceMuted, borderRadius: 10, padding: 6, alignItems: 'center' },
  retry: { minHeight: 32, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  retryText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
})
