import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { useSvgId } from '../../utils/svgId'

const SV_HEIGHT = 112
const HUE_HEIGHT = 22
const THUMB = 22
const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']

/**
 * 색을 직접 고르는 피커. 위 네모에서 채도(가로)·밝기(세로), 아래 막대에서 색상(hue)을 고르고 HEX 로도 넣을 수 있다.
 * onStart 는 끌기·입력을 시작할 때 한 번 (되돌리기 지점), onChange(hex) 는 바뀔 때마다.
 */
export default function ColorPicker({ value, onChange, onStart, label = '색', showHex = true }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [size, setSize] = useState({ sv: 1, hue: 1 })
  const [draft, setDraft] = useState(value)
  const svStart = useRef({ x: 0, y: 0 })
  const hueStart = useRef(0)
  const id = useSvgId('picker')

  // 다른 요소를 고르는 등 밖에서 값이 바뀌면 따라간다. (회색·검정은 색상 정보가 없어 지금 hue 를 지킨다)
  useEffect(() => {
    setDraft(value)
    if (value.toUpperCase() !== hsvToHex(hsv).toUpperCase()) {
      const next = hexToHsv(value)
      setHsv(next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const apply = (next) => {
    setHsv(next)
    onChange(hsvToHex(next))
  }
  const fromSv = (x, y) => ({ ...hsv, s: clamp(x / size.sv, 0, 1), v: clamp(1 - y / SV_HEIGHT, 0, 1) })

  const svPan = usePan({
    onStart: (event) => {
      onStart?.()
      svStart.current = { x: event.locationX, y: event.locationY }
      apply(fromSv(event.locationX, event.locationY))
    },
    onMove: (dx, dy) => apply(fromSv(svStart.current.x + dx, svStart.current.y + dy)),
  })
  const huePan = usePan({
    onStart: (event) => {
      onStart?.()
      hueStart.current = event.locationX
      apply({ ...hsv, h: clamp(event.locationX / size.hue, 0, 1) * 360 })
    },
    onMove: (dx) => apply({ ...hsv, h: clamp((hueStart.current + dx) / size.hue, 0, 1) * 360 }),
  })

  const commitDraft = () => {
    const hex = normalizeHex(draft)
    if (!hex) {
      setDraft(value)
      return
    }
    if (hex !== value.toUpperCase()) {
      onStart?.()
      onChange(hex)
    }
  }
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 })

  return (
    <View style={styles.wrap}>
      <View
        style={styles.sv}
        // 크기는 먼저 꺼내 둔다. (Android 는 이벤트를 핸들러가 끝나면 비워서, setState 콜백 안에서 읽으면 null 이었다)
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width
          setSize((prev) => ({ ...prev, sv: width }))
        }}
        accessibilityLabel={`${label} 채도·밝기`}
        {...svPan}
      >
        {/* 터치 위치(locationX·Y)가 늘 이 상자 기준이 되도록 안쪽 그림은 터치를 받지 않는다. */}
        <View style={[StyleSheet.absoluteFill, styles.svFill]} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${id}-w`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
              <LinearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                <Stop offset="1" stopColor="#000000" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={hueColor} />
            <Rect width="100%" height="100%" fill={`url(#${id}-w)`} />
            <Rect width="100%" height="100%" fill={`url(#${id}-b)`} />
          </Svg>
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: hsv.s * size.sv - THUMB / 2, top: (1 - hsv.v) * SV_HEIGHT - THUMB / 2, backgroundColor: value },
          ]}
        />
      </View>

      <View
        style={styles.hue}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width
          setSize((prev) => ({ ...prev, hue: width }))
        }}
        accessibilityLabel={`${label} 색상`}
        {...huePan}
      >
        <View style={[StyleSheet.absoluteFill, styles.hueTrack]} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${id}-h`} x1="0" y1="0" x2="1" y2="0">
                {HUE_STOPS.map((stop, i) => (
                  <Stop key={i} offset={`${i / (HUE_STOPS.length - 1)}`} stopColor={stop} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id}-h)`} />
          </Svg>
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, styles.hueThumb, { left: (hsv.h / 360) * size.hue - THUMB / 2, backgroundColor: hueColor }]}
        />
      </View>

      {showHex && <View style={styles.hexRow}>
        <View style={[styles.preview, { backgroundColor: value }]} />
        <Text style={styles.hash}>HEX</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commitDraft}
          onBlur={commitDraft}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={styles.hexInput}
          accessibilityLabel={`${label} HEX 코드`}
        />
      </View>}
    </View>
  )
}

export function normalizeHex(text) {
  const raw = String(text ?? '').trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.replace(/./g, '$&$&')}`.toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toUpperCase()
  return null
}

function hexToHsv(hex) {
  const value = normalizeHex(hex) ?? '#000000'
  const n = parseInt(value.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

function hsvToHex({ h, s, v }) {
  const f = (k) => {
    const n = (k + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(n, 4 - n, 1))
  }
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  sv: { height: SV_HEIGHT },
  svFill: { borderRadius: 10, overflow: 'hidden' },
  hue: { height: HUE_HEIGHT + 8, justifyContent: 'center' },
  hueTrack: { top: 4, bottom: 4, borderRadius: HUE_HEIGHT / 2, overflow: 'hidden' },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    boxShadow: '0px 1px 3px rgba(11, 25, 87, 0.35)',
  },
  hueThumb: { top: (HUE_HEIGHT + 8 - THUMB) / 2 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  hash: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  hexInput: {
    flex: 1,
    width: 0, // 웹 입력창의 기본 너비 때문에 패널 밖으로 넘치지 않게
    minWidth: 0,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
})
