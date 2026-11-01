// 공유 다이어리에 올리는 이미지는 서버가 5MiB 까지만 받는다. PDF 쪽 그림(3000px PNG)처럼 이를 넘는 불투명 그림은
// 올리는 순간에만 JPEG 로 낮춘다(기기에 둔 원본은 그대로). 품질을 먼저 낮추고, 그래도 크면 크기를 줄인다.
export const SHARE_MAX_BYTES = 5 * 1024 * 1024 - 64 * 1024 // 5MiB 에서 여유 조금
const QUALITIES = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5]
const SCALES = [1, 0.85, 0.7, 0.55]

/** JPEG 변환 시도 순서: [{ scale, qualities }]. 큰 쪽(scale 1)부터 품질을 낮춰 가며, 안 되면 크기를 줄인다. */
export const shareJpegAttempts = () => SCALES.map(scale => ({ scale, qualities: QUALITIES }))

/** 5MiB 를 넘고, 투명도가 없다고 표시된 PNG · WebP 만 JPEG 로 낮춘다(투명한 스티커는 JPEG 로 바꾸면 배경이 생긴다). */
export const needsShareJpeg = media => Boolean(media?.opaque) && ['png', 'webp'].includes(media.extension) && media.fileSize > SHARE_MAX_BYTES + 64 * 1024
