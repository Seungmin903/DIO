import { TAPE_SIZES } from '../../constants'
import PhotoCropper from './PhotoCropper'

// 조각 길이(가로:세로) 범위. 정사각 조각(1)부터 긴 띠(12)까지. 새 테이프의 처음 틀은 기본 규격 비율
const PIECE_RANGE = [1, 12]
const START_RATIO = TAPE_SIZES[1].w / TAPE_SIZES[1].h

/**
 * 사진으로 테이프를 만들 때(또는 붙인 사진 테이프를 다시 자를 때) 테이프 한 조각으로 쓸 부분을 고른다.
 * 앱의 다른 사진 창과 같은 창(PhotoCropper)을 쓴다: 한 손가락 = 틀 옮기기, 두 손가락 = 확대, 핸들 = 조각 크기.
 * 테이프만의 제약: 조각 비율은 1~12배 안(핸들로 정한다). 다시 자를 때는 붙어 있는 조각 비율 그대로(ratio).
 * 두께는 고르지 않는다: 늘 기본 규격으로 붙고, 붙인 뒤 위아래 손잡이로 자유롭게 바꾼다(지라 608, 예전 슬림 · 기본 · 와이드 버튼 제거).
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
  const sizeId = TAPE_SIZES[1].id
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
  return (
    <PhotoCropper
      photo={photo}
      title={title}
      confirmLabel={confirmLabel}
      fixedAspect={fixedRatio}
      aspectRange={fixedRatio ? undefined : PIECE_RANGE}
      onCancel={onCancel}
      onApply={({ crop, aspect }) => onConfirm({ crop, size: sizeId, ratio: fixedRatio ?? Math.round(aspect * 100) / 100 })}
    />
  )
}
