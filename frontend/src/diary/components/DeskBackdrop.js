import { Component, memo, useEffect, useRef } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { DESK_COLORS, LAMP_PATCH, deskLightAt } from '../utils/deskLight'
import { deskFxAt } from '../utils/deskFx'
import { useDeskHour } from '../utils/deskTimeStore'
import { WINDOW_WIDTH, maskFrame, setDeskGeometry } from '../utils/deskMask'

// 창은 하나다: 해 · 가로등 모두 이 마스크 한 장(2×2 십자 창, 좌우 대칭 사다리꼴)만 쓴다. 광원마다 달라지는 건 변형 · 색 · 세기 · 가장자리 번짐뿐이다(코덱스 24시간 설계).
const LIGHT = require('../../../assets/desk/window-light.png')
const RAINBOW = require('../../../assets/desk/rainbow-streak.png')
const DUST = require('../../../assets/desk/dust-motes.png')
const RAINBOW_ASPECT = 0.25 // 1200 × 300
// 빛은 책상 위에 색을 덮어 칠하는 게 아니라 책상을 밝히는 것이다. 책상 전체에는 하늘빛 그늘을 곱해 어둡게 깔고(multiply),
// 창빛 조각은 그 위에 밝기를 더해(screen) 빛이 닿은 곳만 환해지게 한다.
const LIGHT_BLEND = 'screen'

/**
 * 해 질 녘 · 새벽의 잔광(코덱스): 창 마스크가 아니라 책상 아래에서 위로 옅어지는 전체 화면 세로 그라데이션이다(soft-light).
 * 아래 0%는 불투명도 전체, 38% 높이에서 0.72배, 78% 높이에서 투명이라 큰 색 판을 칠하지 않고 노을의 공기만 남긴다. 창빛 조각 아래에 깔고 UI 는 물들이지 않는다.
 */
function Afterglow({ afterglow }) {
  return <View pointerEvents="none" style={[styles.fill, { mixBlendMode: 'soft-light' }]}>
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs><LinearGradient id="afterglow" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0.22" stopColor={afterglow.color} stopOpacity={0} />
        <Stop offset="0.62" stopColor={afterglow.color} stopOpacity={afterglow.opacity * 0.72} />
        <Stop offset="1" stopColor={afterglow.color} stopOpacity={afterglow.opacity} />
      </LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#afterglow)" />
    </Svg>
  </View>
}

/** 마스크 한 겹. patch 변형(늘어남 · 기울기 · 회전)과 자리는 그 광원의 것이고, extra 는 번짐 사본의 확대 · px 이동이다. */
function maskLayer({ key, patch, size, compact, lightWidth, opacity, tint, blend = LIGHT_BLEND, scale = 1, shift = [0, 0] }) {
  const frame = maskFrame(patch, size, compact)
  const { height, transform } = frame
  const left = frame.left + shift[0]
  const top = frame.top + shift[1]
  if (scale !== 1) transform.push({ scale })
  return <Image key={key} source={LIGHT} resizeMode="stretch"
    style={{ position: 'absolute', width: lightWidth, height, left, top, opacity, tintColor: tint, mixBlendMode: blend, transform }} />
}

/**
 * 창빛 조각 한 장(그 순간의 주 광원 = 해). 같은 마스크를 시각의 변형으로 놓고 세 층(흰 밝기 screen · 시간대 색 multiply · soft-light 색)을 얹는다.
 * 해 조각에는 연출(fx)을 겹친다: 번짐광 · 유리에서 꺾인 파랑/주황 가장자리 · 무지개 띠 · 빛 속 먼지. 
 */
