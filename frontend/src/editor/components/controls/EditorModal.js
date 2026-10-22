import { Modal } from 'react-native'

// iOS 새 아키텍처 Modal은 기본값이 세로 전용이라, 가로로 고정한 화면(태블릿·폰 가로 편집기)에서 열면 앱이 종료된다.
// 실제 방향은 앱의 방향 잠금(useOrientationLock)이 정하므로 모달은 두 방향을 모두 허용한다.
export const MODAL_ORIENTATIONS = ['portrait', 'landscape']

export default function EditorModal(props) {
  return <Modal {...props} supportedOrientations={MODAL_ORIENTATIONS} />
}
