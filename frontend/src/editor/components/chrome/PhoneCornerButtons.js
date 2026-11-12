import { Pressable, StyleSheet } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import Icon from '../controls/Icon'

// 폰 세로: 도구 줄 바로 아래 좌우 끝의 둥근 네모 버튼. 왼쪽 = 페이지 목록, 오른쪽 = 레이어 (코덱스 2026-11-03: 둥근 네모 12dp).
// 패널을 열면 그 버튼은 사라지고(패널이 그 자리를 쓴다), 패널을 닫으면 다시 나타난다.
export const CORNER_BUTTON = 40
// 아래 떠 있는 막대(되돌리기 · 맞춤)와 같은 여백: 작업창 바깥 여백 8 + 막대 여백 12 = 20
export const CORNER_INSET = 20
export const CORNER_TOP = 9 // 열린 페이지 목록의 탭 줄 윗선과 같은 높이(도구 줄 아래 18dp)

export default function PhoneCornerButtons({ pagesOpen, layersOpen, onTogglePages, onToggleLayers, showLayers = true }) {
  return <>
    {!pagesOpen && <Pressable onPress={onTogglePages} accessibilityRole="button" accessibilityLabel="페이지 목록" hitSlop={4} style={[styles.button, styles.left]}>
      <Icon name="panel" size={20} />
    </Pressable>}
    {showLayers && !layersOpen && <Pressable onPress={onToggleLayers} accessibilityRole="button" accessibilityLabel="레이어" hitSlop={4} style={[styles.button, styles.right]}>
      <Icon name="layers" size={20} />
    </Pressable>}
  </>
}

const styles = StyleSheet.create({
  button: { position: 'absolute', top: CORNER_TOP, zIndex: 25, width: CORNER_BUTTON, height: CORNER_BUTTON, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, ...shadow.card },
  left: { left: CORNER_INSET },
  right: { right: CORNER_INSET },
})
