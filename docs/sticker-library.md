# 꾸미기 공방 스티커 보관함 서버 저장

꾸미기 공방 스티커 보관함(폴더 구성 · 폴더 안 스티커)을 계정에 저장해 다른 기기 · 재설치 기기에서도 같은 구성으로 보이게 한다(S15P31F106-806).
스티커 이미지 파일은 [미디어 API](./media.md)의 `POST /api/v1/media`(`libraryCategory=STICKER`)로 올리고, 이 API 는 폴더 구성 문서와 그 안의 미디어 id 만 저장한다.
테이프 · 즐겨찾기 · 최근 · 칩 순서는 범위 밖이며 기기에만 남는다.
내 표지는 [내 표지 서버 저장](./cover-library.md), 내 속지 · 기본 속지 스타일은 [내 속지 서버 저장](./paper-library.md)에서 같은 방식으로 저장한다.

## 인증

`Authorization: Bearer {accessToken}`. 다른 회원 API 와 같은 JWT 검증과 세션 활성 확인을 거친다. 없거나 만료 · 폐기 · 비활성이면 401 `INVALID_TOKEN`. 본인 보관함만 읽고 쓴다.

## GET /api/v1/me/sticker-library

200, `Cache-Control: no-store`. 저장한 적이 없으면 `{"version":0,"folders":[]}`.

```json
{
  "version": 3,
  "folders": [
    { "id": "6a1f…", "name": "여행", "items": [
      { "mediaFileId": "f681d27f-…", "builtin": null, "asset": null, "widget": null, "style": null, "emoji": null, "name": "고양이", "aspect": 1.5 },
      { "mediaFileId": null, "builtin": "heart", "asset": null, "widget": null, "style": null, "emoji": null, "name": null, "aspect": null }
    ] }
  ]
}
```

- 빈 칸은 `null`로 온다. 스티커 이미지는 `GET /api/v1/media/{mediaFileId}/file`로 받는다.

## PUT /api/v1/me/sticker-library

폴더 구성 전체를 바꾼다. 응답은 GET 과 같은 모양(새 `version`), 200, `Cache-Control: no-store`.

```json
{ "expectedVersion": 3, "folders": [ { "id": "6a1f…", "name": "여행", "items": [ { "mediaFileId": "f681d27f-…", "name": "고양이", "aspect": 1.5 } ] } ] }
```

### expectedVersion(동시 저장)

- 기기가 마지막으로 받은 `version`을 보낸다. 처음 저장이면 0.
- 지금 서버 `version`과 다르면 409 `STICKER_LIBRARY_CONFLICT`이고 아무것도 바꾸지 않는다. 기기는 GET 으로 다시 받아 자기 변경과 합친 뒤 새 `version`으로 다시 보낸다.
- 같은 계정의 저장은 행 잠금(`select … for update`)으로 한 줄씩 처리한다. 처음 만들 때 동시에 들어오면 기본 키 충돌을 409 로 돌려준다.

### 한도와 형식(넘으면 400 `INVALID_STICKER_LIBRARY`, 문서 전체를 거절)

| 항목 | 규칙 |
| --- | --- |
| 폴더 수 | 200개 |
| 스티커 수 | 모든 폴더 합쳐 3000개 |
| 내가 만든 스티커(서로 다른 `mediaFileId`) | 200개. 넘으면 400 `INVALID_STICKER_LIBRARY`, `message`는 `지금은 스티커를 최대 200개까지 만들 수 있어요\n{초과 수}개 초과했어요.`. 단, 넘는 문서에 든 `mediaFileId`가 모두 이미 저장된 보관함에 있던 것이면 받는다(이미 200개를 넘은 보관함도 이름 변경 · 옮기기 · 삭제는 된다). 앱도 같은 한도로 추가를 막는다(`frontend/src/editor/utils/customStickerLimit.js`) |
| 폴더 `id` | `^[A-Za-z0-9_-]{1,64}$`, 문서 안에서 중복 불가 |
| 폴더 `name` | 비어 있지 않음, 40자(코드 포인트) 이하 |
| 스티커 글자 칸(`builtin` · `asset` · `widget` · `style` · `emoji` · `name`) | 각 200자(코드 포인트) 이하 |
| 제어 문자 | 모든 글자 칸에서 불가 |
| 스티커 종류 | `mediaFileId` · `builtin` · `asset` · `widget` · `emoji` 중 하나는 있어야 함 |
| `aspect` | 0 초과 100 이하의 유한한 수 |

### 미디어(400 `STICKER_MEDIA_NOT_FOUND`)

- `mediaFileId`는 본인이 올린 `READY` 상태의 `IMAGE`만 넣을 수 있다(남의 파일 · 폰트 · PDF 불가).
- 이미 보관함에 있던 이미지는 사용자가 미디어에서 지웠어도(`deleted_at`) 그대로 둘 수 있다. 새로 넣는 이미지는 지워지지 않은 것이어야 한다.