function LightPatch({ light, fx, size, compact, lightWidth }) {
  const { patch, screen, tint, accent } = light
  const base = { patch, size, compact, lightWidth }
  const { height, left, top } = maskFrame(patch, size, compact)
  const fxStrength = fx.visible * light.sun
  const fxLayer = (key, extra, opacity, color) => maskLayer({ ...base, key, opacity, tint: color, scale: extra.scale, shift: [(extra.dx ?? 0) * lightWidth, (extra.dy ?? 0) * lightWidth] })
  return <>
    {fxStrength > 0.001 && fxLayer('glow', { scale: 1.075, dx: fx.dx, dy: fx.dy }, 0.09 * fxStrength, light.wash.color)}
    {fxStrength > 0.001 && fxLayer('cool', { scale: 1.008, dx: fx.dx - 0.012, dy: fx.dy - 0.004 }, fx.strength * fxStrength, fx.cool)}
    {fxStrength > 0.001 && fxLayer('warm', { scale: 0.992, dx: fx.dx + 0.012, dy: fx.dy + 0.004 }, fx.strength * fxStrength, fx.warm)}
    {screen.opacity > 0.001 && maskLayer({ ...base, key: 'screen', opacity: screen.opacity, tint: '#FFFFFF' })}
    {tint.opacity > 0.001 && maskLayer({ ...base, key: 'tint', opacity: tint.opacity, tint: tint.color, blend: 'multiply' })}
    {accent.opacity > 0.001 && maskLayer({ ...base, key: 'accent', opacity: accent.opacity, tint: accent.color, blend: 'soft-light' })}
    {fxStrength > 0.001 && <Image source={RAINBOW} resizeMode="stretch"
      style={{ position: 'absolute', width: lightWidth * 0.775, height: lightWidth * 0.775 * RAINBOW_ASPECT,
        left: left + lightWidth / 2 + (fx.dx - 0.18) * lightWidth - lightWidth * 0.3875, top: top + height / 2 + (fx.dy + 0.19) * lightWidth - lightWidth * 0.775 * RAINBOW_ASPECT / 2, opacity: fx.rainbow * fxStrength, mixBlendMode: LIGHT_BLEND }} />}
    {fxStrength > 0.001 && <Image source={DUST} resizeMode="stretch"
      style={{ position: 'absolute', width: lightWidth, height, left, top, opacity: fx.mote * fxStrength, tintColor: '#FFFBEF', mixBlendMode: LIGHT_BLEND }} />}
  </>
}

// 가로등의 빛 층(코덱스 가로등 단독 밤). 위에서부터 그린다: 넓은 번짐 → 오른쪽 위 쪽으로 더 밝은 기울기 사본 → 따뜻한 코어 → 호박색 몸통 → 약한 곱하기 접촉색.
// opacity 는 행의 lampOpacity 에 곱하는 비율이다. 푸른 기운이 없도록 모든 층의 색을 옅은 골드 · 황백색 계열로 명시한다(3000–3500K 느낌, 호박색보다 노랗고 하얗게).
const LAMP_LAYERS = [
  { name: 'outer', blend: 'screen', tint: '#E1A45A', ratio: 0.03, scale: 1.15, shifts: [[-5, 0], [5, 0], [0, -4], [0, 4]] },
  { name: 'wide', blend: 'screen', tint: '#F4C778', ratio: 0.115, scale: 1.065, shifts: [[-2, -1], [2, 1]] },
  { name: 'falloff', blend: 'screen', tint: '#FFF0C7', ratio: 0.32, scale: 1.035, shifts: [[7, -6]] },
  { name: 'core', blend: 'screen', tint: '#FFD98B', ratio: 1, scale: 1, shifts: [[0, 0]] },
  { name: 'body', blend: 'soft-light', tint: '#EFC06A', ratio: 0.58, scale: 0.992, shifts: [[0, 0]] },
  { name: 'contact', blend: 'multiply', tint: '#C18B4C', ratio: 0.16, scale: 0.986, shifts: [[1, 1]] },
]

/** 가로등: 같은 마스크를 오른쪽 위 고정 변환으로 따뜻하게 비춘다. 푸른 달빛 없이 이 빛 하나가 밤의 직접광이다. */
function NightLamp({ light, size, compact, lightWidth }) {
  const [x, y, scaleX, scaleY, skewX, rotate] = LAMP_PATCH.patch
  const base = { patch: { x, y, scaleX, scaleY, skewX, rotate }, size, compact, lightWidth }
  return <>
    {LAMP_LAYERS.flatMap(spec => spec.shifts.map((shift, index) =>
      maskLayer({ ...base, key: `${spec.name}${index}`, opacity: light.lampOpacity * spec.ratio, tint: spec.tint, blend: spec.blend, scale: spec.scale, shift })))}
  </>
}

