# 꾸미기 공방 테이프 보관함 서버 저장

꾸미기 공방 테이프 보관함(폴더 구성 · 폴더 안 테이프)을 계정에 저장해 다른 기기 · 재설치 기기에서도 같은 테이프 탭이 보이게 한다.
사진 테이프 이미지는 [미디어 API](./media.md)의 `POST /api/v1/media`(`libraryCategory=TAPE`)로 올리고, 이 API 는 폴더 구성 문서와 그 안의 미디어 id · 자른 자리만 저장한다.
저장 · 충돌 · 한도 · 동기화 규칙은 [스티커 보관함](./sticker-library.md)과 같고, 여기에는 다른 점만 적는다. 테이프 즐겨찾기 · 최근 · 칩 순서는 범위 밖이며 기기에만 남는다.

## GET / PUT /api/v1/me/tape-library

인증 · `Cache-Control: no-store` · `expectedVersion`(409 `TAPE_LIBRARY_CONFLICT`) 규칙은 스티커 보관함과 같다.

```json
{
  "version": 2,
  "folders": [
    { "id": "6a1f…", "name": "내 테이프", "items": [
      { "id": "c3d…", "mediaFileId": "f681d27f-…", "pattern": null, "palette": null, "name": "테이프 1",
        "imageWidth": 1200, "imageHeight": 800, "crop": { "fx": 0.25, "fy": 0.5, "zoom": 2 }, "size": "standard", "pieceRatio": 5.29 },
      { "id": "9e2…", "mediaFileId": null, "pattern": "dots", "palette": "mint", "name": "테이프 2",
        "imageWidth": null, "imageHeight": null, "crop": null, "size": null, "pieceRatio": null }
    ] }
  ]
}
```

### 한도와 형식(넘으면 400 `INVALID_TAPE_LIBRARY`, 문서 전체를 거절)

| 항목 | 규칙 |
| --- | --- |
| 폴더 수 · 테이프 수 · 폴더 `id` · 폴더 `name` | 스티커 보관함과 같다(200개 · 3000개 · `^[A-Za-z0-9_-]{1,64}$` · 40자) |
| 테이프 `id` | 있으면 `^[A-Za-z0-9_-]{1,64}$` |
| 글자 칸(`pattern` · `palette` · `name` · `size`) | 각 200자 이하, 제어 문자 불가 |
| 테이프 종류 | `mediaFileId`(사진 테이프) 또는 `pattern`(기본 무늬) 중 하나는 있어야 함 |
| `crop` | 있으면 `fx` · `fy` 0~1, `zoom` 1~1000 모두 필요 |
| `imageWidth` · `imageHeight` | 0 초과 100000 이하 |
| `pieceRatio` | 0 초과 100 이하 |

### 미디어(400 `TAPE_MEDIA_NOT_FOUND`)

`mediaFileId`는 본인이 올린 `READY` 상태의 `IMAGE`만 넣을 수 있다. 이미 보관함에 있던 이미지는 미디어에서 지웠어도 그대로 둘 수 있다.

## 저장 구조(V40)

- `user_tape_libraries(user_id PK, version, document_json, updated_at)`, `user_tape_library_media(user_id, media_file_id)`.
- 미디어 정리(`MediaReferenceSql`)는 `user_tape_library_media`를 참조로 보아 보관함 테이프 사진을 물리 삭제하지 않는다.
- 미디어에서 지운(삭제 표시) 사진이라도 내 보관함에 든 동안은 본인이 `GET /api/v1/media/{id}/file`로 받을 수 있다(새 기기 · 재설치 기기가 보관함을 받을 때). 보관함에서 빠지면 404다.
- 회원 탈퇴는 두 표를 지운 뒤 참조 없는 개인 파일을 기존 정리 경로로 보낸다. 두 표의 `users` 외래 키는 `ON DELETE CASCADE`라 다른 경로로 계정 행을 지워도 막히지 않는다.
- 앱은 회원 탈퇴를 마치면 이 기기에 남은 그 계정의 동기화 기록(`…:<서버>:<계정>:…` · 그 계정과 맞춘 `…:meta`)을 지운다([내 표지 서버 저장](./cover-library.md)의 `librarySyncRecords.js`).

## 앱 동기화

`frontend/src/editor/services/tapeLibrarySync.js`(테이프 항목 모양), 공용 규칙은 `libraryFolderSync.js`. `StickerLibrarySyncHost`가 스티커 동기화와 함께 띄운다.

- 맞추기 · 합치기 · 기기에만 있는 것 보존 규칙은 스티커 보관함과 같다.
- 테이프 `id`를 함께 저장한다. 합칠 때 같은 테이프는 `id`로 가린다(같은 사진 · 무늬로 만든 테이프가 여럿이어도 각각 남는다).
- 서버가 거절할 칸(잘못된 자른 자리 · 크기)은 그 칸만 빼고 보낸다. 기기에는 그대로 남는다.
- 맞춘 상태는 `dio:tape-library-sync:v1:<서버>:…`에 스티커와 따로 둔다.
- 실패는 화면에 보인다(스티커와 같은 방식). 맞추기가 끝날 때마다 `onStatus`가 결과를 `tapeLibrarySyncStatus.js`에 남긴다. 꾸미기 공방 테이프 탭은 스티커 탭과 같은 자리에 같은 알림(`DecorSaveNotice`)과 `다시 맞추기` 버튼을 보여 준다. 다 맞으면 알림이 사라지고, 로그아웃하거나 다른 계정으로 바꾸면 지운다.
  - `테이프 N개를 계정에 올리지 못했어요. 다른 기기에서는 보이지 않아요.`(사진 업로드 실패)
  - `테이프 N개의 이미지를 받지 못했어요. 연결을 확인해 주세요.`(내려받기 실패)
  - `다른 기기의 변경과 계속 겹쳐 테이프 보관함을 계정에 저장하지 못했어요.`(409가 3번 겹침)
  - `테이프 보관함을 계정과 맞추지 못했어요. 연결을 확인해 주세요.`(그 밖의 연결 · 서버 오류)

## 공유 다이어리에서 사용

개인 테이프 보관함은 같은 계정에서만 복원한다. 공유 페이지에 테이프를 붙이면 기존 공동 편집 API가 테이프 종류, 크롭 설정, 이미지 참조를 페이지 요소로 저장한다. 다이어리 멤버는 페이지 요소에 연결된 이미지를 받아 테이프를 볼 수 있다. 개인 보관함의 폴더나 페이지에 붙이지 않은 사진은 다른 계정에 공유하지 않는다.

## 검증

- `./gradlew test --tests "com.f106.DIO.tape.*"`: 저장 · 다른 기기에서 읽기, 409, 남의 이미지 · 폰트 거절, 형식 오류, 물리 삭제 제외, 탈퇴 정리.
- `sharingPostgresTest`의 `UserWithdrawalPostgresTests`: `media_files` 외래 키 목록과 탈퇴 시 보관함 테이프 정리.
- `node --test tests/tape-library-sync.test.js`: 새 기기 · 재설치 복원, 409 합치기, 올리지 못한 테이프 보존, 다른 계정 기기, 실패 문구 알림 · 다시 맞추면 지우기.
- `node --test tests/decoration-studio.test.js tests/sticker-library-sync.test.js`: 테이프 탭 알림 · 다시 맞추기, 테이프 상태 재시도 중복 방지.
