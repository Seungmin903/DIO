import * as ImagePicker from 'expo-image-picker'
import { cropProfilePhoto } from './profileCrop'

// 시스템 사진 선택기를 사용한다. 별도 카메라·전체 사진첩 권한을 요청하지 않는다.
// 자르기는 기기 기본 화면(allowsEditing) 대신 앱 화면(ProfileCropHost)에서 동그라미로 맞춘다. 자르기를 닫으면 null.
export async function pickProfilePhoto(){
 const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:false,allowsEditing:false,quality:1,
  preferredAssetRepresentationMode:ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current})
 if(result.canceled)return null
 const asset=result.assets?.[0]
 if(!asset?.uri)throw new Error('사진을 불러오지 못했어요. 다시 선택해 주세요.')
 return cropProfilePhoto(asset)
}
