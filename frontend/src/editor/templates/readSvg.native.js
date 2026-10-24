import { File } from 'expo-file-system'
import * as LegacyFileSystem from 'expo-file-system/legacy'

// 개발 서버는 HTTP URI, 출시 AAB는 Asset.downloadAsync()가 만든 file:// URI를 준다.
// 일부 Android 기기에서는 새 File API가 캐시된 번들 SVG를 읽지 못해 내지가 빈 종이로
// 남을 수 있으므로, 해당 경우 asset://·file:// 읽기를 지원하는 legacy API로 재시도한다.
export async function readSvg(uri) {
  try {
    return await new File(uri).text()
  } catch (modernError) {
    try {
      return await LegacyFileSystem.readAsStringAsync(uri, {
        encoding: LegacyFileSystem.EncodingType.UTF8,
      })
    } catch (legacyError) {
      legacyError.cause = modernError
      throw legacyError
    }
  }
}
