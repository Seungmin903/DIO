/** 저장 성공 때만 현재 다이어리 이름을 갱신하고 실제 실패는 기존 안내로 전달한다. */
export async function renameEditorDiary({ diaryId, title, renameDiary, setActive, notify }) {
  if (!diaryId) return false
  try {
    const updated = await renameDiary(diaryId, title)
    setActive(current => current?.id === diaryId ? { ...current, ...(updated || {}), title } : current)
    return true
  } catch (error) {
    notify('이름을 바꾸지 못했어요', error.message)
    return false
  }
}