/**
 * 다이어리 홈 '햇살 책상' 바탕 (세계 층). 누르지 않고 화면 읽기에서 숨긴다.
 * 단색 상판(공방 · 휴지통과 같은 앱 바탕색) + 시각에 따라 자리 · 세기 · 색이 바뀌는 십자 창빛 + 밤 어둠.
 * 시각: 지금 시각(deskTimeStore).
 */
function DeskBackdrop({ compact = false, size, anchorRight = false }) {
  const light = deskLightAt(useDeskHour())
  const root = useRef(null)
  // 크기가 그대로면 다시 재지 않는다. 사이드 메뉴를 여닫는 동안 부모 안에서의 자리만 프레임마다 바뀌어 onLayout 이 계속 오는데,
  // 그때마다 measureInWindow(비동기 브리지 호출)를 부르면 끊긴다. 화면 안 자리는 그대로다.
  const laidOut = useRef(null)
  const measure = event => {
    const { width, height } = event?.nativeEvent?.layout ?? {}
    if (laidOut.current && laidOut.current.width === width && laidOut.current.height === height && laidOut.current.compact === compact) return
    laidOut.current = { width, height, compact }
    root.current?.measureInWindow?.((x, y, w, h) => setDeskGeometry({ x, y, width: w, height: h, compact }))
  }
  useEffect(() => () => setDeskGeometry(null), [])
  if (!size?.width || !size?.height) return null
  const lightWidth = size.width * (compact ? WINDOW_WIDTH.phone : WINDOW_WIDTH.tablet)
  const fx = deskFxAt(light.hour)
  return <View ref={root} onLayout={measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.root, anchorRight && styles.rootRight, { width: size.width, height: size.height }]}>
    {/* 상판은 그림 없이 root 의 단색(DESK_COLORS.base)이다. 그 위에 시간대 그늘 · 창빛만 얹는다 */}
    <View style={[styles.fill, { backgroundColor: light.ambient.color, opacity: light.ambient.opacity, mixBlendMode: 'multiply' }]} />
    <View style={[styles.fill, { backgroundColor: light.wash.color, opacity: light.wash.opacity }]} />
    {/* 밤 어둠은 빛 아래에 깐다: 위에 덮으면 가로등 · 달빛까지 같이 어두워져 묻힌다 */}
    {light.dim > 0.001 && <View style={[styles.fill, { backgroundColor: `rgba(16,25,47,${light.dim.toFixed(3)})` }]} />}
    {light.afterglow.opacity > 0.001 && <Afterglow afterglow={light.afterglow} />}
    {light.key !== 'afterglow' || light.screen.opacity > 0.001 ? <LightPatch light={light} fx={fx} size={size} compact={compact} lightWidth={lightWidth} /> : null}
    {light.lampOpacity > 0.001 && <NightLamp light={light} size={size} compact={compact} lightWidth={lightWidth} />}
  </View>
}

/** 책상은 꾸밈이라, 그리다 실패해도 보관함 화면(다이어리 · 버튼)까지 같이 죽지 않게 막는다. */
class SafeDeskBackdrop extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(prev) { if (this.state.failed && prev.size !== this.props.size) this.setState({ failed: false }) }
  componentDidCatch(error) { if (__DEV__) console.warn('DeskBackdrop 을 그리지 못했어요:', error?.message) }
  render() { return this.state.failed ? null : <DeskBackdrop {...this.props} /> }
}

export default memo(SafeDeskBackdrop)

const styles = StyleSheet.create({
  // 크기는 부모가 잰 값(size)으로 고정한다. top · bottom 으로 늘리면 안드로이드가 안의 요소 크기에 끌려가 화면보다 커졌다.
  root: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', isolation: 'isolate', backgroundColor: DESK_COLORS.base },
  // 오른쪽 끝에 붙인다: 작업 영역이 왼쪽(사이드바 쪽)에서 줄고 늘어도 상판은 제자리에 있고, 왼쪽만 가려진다.
  rootRight: { left: undefined, right: 0 },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
})
