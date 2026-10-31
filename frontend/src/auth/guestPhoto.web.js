// 브라우저의 blob 주소는 새로 고치면 사라진다. 고른 사진을 줄여서 data 주소로 저장한다.
// 브라우저 저장소는 보통 5MB 안팎이라 원본 크기를 그대로 넣지 않는다(긴 변 640 · JPEG 0.85).
const MAX_SIDE = 640;

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('사진을 불러오지 못했어요. 다시 선택해 주세요.'));
    reader.readAsDataURL(blob);
  });

async function shrink(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function keepGuestPhoto(uri) {
  if (uri.startsWith('data:')) return uri;
  const blob = await (await fetch(uri)).blob();
  try {
    return await shrink(blob);
  } catch {
    return readAsDataUrl(blob);
  }
}

// data 주소는 파일이 없어 지울 것이 없다.
export async function releaseGuestPhoto() {}
