import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

// 보관함이 닫히는 애니메이션(UIKit 기본 약 0.35초)보다 조금 길게 기다린다
export const IOS_PICKER_DISMISS_MS = 500

const systemPicker = ({ multiple, selectionLimit }) => ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'], allowsMultipleSelection: multiple, allowsEditing: false, quality: 1,
  ...(multiple && selectionLimit > 0 ? { selectionLimit } : {}),
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
})

// 삼성 기기는 구글 포토가 함께 뜨는 시스템 선택 창 대신 기기 갤러리를 연다(modules/dio-gallery). 모듈 · 갤러리가 없거나 열지 못하면 시스템 창을 쓴다.
const gallery = () => {
  if (Platform.OS !== 'android') return null
  const native = globalThis.expo?.modules?.DioGallery
  try { return native?.isAvailable() ? native : null } catch { return null }
}

export async function selectImages({ multiple, selectionLimit }) {
  // 삼성 갤러리 모듈은 다중 선택 여부만 받고 최대 장수는 지정할 수 없다.
  const native = multiple && selectionLimit > 0 ? null : gallery()
  if (native) {
    try { return await native.pick(Boolean(multiple)) } catch (error) {
      // 고른 뒤 읽지 못한 것은 창을 다시 띄우지 않고 실패로 알린다. 열지 못했을 때만 시스템 창으로 넘어간다
      if (error?.code === 'ERR_GALLERY_READ') throw error
      // 앞선 요청이 새 요청에 밀린 경우다. 새 갤러리가 이미 떠 있으니 창을 더 열지 않는다
      if (error?.code === 'ERR_GALLERY_STALE') return { canceled: true, assets: [] }
    }
  }
  const result = await systemPicker({ multiple, selectionLimit })
  // iOS 보관함은 고른 결과를 넘긴 뒤에야 닫히기 시작한다(expo-image-picker: 결과 전달 → dismiss). 닫히는 동안 자르기 창(Modal)을 띄우면
  // iOS 가 창을 띄우지 않아 자르기를 끝없이 기다렸다 — iPad 회원 다이어리에서 기기 사진을 넣어도 아무 반응이 없던 원인. 닫힐 때까지 기다린 뒤 돌려준다
  if (Platform.OS === 'ios' && !result?.canceled) await new Promise(resolve => setTimeout(resolve, IOS_PICKER_DISMISS_MS))
  return result
}
