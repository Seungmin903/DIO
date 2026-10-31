// 브라우저의 blob 주소는 새로 고치면 사라진다. 고른 사진을 data 주소로 바꿔 저장한다.
export async function keepGuestPhoto(uri) {
  if (uri.startsWith('data:')) return uri;
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('사진을 불러오지 못했어요. 다시 선택해 주세요.'));
    reader.readAsDataURL(blob);
  });
}
