/** 현재 페이지 출력마다 고정되는 파일명. 저장 경로로 해석될 문자는 제거한다. */
export function pngFileName(title, pageNumber, now = new Date()) {
  const name = String(title || '다이어리').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 48) || '다이어리'
  const pad = (value, length = 2) => String(value).padStart(length, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(), 3)}`
  return `DIO_${name}_p${String(pageNumber).padStart(2, '0')}_${stamp}.png`
}

export function pngSaveError(error) {
  if (error?.code === 'PHOTO_PERMISSION_BLOCKED') return '사진첩 저장 권한이 꺼져 있어요. 설정에서 사진 추가 권한을 허용한 뒤 다시 저장해 주세요.'
  if (error?.code === 'PHOTO_PERMISSION_DENIED') return '사진첩에 저장하려면 사진 추가 권한이 필요해요. 다시 저장을 눌러 권한을 허용해 주세요.'
  const text = `${error?.code || ''} ${error?.name || ''} ${error?.message || ''}`
  if (/ENOSPC|quota|no space|disk full|storage.*full/i.test(text)) return '저장 공간이 부족해요. 공간을 확보한 뒤 다시 저장해 주세요.'
  if (/NotAllowed|SecurityError|permission|access denied|EACCES|EPERM/i.test(text)) return '저장 위치에 접근할 수 없어요. 다른 폴더를 선택해 다시 저장해 주세요.'
  return 'PNG를 저장하지 못했어요. 저장 위치를 확인한 뒤 다시 저장해 주세요.'
}

/** React 갱신 전의 연속 클릭도 차단한다. 실패·취소 후에는 다시 실행할 수 있다. */
export function createSaveGate() {
  let pending = false
  return async (action) => {
    if (pending) return { status: 'busy' }
    pending = true
    try { return await action() } finally { pending = false }
  }
}
