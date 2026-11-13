import { Dimensions, Modal, Platform, View, useWindowDimensions } from 'react-native'
import * as bootGate from '../../../shared/bootGate'

// iOS 새 아키텍처 Modal은 기본값이 세로 전용이라, 가로로 고정한 화면(태블릿·폰 가로 편집기)에서 열면 앱이 종료된다.
// 실제 방향은 앱의 방향 잠금(useOrientationLock)이 정하므로 모달은 두 방향을 모두 허용한다.
export const MODAL_ORIENTATIONS = ['portrait', 'landscape']

// 투명 모달(확인 창 · 말풍선 · 시트)은 상태 표시줄 · 내비게이션 막대까지 덮는다. 말풍선(PopoverMenu)처럼 measureInWindow 좌표에 놓는 것도 이래야 앱 화면 좌표와 맞는다.
// 안드로이드는 모달 창이 첫 프레임엔 내비게이션 막대를 뺀 높이였다가 다음 프레임에 화면 전체로 커져, 가운데 놓인 창이 막대 절반만큼(폰 18dp) 튀었다.
// 그래서 안드로이드 투명 모달의 내용은 처음부터 화면 크기로 고정한 판 위에 놓는다(창이 커지는 동안에도 가운데 · 아래 기준이 그대로).
// 화면 전체를 쓰는 투명 모달은 안전 영역을 스스로 비운다
// 시험 환경처럼 react-native 일부만 있는 곳에서도 그대로 Modal 로 동작하게 한다
const useWindowSize = typeof useWindowDimensions === 'function' ? useWindowDimensions : () => null
const useBooting = typeof bootGate.useBooting === 'function' ? bootGate.useBooting : () => false

// 모달은 네이티브 창이라 시작 화면(BootSplash, 일반 View) 위로 뜬다. 시작 화면이 닫힐 때까지 감춰 두었다가 그때 연다(bootGate)
export default function EditorModal({ statusBarTranslucent, navigationBarTranslucent, visible = true, children, ...props }) {
  const booting = useBooting()
  const transparent = Boolean(props.transparent)
  const cover = statusBarTranslucent ?? transparent
  const pinned = transparent && Platform?.OS === 'android' && typeof Dimensions?.get === 'function'
  useWindowSize() // 회전 · 창 크기가 바뀌면 다시 그려 화면 크기를 새로 읽는다
  const screen = pinned ? Dimensions.get('screen') : null
  return <Modal {...props} visible={visible && !booting} statusBarTranslucent={cover} navigationBarTranslucent={navigationBarTranslucent ?? (cover && transparent)} supportedOrientations={MODAL_ORIENTATIONS}>
    {pinned ? <View style={{ position: 'absolute', left: 0, top: 0, width: screen.width, height: screen.height }}>{children}</View> : children}
  </Modal>
}
