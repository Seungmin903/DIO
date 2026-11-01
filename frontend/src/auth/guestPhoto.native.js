import { File, Paths } from 'expo-file-system';

// 사진 선택기가 준 파일은 캐시 폴더에 있어 앱이 지울 수 있다. 문서 폴더로 옮겨 둔다(이전 사진은 저장이 끝난 뒤 releaseGuestPhoto 로 지운다).
export async function keepGuestPhoto(uri) {
  const target = new File(Paths.document, `dio-guest-profile-${Date.now()}.jpg`);
  new File(uri).copy(target);
  return target.uri;
}

// 문서 폴더에 옮겨 둔 게스트 사진만 지운다(그 밖의 주소는 건드리지 않는다).
export async function releaseGuestPhoto(uri) {
  if (uri && uri.startsWith(Paths.document.uri)) new File(uri).delete();
}
