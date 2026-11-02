import { useLayoutEffect, useMemo, useState } from 'react'
import { Animated, Platform, StyleSheet, View } from 'react-native'
import StaticPage from './StaticPage'
import { normalizePaperAppearance } from '../../templates/appearance'

// 가로 그라데이션 띠. stops: [[위치 0~1, 투명도]] (검정 기준)
// 띠를 쌓거나 SVG 를 쓰면 이음선이 보이거나 반전될 때 안 그려져서, 스타일의 linear-gradient 를 쓴다. (RN 0.88 네이티브 · 웹 CSS 모두 지원)
function Shade({ stops, style }) {
  const image = `linear-gradient(to right, ${stops.map(([at, alpha]) => `rgba(0,0,0,${alpha}) ${Math.round(at * 100)}%`).join(', ')})`
  return <Animated.View pointerEvents="none" style={[styles.fill, style, { backgroundImage: image }]} />
}

// 접힌 조각의 가장자리가 아래 앞면에 드리우는 그림자 번짐 폭. 이게 없으면 조각과 앞면이 같은 흰 종이라 경계가 안 보인다.
// 그림자 세기 · 번짐 · 그라데이션 정지점은 코덱스 조정값(2026-11-02)
const flapEdgeBlur = (W, H) => Math.max(7, Math.hypot(W, H) * 0.0135)
const FLAP_EDGE_ALPHA = 0.24

const SAMPLES = 240 // 접힘선 위치를 이만큼 찍어 두고 그 사이를 이어서 움직인다 (Animated 는 직선 보간만 한다)
/**
 * 접힘선 기하. 오른쪽 가장자리의 한 점 C 를 잡아 왼쪽으로 끌어 T 로 옮기면(이전 페이지는 전체를 좌우로 뒤집어 쓴다)
 * 접힘선은 C 와 T 의 수직이등분선이고, 접힌 조각은 접힘선을 기준으로 뒤집힌 종이 뒷면이다.
 *  - lift = 0 (가운데): T 가 같은 높이로 움직여 접힘선이 곧은 세로선
 *  - lift ≠ 0 (위·아래): T 가 모서리 쪽에서 안쪽으로 올라왔다 내려와 접힘선이 대각선
 * 반평면 하나를 '기울어진 잘라내기 상자'로 만든다: 상자(D × 2D)를 접힘선 위 점 P 에 오른쪽 가운데가 오게 놓고 각도 α 만큼 돌린 뒤
 * overflow 를 잘라내면 접힘선 한쪽만 보인다. 그 안의 페이지는 -α 로 되돌려 똑바로 세운다.
 * at(p): progress p 에서 상자·페이지 위치와 각도를 정확히 계산한다. (표본을 이어 붙이면 제자리여야 할 앞면이 떨렸다)
 */
function fold(W, H, lift) {
  const diagonal = Math.hypot(W, H)
  const D = diagonal * 1.1
  const castBand = diagonal * 0.06
  const cy = H / 2 + lift * H / 2
  const at = (p) => {
    // p=0 에서는 길이가 0 이라 방향이 정해지지 않으므로 극한 방향을 쓴다. p=1 은 세로 접힘선(책등).
    const e = p === 0 ? 1e-4 : p
    const vx = 2 * W * e, vy = lift * 0.5 * H * Math.sin(Math.PI * e)
    const len = Math.hypot(vx, vy)
    const n = { x: vx / len, y: vy / len }
    const P = { x: W - vx / 2, y: cy - vy / 2 }
    const alpha = Math.atan2(n.y, n.x)
    const cos = Math.cos(alpha), sin = Math.sin(alpha)
    const Cc = { x: P.x - n.x * D / 2, y: P.y - n.y * D / 2 } // 상자 가운데 (세계 좌표)
    const toLocal = (Q) => {
      const dx = Q.x - Cc.x, dy = Q.y - Cc.y
      return { x: dx * cos + dy * sin + D / 2, y: -dx * sin + dy * cos + D }
    }
    const Q = { x: W / 2, y: H / 2 }
    const side = (Q.x - P.x) * n.x + (Q.y - P.y) * n.y
    const Cr = { x: P.x + n.x * D / 2, y: P.y + n.y * D / 2 } // 드러나는 쪽(접힘선 바깥) 상자 가운데
    const reveal = (() => {
      const dx = Q.x - Cr.x, dy = Q.y - Cr.y
      return { x: dx * cos + dy * sin + D / 2, y: -dx * sin + dy * cos + D }
    })()
    const flap = toLocal({ x: Q.x - 2 * side * n.x, y: Q.y - 2 * side * n.y }) // 페이지 가운데를 접힘선 너머로 뒤집은 자리
    const cast = { x: P.x + n.x * castBand / 2, y: P.y + n.y * castBand / 2 }
    return {
      px: P.x, py: P.y, nx: n.x, ny: n.y,
      deg: alpha * 180 / Math.PI,
      boxLeft: Cc.x - D / 2, boxTop: Cc.y - D,
      revealBoxLeft: Cr.x - D / 2, revealBoxTop: Cr.y - D,
      revealLeft: reveal.x - W / 2, revealTop: reveal.y - H / 2,
      flapLeft: flap.x - W / 2, flapTop: flap.y - H / 2,
      castLeft: cast.x - castBand / 2, castTop: cast.y - D,
    }
  }
  return { D, castBand, at }
}

