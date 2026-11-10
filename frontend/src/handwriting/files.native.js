import * as FS from 'expo-file-system/legacy'
import { File } from 'expo-file-system'
import * as Picker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'
import { fromBase64, toBase64 } from './fontFormat.js'

const workflowDirectory = () => `${FS.documentDirectory}dio-handwriting-workflow/`
function workflowPath(ref) {
  if (!/^[0-9a-f-]{36}$/i.test(ref)) throw new Error('폰트 작업 파일 ID가 올바르지 않아요.')
  return `${workflowDirectory()}${ref}.json`
}
export const workflowBlobs = {
  read: ref => FS.readAsStringAsync(workflowPath(ref), { encoding: FS.EncodingType.UTF8 }),
  async write(ref, text) {
    const uri = workflowPath(ref), pending = `${uri}.pending`
    await FS.makeDirectoryAsync(workflowDirectory(), { intermediates: true })
    if ((await FS.getInfoAsync(uri)).exists) throw new Error('폰트 작업 파일 ID가 충돌했어요.')
    try {
      await FS.writeAsStringAsync(pending, text, { encoding: FS.EncodingType.UTF8 })
      if (await FS.readAsStringAsync(pending, { encoding: FS.EncodingType.UTF8 }) !== text) throw new Error('입력을 모두 저장하지 못했어요. 저장 공간을 확인해 주세요.')
      await FS.moveAsync({ from: pending, to: uri })
    } catch (error) { await FS.deleteAsync(pending, { idempotent: true }).catch(() => {}); throw error }
  },
  remove: ref => FS.deleteAsync(workflowPath(ref), { idempotent: true }),
  async prune(keep) {
    for (const name of await FS.readDirectoryAsync(workflowDirectory())) {
      const match = /^([0-9a-f-]{36})\.json(?:\.pending)?$/i.exec(name)
      if (match && (!keep.has(match[1]) || name.endsWith('.pending'))) await FS.deleteAsync(`${workflowDirectory()}${name}`, { idempotent: true })
    }
  },
}

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
// 공유 다이어리 폰트: 올릴 때 파일 이름에 기기 폰트 id 를 담는다(collaboration/diaryFonts.js). expo/fetch 가 읽도록 bytes() 를 붙인다
export async function sharedFontUploadBody(font) {
  if (!font.uri?.startsWith('file://')) throw Object.assign(new Error('기기에 저장한 폰트만 올릴 수 있어요.'), { code: 'FONT_SOURCE_MISSING' })
  const name = `dio-hw-${font.fileId.toLowerCase()}.ttf`
  const body = new FormData()
  body.append('file', { uri: font.uri, type: 'font/ttf', name, bytes: () => new File(font.uri).bytes() })
  body.append('libraryCategory', 'FONT')
  return body
}
// 받은 친구 폰트 캐시: 서버 파일 id(mediaFileId) 이름으로 둔다. 다른 계정으로 열면 통째로 비운다(sharedFonts.js)
const sharedFontDirectory = () => `${FS.documentDirectory}dio-shared-fonts/`
const sharedFontPath = mediaFileId => {
  if (!/^[0-9a-f-]{36}$/i.test(mediaFileId)) throw new Error('폰트 파일 ID가 올바르지 않아요.')
  return `${sharedFontDirectory()}${mediaFileId}.ttf`
}
export async function cachedSharedFontUri(mediaFileId) {
  const uri = sharedFontPath(mediaFileId)
  const info = await FS.getInfoAsync(uri)
  return info.exists && info.size > 0 ? uri : null
}
export async function removeSharedFontBytes(mediaFileId) {
  await FS.deleteAsync(sharedFontPath(mediaFileId), { idempotent: true })
}
export async function clearSharedFontBytes() {
  await FS.deleteAsync(sharedFontDirectory(), { idempotent: true })
}
export function releaseSharedFontUris() {} // 네이티브는 파일 경로라 풀어 줄 것이 없다
export async function saveSharedFontBytes(mediaFileId, bytes) {
  const uri = sharedFontPath(mediaFileId), temporary = `${uri}.pending`
  await FS.makeDirectoryAsync(sharedFontDirectory(), { intermediates: true })
  try {
    // 최대 25MB 폰트를 Base64 문자열(약 1.33배)로 바꾸지 않고 바이트 그대로 쓴다(저사양 기기 메모리. PDF 원본 저장과 같은 방법)
    const pending = new File(temporary)
    pending.create({ overwrite: true })
    await pending.write(bytes)
    const info = await FS.getInfoAsync(temporary)
    if (!info.exists || info.size !== bytes.length) throw new Error('폰트 파일을 모두 저장하지 못했어요. 저장 공간을 확인해 주세요.')
    await FS.deleteAsync(uri, { idempotent: true })
    await FS.moveAsync({ from: temporary, to: uri })
    return uri
  } catch (error) { await FS.deleteAsync(temporary, { idempotent: true }).catch(() => {}); throw error }
}
export async function restoreFontUri(font) {
  if (!font.uri?.startsWith('file://')) throw new Error('기기 폰트 경로가 올바르지 않아요.')
  const info = await FS.getInfoAsync(font.uri)
  if (!info.exists || info.size !== font.validation?.bytes) throw new Error('폰트 파일을 다시 가져와 주세요.')
  return font.uri
}
