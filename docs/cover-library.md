# 꾸미기 공방 내 표지 서버 저장

꾸미기 공방 > 표지 탭의 내 표지 목록을 계정에 저장해 다른 기기 · 재설치 기기에서도 같은 표지가 보이게 한다.
표지 사진 · 표지에 붙인 내 스티커 이미지는 [미디어 API](./media.md)의 `POST /api/v1/media`(사진 `PHOTO`, 스티커 `STICKER`)로 올리고, 이 API 는 표지 목록 문서와 그 안의 미디어 id 만 저장한다.
저장 · 충돌 · 동기화 규칙은 [스티커 보관함](./sticker-library.md)과 같고, 여기에는 다른 점만 적는다. 내 속지는 범위 밖이며 기기에만 남는다.

## GET / PUT /api/v1/me/cover-library

인증 · `Cache-Control: no-store` · `expectedVersion`(409 `COVER_LIBRARY_CONFLICT`) 규칙은 스티커 보관함과 같다. 폴더가 없는 한 줄 목록(`covers`)이다.

```json
{
  "version": 2,
  "covers": [
    { "id": "6a1f…", "name": "여행 표지", "createdAt": "2026-11-10T01:00:00.000Z", "orientation": "portrait",
      "cover": { "kind": "photo", "photo": { "src": "media:f681d27f-…", "mediaFileId": "f681d27f-…", "aspect": 0.75 },
                 "stickers": [ { "id": "s1", "src": "media:0b2c…", "mediaFileId": "0b2c…", "x": 40, "y": 60, "size": 14, "rotation": 0 } ], "…": "…" } }
  ]
}
```

- PUT 본문은 `{ "expectedVersion": 2, "covers": [ … ] }`.
- `cover`(표지 디자인)는 받은 그대로 저장하고 돌려준다. 앱이 읽을 때 `coverDesign.normalizeCover`로 맞춘다.
- 빈 `createdAt`은 `null`로 온다.

### 한도와 형식(넘으면 400 `INVALID_COVER_LIBRARY`, 문서 전체를 거절)

| 항목 | 규칙 |
| --- | --- |
| 표지 수 | 100개 이하(앱은 30개까지 둔다) |
| `id` | `^[A-Za-z0-9_-]{1,64}$`, 목록 안에서 겹치지 않음 |
| `name` | 1~40자, 제어 문자 불가 |
| `createdAt` | 있으면 40자 이하 |
| `orientation` | `portrait` 또는 `landscape` |
| `cover` | 객체, JSON 64KB 이하, 안의 `mediaFileId` 칸은 모두 UUID(표지 하나에 200개 이하), `src`가 `media:…`면 같은 객체의 `media:<mediaFileId>`와 같아야 함 |

### 미디어(400 `COVER_MEDIA_NOT_FOUND`)

`cover` 안 어디든 `mediaFileId`는 본인이 올린 `READY` 상태의 `IMAGE`만 넣을 수 있다. 이미 보관함에 있던 이미지는 미디어에서 지웠어도 그대로 둘 수 있다.

## 저장 구조(V41)

- `user_cover_libraries(user_id PK, version, document_json, updated_at)`, `user_cover_library_media(user_id, media_file_id)`.
- 미디어 정리(`MediaReferenceSql`)는 `user_cover_library_media`를 참조로 보아 보관함 표지 그림을 물리 삭제하지 않는다.
- 미디어에서 지운(삭제 표시) 그림이라도 내 보관함에 든 동안은 본인이 `GET /api/v1/media/{id}/file`로 받을 수 있다(새 기기 · 재설치 기기가 보관함을 받을 때). 보관함에서 빠지면 404다.
- 회원 탈퇴는 두 표를 지운 뒤 참조 없는 개인 파일을 기존 정리 경로로 보낸다. 두 표의 `users` 외래 키는 `ON DELETE CASCADE`라 다른 경로로 계정 행을 지워도 막히지 않는다.

## 앱 동기화

`frontend/src/diary/services/coverLibrarySync.js`. `StickerLibrarySyncHost`가 스티커 보관함 동기화와 함께 띄운다.

