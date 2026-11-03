import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia'
import * as stroke from './strokeSkia.js'

// 앱: Skia 는 바로 쓸 수 있다(웹 쪽은 skiaRuntime.js). 같은 모양의 런타임을 준다.
const runtime = { Skia, AlphaType, ColorType, ...stroke, makeSurface: (width, height) => Skia.Surface.MakeOffscreen(width, height) }
const state = { status: 'ready', runtime }
export const loadSkia = () => Promise.resolve(runtime)
export const useSkiaRuntime = () => state
export const skiaState = () => state
