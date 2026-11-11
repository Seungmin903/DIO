// 공유 다이어리에 올리는 이미지는 서버가 5MiB 까지만 받는다. PDF 쪽 그림(3000px PNG)처럼 이를 넘는 불투명 그림은
// 올리는 순간에만 JPEG 로 낮춘다(기기에 둔 원본은 그대로). 품질을 먼저 낮추고, 그래도 크면 크기를 줄인다.
export const SHARE_MAX_BYTES = 5 * 1024 * 1024 - 64 * 1024 // 5MiB 에서 여유 조금
const QUALITIES = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5]
const SCALES = [1, 0.85, 0.7, 0.55]

/** JPEG 변환 시도 순서: [{ scale, qualities }]. 큰 쪽(scale 1)부터 품질을 낮춰 가며, 안 되면 크기를 줄인다. */
export const shareJpegAttempts = () => SCALES.map(scale => ({ scale, qualities: QUALITIES }))

/** 5MiB 를 넘는 JPEG 와, 투명도가 없다고 표시된 PNG · WebP 를 JPEG 로 낮춘다(투명한 스티커는 JPEG 로 바꾸면 배경이 생긴다).
 * JPEG 도 넣는다: 아이폰 사진(HEIC)은 3072px JPEG(품질 0.95)로 바꿔 올리는데 이것이 5MiB 를 넘으면 서버가 거절해
 * 회원 다이어리에 사진이 올라가지 않았다('서버가 거절한 편집은 기기에 보관했어요'). */
export const needsShareJpeg = media => ['jpg', 'jpeg'].includes(media?.extension) || (Boolean(media?.opaque) && ['png', 'webp'].includes(media?.extension))
  ? media.fileSize > SHARE_MAX_BYTES + 64 * 1024 : false

/** 5MiB 를 넘는 PNG · WebP 중 불투명하다고 알 수 없는 것(화면 캡처 등)은 투명도를 지키려 PNG 그대로 크기만 줄인다.
 * iPad 화면 캡처(1640×2360 PNG, 11MB)는 표시본도 만들지 않을 만큼 작아 줄이지 않고 올리다 거절됐다. */
export const needsSharePng = media => !needsShareJpeg(media) && ['png', 'webp'].includes(media?.extension) && media.fileSize > SHARE_MAX_BYTES + 64 * 1024
// PNG 는 품질을 고를 수 없어 크기만 차례로 줄인다(면적은 대략 배율의 제곱으로 준다)
export const SHARE_PNG_SCALES = [0.85, 0.7, 0.55, 0.4, 0.3, 0.2]