- 내 표지 · 내 속지 목록은 `useMyLibrary`의 모듈 저장소 한 벌을 모든 화면과 동기화가 함께 쓴다(화면마다 따로 읽어 덮어쓰지 않게).
- 맞추기 · 합치기 · 기기에만 있는 것 보존 규칙은 스티커 보관함과 같다. 합칠 때 같은 표지는 `id`로 가리고, 양쪽에서 고쳤으면 이 기기 것을 쓴다.
- 표지 안의 그림(표지 사진 · 내 스티커)마다 기기 id ↔ 서버 id 짝을 기록한다. 그림 하나라도 올리지 못한 표지는 이번에는 빼고 기기에 남긴 뒤 다음 맞추기에서 다시 올린다.
- 기본 스티커(`builtin`)는 그림이 아니라 그대로 보낸다.
- 서버가 거절할 표지(그림 칸 200개 초과 · 디자인 64KB 초과 · 잘못된 id)와 100개를 넘는 표지는 보내지 않고 기기에만 남긴다. 하나 때문에 문서 전체가 400 으로 거절되어 다른 표지까지 저장되지 않는 일을 막는다.
- 서버 목록을 받는 사이 이 기기에서 목록을 고치면 받은 것으로 덮지 않고 다시 맞춘다.
- 받지 못한 그림은 기억해 두고 맞출 때마다 다시 받는다(앱을 다시 켜도 이어서). 서버에 파일이 없으면(404 · 410) 더 받지 않는다.
- 바뀌었는지는 보낼 수 있는 표지끼리만 비교하고, 새로 올라간 것이 없으면 저장(PUT)하지 않는다(올리지 못한 표지 때문에 version 이 계속 오르지 않게).
- 올리지 못한 표지 · 받지 못한 그림 · 연결 오류는 꾸미기 공방 표지 탭에 `다시 맞추기`와 함께 보인다(`coverLibrarySyncStatus.js`).
- 맞춘 상태는 `dio:cover-library-sync:v1:<서버>:…`에 스티커 보관함과 따로 둔다.
- 다른 계정이 쓰던 기기에서는 그 계정 표지를 이 계정에 올리지 않고 서버 목록으로 바꾼다. 바꾸기 전 기기 목록은 이전 계정 몫(`…:<계정>:stash`)으로 따로 두고, 그 계정으로 다시 로그인하면 아직 서버에 없던 표지(그림을 올리지 못한 표지 · 한 번도 맞춘 적 없는 표지)만 되살려 다시 올린다. 따로 둔 표지의 그림 파일은 지우지 않는다. 따로 둔 몫은 30일이 지나면 되살리지 않고, 다른 계정으로 맞출 때 지운다. 몫은 계정이 바뀐 뒤 처음 맞출 때 한 번만 쓰고 그 표지 id 를 `meta.stashedIds`에 둔다. 받는 사이 편집으로 다시 맞출 때는 몫을 덮어쓰지 않고, 그사이 새 계정으로 만든 표지는 새 계정에 남겨 올린다.
- 회원 탈퇴를 마치면 그 계정의 꾸미기 공방 동기화 기록(스티커 · 테이프 보관함 · 내 표지의 `…:<서버>:<계정>:…` · 그 계정과 맞춘 `…:meta` · 따로 둔 몫)을 이 기기에서 지운다(`forgetLibrarySyncAccount` → `librarySyncRecords.js`). 먼저 그 계정 동기화를 멈추고 이미 돌던 맞추기가 끝나기를(`settled()`, 최대 5초) 기다린 뒤 지우며, 5초를 넘기면 먼저 지우고 끝난 뒤 한 번 더 지운다.
- 기기 목록이 다른 기기와 합쳐 30개를 넘으면(서버는 100개까지) 새 표지를 더할 때 한 번에 30개로 줄이지 않고 가장 오래된 하나만 뺀다. 줄이면 동기화가 줄인 만큼을 서버에서도 지운다.
- 표지 복사는 JSON 으로 한다(`structuredClone` 은 React Native(Hermes) 전역에 없을 수 있다).
- 앱은 보내기 전에 그림 칸의 `src`를 `media:<mediaFileId>`로 맞춘다(예전 표지처럼 `src`만 있으면 그 id 를 `mediaFileId`로 채운다).
- 서버 목록으로 바꾼 직후 들어온 사용자 편집은 바꾼 목록과 지금 목록을 비교해 다시 맞춘다.

## 검증

- `./gradlew test --tests "com.f106.DIO.cover.*"`: 저장 · 다른 기기에서 읽기, 409, 남의 이미지 · 폰트 거절, 형식 오류, 물리 삭제 제외, 탈퇴 정리.
- `sharingPostgresTest`의 `UserWithdrawalPostgresTests`: `media_files` 외래 키 목록과 탈퇴 시 보관함 표지 그림 정리.
- `node --test tests/cover-library-sync.test.js`: 새 기기 · 재설치 복원, 지우기 · 이름 · 편집 반영, 409 합치기, 올리지 못한 표지 보존 · 반복 저장 없음, 받지 못한 그림 재시도 · 404 중단, 실패 표시, 다른 계정 기기, 받는 중 수정, 표지당 그림 한도, 계정을 바꿨다 돌아올 때 되살리기 · 30일 기한, 탈퇴 정리, structuredClone 없는 런타임, 바꾼 직후 편집, src 맞추기.
- `node --test tests/my-library-store.test.js`: `useMyLibrary` 저장소(읽기 전 저장 순서, 연속 저장, 화면 사이 공유, 저장 실패, `replaceMyCovers`의 base 거절 · 구독 해제).