/**
 * 책장 넘기기(읽기 모드): 종이를 잡고 접어 넘긴다. 가운데를 잡으면 곧게, 위·아래 모서리를 잡으면 대각선으로 접힌다.
 *  - 접힘선 안쪽: 아직 안 넘어간 앞면 (제자리, 불투명)
 *  - 접힘선 너머로 접혀 넘어온 조각: 종이 뒷면. 접힘선 쪽이 어둡다.
 *  - 접힘선 바깥: 새 페이지. 접힌 종이가 드리운 그림자가 접힘선 쪽에 깔린다.
 * dir: 1 다음 페이지(오른쪽에서 왼쪽으로 넘김), -1 이전 페이지(좌우 반대). lift: utils/pageTurn 의 turnLift 참고.
 * progress: Animated.Value 0(안 넘어감) → 1(다 넘어감)
 */
function NativePageTurn({ page, from, zoom, width, height, dir, lift = 0, progress }) {
  const w = width * zoom, h = height * zoom
  const paper = normalizePaperAppearance((from ?? page).paperAppearance).backgroundColor // 뒷면은 넘어가는(앞장) 속지 색과 같게
  const revealPaper = normalizePaperAppearance(page.paperAppearance).backgroundColor
  const { D, castBand, rows } = useMemo(() => {
    const { D, castBand, at } = fold(w, h, lift)
    return { D, castBand, rows: Array.from({ length: SAMPLES + 1 }, (_, i) => ({ p: i / SAMPLES, ...at(i / SAMPLES) })) }
  }, [w, h, lift])
  // 상자 위치·각도·페이지 위치는 전부 progress 하나에서 파생시킨다. (값을 따로 setValue 하면 서로 다른 때에 반영돼 앞면이 밀렸다)
  // 표본을 촘촘히 잡아 직선 보간 오차를 1px 아래로 줄인다.
  // 넘기는 도중 다시 그려져도 보간 노드를 새로 만들지 않는다 (표본 241칸 × 12개)
  const { alpha, unAlpha, boxLeft, boxTop, revealBoxLeft, revealBoxTop, revealLeft, revealTop, flapLeft, flapTop, castLeft, castTop, castFade } = useMemo(() => {
    const input = rows.map((row) => row.p)
    const track = (key, format = (value) => value) => progress.interpolate({ inputRange: input, outputRange: rows.map((row) => format(row[key])), extrapolate: 'clamp' })
    const deg = (value) => `${value}deg`
    return {
      alpha: track('deg', deg), unAlpha: track('deg', (value) => deg(-value)),
      boxLeft: track('boxLeft'), boxTop: track('boxTop'), revealBoxLeft: track('revealBoxLeft'), revealBoxTop: track('revealBoxTop'), revealLeft: track('revealLeft'), revealTop: track('revealTop'),
      flapLeft: track('flapLeft'), flapTop: track('flapTop'), castLeft: track('castLeft'), castTop: track('castTop'),
      castFade: progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 0.9, 0], extrapolate: 'clamp' }),
    }
  }, [progress, rows])
  const sx = dir > 0 ? 1 : -1 // 이전 페이지는 전체를 좌우로 뒤집어 계산하므로 페이지 그림은 한 번 더 뒤집어 바로 세운다
  const flapBand = Math.hypot(w, h) * 0.1
  // 위치는 left/top 이 아니라 translate 로 옮긴다: 레이아웃을 건드리지 않아 네이티브 드라이버로 UI 스레드에서
  // 상자·앞면·뒷면·그림자가 같은 프레임에 한꺼번에 갱신된다. (JS 에서 따로 갱신하면 앞면이 몇 px 밀려 떨렸다)
  const box = { position: 'absolute', left: 0, top: 0, width: D, height: 2 * D, overflow: 'hidden' }
  const boxMove = { transform: [{ translateX: boxLeft }, { translateY: boxTop }, { rotate: alpha }] }
  return (
    <View pointerEvents="none" style={[styles.fill, styles.clip, { transform: [{ scaleX: sx }] }]}>
      {/* 접힘선 바깥에 드러나는 새 페이지. 앞장(지금 보이는 캔버스)은 건드리지 않고 이 덮개만 움직인다 */}
      <Animated.View style={[box, { transform: [{ translateX: revealBoxLeft }, { translateY: revealBoxTop }, { rotate: alpha }] }]}>
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: [{ translateX: revealLeft }, { translateY: revealTop }, { rotate: unAlpha }, { scaleX: sx }] }}>
          <StaticPage page={page} zoom={zoom} background={revealPaper} still />
        </Animated.View>
      </Animated.View>

      {/* 드러난 새 페이지 위에 접힌 종이가 드리우는 그림자 */}
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: castBand, height: 2 * D, opacity: castFade, overflow: 'hidden', transform: [{ translateX: castLeft }, { translateY: castTop }, { rotate: alpha }] }}>
        <Shade stops={[[0, 0.3], [0.28, 0.18], [0.62, 0.045], [1, 0]]} />
      </Animated.View>

      {/* 접혀 넘어온 조각: 접힘선을 기준으로 뒤집힌 종이 뒷면 */}
      <Animated.View style={[box, boxMove]}>
        {/* 가장자리 그림자: 접힘선 쪽은 상자 경계에서 잘려 앞면 쪽(바깥 가장자리)에만 남는다 */}
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundColor: paper, boxShadow: `0 0 ${flapEdgeBlur(w, h).toFixed(1)}px rgba(0,0,0,${FLAP_EDGE_ALPHA})`, transform: [{ translateX: flapLeft }, { translateY: flapTop }, { scaleX: -1 }, { rotate: unAlpha }] }} />
        {/* 접힘선(오른쪽 끝)으로 갈수록 말려 어두워진다. 띠를 상자 밖으로 조금 넘겨 둔다:
            픽셀 맞춤으로 띠 끝이 상자 끝보다 1px 모자라면 접힘선에 그늘 없는 흰 종이가 선으로 드러난다 (넘친 부분은 상자가 자른다) */}
        <Shade stops={[[0, 0], [0.35, 0.015], [0.68, 0.08], [1, 0.24]]} style={{ left: D - flapBand, width: flapBand + 3, right: undefined, bottom: undefined, height: 2 * D }} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  clip: { overflow: 'hidden' },
})

