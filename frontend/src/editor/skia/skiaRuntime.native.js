import { AlphaType, ClipOp, ColorType, FilterMode, MipmapMode, Skia } from '@shopify/react-native-skia'
import * as stroke from './strokeSkia.js'

// 앱: Skia 는 바로 쓸 수 있다(웹 쪽은 skiaRuntime.js). 같은 모양의 런타임을 준다.
// gpuSurface: makeSurface 가 GPU 표면이다(웹 CanvasKit 은 CPU 라 큰 그림은 JS 보다 느리다)
const runtime = { Skia, AlphaType, ColorType, ClipOp, FilterMode, MipmapMode, ...stroke, makeSurface: (width, height) => Skia.Surface.MakeOffscreen(width, height), gpuSurface: true }
const state = { status: 'ready', runtime }
export const loadSkia = () => Promise.resolve(runtime)
export const useSkiaRuntime = () => state
export const skiaState = () => state
