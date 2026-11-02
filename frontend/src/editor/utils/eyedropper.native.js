import UPNG from 'upng-js'
import { Dimensions } from 'react-native'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { captureScreen, releaseCapture } from 'react-native-view-shot'

const readBytes = async file => typeof file.bytes === 'function' ? await file.bytes() : new Uint8Array(await file.arrayBuffer())
const hex = (n) => n.toString(16).padStart(2, '0').toUpperCase()
// 끄는 동안 바로 읽으려고 화면을 이 폭(픽셀)으로 줄여 메모리에 풀어 둔다. 가로 2304 화면이면 1/4 쯤 — 펜 굵기보다 잘게 집을 일은 거의 없다
const SAMPLE_WIDTH = 640

// 앱: 화면을 찍어 두고 손가락이 닿은 자리의 색을 읽는다(screenTap). 웹은 브라우저 스포이드를 쓴다(eyedropper.js)
export const eyedropperMode = 'screenTap'

/**
 * 지금 화면을 찍어 줄인 그림을 풀어 둔다 → { colorAt(x, y) → '#RRGGBB', uri, release() }. x · y 는 화면 좌표(dp).
 * uri 는 찍은 원본(돋보기에 확대해 보여 준다). 다 쓰면 release() 로 지운다. 창 · 덮개를 숨긴 뒤에 불러야 그 아래 화면이 찍힌다. 못 찍으면 null
 */
export async function captureScreenSampler() {
  let shot, context, rendered, small
  try {
    shot = await captureScreen({ format: 'png', result: 'tmpfile' })
    context = ImageManipulator.manipulate(shot)
    context.resize({ width: SAMPLE_WIDTH })
    rendered = await context.renderAsync()
    small = await rendered.saveAsync({ format: SaveFormat.PNG, compress: 1 })
    const image = UPNG.decode((await readBytes(new File(small.uri))).buffer)
    const rgba = new Uint8Array(UPNG.toRGBA8(image)[0])
    const screen = Dimensions.get('screen')
    const kx = image.width / screen.width, ky = image.height / screen.height
    const uri = shot
    shot = null // 돋보기가 쓰는 동안 지우지 않는다(release 에서 지운다)
    return {
      uri,
      release: () => { try { releaseCapture(uri) } catch { /* 임시 파일 정리 실패는 무시 */ } },
      // 둘레 3×3 칸의 채널별 중앙값: 글자 테두리 안티앨리어싱 한 칸에 휘둘리지 않게
      colorAt(x, y) {
        const cx = Math.floor(x * kx), cy = Math.floor(y * ky)
        const channels = [[], [], []]
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const px = Math.min(image.width - 1, Math.max(0, cx + dx)), py = Math.min(image.height - 1, Math.max(0, cy + dy))
          const i = (py * image.width + px) * 4
          channels[0].push(rgba[i]); channels[1].push(rgba[i + 1]); channels[2].push(rgba[i + 2])
        }
        const [r, g, b] = channels.map((values) => values.sort((m, n) => m - n)[4])
        return `#${hex(r)}${hex(g)}${hex(b)}`
      },
    }
  } catch { return null }
  finally {
    rendered?.release?.(); context?.release?.()
    try { if (shot) releaseCapture(shot) } catch { /* 임시 파일 정리 실패는 무시 */ }
    try { if (small) { const file = new File(small.uri); if (file.exists) file.delete() } } catch { /* 무시 */ }
  }
}

export async function openBrowserEyedropper() { return null }
