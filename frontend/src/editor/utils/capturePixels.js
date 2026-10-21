const invalidPng = () => Object.assign(new Error('생성된 PNG 정보를 읽지 못했어요. 다시 만들어 주세요.'), { code: 'EXPORT_CAPTURE_INVALID' })

export function captureDimensions(snapshot, platform, pixelRatio) {
  const { pixelWidth, pixelHeight } = snapshot
  if (![pixelWidth, pixelHeight].every(n => Number.isSafeInteger(n) && n > 0)) throw invalidPng()
  // view-shot iOS는 요청 크기를 포인트로 받아 기기 배율로 PNG를 만든다.
  const density = platform === 'ios' ? pixelRatio : 1
  if (!Number.isFinite(density) || density <= 0) throw invalidPng()
  return { width: pixelWidth / density, height: pixelHeight / density }
}

// 전체 이미지 디코딩 없이 PNG IHDR의 실제 픽셀 크기만 읽는다.
export function pngDimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!(bytes instanceof Uint8Array) || bytes.length < 24 || !signature.every((n, i) => bytes[i] === n)) throw invalidPng()
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (data.getUint32(8) !== 13 || data.getUint32(12) !== 0x49484452) throw invalidPng()
  const width = data.getUint32(16), height = data.getUint32(20)
  if (!width || !height) throw invalidPng()
  return { width, height }
}

export function verifyCaptureDimensions(bytes, snapshot) {
  const actual = pngDimensions(bytes)
  if (actual.width !== snapshot.pixelWidth || actual.height !== snapshot.pixelHeight) {
    throw Object.assign(new Error('PNG 출력 크기가 요청한 크기와 달라요. 다시 만들어 주세요.'), {
      code: 'EXPORT_CAPTURE_SIZE_MISMATCH', expected: { width: snapshot.pixelWidth, height: snapshot.pixelHeight }, actual,
    })
  }
  return actual
}
