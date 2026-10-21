import { useWindowDimensions } from 'react-native'
import { formFactorFor } from './layout'

// 창 크기가 바뀔 때마다(회전·화면 분할·웹 창 크기 조절) 폰/태블릿 배치를 다시 고른다.
export function useFormFactor() {
  const { width, height } = useWindowDimensions()
  const formFactor = formFactorFor(width, height)
  return { formFactor, isPhone: formFactor === 'phone', isLandscape: width > height }
}
