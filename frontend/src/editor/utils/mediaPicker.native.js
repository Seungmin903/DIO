import * as ImagePicker from 'expo-image-picker'

export function selectImages({ multiple }) {
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: multiple, allowsEditing: false, quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  })
}
