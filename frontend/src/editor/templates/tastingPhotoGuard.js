/** Check again after the picker or crop dialog yields to other page edits. */
export function tastingPhotoInterruption(crop, page, targetPage, targetAsset) {
  if (!crop) return { reason: 'cancelled', message: null }
  if (page?.id !== targetPage) return { reason: 'page-changed', message: '페이지가 바뀌어 사진을 추가하지 못했어요. 원래 페이지에서 다시 선택해 주세요.' }
  if (page.backgroundAssetId !== targetAsset) return { reason: 'template-changed', message: '속지가 바뀌어 사진을 추가하지 못했어요. 속지를 확인한 뒤 다시 선택해 주세요.' }
  if ((page.objects ?? []).some(object => object.tastingPhoto)) return { reason: 'photo-added', message: '사진 칸에 다른 사진이 먼저 추가되어 선택한 사진을 넣지 못했어요.' }
  return null
}