## 저장 구조(V39)

- `user_sticker_libraries(user_id PK, version, document_json, updated_at)`: 폴더 구성 문서 한 벌.
- `user_sticker_library_media(user_id, media_file_id)`: 문서에 든 미디어 id. 저장마다 문서와 같이 다시 쓴다.
- 미디어 정리(`MediaReferenceSql`)는 이 표를 참조로 보아 보관함 스티커 파일을 물리 삭제하지 않는다.
- 미디어에서 지운(삭제 표시) 이미지라도 내 보관함에 든 동안은 본인이 `GET /api/v1/media/{id}/file`로 받을 수 있다(새 기기 · 재설치 기기가 보관함을 받을 때). 보관함에서 빠지면 404다. 앱은 404 · 410 으로 받지 못한 이미지는 다시 받지 않고 실패로 알리지도 않는다.
- 회원 탈퇴는 두 표를 지운 뒤 참조 없는 개인 파일을 기존 정리 경로로 보낸다([회원 탈퇴](./user-withdrawal.md)). 두 표의 `users` 외래 키는 `ON DELETE CASCADE`라 다른 경로로 계정 행을 지워도 막히지 않는다.
- 앱은 회원 탈퇴를 마치면 이 기기에 남은 그 계정의 동기화 기록(`…:<서버>:<계정>:…` · 그 계정과 맞춘 `…:meta`)을 지운다([내 표지 서버 저장](./cover-library.md)의 `librarySyncRecords.js`).

## 앱 동기화

`frontend/src/editor/services/stickerLibrarySync.js`, `frontend/src/diary/components/StickerLibrarySyncHost.js`.

- 회원으로 로그인한 동안 앱 시작 · 다시 앞으로 올 때 맞추고, 보관함이 바뀌면 1.5초 모아 올린다.
- 이 기기에서 마지막으로 맞춘 상태(계정 · `version` · 그때 문서)를 기억해 어느 쪽이 바뀌었는지 가린다.
  - 같은 계정: 기기만 바뀜 → 올림, 서버만 바뀜 → 받음, 둘 다 → 합쳐 올림. 저장 결과가 보낸 것과 다르면(합쳐졌으면) 기기에도 들인다.
  - 이 기기에서 처음이고 비어 있으면 서버 것을 받는다. 처음인데 기기에 스티커가 있으면 합쳐 올린다.
  - 다른 계정이 쓰던 기기: 그 계정의 스티커를 올리지 않고 이 계정의 서버 보관함을 받는다.
- 합치기는 폴더 · 스티커를 모두 남긴다(한쪽에서 지운 것이 다시 보일 수 있다).
- 서버 것을 들일 때도 아직 올리지 못한 스티커 · 보낼 수 없는 칸 · 맞춘 적 없는 폴더는 기기에서 지우지 않는다(다른 기기에서 지운 폴더는 지운다).
- 보내기 전에 위 한도에 맞춘다: 이름의 제어 문자를 빼고 길이를 줄이며, 폴더 200개 · 스티커 3000개를 넘는 것과 형식에 맞지 않는 종류 값은 보내지 않고 기기에만 남긴다.
- 바뀌었는지는 보낼 수 있는 것끼리만 비교한다. 보낼 수 없는 폴더 · 칸 · 한도 초과만 있으면 저장하지 않는다. 아직 올리지 못한 스티커가 있으면 맞출 때마다 다시 올려 보되, 새로 올라간 것이 없고 서버도 그대로면 저장(PUT)하지 않는다.
- 맞추기 결과는 꾸미기 공방 스티커 탭에 알린다: 올리지 못한 스티커가 남거나 저장이 409 로 계속 겹치거나 연결이 안 되면 실패 문구와 `다시 맞추기` 버튼(저장 실패 안내와 같은 모양)을 보이고, 성공하면 지운다. 로그아웃하면 지운다.
- 기기 미디어 id ↔ 서버 미디어 id 짝은 계정별로 AsyncStorage 에 둔다(`dio:sticker-library-sync:v1:<서버>:…`). 이 기기가 올린 스티커는 다시 받을 때 기기 원본을 그대로 쓴다.

## 검증

- `./gradlew test --tests "com.f106.DIO.sticker.*"`: 저장 · 다른 기기에서 읽기, 409, 남의 이미지 · 폰트 거절, 지운 이미지 유지 규칙, 형식 오류, 탈퇴 정리, 물리 삭제 제외.
- `sharingPostgresTest`의 `UserWithdrawalPostgresTests`: `media_files`를 참조하는 외래 키 목록과 탈퇴 시 보관함 스티커 정리.
- `node --test tests/sticker-library-sync.test.js`: 맞추기 규칙 · 409 합치기 · 기기에만 있는 것 보존 · 한도 정리.
