import { useEffect, useState } from 'react'

// 다른 도구로 전환하거나 바깥을 누를 때도 같은 닫기 동작을 사용한다.
export function usePhotoPanel(readOnly) {
  const [open,setOpen]=useState(false)
  useEffect(()=>{if(readOnly)setOpen(false)},[readOnly])
  return {
    visible:open&&!readOnly,
    toggle(){if(!readOnly)setOpen(!open)},
    close(){setOpen(false)},
  }
}

// 서버에서 다시 가져온 파일은 자르기 취소·빈 칸 부족으로 삭제하지 않는다.
export function discardUnusedPhotoImports(images,used,discard) {
  const unused=images.filter(image=>!image.serverStored&&!used.includes(image))
  return unused.length?discard(unused):Promise.resolve()
}

// 최근 사진 기록이 실패해도 이미 추가한 캔버스 사진은 유지한다.
export function addPhotoAndRecordRecent(image, add, markRecent) {
  add()
  try { markRecent?.([image]) } catch { /* 최근 목록은 사진 저장과 독립적이다. */ }
}
