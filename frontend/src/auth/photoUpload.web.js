export async function buildPhotoBody(signup, uri, partName = 'signup') {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('프로필 사진을 읽지 못했어요.');
  const source = await response.blob();
  const bitmap = await createImageBitmap(source);
  let photo;
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    photo = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!photo) throw new Error('프로필 사진을 변환하지 못했어요.');
  } finally { bitmap.close(); }
  const body = new FormData();
  body.append(partName, new Blob([JSON.stringify(signup)], { type: 'application/json' }), `${partName}.json`);
  body.append('photo', photo, 'profile.png');
  return { body, dispose() {} };
}
