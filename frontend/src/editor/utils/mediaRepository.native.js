import AsyncStorage from '@react-native-async-storage/async-storage'
import { Directory, File, FileMode, Paths } from 'expo-file-system'
import { MediaError, storageError } from './mediaPolicy.js'
import { validateStoredOriginal } from './mediaRecovery.js'
export { decode, createDisplay, dispose, verifyDisplay } from './mediaProcessing.native.js'

const KEY = 'dio:media:v1:'
const directory = () => new Directory(Paths.document, 'dio-media')
const original = (metadata) => new File(directory(), `${metadata.mediaFileId}.${metadata.extension}`)
const displayFile = (metadata) => metadata.display ? new File(directory(), `${metadata.mediaFileId}.display.${metadata.display.extension}`) : null

export async function readAsset(asset) {
  try {
    const file = new File(asset.uri)
    const handle = file.open(FileMode.ReadOnly)
    try { return { source: file, size: file.size, header: handle.readBytes(64) } }
    finally { handle.close() }
  } catch (error) { throw new MediaError('MEDIA_READ_FAILED', '선택한 파일을 읽지 못했어요. 다시 선택해 주세요.', error) }
}

export async function save(source, metadata, display) {
  const target = original(metadata)
  const preview = displayFile(metadata)
  try {
    directory().create({ intermediates: true, idempotent: true })
    await source.copy(target)
    if (!target.exists || target.size !== metadata.fileSize) throw new Error('Incomplete media copy')
    if (display) {
      await display.source.copy(preview)
      if (!preview.exists || preview.size !== metadata.display.fileSize) throw new Error('Incomplete display copy')
    }
    // 앱 컨테이너 절대 경로는 재실행 시 바뀔 수 있어 메타데이터에 저장하지 않는다.
    await AsyncStorage.setItem(KEY + metadata.mediaFileId, JSON.stringify(metadata))
    return preview?.uri ?? target.uri
  } catch (error) {
    try { if (target.exists) target.delete() } catch { /* 미참조 파일만 남으며 성공을 반환하지 않는다. */ }
    try { if (preview?.exists) preview.delete() } catch { /* 미참조 파일 정리는 후속 작업이다. */ }
    try { await AsyncStorage.removeItem(KEY + metadata.mediaFileId) } catch { /* 원래 오류를 반환한다. */ }
    throw storageError(error)
  }
}

export async function get(id) {
  try {
    const raw = await AsyncStorage.getItem(KEY + id)
    if (!raw) throw new MediaError('MEDIA_NOT_FOUND', '저장된 원본 이미지를 찾을 수 없어요.')
    let media
    try { media = JSON.parse(raw); if (!media?.extension || media.mediaFileId !== id) throw new Error('Invalid metadata') }
    catch (error) { throw new MediaError('MEDIA_CORRUPT', '저장된 이미지 정보가 손상되었어요. 원본 파일을 다시 선택해 주세요.', error) }
    const blob = original(media)
    if (!blob.exists) throw new MediaError('MEDIA_NOT_FOUND', '저장된 원본 이미지를 찾을 수 없어요.')
    const handle = blob.open(FileMode.ReadOnly)
    try { validateStoredOriginal(handle.readBytes(64), blob.size, media) } finally { handle.close() }
    const preview = displayFile(media)
    return { media, blob, displayBlob: preview?.exists ? preview : null }
  } catch (error) { throw storageError(error, 'STORAGE_READ_FAILED') }
}

export async function entries() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(KEY))
  const records = await AsyncStorage.multiGet(keys)
  return records.flatMap(([, raw]) => {
    if (!raw) return []
    const media = JSON.parse(raw)
    const file = original(media)
    const preview = displayFile(media)
    return file.exists ? [{ id: media.mediaFileId, uri: preview?.exists ? preview.uri : file.uri }] : []
  })
}

export async function remove(id) {
  const { blob, displayBlob } = await get(id)
  await AsyncStorage.removeItem(KEY + id)
  blob.delete()
  if (displayBlob?.exists) displayBlob.delete()
}
