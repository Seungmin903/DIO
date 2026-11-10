# 꾸미기 공방 팔레트 서버 저장

꾸미기 공방 도구 탭 팔레트(펜 · 형광펜 · 테이프 · 글자 · 종이 · 줄 색의 고정 칸)를 계정에 저장해 다른 기기 · 재설치 기기에서도 같은 팔레트가 보이게 한다.
이전에는 `frontend/src/editor/hooks/usePalettes.js`가 기기 저장소(AsyncStorage)에만 저장했다. 기기 저장소는 그대로 쓰고, 그 위에서 계정 서버와 맞춘다.

## 인증

`Authorization: Bearer {accessToken}`. 다른 회원 API 와 같은 JWT 검증과 세션 활성 확인을 거친다. 없거나 만료 · 폐기 · 비활성이면 401 `INVALID_TOKEN`. 본인 팔레트만 읽고 쓴다.

## GET /api/v1/me/palettes

200, `Cache-Control: no-store`. 저장한 적이 없으면 `{"version":0,"palettes":{}}`.

```json
{ "version": 2, "palettes": { "pen": ["#111111", "#ABCDEF", "#333333"], "tape": ["pink", "custom:#F8D9DF:#C96B7B"] } }
```

- 문서에 없는 도구 · 칸은 앱 기본 색이다.

## PUT /api/v1/me/palettes

팔레트 전체를 바꾼다. 응답은 GET 과 같은 모양(새 `version`), 200, `Cache-Control: no-store`.

```json
{ "expectedVersion": 2, "palettes": { "pen": ["#111111", "#ABCDEF", "#333333"] } }
```

- `expectedVersion`: 기기가 마지막으로 받은 `version`(처음이면 0). 지금 서버 `version`과 다르면 409 `PALETTE_CONFLICT`이고 아무것도 바꾸지 않는다. 같은 계정의 저장은 행 잠금으로 한 줄씩 처리한다.

### 형식(넘으면 400 `INVALID_PALETTE`, 문서 전체를 거절)

| 항목 | 규칙 |
| --- | --- |
| 도구 이름 | `^[A-Za-z][A-Za-z0-9]{0,31}$`, 32종류까지(앱이 정한다. 새 도구가 생겨도 서버는 그대로) |
| 칸 수 | 도구마다 1~64칸 |
| 칸 값 | `tape`: 테이프 기본 색 id(`^[a-z][a-z0-9_-]{0,31}$`) 또는 테이프 사용자 색 `custom:#바탕:#무늬`. 그 밖의 도구: `#RRGGBB`만(새 도구도 같다. 색이 아닌 값을 쓰는 도구가 생기면 서버 규칙을 함께 바꾼다) |

## 저장 구조(V43)

- `user_palettes(user_id PK, version, document_json, updated_at)`: 팔레트 문서 한 벌. `users` 외래 키는 `ON DELETE CASCADE`.
- 회원 탈퇴는 `UserWithdrawalDataRepository`가 이 행을 지운다.

## 앱 동기화

`frontend/src/editor/services/paletteSync.js`, `frontend/src/diary/components/PaletteSyncHost.js`(App.js 에서 회원 로그인 동안 붙는다).

- 앱 시작 · 다시 앞으로 올 때 맞추고, 팔레트가 바뀌면 1.5초 모아 올린다.
- 이 기기에서 마지막으로 맞춘 서버 문서를 기억하고(`dio:palette-sync:v1:<서버>:meta`) 칸마다 합친다: 기기 칸이 지난번과 다르면 기기 것, 아니면 서버 것. 두 기기가 서로 다른 칸을 바꾸면 둘 다 남고, 같은 칸이면 나중에 올린 기기 것이 남는다.
- 이 기기에서 처음(새 기기 · 재설치)이면 지난번을 기본 색으로 보아, 기기에서 바꾼 칸만 남기고 나머지는 서버 것을 받는다.
- 다른 계정이 쓰던 기기는 그 계정의 팔레트를 올리지 않고 이 계정의 서버 팔레트를 그대로 받는다.
- 저장 중 409 면 다시 받아 합친 뒤 다시 저장한다(3번까지). 서버 문서가 이미 같으면 저장(PUT)하지 않는다.
- 받거나 저장하는 동안(합친 뒤 서버 응답을 기다리는 사이 포함) 사용자가 바꾼 도구는 덮지 않고, 맞춘 상태도 기록하지 않은 채 다시 맞춘다. 받은 팔레트가 기본 색과 같으면 기기 저장값을 지운다(기본으로 되돌리기와 같은 상태).
- 서버의 형식이 틀린 칸은 기본 색으로 채우고, 모르는 도구는 기기에 들이지 않는다.
- 서버 문서에 이 앱이 모르는 도구(새 버전 앱이 만든 것)가 있으면 저장할 때 서버 것을 그대로 함께 올린다. 문서 전체를 바꾸는 PUT 이라도 구버전 앱이 새 도구의 색을 지우지 않는다.
- 실패는 다음 맞추기(앞으로 올 때 · 다음 변경)에서 다시 시도한다.
- 실패하면 운영 빌드에서도 꾸미기 공방 도구 탭에 테이프 · 스티커 보관함과 같은 알림과 `다시 맞추기` 버튼을 보인다(`editor/services/paletteSyncStatus.js`). 다음 맞추기가 성공하거나 로그아웃 · 다른 계정으로 바뀌면 지운다.
  - 연결 · 인증 오류: `팔레트를 계정과 맞추지 못했어요. 연결을 확인해 주세요.`
  - 409 가 세 번 겹침: `다른 기기의 변경과 계속 겹쳐 팔레트를 계정에 저장하지 못했어요.`
  - 개발 빌드는 콘솔 `[DIO_PALETTE_SYNC]`에도 남긴다.

## 검증

- `./gradlew test --tests "com.f106.DIO.palette.*"`: 저장 · 다른 기기에서 읽기, 409, 계정별 분리, 형식 오류, 401, 탈퇴 정리.
- `node --test tests/palette-sync.test.js tests/palette-preference.test.js`: 다른 기기 · 재설치 복원, 서로 다른 칸 합치기, 409 합치기, 기본 색 되돌리기, 다른 계정 기기, 서버 형식 오류, 받는 중 편집 보존.
