import { assetBaseUrl, remoteAssetUrl } from './remoteAssets.js'

// 웹은 파일을 저장하지 않고 주소를 그대로 쓴다. 객체 키가 내용 해시라 브라우저 · CloudFront 캐시를 오래 둬도 된다.
// 글꼴(@font-face)과 속지(fetch)는 다른 출처에서 읽으므로 CloudFront · S3 에 CORS 가 필요하다.
export async function fetchRemoteAsset(asset) {
  return remoteAssetUrl(asset, assetBaseUrl())
}
