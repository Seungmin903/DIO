import * as FS from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'

export async function obtainLicenseSource(source) {
  if (!/^[a-zA-Z0-9._-]+$/.test(source.fileName)) throw new Error('소스 파일 이름이 올바르지 않아요.')
  if (!source.asset?.startsWith('asset:///dio_licenses/sources/')) throw new Error('이 배포물에 포함되지 않은 소스예요.')
  if (!await Sharing.isAvailableAsync()) throw new Error('이 기기에서 파일 공유를 사용할 수 없어요.')
  const uri = `${FS.cacheDirectory}DIO-${source.fileName}`
  await FS.copyAsync({ from: source.asset, to: uri })
  const info = await FS.getInfoAsync(uri)
  if (!info.exists || info.size !== source.bytes) throw new Error('소스 파일을 확인하지 못했어요. Android 배포 앱에서 다시 시도해 주세요.')
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: '오픈소스 원본 저장' })
}
