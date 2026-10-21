import { ScrollView, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFormFactor } from '../../../shared/useFormFactor'

// 모바일의 짧은 가로 화면에서도 창의 시작과 하단 작업 버튼에 접근한다.
export default function CropViewport({ children }) {
  const { isPhone } = useFormFactor()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  if (!isPhone) return children
  const maxHeight = Math.max(1, height - 2 * Math.max(insets.top, insets.bottom) - 24)
  return <ScrollView style={{ flexGrow: 0, maxHeight }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
}
