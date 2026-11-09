# 꾸미기 공방 내 속지 · 기본 속지 스타일 서버 저장

꾸미기 공방 > 속지 탭의 내 속지 목록(PDF 로 만든 속지 묶음)과 새 다이어리의 기본 속지 스타일(종이 색 · 선 색 · 글꼴)을 계정에 저장해 다른 기기 · 재설치 기기에서도 같게 보이게 한다.
쪽 그림은 [미디어 API](./media.md)의 `POST /api/v1/media`(`PHOTO`)로 올리고, 이 API 는 속지 목록 · 스타일 문서와 쪽마다 미디어 id 만 저장한다.
저장 · 충돌 · 동기화 규칙은 [내 표지](./cover-library.md) · [스티커 보관함](./sticker-library.md)과 같고, 여기에는 다른 점만 적는다.

기기 저장소 키는 그대로 `dio:diary:my-papers:v1`(내 속지) · `dio:diary:paper-style-default:v1`(기본 속지 스타일)이며, 로그인한 동안 이 값을 서버와 맞춘다.

## GET / PUT /api/v1/me/paper-library

인증 · `Cache-Control: no-store` · `expectedVersion`(409 `PAPER_LIBRARY_CONFLICT`) 규칙은 내 표지와 같다. 문서는 속지 목록(`papers`)과 기본 속지 스타일(`style`) 한 벌이다.

```json
{
  "version": 3,
  "papers": [
    { "id": "6a1f…", "name": "플래너", "createdAt": "2026-11-10T01:00:00.000Z", "orientation": "portrait",
      "pages": [ { "mediaFileId": "f681d27f-…", "aspect": 0.7071, "name": "플래너 1쪽" } ] }
  ],
  "style": { "backgroundColor": "#FFF8E7", "layoutColor": "#33476B", "font": "nanum-gothic" }
}
```

- PUT 본문은 `{ "expectedVersion": 3, "papers": [ … ], "style": { … } | null }`. 목록 · 스타일을 함께 바꾼다.
- 저장한 적이 없으면 `version` 0, 빈 `papers`, `style: null`. `style: null`은 '고른 적 없음'이며 앱은 원래 기본값(화이트 · 차콜 · 원본 글꼴)을 쓴다.
- 쪽의 `src`(`media:<id>`)와 확대용 원본 PDF 연결(`pdfSource`)은 기기 전용이라 보내지 않는다. 다른 기기에서는 쪽 그림만 받고, 확대하면 그 그림을 그대로 키워 보인다.
- 색은 대문자로 맞춰 저장한다. 빈 `createdAt` · 쪽 `name` · `font`는 `null`로 온다.

### 한도와 형식(넘으면 400 `INVALID_PAPER_LIBRARY`, 문서 전체를 거절)

| 항목 | 규칙 |
| --- | --- |
| 속지 수 | 100개 이하(앱은 30개까지 둔다) |
| `id` | `^[A-Za-z0-9_-]{1,64}$`, 목록 안에서 겹치지 않음 |
| `name` · 쪽 `name` | 속지 이름 1~40자, 쪽 이름 40자 이하, 제어 문자 불가 |
| `createdAt` | 있으면 40자 이하 |
| `orientation` | `portrait` 또는 `landscape` |
| `pages` | 1~100쪽(앱은 PDF 60쪽까지 만든다), 쪽마다 `mediaFileId`(UUID) · `aspect`(0 초과 100 이하) |
| `style` | `null` 또는 `backgroundColor` · `layoutColor`(`#RRGGBB`), `font`는 있으면 `^[A-Za-z0-9_-]{1,40}$` |

### 미디어(400 `PAPER_MEDIA_NOT_FOUND`)

쪽의 `mediaFileId`는 본인이 올린 `READY` 상태의 `IMAGE`만 넣을 수 있다. 이미 보관함에 있던 이미지는 미디어에서 지웠어도 그대로 둘 수 있다.

## 저장 구조(V42)

- `user_paper_libraries(user_id PK, version, document_json, updated_at)`, `user_paper_library_media(user_id, media_file_id)`.
- 미디어 정리(`MediaReferenceSql`)는 `user_paper_library_media`를 참조로 보아 보관함 쪽 그림을 물리 삭제하지 않는다.
- 미디어에서 지운(삭제 표시) 쪽 그림이라도 내 보관함에 든 동안은 본인이 `GET /api/v1/media/{id}/file`로 받을 수 있다(새 기기 · 재설치 기기가 보관함을 받을 때). 보관함에서 빠지면 404다.
- 회원 탈퇴는 두 표를 지운 뒤 참조 없는 개인 파일을 기존 정리 경로로 보낸다. 두 표의 `users` 외래 키는 `ON DELETE CASCADE`라 다른 경로로 계정 행을 지워도 막히지 않는다.

## 앱 동기화

`frontend/src/diary/services/paperLibrarySync.js`. `StickerLibrarySyncHost`가 스티커 · 테이프 · 내 표지 동기화와 함께 띄운다.

- 내 속지는 `useMyLibrary`, 기본 속지 스타일은 `useDefaultPaperStyle`의 모듈 저장소 한 벌을 모든 화면과 동기화가 함께 쓴다.
- 맞추기 · 합치기 · 기기에만 있는 것 보존 규칙은 내 표지와 같다. 같은 속지는 `id`로 가리고, 양쪽에서 고쳤으면 이 기기 것을 쓴다.
- 스타일은 이 기기에서 고른 값이 있으면 그것을, 없으면 서버 값을 쓴다. 새 기기 · 재설치 기기는 속지도 스타일도 비어 있으므로 서버 문서를 그대로 받는다.
- 쪽마다 기기 id ↔ 서버 id 짝을 기록한다. 쪽 하나라도 올리지 못한 속지는 이번에는 빼고 기기에 남긴 뒤 다음 맞추기에서 다시 올린다.
- 받은 문서에 이 기기에 이미 있던 쪽이 있으면 원본 PDF 연결(`pdfSource`)을 그대로 이어 둔다.
- 다른 계정이 쓰던 기기에서는 이전 계정의 속지 · 스타일을 올리지 않고 서버 것으로 바꾼다(서버에 스타일이 없으면 기본값).
- 맞춘 상태는 `dio:paper-library-sync:v1:<서버>:…`에 다른 보관함과 따로 둔다.

## 검증

- `./gradlew test --tests "com.f106.DIO.paper.*"`: 저장 · 다른 기기에서 읽기, 스타일 기본값 되돌리기, 409, 남의 이미지 · 폰트 거절, 형식 오류, 물리 삭제 제외, 탈퇴 정리.
- `sharingPostgresTest`의 `UserWithdrawalPostgresTests`: `media_files` 외래 키 목록과 탈퇴 시 보관함 쪽 그림 정리.
- `node --test tests/paper-library-sync.test.js`: 새 기기 · 재설치 복원, 스타일만 바꾸기 · 지우기 반영, 두 기기 합치기 · 409, 올리지 못한 속지 보존, 다른 계정 기기.
