import { Component, memo, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { templateReference } from '../templates/catalog.js'
import { loadTemplate } from '../templates/loadTemplate'
import { pageSize } from '../utils/pageGeometry.js'

class SvgBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { this.props.onError(error) }
  render() { return this.state.error ? null : this.props.children }
}

function throwSvgError(error) { throw error }
function RenderedSvg({ xml, width, height, onReady }) {
  const callback = useRef(onReady)
  callback.current = onReady
  // 렌더링이 성공해 커밋된 다음에만 출력 준비 완료를 알린다.
  useEffect(() => { callback.current?.() }, [xml])
  return <SvgXml xml={xml} width={width} height={height} onError={throwSvgError} />
}

function BackgroundAttempt({ page, zoom, preparedXml, onReady, onError, onRetry, compact }) {
  const [xml, setXml] = useState(preparedXml ?? null)
  const [error, setError] = useState(null)
  const callbacks = useRef({ onReady, onError })
  callbacks.current = { onReady, onError }
  const { width, height } = pageSize(page)
  const fail = failure => { setError(failure); callbacks.current.onError?.(failure) }
  useEffect(() => {
    let active = true
    if (preparedXml != null) return undefined
    let reference
    try { reference = templateReference(page) }
    catch (failure) { fail(failure); return undefined }
    if (!reference) { callbacks.current.onReady?.(); return undefined }
    loadTemplate(reference).then(value => { if (active) setXml(value) }).catch(failure => { if (active) fail(failure) })
    return () => { active = false }
  }, [page.backgroundAssetId, page.templateVersion, preparedXml])

  if (page.backgroundAssetId == null) return null
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {xml && !error && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <SvgBoundary onError={fail}><RenderedSvg xml={xml} width={width * zoom} height={height * zoom} onReady={() => callbacks.current.onReady?.()} /></SvgBoundary>
    </View>}
    {!xml && !error && <Text pointerEvents="none" style={styles.notice}>속지 로딩 중…</Text>}
    {error && <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.notice}>{compact ? '속지 로딩 실패' : error.message}</Text>
      {onRetry && <Pressable accessibilityRole="button" accessibilityLabel="속지 다시 불러오기" onPress={onRetry} style={styles.retry}><Text>다시 시도</Text></Pressable>}
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
  notice: { color: '#557496', fontSize: 12, padding: 8 },
  error: { alignSelf: 'center', margin: 12, backgroundColor: '#FFF2F0', borderRadius: 8, padding: 6, alignItems: 'center' },
  retry: { padding: 8, backgroundColor: '#FFFFFF', borderRadius: 6 },
})
