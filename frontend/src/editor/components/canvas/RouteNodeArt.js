import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { normalizeRouteNode, ROUTE_NODE_SIZE } from '../../widgets/routeNode'
import { loadedFontFamily } from '../../utils/text'
import { TEXT } from '../../templates/plannerDraw.js'
import { useTextFont } from '../../hooks/useTextFont'

// 여행 노선 지점 그림(기획 marker-*.svg 와 같은 모양, 48 단위 상자). 출발: 채운 원, 방문: 빈 원(굵은 테두리), 도착: 빈 원 + 안쪽 고리.
// 빈 원의 안은 종이색을 따라가야 하지만(기획 보완 항목) 지금은 흰색이다. 색은 지점 기록의 color(놓을 때의 노선 색).
// 장소 이름은 원 바로 아래 가운데에 쓴다(겹침 보정은 2차). 글자색은 노선 색과 별개로 속지 글자색(#292929), 글꼴은 속지 글꼴 마루부리.
// 속지 양식의 고정값(앱 테마 색이 아니다): 빈 원 안은 속지 종이색(plannerDraw 바탕 rect 와 같은 흰색), 이름은 속지 글자색(plannerDraw TEXT)
const PAPER = '#FFFFFF'
const LABEL_COLOR = TEXT
const LABEL_SIZE = 12 // 페이지 단위
const LABEL_WIDTH = 160 // 페이지 단위. 지점 상자보다 넓게 잡아 가운데 정렬한다

export default function RouteNodeArt({ node, width, height }) {
  const { kind, color, label } = normalizeRouteNode(node)
  useTextFont(label ? 'maruburi' : null) // 마루부리가 늦게 와도 라벨을 다시 그린다
  const k = width / ROUTE_NODE_SIZE
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox="0 0 48 48">
        {kind === 'start' && <Circle cx="24" cy="24" r="11" fill={color} />}
        {kind === 'stop' && <Circle cx="24" cy="24" r="11" fill={PAPER} stroke={color} strokeWidth="3" />}
        {kind === 'end' && <>
          <Circle cx="24" cy="24" r="13" fill={PAPER} stroke={color} strokeWidth="3" />
          <Circle cx="24" cy="24" r="7" fill="none" stroke={color} strokeWidth="2" />
        </>}
      </Svg>
      {label ? (
        <Text numberOfLines={2} pointerEvents="none" style={[styles.label, { top: height * 0.86, left: (width - LABEL_WIDTH * k) / 2, width: LABEL_WIDTH * k, fontSize: LABEL_SIZE * k, lineHeight: LABEL_SIZE * 1.3 * k, fontFamily: loadedFontFamily('maruburi') ?? undefined }]}>{label}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { position: 'absolute', textAlign: 'center', color: LABEL_COLOR },
})
