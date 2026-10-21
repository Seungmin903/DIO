import { Modal } from 'react-native'
import { useFormFactor } from '../../../shared/useFormFactor'

const PHONE_ORIENTATIONS = ['portrait', 'landscape']

export default function EditorModal(props) {
  const { isPhone } = useFormFactor()
  // 태블릿은 기존 네이티브 기본값을 그대로 사용한다.
  const orientationProps = isPhone ? { supportedOrientations: PHONE_ORIENTATIONS } : {}
  return <Modal {...props} {...orientationProps} />
}
