import { GifReader } from 'omggif'
import UPNG from 'upng-js'
import { PageExportError } from './pageExport.js'

const MAX_BYTES = 50 * 1024 * 1024 // 가져오기 제한(mediaPolicy 의 gifMaxBytes)과 같게
const MAX_PIXELS = 8000000

/** 첫 이미지 블록까지만 검사/읽는다. 이후 프레임은 파싱·디코딩하지 않는다. */
function firstImageData(bytes) {
  const requireBytes = (offset, count) => { if (offset + count > bytes.length) throw new Error('Truncated GIF') }
  requireBytes(0, 13)
  const signature = String.fromCharCode(...bytes.subarray(0, 6))
  if (!['GIF87a', 'GIF89a'].includes(signature)) throw new Error('Invalid GIF header')
  const width = bytes[6] | bytes[7] << 8, height = bytes[8] | bytes[9] << 8
  if (!width || !height || width > 4096 || height > 4096 || width * height > MAX_PIXELS) throw new PageExportError('EXPORT_GIF_TOO_LARGE', 'GIF의 첫 프레임은 긴 변 4096px·800만 화소 이내에서 내보낼 수 있어요.')
  const globalColors = bytes[10] & 128 ? 1 << ((bytes[10] & 7) + 1) : 0
  let offset = 13 + globalColors * 3
  requireBytes(0, offset)
  const headerEnd = offset
  let control = new Uint8Array(0)
  const blocks = () => {
    while (true) {
      requireBytes(offset, 1)
      const length = bytes[offset++]
      if (!length) return
      requireBytes(offset, length)
      offset += length
    }
  }
  while (offset < bytes.length) {
    const start = offset
    const kind = bytes[offset++]
    if (kind === 0x21) {
      requireBytes(offset, 1)
      const label = bytes[offset++]
      blocks()
      // 디코더가 알지 못하는 확장도 경계를 검사한 후 제외한다.
      if (label === 0xf9) {
        if (offset - start !== 8 || bytes[start + 2] !== 4) throw new Error('Invalid graphics control extension')
        control = bytes.subarray(start, offset)
      } else if (label === 0x01) {
        // Plain Text는 렌더링하지 않지만 자신에게 적용된 GCE는 소비한다.
        control = new Uint8Array(0)
      }
    } else if (kind === 0x2c) {
      requireBytes(offset, 9)
      const left = bytes[offset] | bytes[offset + 1] << 8, top = bytes[offset + 2] | bytes[offset + 3] << 8
      const w = bytes[offset + 4] | bytes[offset + 5] << 8, h = bytes[offset + 6] | bytes[offset + 7] << 8
      const packed = bytes[offset + 8]
      if (!w || !h || left + w > width || top + h > height) throw new Error('Invalid first image bounds')
      offset += 9
      const localColors = packed & 128 ? 1 << ((packed & 7) + 1) : 0
      if (!localColors && !globalColors) throw new Error('Missing GIF palette')
      offset += localColors * 3
      requireBytes(offset, 2)
      if (bytes[offset] < 2 || bytes[offset] > 8 || !bytes[offset + 1]) throw new Error('Invalid GIF LZW stream')
      offset++
      blocks()
      const image = bytes.subarray(start, offset)
      const data = new Uint8Array(headerEnd + control.length + image.length)
      data.set(bytes.subarray(0, headerEnd))
      data.set(control, headerEnd)
      data.set(image, headerEnd + control.length)
      return { data, width, height }
    } else { throw new Error('GIF has no first image') }
  }
  throw new Error('GIF has no first image')
}

/**
 * 파일 앞부분만 읽어 첫 장면 PNG 를 만든다. 1MiB 부터 4배씩 늘려 읽고, 첫 장면이 다 들어오면 멈춘다.
 * (큰 GIF 도 첫 장면은 보통 앞쪽 몇 MiB 안에 있다) readHead(n): 앞 n 바이트, total: 파일 크기
 */
export async function gifFirstFramePngFromHead(readHead, total, options) {
  for (let length = Math.min(total, 1 << 20); ; length = Math.min(total, length * 4)) {
    try {
      return gifFirstFramePng(await readHead(length), options)
    } catch (error) {
      // 크기 초과는 더 읽어도 같고, 파일 끝까지 읽었는데도 안 되면 정말 깨진 파일이다.
      if (length >= total || error?.code === 'EXPORT_GIF_TOO_LARGE') throw error
    }
  }
}

/** 재생 상태와 무관하게 원본 0번 프레임을 논리 화면에 합성해 정지 PNG로 만든다. */
export function gifFirstFramePng(input, { size } = {}) {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    if (!bytes.length || bytes.length > MAX_BYTES) throw new PageExportError('EXPORT_GIF_TOO_LARGE', 'GIF는 50MiB 이내에서 내보낼 수 있어요.')
    const header = firstImageData(bytes)
    const reader = new GifReader(header.data)
    const frame = reader.frameInfo(0)
    if (frame.data_offset + frame.data_length > header.data.length) throw new Error('Truncated first frame')
    const rgba = new Uint8Array(header.width * header.height * 4)
    // 편집 화면과 같이 첫 이미지 바깥의 논리 화면은 투명하게 둔다.
    reader.decodeAndBlitFrameRGBA(0, rgba)
    const scale = size ? Math.min(1, size.width / header.width, size.height / header.height) : 1
    if (!(scale > 0) || !Number.isFinite(scale)) throw new Error('Invalid GIF output size')
    const width = Math.max(1, Math.ceil(header.width * scale)), height = Math.max(1, Math.ceil(header.height * scale))
    let pixels = rgba
    if (width !== header.width || height !== header.height) {
      pixels = new Uint8Array(width * height * 4)
      // 픽셀 면적 가중 평균. 알파를 먼저 곱해 투명 가장자리의 검은 테두리를 막는다.
      const sx = header.width / width, sy = header.height / height
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const left = x * sx, right = (x + 1) * sx, top = y * sy, bottom = (y + 1) * sy
        let alpha = 0, red = 0, green = 0, blue = 0
        for (let iy = Math.floor(top); iy < Math.min(header.height, Math.ceil(bottom)); iy++) {
          const wy = Math.min(bottom, iy + 1) - Math.max(top, iy)
          for (let ix = Math.floor(left); ix < Math.min(header.width, Math.ceil(right)); ix++) {
            const weight = wy * (Math.min(right, ix + 1) - Math.max(left, ix))
            const source = (iy * header.width + ix) * 4
            const a = rgba[source + 3] * weight
            alpha += a
            red += rgba[source] * a; green += rgba[source + 1] * a; blue += rgba[source + 2] * a
          }
        }
        const target = (y * width + x) * 4
        if (alpha > 0) {
          pixels[target] = Math.round(red / alpha); pixels[target + 1] = Math.round(green / alpha); pixels[target + 2] = Math.round(blue / alpha)
          pixels[target + 3] = Math.round(alpha / (sx * sy))
        }
      }
    }
    // 작은 PNG는 팔레트 청크 오버헤드가 인코더 버퍼보다 커질 수 있어 RGBA로 기록한다.
    const png = new Uint8Array(UPNG.encode([pixels.buffer], width, height, 0, undefined, width * height < 256))
    return { png, width, height }
  } catch (error) {
    if (error instanceof PageExportError) throw error
    throw new PageExportError('EXPORT_GIF_DECODE_FAILED', 'GIF의 첫 프레임을 읽지 못했어요. 원본을 확인해 주세요.', error)
  }
}
