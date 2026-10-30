import { Component, memo, useEffect, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { DESK_COLORS, deskLightAt } from '../utils/deskLight'
import { useDeskHourOverride } from '../utils/deskTimeStore'

const WOOD = require('../../../assets/desk/desk-wood.jpg')
const LIGHT = require('../../../assets/desk/window-light.png')
const SHADE = 'rgba(150,142,185,0.1)' // 상판 전체의 옅은 그늘. 이 위에 창빛이 얹혀 밝게 보인다
const RECHECK_MS = 60 * 1000
const SHADOW_REACH = 0.3 // 빛 그림자 길이를 줄이는 비율 (1이면 키프레임 그대로)
const SHADOW_MAX = 3.2 // 그림자가 소품에서 밀리는 최대 dp (scale 1 기준)
const NIGHT_PROP_DIM = 0.3 // 밤에 소품을 덮는 어둠은 상판의 이만큼만 (은색 클립 · 하얀 틀이 어둠에 묻히지 않게)
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))

// 소품 이미지. 크기(여백 포함)와 돌리기 전 내용 폭은 manifest.json 에 있다 (generate-desk-assets.py 가 만든다).
// 비스듬히 놓인 각도는 이미지에 미리 구워 둔다: 앱에서 돌리면 안드로이드가 가장자리를 계단처럼 깨뜨려 그린다.
const MANIFEST = require('../../../assets/desk/props/manifest.json')
const PROPS = {
  'polaroid-picnic': { src: require('../../../assets/desk/props/polaroid-picnic.png'), shadow: require('../../../assets/desk/props/polaroid-picnic-shadow.png'), ...MANIFEST['polaroid-picnic'] },
  'tape-butter': { src: require('../../../assets/desk/props/tape-butter.png'), shadow: require('../../../assets/desk/props/tape-butter-shadow.png'), ...MANIFEST['tape-butter'] },
  'binder-clip-2': { src: require('../../../assets/desk/props/binder-clip-2.png'), shadow: require('../../../assets/desk/props/binder-clip-2-shadow.png'), ...MANIFEST['binder-clip-2'] },
  'binder-clip': { src: require('../../../assets/desk/props/binder-clip.png'), shadow: require('../../../assets/desk/props/binder-clip-shadow.png'), ...MANIFEST['binder-clip'] },
  'polaroid-sky': { src: require('../../../assets/desk/props/polaroid-sky.png'), shadow: require('../../../assets/desk/props/polaroid-sky-shadow.png'), ...MANIFEST['polaroid-sky'] },
  'tape-lavender': { src: require('../../../assets/desk/props/tape-lavender.png'), shadow: require('../../../assets/desk/props/tape-lavender-shadow.png'), ...MANIFEST['tape-lavender'] },
  'sticker-heart': { src: require('../../../assets/desk/props/sticker-heart.png'), shadow: require('../../../assets/desk/props/sticker-heart-shadow.png'), ...MANIFEST['sticker-heart'] },
  'paper-clip': { src: require('../../../assets/desk/props/paper-clip.png'), shadow: require('../../../assets/desk/props/paper-clip-shadow.png'), ...MANIFEST['paper-clip'] },
}

// 소품 묶음. 설계 크기(1280 × 800 태블릿 기준 dp) 안의 중심 x · y, 보이는 폭(돌리기 전 내용 폭), 떠 있는 정도(lift: 클수록 그림자가 길고 멀다)
const CLUSTERS = {
  // 왼쪽 아래: 하늘 소풍 폴라로이드 + 버터 테이프 + 바인더 클립 두 개(방향이 다르다)
  left: {
    width: 340, height: 210, items: [
      ['polaroid-picnic', 74, 105, 147, 0.4],
      ['tape-butter', 102, 20, 80, 0.1],
      ['binder-clip', 158, 174, 62, 0.6],
      ['binder-clip-2', 244, 98, 62, 0.6],
    ],
  },
  // 오른쪽 아래: 하늘 폴라로이드(두리 스티커) + 라벤더 도트 테이프 + 하트 스티커 + 종이 클립
  right: {
    width: 340, height: 200, items: [
      ['polaroid-sky', 179, 107, 165, 0.4],
      ['tape-lavender', 106, 44, 100, 0.1],
      ['sticker-heart', 35, 163, 32, 0.2],
      ['paper-clip', 302, 62, 22, 0.3],
    ],
  },
}

