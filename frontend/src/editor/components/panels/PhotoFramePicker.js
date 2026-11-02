import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { colors, DISABLED_OPACITY } from '../../../shared/theme'
import { PHOTO_FRAME_ASSETS } from '../../constants'
import { frameAssetName, frameInsets, ratioValueOf } from '../../utils/objects'
import { stripCellBoxes, stripHeight } from '../../utils/photoStrip'
import { frameColorOf } from '../canvas/ObjectView'
import FrameBackdrop, { FrameShape, PREVIEW_EDGE, StripBackdrop } from '../canvas/PhotoFrame'

export const PREVIEW = 54 // 코덱스 24번: 틀 모양이 크게 보이게 (카드 88×92)
export const PHOTO_FILL = '#B9CBE6' // 미리보기 안의 사진 자리
const PREVIEW_SHADOW = 'rgba(11,23,102,0.14)'

/**
 * 사진 틀 칸 (오프라인 에셋 '④ 사진 틀'). 위젯 칸의 사진 틀(누르면 빈 틀을 붙인다)이 쓴다.
 * 미리보기는 늘 그 틀의 기본 색으로 그린다 (고른 틀 색상은 반영하지 않는다).
 * 칸 바탕과 비슷한 흰 틀(폴라로이드 · 우표 · 공연 티켓)도 보이게 바깥 선을 진하게 하고 틀 모양 그대로 아래에 옅은 그림자를 깐다.
 * group: 이 묶음(PHOTO_FRAME_GROUPS)만. disabled: 고를 수 없는 틀 id 목록
 */
export default function PhotoFramePicker({ value, onSelect, group, disabled = [] }) {
  return (
    <TileGrid
      items={group ? PHOTO_FRAME_ASSETS.filter((frame) => frame.group === group) : PHOTO_FRAME_ASSETS}
      value={value}
      disabled={disabled}
      onSelect={onSelect}
      label={frameLabel}
      renderPreview={(frame) => <FramePreview frame={frame} />}
    />
  )
}

/** 화면 읽기 이름: 사진 틀 폴라로이드 · 사진 틀 네컷 (4칸) */
export const frameLabel = (frame) => `사진 틀 ${frameAssetName(frame.id)}${frame.cells ? ` (${frame.cells}칸)` : ''}`

/** 미리보기 + 이름 칸을 한 줄 4칸으로 (사진 틀 · 사진 모양이 같은 모양을 쓴다) */
export function TileGrid({ items, value, disabled = [], onSelect, label, renderPreview }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const active = item.id === value
        const off = disabled.includes(item.id)
        return (
          <View key={item.id} style={styles.slot}>
            <Pressable
              onPress={() => onSelect(item)}
              disabled={off}
              accessibilityRole="button"
              accessibilityLabel={label(item)}
              accessibilityState={{ selected: active, disabled: off }}
              style={({ pressed }) => [styles.cell, active && styles.cellActive, off && styles.disabled, pressed && styles.pressed]}
            >
              <View style={styles.preview}>{renderPreview(item)}</View>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}

/** 틀 미리보기. size: 미리보기 칸 크기(기본 PREVIEW). 보관함 위젯 칸은 스티커 칸에 맞춰 더 작게 쓴다 */
export function FramePreview({ frame, size = PREVIEW }) {
  const color = frameColorOf({ frame: frame.id })
  if (frame.kind === 'strip') {
    // 세로 틀은 높이를, 가로 틀은 너비를 미리보기 칸에 맞춘다
    const tall = stripHeight(frame.id, 1) > 1
    const w = tall ? (size * 0.98) / stripHeight(frame.id, 1) : size + 10
    const h = stripHeight(frame.id, w)
    const cells = stripCellBoxes({ frame: frame.id, w, h })
    return (
      <View style={{ width: w, height: h, marginVertical: (size - h) / 2 }}>
        <PreviewShadow frame={frame.id === 'filmstrip' ? frame.id : 'strip'} width={w} height={h} />
        <StripBackdrop frame={frame.id} width={w} height={h} cells={cells} color={color} edge={PREVIEW_EDGE} />
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {cells.map((cell, i) => <Rect key={i} x={cell.left} y={cell.top} width={cell.width} height={cell.height} fill={PHOTO_FILL} />)}
        </Svg>
      </View>
    )
  }
  const insets = frameInsets(frame.id)
  const w = frame.id.startsWith('ticket') ? size + 10 : size - 6
  const inner = { left: w * insets.left, top: w * insets.top, width: w * (1 - insets.left - insets.right) }
  inner.height = inner.width / (ratioValueOf(frame.ratio, {}) ?? 1) // 빈 틀과 같은 안쪽 비율
  const h = inner.top + inner.height + w * insets.bottom
  return (
    <View style={{ width: w, height: h, marginVertical: (size - h) / 2 }}>
      <PreviewShadow frame={frame.id} width={w} height={h} />
      <FrameBackdrop frame={frame.id} width={w} height={h} inner={inner} color={color} edge={PREVIEW_EDGE} />
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Rect x={inner.left} y={inner.top} width={inner.width} height={inner.height} fill={PHOTO_FILL} />
      </Svg>
    </View>
  )
}

/** 틀 모양 그대로 살짝 아래에 까는 그림자 (종이 위에 놓인 듯). 필름은 뚫린 구멍으로 그림자가 비치므로 깔지 않는다 */
function PreviewShadow({ frame, width, height }) {
  if (frame === 'film' || frame === 'filmstrip') return null
  return (
    <Svg width={width} height={height} style={styles.shadow}>
      <FrameShape frame={frame} width={width} height={height} fill={PREVIEW_SHADOW} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  // 코덱스 24번: 3열, 카드 88×92, 카드 사이 8 (칸 padding 4 × 2)
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  slot: { width: '33.333%', padding: 4 },
  cell: {
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  cellActive: { borderWidth: 2, borderColor: colors.primaryStrong },
  preview: { height: PREVIEW, justifyContent: 'center' },
  disabled: { opacity: DISABLED_OPACITY },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  shadow: { position: 'absolute', left: 0, top: 1.5 },
  name: { fontSize: 11, fontWeight: '600', color: colors.text },
})
