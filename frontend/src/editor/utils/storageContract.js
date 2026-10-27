// 런타임 의존성이 없는 저장 계약. 앱과 QA가 함께 사용한다.
// 저장 형식 변경 시 키/DB 버전과 마이그레이션을 함께 갱신한다.
export const STORAGE_KEYS = Object.freeze({
  doc: 'dio:editor:doc:v4',
  customDecor: 'dio:editor:custom-decor:v2',
  stickerCategory: 'dio:editor:sticker-category:v1', // 보관함 내용과 분리한 마지막 스티커 칩 설정
  tapePreferences: 'dio:editor:tape-preferences:v1', // 기기 공통 새 테이프 도구 설정. 문서·미디어 참조는 저장하지 않는다.
  diaries: 'dio:diary:list:v1', // 보관함 다이어리 목록. 각 편집 문서는 doc 키 뒤에 `:<diaryId>`를 붙여 저장한다.
})

export const MEDIA_DB = Object.freeze({ name: 'dio-media', version: 3 })
