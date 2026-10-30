import { Component, memo, useMemo, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SvgAst, SvgXml, parse } from 'react-native-svg'
import { templateReference } from '../templates/catalog.js'
import { loadTemplateAst, peekTemplateAst } from '../templates/loadTemplate'
import { colorTemplateAst, normalizePaperAppearance } from '../templates/appearance.js'
import { pageSize } from '../utils/pageGeometry.js'
import { isStudyPlannerId, normalizePlanner, plannerBaseSvg, plannerOverlaySvg } from '../templates/studyPlanner.js'

class SvgBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { this.props.onError(error) }
  render() { return this.state.error ? null : this.props.children }
}

function throwSvgError(error) { throw error }
function RenderedSvg({ xml, ast, width, height, onReady }) {
  const callback = useRef(onReady)
  callback.current = onReady
  // 렌더링이 성공해 커밋된 다음에만 출력 준비 완료를 알린다.
  useEffect(() => { callback.current?.() }, [xml, ast])
  // 내보내기는 준비된 XML을, 편집 화면·썸네일은 캐시의 해석된 SVG(AST)를 그린다.
  return ast
    ? <SvgAst ast={ast} override={{ width, height }} />
    : <SvgXml xml={xml} width={width} height={height} onError={throwSvgError} />
}

function cachedAst(page) {
  try {
    const reference = templateReference(page)
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
    try { reference = templateReference(page) }
    catch (failure) { fail(failure); return undefined }
    if (!reference) { callbacks.current.onReady?.(); return undefined }
    loadTemplateAst(reference).then(ast => { if (active) setSvg({ ast }) }).catch(failure => { if (active) fail(failure) })
    return () => { active = false }
  }, [page.backgroundAssetId, page.templateVersion, preparedXml])

  const appearance = normalizePaperAppearance(page.paperAppearance)
  // 가이드는 종이 바탕과 속지 글씨 사이에만 넣는다. 출력용 XML 경로에는 가이드를 넣지 않는다.
  const guideUnderlay = preparedXml == null ? underlay : null
  const transparentPaper = Boolean(guideUnderlay)
  // 스터디 플래너: 바탕은 캐시한 속지 그대로 두고, 칠한 칸 · 체크 · 합계는 작은 덮개 SVG로 위에 겹친다.
  // 기록이 바뀌어도 덮개만 다시 만들어 지우기 · 칠하기가 가볍다. 시간표 시작 시각을 바꾼 페이지만 바탕을 다시 만든다.
  const planner = preparedXml == null && isStudyPlannerId(page.backgroundAssetId) ? page.planner ?? null : null
  const plannerOrientation = page.backgroundAssetId?.endsWith('portrait') ? 'portrait' : 'landscape'
  const startHour = planner ? normalizePlanner(planner).options.startHour : 6
  const shiftedBase = useMemo(() => startHour === 6 ? null : parse(plannerBaseSvg(plannerOrientation, startHour)), [plannerOrientation, startHour])
  const plannerAst = useMemo(() => planner ? parse(plannerOverlaySvg(plannerOrientation, planner)) : null, [plannerOrientation, planner])
  const baseAst = shiftedBase ?? svg?.ast
  const styledAst = useMemo(() => baseAst ? colorTemplateAst(baseAst, appearance, { transparentPaper }) : null, [baseAst, appearance.backgroundColor, appearance.layoutColor, transparentPaper])
  const styledPlanner = useMemo(() => plannerAst ? colorTemplateAst(plannerAst, appearance) : null, [plannerAst, appearance.backgroundColor, appearance.layoutColor])
  if (page.backgroundAssetId == null) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: appearance.backgroundColor }]}>{guideUnderlay}</View>
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: appearance.backgroundColor }]} pointerEvents="box-none">
    {guideUnderlay}
    {svg && !error && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <SvgBoundary onError={fail}><RenderedSvg xml={svg.xml} ast={styledAst} width={width * zoom} height={height * zoom} onReady={() => callbacks.current.onReady?.()} /></SvgBoundary>
    </View>}
    {svg && !error && styledPlanner && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <SvgBoundary onError={fail}><SvgAst ast={styledPlanner} override={{ width: width * zoom, height: height * zoom }} /></SvgBoundary>
    </View>}
    {/* 속지는 기기에 있는 파일이라 곧바로 준비된다. 준비 전에는 빈 종이로 두고 로딩 문구를 띄우지 않는다. */}
    {error && <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.notice}>{compact ? '내지 로딩 실패' : error.message}</Text>
      {onRetry && <Pressable accessibilityRole="button" accessibilityLabel="내지 다시 불러오기" onPress={onRetry} style={styles.retry}><Text>다시 시도</Text></Pressable>}
    </View>}
  </View>
}

function PageBackground(props) {
  const [attempt, setAttempt] = useState(0)
  const key = [props.page.id, props.page.backgroundAssetId, props.page.templateVersion, attempt].join(':')
  return <BackgroundAttempt key={key} {...props} onRetry={props.preparedXml == null ? () => setAttempt(value => value + 1) : undefined} />
}
export default memo(PageBackground)

const styles = StyleSheet.create({
  notice: { color: '#606BB2', fontSize: 12, padding: 8 },
  error: { alignSelf: 'center', margin: 12, backgroundColor: '#FFF2F0', borderRadius: 8, padding: 6, alignItems: 'center' },
  retry: { padding: 8, backgroundColor: '#FFFFFF', borderRadius: 6 },
})
