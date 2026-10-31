import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, DISABLED_OPACITY } from '../../../shared/theme'
import { FRAME_TEXT, PHOTO_FRAME_ASSETS, PHOTO_SHAPES } from '../../constants'
import { useMediaUri } from '../../hooks/useMediaUri'
import { photoShapePatch } from '../../utils/objects'
import { isStripFrame } from '../../utils/photoStrip'
import { shapePath } from '../../utils/shapes'
import { frameColorOf, photoCornerRadius } from '../canvas/ObjectView'
import { frameTextOf } from '../canvas/PhotoFrame'
import PenSafeTextInput from '../controls/PenSafeTextInput'
import ColorField from '../controls/ColorField'
import Icon from '../controls/Icon'
import Slider from '../controls/Slider'
import { PHOTO_FILL, PREVIEW, TileGrid } from './PhotoFramePicker'

/**
 * 사진 틀·모양 (옵션 패널 '꾸미기' 맨 위). 틀은 사진 보관함에서 붙일 때 정하고, 붙인 뒤에는 바꾸지 않는다.
 * - 글자: 티켓 · 인생네컷에 인쇄된 글자 (처음엔 기본 글자)
 * - 칸 사진: 여러 칸 틀(인생네컷·필름 4컷)에서 칸을 골라 사진을 바꾸거나 비운다.
 * - 모양(사각·라운드·원형·하트·별): 틀 없는 사진만. 사진 자체를 그 모양으로 자른다.
 * 틀 색을 쓰는 틀(폴라로이드·우표·티켓 4종·인생네컷)은 아래에 틀 색 피커가 나온다.
 */
export default function FrameOptions({ photo, dispatch, onReplaceCell, onCropCell }) {
  const update = (patch) => dispatch({ type: 'updateObject', id: photo.id, record: true, patch })
  const strip = isStripFrame(photo.frame)
  // 예전 문서의 액자도 틀 색은 계속 바꿀 수 있다
  const colored = PHOTO_FRAME_ASSETS.find((f) => f.id === photo.frame)?.colored || photo.frame === 'frame'

  const apply = (patch) => {
    if (patch && Object.keys(patch).length) update(patch)
  }

  return (
    <View style={styles.section}>
      {FRAME_TEXT[photo.frame] && <FrameTextOptions photo={photo} dispatch={dispatch} />}

      {strip && <CellOptions photo={photo} dispatch={dispatch} onReplaceCell={onReplaceCell} onCropCell={onCropCell} />}

      {photo.frame === 'shape' && (
        <>
          <Text style={[styles.title, styles.subTitle]}>모양</Text>
          <TileGrid
            items={PHOTO_SHAPES}
            value={photo.shape}
            onSelect={(shape) => apply(photoShapePatch(photo, shape.id))}
            label={(shape) => `사진 모양 ${shape.name}`}
            renderPreview={(shape) => (
              <Svg width={PREVIEW} height={PREVIEW}>
                <Path d={shapePath(shape.id, PREVIEW - 8, PREVIEW - 8)} fill={PHOTO_FILL} transform="translate(4 4)" />
              </Svg>
            )}
          />
        </>
      )}

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

      {colored && (
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

/**
 * 여러 칸 틀의 칸 사진: 칸을 고르고 아래 버튼으로 넣기·바꾸기 · 자르기 · 비우기 (손가락으로 누르기 쉬운 크기 유지).
 * 캔버스에서 칸을 두 번 눌러도 같다 (빈 칸은 넣기, 찬 칸은 자르기).
 */
function CellOptions({ photo, dispatch, onReplaceCell, onCropCell }) {
  const cells = photo.cells ?? []
  const [picked, setPicked] = useState(() => Math.max(0, cells.findIndex((cell) => !cell)))
  const index = Math.min(picked, cells.length - 1)
  const filled = Boolean(cells[index])
  const clear = () =>
    dispatch({ type: 'updateObject', id: photo.id, record: true, patch: { cells: cells.map((cell, i) => (i === index ? null : cell)) } })
  return (
    <>
      <Text style={[styles.title, styles.subTitle]}>칸 사진</Text>
      <View style={styles.cells}>
        {cells.map((cell, i) => (
          <Pressable
            key={i}
            onPress={() => setPicked(i)}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}번 칸${cell ? '' : ' (비어 있음)'}`}
            accessibilityState={{ selected: i === index }}
            style={[styles.cellSlot, i === index && styles.cellActive]}
          >
            {cell ? <CellThumb cell={cell} /> : <Icon name="plus" size={16} color={colors.textMuted} />}
            <Text style={styles.cellNumber}>{i + 1}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => onReplaceCell?.(photo.id, index)}
          accessibilityRole="button"
          accessibilityLabel={filled ? `${index + 1}번 칸 사진 바꾸기` : `${index + 1}번 칸에 사진 넣기`}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Icon name={filled ? 'swap' : 'image'} size={16} forText={13} />
          <Text style={styles.actionText}>{filled ? '바꾸기' : `${index + 1}번 칸에 넣기`}</Text>
        </Pressable>
        {filled && (
          <Pressable
            onPress={() => onCropCell?.(photo.id, index)}
            accessibilityRole="button"
            accessibilityLabel={`${index + 1}번 칸 자르기`}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Icon name="crop" size={16} forText={13} />
            <Text style={styles.actionText}>자르기</Text>
          </Pressable>
        )}
        <Pressable
          onPress={clear}
          disabled={!filled}
          accessibilityRole="button"
          accessibilityLabel={`${index + 1}번 칸 비우기`}
          accessibilityState={{ disabled: !filled }}
          style={({ pressed }) => [styles.action, !filled && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>비우기</Text>
        </Pressable>
      </View>
    </>
  )
}

/** 틀에 인쇄된 글자 입력칸. 입력을 시작할 때 한 번만 되돌리기 지점을 만든다. */
function FrameTextOptions({ photo, dispatch }) {
  const text = frameTextOf(photo.frame, photo.frameText)
  return (
    <>
      <Text style={styles.title}>글자</Text>
      <View style={styles.fields}>
        {FRAME_TEXT[photo.frame].fields.map((field) => (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldName}>{field.name}</Text>
            <PenSafeTextInput
              value={text[field.key] ?? ''}
              onFocus={() => dispatch({ type: 'checkpoint' })}
              onChangeText={(value) =>
                dispatch({ type: 'updateObject', id: photo.id, record: false, patch: { frameText: { ...photo.frameText, [field.key]: value } } })
              }
              accessibilityLabel={`${field.name} 글자`}
              maxLength={40}
              style={styles.input}
            />
          </View>
        ))}
      </View>
    </>
  )
}

function CellThumb({ cell }) {
  const uri = useMediaUri(cell, { still: true })
  return <Image source={uri ? { uri } : null} style={StyleSheet.absoluteFill} resizeMode="cover" />
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  title: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  subTitle: { marginTop: 12 },
  fields: { gap: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldName: { width: 64, fontSize: 12, fontWeight: '600', color: colors.textMuted },
  input: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  cells: { flexDirection: 'row', gap: 6 },
  cellSlot: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F4F6FA',
  },
  cellActive: { borderWidth: 2, borderColor: colors.primary },
  cellNumber: {
    position: 'absolute',
    left: 4,
    top: 4,
    minWidth: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
  },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.text },
  disabled: { opacity: DISABLED_OPACITY },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
})
