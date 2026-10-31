import { File, Paths } from 'expo-file-system';

// 사진 선택기가 준 파일은 캐시 폴더에 있어 앱이 지울 수 있다. 문서 폴더로 옮겨 두고, 이전 사진은 지운다.
export async function keepGuestPhoto(uri, previousUri) {
  const target = new File(Paths.document, `dio-guest-profile-${Date.now()}.jpg`);
  new File(uri).copy(target);
  try {
    if (previousUri && previousUri.startsWith(Paths.document.uri)) new File(previousUri).delete();
  } catch {}
  return target.uri;
}
