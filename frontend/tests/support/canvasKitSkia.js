import { createRequire } from 'node:module'

// 앱의 Skia 대신 웹과 같은 CanvasKit(wasm) 위의 react-native-skia 를 Node 에서 띄워, skiaRuntime 과 같은 모양으로 준다.
// 못 불러오면 null (부르는 테스트는 건너뛴다)
export async function loadCanvasKitSkia() {
  try {
    const require = createRequire(import.meta.url)
    // canvaskit-wasm 은 react-native-skia 를 통해 설치된다
    const CanvasKit = await createRequire(require.resolve('@shopify/react-native-skia/package.json'))('canvaskit-wasm')()
    global.CanvasKit = CanvasKit
    const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia.js')
    const { AlphaType, ClipOp, ColorType, FilterMode, MipmapMode } = require('@shopify/react-native-skia/lib/commonjs/skia/types')
    const Skia = JsiSkApi(CanvasKit)
    return { Skia, AlphaType, ClipOp, ColorType, FilterMode, MipmapMode, makeSurface: (width, height) => Skia.Surface.Make(width, height) }
  } catch { return null }
}
