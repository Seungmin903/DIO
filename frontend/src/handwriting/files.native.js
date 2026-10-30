import * as FS from 'expo-file-system/legacy'
import { File } from 'expo-file-system'
import * as Picker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'
import { fromBase64, toBase64 } from './fontFormat.js'

export async function pickLocalFile() {
  // Android's picker grants access to its content URI. In Expo Go, the picker's
  // global cache directory is outside the legacy file system's scoped root.
  const picked = await Picker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: Platform.OS !== 'android', multiple: false })
  if (picked.canceled) return null
  const file = picked.assets[0]
  if (!Number.isFinite(file.size) || file.size > 90 * 1024 * 1024) throw new Error('파일이 너무 커요.')
  return { name: file.name, bytes: await new File(file.uri).bytes() }
}
let packageRevision = 0
export async function writeLocalPackage(name, text) {
  if (Platform.OS === 'ios') {
    if (!await Sharing.isAvailableAsync()) throw new Error('이 기기에서 파일 공유를 사용할 수 없어요.')
    const uri = `${FS.cacheDirectory}dio-font-${Date.now()}-${++packageRevision}-${name.replace(/[\\/:]/g, '_')}`
    try {
      await FS.writeAsStringAsync(uri, text, { encoding: FS.EncodingType.UTF8 })
      await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json' })
      return true
    } finally { await FS.deleteAsync(uri, { idempotent: true }).catch(() => {}) }
  }
  const access = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync()
  if (!access.granted) return false
  const uri = await FS.StorageAccessFramework.createFileAsync(access.directoryUri, name, 'application/json')
  await FS.writeAsStringAsync(uri, text, { encoding: FS.EncodingType.UTF8 })
  return true
}
export async function saveFontBytes(id, bytes) {
  const directory = `${FS.documentDirectory}dio-personal-fonts/`
  await FS.makeDirectoryAsync(directory, { intermediates: true })
  const uri = `${directory}${id}.ttf`
  const temporary = `${uri}.pending`
  if ((await FS.getInfoAsync(uri)).exists || (await FS.getInfoAsync(temporary)).exists) throw new Error('폰트 파일 ID가 충돌했어요.')
  try {
    await FS.writeAsStringAsync(temporary, toBase64(bytes), { encoding: FS.EncodingType.Base64 })
    const info = await FS.getInfoAsync(temporary)
    if (!info.exists || info.size !== bytes.length) throw new Error('폰트 파일을 모두 저장하지 못했어요. 저장 공간을 확인해 주세요.')
    await FS.moveAsync({ from: temporary, to: uri })
    return uri
  } catch (error) { await FS.deleteAsync(temporary, { idempotent: true }).catch(() => {}); throw error }
}
export async function removeFontBytes(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('폰트 파일 ID가 올바르지 않아요.')
  await FS.deleteAsync(`${FS.documentDirectory}dio-personal-fonts/${id}.ttf`, { idempotent: true })
}
export async function readFontBytes(uri) {
  if (!uri?.startsWith('file://')) throw new Error('기기에 저장한 폰트만 읽을 수 있어요.')
  return fromBase64(await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 }))
}
export async function restoreFontUri(font) {
  if (!font.uri?.startsWith('file://')) throw new Error('기기 폰트 경로가 올바르지 않아요.')
  const info = await FS.getInfoAsync(font.uri)
  if (!info.exists || info.size !== font.validation?.bytes) throw new Error('폰트 파일을 다시 가져와 주세요.')
  return font.uri
}
