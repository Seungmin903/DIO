import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { ddayCaption, ddayDateText, ddayText, daysUntil, normalizeWidget } from './dday'
import { useToday } from './useToday'

// 종이 스티커 그림 색: 앱 화면(UI) 색이 아니라 PDF 시안(속지 에셋 아이디어 54쪽)의 스티커 그림 색이라 theme 토큰이 아닌 고정값을 쓴다.
// 라벨은 연한 남보라, 티켓은 버터 노랑, 도장은 옅은 붉은 잉크
const LABEL_COLOR = '#9FA9D9'
const TICKET_FILL = '#FEF0BF'
const TICKET_EDGE = '#EBC95E'
const TICKET_TEXT = '#2A2A2A'
const TICKET_SUB = '#7A6A3C'
const STAMP_INK = '#E8A79D'

// 굵은 숫자 한 글자의 너비 ≈ 글자 크기 × 0.62. 자리 너비에 들어오도록 글자 수에 맞춰 크기를 줄인다. (웹은 adjustsFontSizeToFit 이 없다)
// 이보다 작은 글자는 브라우저가 최소 크기로 키워 자리를 넘고 잘리므로(보관함 미리보기 등) 그리지 않는다
export const MIN_FONT = 6.5
export const fitFont = (text, base, available) => Math.min(base, available / (Math.max(text.length, 1) * 0.62))

/**
 * 디데이 카운터 그림. width·height 는 화면에 그리는 크기(논리 크기 × zoom).
 * 남은 날은 그릴 때마다 오늘 기준으로 다시 센다. today 는 테스트·미리보기에서 날짜를 고정할 때만 넘긴다.
 */
function DdayWidget({ widget, width, height, today }) {
  const current = useToday()
  const value = normalizeWidget(widget)
  if (!value) return null
  const text = ddayText(daysUntil(value.date, today ?? current))
  const label = `${value.title ? `${value.title} ` : ''}${text}`
  const box = { width, height }
  return (
    <View accessible accessibilityLabel={label} style={box}>
      {value.style === 'ticket' && <Ticket value={value} text={text} {...box} />}
      {value.style === 'stamp' && <Stamp value={value} text={text} {...box} />}
      {value.style === 'label' && <Label value={value} text={text} {...box} />}
    </View>
  )
}

export default memo(DdayWidget)

function Label({ value, text, width, height }) {
  return (
    <View style={[styles.center, { width, height, borderRadius: height * 0.12, backgroundColor: LABEL_COLOR }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.number, { width: width * 0.88, fontSize: fitFont(text, height * 0.6, width * 0.88), lineHeight: height * 0.9, color: '#FFFFFF' }]}>{text}</Text>
    </View>
  )
}

// 티켓 몸통: 점선 자리의 위아래가 반원으로 파인 모양을 한 줄 윤곽선으로 그린다 (홈에서도 윤곽선이 끊기지 않는다)
export function ticketPath(width, height, cut, notch, corner, inset) {
  const l = inset, t = inset, r = width - inset, b = height - inset
  return [
    `M${l + corner} ${t}`, `H${cut - notch}`, `A${notch} ${notch} 0 0 0 ${cut + notch} ${t}`, `H${r - corner}`,
    `A${corner} ${corner} 0 0 1 ${r} ${t + corner}`, `V${b - corner}`, `A${corner} ${corner} 0 0 1 ${r - corner} ${b}`,
    `H${cut + notch}`, `A${notch} ${notch} 0 0 0 ${cut - notch} ${b}`, `H${l + corner}`,
    `A${corner} ${corner} 0 0 1 ${l} ${b - corner}`, `V${t + corner}`, `A${corner} ${corner} 0 0 1 ${l + corner} ${t}`, 'Z',
  ].join(' ')
}

function Ticket({ value, text, width, height }) {
  const notch = height * 0.1
  const cut = width * 0.74
  const dash = height * 0.07
  const line = Math.max(1, height * 0.018)
  const dashCount = Math.floor((height - notch * 2) / (dash * 2))
  const caption = ddayCaption(value)
  return (
    <View style={{ width, height }}>
      {/* 윤곽선 바깥 1px 여백: 화면 배율·소수점 크기에서 가장자리 윤곽선 반쪽이 잘리지 않게 */}
      <Svg width={width} height={height} style={[StyleSheet.absoluteFill, { overflow: 'visible' }]}>
        <Path d={ticketPath(width, height, cut, notch, height * 0.12, line / 2 + 1)} fill={TICKET_FILL} stroke={TICKET_EDGE} strokeWidth={line} strokeLinejoin="round" />
      </Svg>
      {Array.from({ length: dashCount }, (_, i) => (
        <View key={i} style={{ position: 'absolute', left: cut - line / 2, top: notch + dash * 0.5 + i * dash * 2, width: line, height: dash, backgroundColor: TICKET_EDGE }} />
      ))}
      <View style={{ position: 'absolute', left: width * 0.07, top: 0, width: cut - width * 0.1, height, justifyContent: 'center' }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.number, { fontSize: fitFont(text, height * 0.42, cut - width * 0.1), lineHeight: height * 0.52, textAlign: 'left', color: TICKET_TEXT }]}>{text}</Text>
        {!!caption && height * 0.13 >= MIN_FONT && <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ marginTop: height * 0.02, textAlign: 'left', fontSize: height * 0.13, fontWeight: '600', color: TICKET_SUB }}>{caption}</Text>}
      </View>
      {height * 0.1 >= MIN_FONT && <View style={[styles.center, { position: 'absolute', left: cut, top: 0, width: width - cut, height }]}>
        <Text style={{ width: height * 0.8, textAlign: 'center', fontSize: height * 0.1, fontWeight: '800', letterSpacing: height * 0.015, color: TICKET_EDGE, transform: [{ rotate: '90deg' }] }}>TICKET</Text>
      </View>}
    </View>
  )
}

function Stamp({ value, text, width, height }) {
  const size = Math.min(width, height)
  const c = size / 2
  return (
    <View style={[styles.center, { width, height }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={size * 0.46} fill="none" stroke={STAMP_INK} strokeWidth={size * 0.04} />
        <Circle cx={c} cy={c} r={size * 0.385} fill="none" stroke={STAMP_INK} strokeWidth={size * 0.012} />
      </Svg>
      {/* 디데이 글자는 도장 한가운데, 이름은 그 위에 따로 얹는다 (이름이 있어도 글자가 아래로 밀리지 않게) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { transform: [{ rotate: '-10deg' }] }]}>
        <Text numberOfLines={1} style={[styles.number, { width: size * 0.7, fontSize: fitFont(text, size * 0.24, size * 0.7), lineHeight: size * 0.3, color: STAMP_INK }]}>{text}</Text>
        {!!value.title && size * 0.08 >= MIN_FONT && <Text numberOfLines={1} style={{ position: 'absolute', top: size * 0.2, width: size * 0.6, textAlign: 'center', fontSize: Math.min(size * 0.1, (size * 0.6) / (value.title.length * 0.9)), fontWeight: '700', color: STAMP_INK }}>{value.title}</Text>}
        {size * 0.085 >= MIN_FONT && <Text numberOfLines={1} style={{ position: 'absolute', top: size * 0.68, width: size * 0.6, textAlign: 'center', fontSize: size * 0.085, fontWeight: '700', color: STAMP_INK }}>{ddayDateText(value.date)}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  number: { fontWeight: '800', includeFontPadding: false, textAlign: 'center' },
})
