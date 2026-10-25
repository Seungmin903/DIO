import * as ImagePicker from 'expo-image-picker'

// 시스템 사진 선택기를 사용한다. 별도 카메라·전체 사진첩 권한을 요청하지 않는다.
export async function pickProfilePhoto(){
 const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:false,allowsEditing:true,aspect:[1,1],quality:0.8})
 if(result.canceled)return null
 const uri=result.assets?.[0]?.uri
 if(!uri)throw new Error('사진을 불러오지 못했어요. 다시 선택해 주세요.')
 return uri
}