/** 지금 시각(소수). 10분 단위가 아니라 1분마다 다시 읽어 빛이 천천히 움직인다. fixedHour 를 주면 그 시각으로 고정한다. */
function useDeskHour(fixedHour) {
  const read = () => { const now = new Date(); return now.getHours() + now.getMinutes() / 60 }
  const [hour, setHour] = useState(() => fixedHour ?? read())
  useEffect(() => {
    if (fixedHour != null) { setHour(fixedHour); return undefined }
    setHour(read())
    const timer = setInterval(() => setHour(read()), RECHECK_MS)
    return () => clearInterval(timer)
  }, [fixedHour])
  return hour
}

// 창빛 그림의 세로 / 가로 (generate-desk-assets.py 가 만든 그대로. 웹에는 Image.resolveAssetSource 가 없어 직접 적는다)
const LIGHT_ASPECT = 0.6357
// 창 모양 · 크기 · 각도는 시각이 바뀌어도 그대로다. 움직이는 건 자리 · 세기 · 색뿐이다.
const WINDOW_WIDTH = { tablet: 0.85, phone: 1.5 } // 책상 폭에 대한 창빛 폭

function Cluster({ name, place, scale, light }) {
  const spec = CLUSTERS[name]
  const u = value => value * scale
  return <View style={{ position: 'absolute', ...place, width: u(spec.width), height: u(spec.height) }}>
    {spec.items.map(([key, cx, cy, width, lift], index) => {
      const prop = PROPS[key]
      const k = u(width) / prop.base
      const w = prop.w * k, h = prop.h * k
      // 소품은 책상에 누워 있어 그림자가 바짝 붙는다. 빛 방향만 따르고, 해 질 녘에도 멀리 밀리지 않게 짧게 자른다.
      const dx = clamp(light.shadow[0] * lift * scale * SHADOW_REACH, SHADOW_MAX * scale) + 0.4, dy = clamp(light.shadow[1] * lift * scale * SHADOW_REACH, SHADOW_MAX * scale) + 0.8
      const common = { position: 'absolute', width: w, height: h }
      return <View key={key + index} style={{ position: 'absolute', left: u(cx) - w / 2, top: u(cy) - h / 2, width: w, height: h }}>
        <Image source={prop.shadow} style={{ ...common, left: dx, top: dy, opacity: Math.min(0.5, Math.max(light.shadowOpacity, 0.2) * 1.7) }} />
        <Image source={prop.src} style={{ ...common, left: 0, top: 0 }} />
      </View>
    })}
  </View>
}

/**
 * 다이어리 홈 '햇살 책상' 바탕 (세계 층). 누르지 않고 화면 읽기에서 숨긴다.
 * 원목 상판(고정) + 시각에 따라 자리 · 세기 · 색이 바뀌는 십자 창빛(나무 그림자가 한 장 안에 녹아 있다) + 소품(그림자 방향이 바뀐다) + 밤 어둠.
 * decor: { left?: { scale, left, bottom }, right?: { scale, right, bottom } } 소품 묶음 자리 (없으면 그 묶음은 그리지 않는다).
 * 시각: 게스트 슬라이더가 고정한 값(deskTimeStore)이 있으면 그 시각, 없으면 지금 시각.
 */
function DeskBackdrop({ compact = false, decor = null, size }) {
  const light = deskLightAt(useDeskHour(useDeskHourOverride()))
  if (!size?.width || !size?.height) return null
  const lightWidth = size.width * (compact ? WINDOW_WIDTH.phone : WINDOW_WIDTH.tablet)
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.root, { width: size.width, height: size.height }]}>
    <Image source={WOOD} resizeMode="cover" style={styles.fill} />
    <View style={[styles.fill, { backgroundColor: SHADE }]} />
    {size.width > 0 && <Image source={LIGHT} resizeMode="stretch"
      style={{ position: 'absolute', width: lightWidth, height: lightWidth * LIGHT_ASPECT, opacity: light.opacity, tintColor: light.color,
        left: size.width * (compact ? light.x - 0.45 : light.x), top: size.height * (compact ? 0.1 + light.y : light.y) }} />}
    {light.dim > 0.001 && <View style={[styles.fill, { backgroundColor: `rgba(24,32,70,${light.dim.toFixed(3)})` }]} />}
    {decor?.left && <Cluster name="left" place={{ left: decor.left.left, bottom: decor.left.bottom }} scale={decor.left.scale} light={light} />}
    {decor?.right && <Cluster name="right" place={{ right: decor.right.right, bottom: decor.right.bottom }} scale={decor.right.scale} light={light} />}
    {light.dim > 0.001 && <View style={[styles.fill, { backgroundColor: `rgba(24,32,70,${(light.dim * NIGHT_PROP_DIM).toFixed(3)})` }]} />}
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
  root: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', backgroundColor: DESK_COLORS.base },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
})
