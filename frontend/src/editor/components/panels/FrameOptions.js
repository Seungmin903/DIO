import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import { FRAME_INSETS, PHOTO_FRAMES, PHOTO_SHAPES, POLAROID_RATIOS } from '../../constants'
import { framedHeight, isBorderFrame, ratioValueOf, resizeAroundCenter } from '../../utils/objects'
import { shapePath } from '../../utils/shapes'
import { frameColorOf, photoCornerRadius } from '../canvas/ObjectView'
import ColorField from '../controls/ColorField'
import Slider from '../controls/Slider'
import FrameBackdrop from '../canvas/PhotoFrame'

const PREVIEW = 46
const PHOTO_FILL = '#B9CBE6' // 미리보기 안의 사진 자리

/**
 * 사진 프레임 (옵션 패널 '꾸미기' 맨 위). 미리보기 칸을 눌러 바꾼다.
 * - 모양(없음·라운드·원형·하트·별): 사진 자체를 그 모양으로 자른다.
 * - 틀(폴라로이드·필름·우표·액자): 여백 있는 틀에 사진을 넣는다. 안쪽 사진 비율은 '자르기'에서 고른다.
 * 틀 색을 쓰는 프레임(폴라로이드·우표·액자)은 아래에 틀 색 피커가 나온다.
 */
export default function FrameOptions({ photo, dispatch }) {
  const update = (patch) => dispatch({ type: 'updateObject', id: photo.id, record: true, patch })
  const current = isBorderFrame(photo.frame) ? photo.frame : photo.shape
  const frameInfo = PHOTO_FRAMES.find((f) => f.id === current)

  function applyFrame(frame) {
    if (frame.id === current) return
    // 지금 안쪽 사진의 비율 (틀이면 자르기 비율, 모양이면 지금 크기)
    const innerRatio = isBorderFrame(photo.frame)
      ? ratioValueOf(photo.ratio, photo) ?? photo.imageWidth / photo.imageHeight
      : photo.w / photo.h
    if (frame.kind === 'border') {
      const ratio = POLAROID_RATIOS.some((r) => r.id === photo.ratio) ? photo.ratio : innerRatio === 1 ? '1:1' : 'original'
      update({ frame: frame.id, ratio, ...resizeAroundCenter(photo, photo.w, framedHeight(photo.w, ratio, photo, frame.id)) })
      return
    }
    const square = PHOTO_SHAPES.find((s) => s.id === frame.id)?.square
    if (square) {
      const size = Math.min(photo.w, photo.h)
      update({ frame: 'shape', shape: frame.id, ...resizeAroundCenter(photo, size, size) })
      return
    }
    // 사각·라운드는 모서리 둥글기를 그 모양의 기본값으로 되돌린다
    update({ frame: 'shape', shape: frame.id, radius: undefined, ...resizeAroundCenter(photo, photo.w, photo.w / innerRatio) })
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>틀 모양</Text>
      <View style={styles.grid}>
        {PHOTO_FRAMES.map((frame) => {
          const active = frame.id === current
          return (
            <Pressable
              key={frame.id}
              onPress={() => applyFrame(frame)}
              accessibilityRole="button"
              accessibilityLabel={`틀 모양 ${frame.name}`}
              accessibilityState={{ selected: active }}
              style={[styles.cell, active && styles.cellActive]}
            >
              {/* 미리보기는 늘 그 틀의 기본 색으로 (고른 틀 색상은 반영하지 않는다) */}
              <FramePreview frame={frame} color={frameColorOf({ frame: frame.id })} />
              <Text style={styles.name} numberOfLines={1}>
                {frame.name}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {photo.frame === 'shape' && (photo.shape === 'rect' || photo.shape === 'round') && (
        <>
          <Text style={[styles.title, styles.subTitle]}>모서리 둥글기</Text>
          <Slider
            value={photoCornerRadius(photo)}
            min={0}
            max={0.5}
            step={0.02}
            minusLabel="모서리 덜 둥글게"
            plusLabel="모서리 더 둥글게"
            scale={200}
            unit="%"
            label="모서리 둥글기"
            onStart={() => dispatch({ type: 'checkpoint' })}
            onChange={(value) =>
              dispatch({ type: 'updateObject', id: photo.id, record: false, patch: { radius: Math.round(value * 100) / 100 } })
            }
          />
        </>
      )}

      {frameInfo?.colored && (
        <>
          {/* 틀 색: 프리셋 없이 피커로 직접 고른다 */}
          <ColorField
            title="틀 색상"
            label="틀 색상"
            value={frameColorOf(photo)}
            onStart={() => dispatch({ type: 'checkpoint' })}
            onChange={(value) => dispatch({ type: 'updateObject', id: photo.id, record: false, patch: { frameColor: value } })}
          />
        </>
      )}
    </View>
  )
}

function FramePreview({ frame, color }) {
  if (frame.kind === 'shape') {
    return (
      <Svg width={PREVIEW} height={PREVIEW}>
        <Path d={shapePath(frame.id, PREVIEW - 8, PREVIEW - 8)} fill={PHOTO_FILL} transform="translate(4 4)" />
      </Svg>
    )
  }
  const insets = FRAME_INSETS[frame.id]
  const w = PREVIEW - 6
  const inner = { left: w * insets.side, top: w * insets.top, width: w * (1 - insets.side * 2) }
  inner.height = inner.width // 미리보기는 정사각 사진
  const h = inner.top + inner.height + w * insets.bottom
  return (
    <View style={{ width: w, height: h, marginVertical: (PREVIEW - h) / 2 }}>
      <FrameBackdrop frame={frame.id} width={w} height={h} inner={inner} color={color} />
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Rect x={inner.left} y={inner.top} width={inner.width} height={inner.height} fill={PHOTO_FILL} />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  title: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  subTitle: { marginTop: 12 },
  // 한 줄 3칸이 패널 폭에 꽉 차게
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
  cell: {
    width: '32.3%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F4F6FA',
  },
  cellActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  name: { fontSize: 11, fontWeight: '600', color: colors.text },
})
