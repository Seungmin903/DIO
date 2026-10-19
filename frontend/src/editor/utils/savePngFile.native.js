import { Directory, File, FileMode, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
// SDK 57의 루트 saveToLibraryAsync는 폐기된 stub이므로 명시적인 legacy 진입점을 쓴다.
import { getPermissionsAsync, requestPermissionsAsync, saveToLibraryAsync } from 'expo-media-library/legacy'

export async function savePngFile(result, fileName) {
  const source = new File(result.uri)
  if (!source.exists || !source.size) throw new Error('PNG output unavailable')
  const reader = source.open(FileMode.ReadOnly)
  try {
    const header = reader.readBytes(8)
    if (![137,80,78,71,13,10,26,10].every((value, index) => header[index] === value)) throw new Error('Invalid PNG output')
  } finally { reader.close() }

  // 사진 목록을 읽지 않고 추가 권한만 확인/요청한다.
  let permission = await getPermissionsAsync(true, [])
  if (!permission.granted && permission.canAskAgain) permission = await requestPermissionsAsync(true, [])
  if (!permission.granted) {
    const error = new Error('Photo library add permission denied')
    error.code = permission.canAskAgain ? 'PHOTO_PERMISSION_DENIED' : 'PHOTO_PERMISSION_BLOCKED'
    throw error
  }

  const directory = new Directory(Paths.cache, `dio-photo-export-${randomUUID()}`)
  let created = false
  try {
    directory.create(); created = true
    const temporary = new File(directory, fileName)
    await source.copy(temporary)
    // content:// 크기를 추정하지 않는다. 사진첩 API의 저장 완료를 기다린다.
    await saveToLibraryAsync(temporary.uri)
    return { status: 'saved', fileName, destination: 'photos' }
  } finally {
    // 이 호출이 만든 캐시 폴더만 정리한다. 원본 캡처나 사진첩 결과는 지우지 않는다.
    if (created) { try { directory.delete() } catch {} }
  }
}
