import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { MAX_PHOTOS, validateEvidence } from './safetyModel';

export async function pickEvidence(remaining) {
  if (remaining < 1) return [];
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false,
    allowsMultipleSelection: true, selectionLimit: Math.min(remaining, MAX_PHOTOS), quality: 1 });
  if (result.canceled) return [];
  if (result.assets.length > remaining) throw new Error(`사진을 ${remaining}장까지 더 첨부할 수 있어요.`);
  return result.assets.map(asset => {
    const fileName = asset.fileName || asset.uri.split('/').pop() || 'evidence';
    const extension = fileName.split('.').pop().toLowerCase();
    const mimeType = asset.mimeType || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[extension]);
    let size = asset.fileSize ?? asset.file?.size;
    if (size == null) { try { size = new File(asset.uri).size; } catch { /* validation shows a recoverable error */ } }
    const photo = { uri: asset.uri, fileName, mimeType, size, width: asset.width, height: asset.height };
    const error = validateEvidence(photo);
    if (error) throw new Error(error);
    return photo;
  });
}