// ---- 웹: 회전 없이 clip-path 다각형으로 자른다 ----
// 앞면을 회전한 상자 안에서 되돌려 세우는 방식은 무거운 속지를 프레임마다 두 번 회전해 그려 가장자리가 떨렸다.
// 웹은 앞면을 한 번도 움직이지 않고 접힘선 안쪽 다각형만 보이게 하며, 뒷면·그림자도 같은 다각형 + 그라데이션으로 그린다.
const clipHalf = (poly, a, b, c) => { // a*x + b*y <= c 인 쪽만 남긴다 (Sutherland–Hodgman)
  const out = []
  poly.forEach((cur, i) => {
    const prev = poly[(i + poly.length - 1) % poly.length]
    const dc = a * cur.x + b * cur.y - c, dp = a * prev.x + b * prev.y - c
    if ((dc <= 0) !== (dp <= 0)) { const t = dp / (dp - dc); out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }) }
    if (dc <= 0) out.push(cur)
  })
  return out
}
const polygonStyle = (poly) => poly.length >= 3 ? `polygon(${poly.map((q) => `${q.x.toFixed(2)}px ${q.y.toFixed(2)}px`).join(',')})` : 'polygon(0 0,0 0,0 0)'

function WebPageTurn({ page, from, zoom, width, height, dir, lift = 0, progress }) {
  const w = width * zoom, h = height * zoom
  const paper = normalizePaperAppearance((from ?? page).paperAppearance).backgroundColor
  const revealPaper = normalizePaperAppearance(page.paperAppearance).backgroundColor
  const { castBand, at } = useMemo(() => fold(w, h, lift), [w, h, lift])
  // 넘김은 항상 progress 0 에서 시작하므로 초기값은 0 이고 이후 값은 리스너로만 받는다. (비공개 __getValue 를 쓰지 않는다)
  const [p, setP] = useState(0)
  useLayoutEffect(() => {
    const id = progress.addListener(({ value }) => setP(Math.max(0, Math.min(1, value))))
    return () => progress.removeListener(id)
  }, [progress])
  const { px, py, nx, ny } = at(p)
  const rect = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
  const c = nx * px + ny * py
  const revealPoly = clipHalf(rect, -nx, -ny, -c) // 접힘선 바깥: 드러나는 새 페이지 (앞장은 캔버스가 그대로 둔다)
  const reflect = (q) => { const side = (q.x - px) * nx + (q.y - py) * ny; return { x: q.x - 2 * side * nx, y: q.y - 2 * side * ny } }
  let flapPoly = clipHalf(rect, -nx, -ny, -c).map(reflect) // 접힘선 너머 종이를 뒤집어 앞면 쪽에 놓는다
  for (const [a, b, d] of [[-1, 0, 0], [1, 0, w], [0, -1, 0], [0, 1, h]]) flapPoly = clipHalf(flapPoly, a, b, d)
  const castPoly = clipHalf(clipHalf(rect, -nx, -ny, -c), nx, ny, c + castBand) // 접힘선 바깥 띠
  const frontPoly = clipHalf(rect, nx, ny, c) // 접힘선 안쪽: 아직 안 넘어간 앞면
  // 접힘선에서 법선 방향(sign)으로 거리 δ 인 점이 그라데이션 위 t0 + δ 에 오도록 CSS 그라데이션을 맞춘다
  const gradient = (sign, stops) => {
    const dx = nx * sign, dy = ny * sign
    const angle = Math.atan2(dx, -dy)
    const length = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))
    const t0 = (px - w / 2) * dx + (py - h / 2) * dy + length / 2
    return `linear-gradient(${angle * 180 / Math.PI}deg, ${stops.map(([distance, alpha]) => `rgba(0,0,0,${alpha}) ${(t0 + distance).toFixed(2)}px`).join(', ')})`
  }
  // 프레임마다 바뀌는 건 다각형 자르기뿐이므로 무거운 속지는 그대로 둔다 (StaticPage 도 memo)
  const revealPage = useMemo(() => (
    <View style={{ width: w, height: h, transform: [{ scaleX: dir > 0 ? 1 : -1 }] }}>
      <StaticPage page={page} zoom={zoom} background={revealPaper} still />
    </View>
  ), [page, zoom, revealPaper, w, h, dir])
  const fade = p < 0.85 ? 1 - 0.1 * (p / 0.85) : 0.9 * (1 - (p - 0.85) / 0.15)
  const flapBand = Math.hypot(w, h) * 0.1
  const edgeBlur = flapEdgeBlur(w, h)
  const sx = dir > 0 ? 1 : -1
  const layer = (poly, extra) => <View pointerEvents="none" style={[styles.fill, { clipPath: polygonStyle(poly) }, extra]} />
  return (
    <View pointerEvents="none" style={[styles.fill, styles.clip, { transform: [{ scaleX: sx }] }]}>
      {revealPoly.length >= 3 && <View pointerEvents="none" style={[styles.fill, { clipPath: polygonStyle(revealPoly) }]}>{revealPage}</View>}
      {castPoly.length >= 3 && layer(castPoly, { backgroundImage: gradient(1, [[-1, 0], [0, 0.3 * fade], [castBand * 0.28, 0.18 * fade], [castBand * 0.62, 0.045 * fade], [castBand, 0]]) })}
      {/* 접혀 넘어온 조각이 아래 앞면에 드리우는 그림자는 앞면 쪽에만 보이게 자른다 (드러난 쪽은 위 그림자가 맡는다) */}
      {flapPoly.length >= 3 && frontPoly.length >= 3 && (
        <View pointerEvents="none" style={[styles.fill, { clipPath: polygonStyle(frontPoly) }]}>
          <View pointerEvents="none" style={[styles.fill, { filter: `drop-shadow(0 0 ${edgeBlur.toFixed(1)}px rgba(0,0,0,${(FLAP_EDGE_ALPHA * fade).toFixed(3)}))` }]}>
            {layer(flapPoly, { backgroundColor: paper, backgroundImage: gradient(-1, [[0, 0.24], [flapBand * 0.32, 0.08], [flapBand * 0.65, 0.015], [flapBand, 0]]) })}
          </View>
        </View>
      )}
    </View>
  )
}

export default function ReadingPageTurn(props) {
  return Platform.OS === 'web' ? <WebPageTurn {...props} /> : <NativePageTurn {...props} />
}
