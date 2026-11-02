import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { TAPE_SIZES } from '../../constants'
import { Segmented } from '../ToolPanel'
import PhotoCropper from './PhotoCropper'

// 조각 길이(가로:세로) 범위. 정사각 조각(1)부터 긴 띠(12)까지. 새 테이프의 처음 틀은 기본 규격 비율
const PIECE_RANGE = [1, 12]
const START_RATIO = TAPE_SIZES[1].w / TAPE_SIZES[1].h

/**
 * 사진으로 테이프를 만들 때(또는 붙인 사진 테이프를 다시 자를 때) 테이프 한 조각으로 쓸 부분을 고른다.
 * 앱의 다른 사진 창과 같은 창(PhotoCropper)을 쓴다: 한 손가락 = 틀 옮기기, 두 손가락 = 확대, 핸들 = 조각 크기.
 * 테이프만의 제약: 조각 비율은 1~12배 안(핸들로 정한다), 두께(규격)를 고른다. 다시 자를 때는 붙어 있는 조각 비율 그대로(ratio).
 * 확정하면 { crop, size, ratio(조각 가로:세로) } 를 넘긴다.
 * image: { src, mediaFileId, width, height }  crop: { fx, fy, zoom }
 */
export default function TapeCropper({
  image,
  initialCrop,
  ratio: fixedRatio, // 다시 자를 때: 붙어 있는 테이프 조각의 가로:세로
  title = '테이프로 쓸 부분 고르기',
  confirmLabel = '테이프 만들기',
  onConfirm,
  onCancel,
}) {
  const [sizeId, setSizeId] = useState(TAPE_SIZES[1].id)
  const start = fixedRatio ?? START_RATIO
  const photo = {
    id: 'tape-crop',
    type: 'photo',
    frame: 'none',
    src: image.src,
    mediaFileId: image.mediaFileId,
    imageWidth: image.width,
    imageHeight: image.height,
    x: 0,
    y: 0,
    w: start * 100,
    h: 100,
    crop: initialCrop,
  }
  // 새 테이프만: 두께(다시 자르기는 붙어 있는 테이프 두께 그대로)
  const extra = fixedRatio ? null : (
    <View style={styles.row}>
      <Text style={styles.label}>두께</Text>
      <View style={styles.control}>
        <Segmented items={TAPE_SIZES.map((item) => ({ id: item.id, label: item.name, a11y: `두께 ${item.name}` }))} selected={(id) => id === sizeId} onPress={setSizeId} />
      </View>
    </View>
  )
  return (
    <PhotoCropper
      photo={photo}
      title={title}
      confirmLabel={confirmLabel}
      fixedAspect={fixedRatio}
      aspectRange={fixedRatio ? undefined : PIECE_RANGE}
      extra={extra}
      onCancel={onCancel}
      onApply={({ crop, aspect }) => onConfirm({ crop, size: sizeId, ratio: fixedRatio ?? Math.round(aspect * 100) / 100 })}
    />
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  label: { width: 64, fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  control: { flex: 1 },
})
