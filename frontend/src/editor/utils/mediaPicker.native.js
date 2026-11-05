import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

const systemPicker = ({ multiple }) => ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'], allowsMultipleSelection: multiple, allowsEditing: false, quality: 1,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
})

// 삼성 기기는 구글 포토가 함께 뜨는 시스템 선택 창 대신 기기 갤러리를 연다(modules/dio-gallery). 모듈 · 갤러리가 없거나 실패하면 시스템 창을 쓴다.
const gallery = () => {
  if (Platform.OS !== 'android') return null
  const native = globalThis.expo?.modules?.DioGallery
  try { return native?.isAvailable() ? native : null } catch { return null }
}

export async function selectImages({ multiple }) {
  const native = gallery()
  if (native) {
    try { return await native.pick(Boolean(multiple)) } catch { /* 아래 시스템 창으로 */ }
  }
  return systemPicker({ multiple })
}
