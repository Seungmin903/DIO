# 손글씨 폰트 API

모든 API는 로그인 인증이 필요하다. `mediaFileId`와 `diaryId`는 UUID다.

## 내 폰트 저장과 조회

- `POST /api/v1/media`: multipart `file`로 완성된 TTF/OTF를 업로드한다. `libraryCategory=FONT`는 선택 사항이며 생략하면 서버가 형식에 따라 분류한다. 폰트는 최대 25 MiB, GIF는 최대 15 MiB, 그 밖의 이미지·오디오는 최대 5 MiB다. 저장 성공 시 201과 `mediaFileId`를 반환한다.
- `GET /api/v1/handwriting-fonts`: 소유한 `FONT`, `READY`, 미삭제 파일 목록을 반환한다. 각 항목은 `mediaFileId`, `name`(없으면 null), `mimeType`, `fileSize`, `enabled`를 포함한다.
- `GET /api/v1/media/{mediaFileId}/file`: 소유 폰트를 내려받는다. 일반 미디어 API의 기존 공유 이미지 접근 정책도 유지된다.

업로드는 동기 처리한다. 성공 응답 전에 연결이 끊기면 저장 결과가 불확실할 수 있으며 별도 업로드 상태 추적 API는 없다.

## 폰트 생성 한도

- `GET /api/v1/handwriting-fonts/generation-slot`은 계정의 `{generationId, completed}`를 반환한다. 빈 자리는 `{generationId: null, completed: false}`다.
- `PUT /api/v1/handwriting-fonts/generation-slot`은 `{generationId, action}`을 받는다. `RESERVE`는 생성 시작 전에 자리를 확보하고, `COMPLETE`는 생성 완료를 기록한다. `RELEASE`는 같은 작업의 미완료 자리만 반환한다. 성공 시 204를 반환하고 같은 요청을 재시도할 수 있다.
- 서버는 계정별 동시 갱신을 회원 행 잠금으로 처리한다. 다른 작업이 이미 자리를 쓰면 409 `FONT_GENERATION_LIMIT`, 확보한 자리와 완료 요청의 ID가 다르면 409 `FONT_GENERATION_SLOT_LOST`를 반환한다.

### 기기에서 생성 작업을 잃었을 때

앱을 삭제하거나 저장소를 초기화해 작업이 사라지면 서버에 미완료 자리가 남을 수 있다. 작업이 남아 있는 기기가 있으면 그 기기에서 취소한다. 작업을 복구할 수 없으면 운영 담당자가 계정 소유권과 생성 작업이 더 이상 실행 중이 아님을 확인한 뒤 해당 미완료 자리만 반환한다.

1. 아래 트랜잭션에서 서비스와 같은 회원 행 잠금을 획득하고 현재 자리의 ID와 완료 여부를 확인한다. `:user_id`와 `:generation_id`에는 확인한 회원 ID와 복구 대상 작업 ID를 바인딩한다. 현재 자리가 복구 대상과 일치하지 않거나 이미 완료되었으면 롤백한다.
2. 삭제 결과가 대상 행 1개일 때만 커밋한다. 그 후 회원이 앱에서 다시 생성할 수 있는지 확인한다.

```sql
BEGIN;
SELECT user_id FROM users WHERE user_id = :user_id FOR UPDATE;
SELECT generation_id, completed FROM handwriting_font_generation_slots WHERE user_id = :user_id;

DELETE FROM handwriting_font_generation_slots
WHERE user_id = :user_id AND generation_id = :generation_id AND completed = FALSE
RETURNING generation_id;
-- 대상 행 1개를 확인한 뒤 COMMIT. 그 외에는 ROLLBACK.
```

## 다이어리 폰트

활성 다이어리의 활성 OWNER·EDITOR만 접근할 수 있다. VIEWER와 비회원·탈퇴 멤버는 접근할 수 없다.

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | `/api/v1/diaries/{diaryId}/fonts` | 공유 폰트 목록 조회. 비활성 공유는 `enabled=false`; 삭제되거나 준비되지 않은 파일은 제외 |
| POST | `/api/v1/diaries/{diaryId}/fonts` | `{"mediaFileId":"UUID"}`로 소유한 폰트 공유, 204 반환 |
| PATCH | `/api/v1/diaries/{diaryId}/fonts/{mediaFileId}` | `{"enabled":true}` 또는 `false`로 상태 변경, 204 반환 |
| GET | `/api/v1/diaries/{diaryId}/fonts/{mediaFileId}/file` | 공유가 활성이고 파일이 `FONT`·`READY`·미삭제인 경우 파일 반환 |

반복 공유는 기존 상태를 유지하며 204를 반환한다. 원본이 삭제되면 목록과 다운로드에서 제외된다. 클라이언트는 목록·권한을 다시 확인해 사용 불가한 캐시를 적용하지 않아야 한다.

## 폰트 공유 동의(계정 단위)

공유 다이어리에 내 손글씨 폰트를 올려 공유해도 되는지를 계정마다 한 번 묻고, 그 답을 서버에 저장한다. 어느 기기에서 로그인해도 같은 값을 쓰며, 설정 > 편집의 `공유 다이어리에 내 폰트 공유` 스위치도 이 값을 보여 준다.

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | `/api/v1/handwriting-fonts/share-consent` | `{"status":"GRANTED"\|"DENIED"\|"NOT_ASKED","changedAt":"..."\|null}` 반환. 조회만으로는 기록을 만들지 않음 |
| PUT | `/api/v1/handwriting-fonts/share-consent` | `{"agreed":true\|false,"onlyIfNotAsked":false}`로 저장. 저장된 값을 같은 모양으로 반환 |

- `onlyIfNotAsked=true`이면 아직 답이 없을 때만 저장한다. 이미 답이 있으면 저장하지 않고 그 값을 그대로 돌려준다. 앱은 예전 버전이 기기에만 저장한 답을 서버로 옮길 때 이 값을 쓰므로, 다른 기기에서 먼저 고른 답을 덮어쓰지 않는다.
- 같은 값을 다시 보내면 `changedAt`은 바뀌지 않는다. 같은 계정의 동시 요청은 회원 행 잠금으로 순서대로 처리한다.
- 새 테이블이나 마이그레이션 없이 `user_terms_agreements`에 `terms_type='FONT_SHARE'`, `terms_version='v1'` 행 하나로 저장한다. `TermsType` 열거형에는 넣지 않았으므로 회원가입과 `/api/v1/me/terms`(선택 약관 4종)의 응답·입력 검증은 그대로다. 회원 탈퇴 때는 동의 기록 정리와 함께 지워진다.
- 앱(`frontend/src/handwriting/fontShareConsent.js`)은 서버 값을 5분 동안 기억해 두고 쓰며, 설정 화면을 열 때마다 서버에서 다시 읽는다. 공유 다이어리에 폰트를 올리기 직전과 동의를 묻기 직전에는 기억한 값을 쓰지 않고 서버 값을 새로 읽는다. 그래서 다른 기기에서 철회한 동의를 바로 따르고, 서버를 읽지 못하면 올리지 않는다. 기기 저장소 키 `dio:member:v1:<accountId>:font-share-consent:v1`에는 아직 서버로 보내지 못한 답만 남긴다. 예를 들어 예전 버전이 기기에만 저장한 답이나 저장에 실패한 답이다. 이 값은 로그인 직후, 또는 다음에 동의를 읽을 때 서버로 옮기고 지운다. 서버를 읽지 못하면 묻지도 올리지도 않는다(`unavailable`).
- 미인증은 401, `agreed`가 없으면 400이다.

## 오류

- 미인증은 401, 잘못된 UUID·누락된 필드는 400이다. 접근할 수 없는 다이어리나 존재하지 않는 폰트는 404로 처리한다.
- 폰트 파일을 찾을 수 없으면 `FONT_NOT_FOUND`, 저장소에 접근할 수 없으면 503 `FONT_STORAGE_UNAVAILABLE`을 반환한다.
- 업로드 크기 초과는 413 `MEDIA_FILE_TOO_LARGE`, 업로드 동시 실행 한도 초과는 503 `MEDIA_UPLOAD_BUSY`와 `Retry-After`를 반환한다.
- 공유 폰트 다운로드 동시 실행·대기 한도 초과 시 503과 `Retry-After: 1`을 반환한다. 기본 프로세스별 한도는 실행 2건, 대기 4건, 대기 시간 250ms이며 `dio.font.download.max-concurrent`, `max-waiters`, `wait-millis`로 조정한다.

폰트 다운로드는 저장소 읽기 동안 DB 잠금과 연결을 유지하며 같은 파일의 다운로드는 직렬화된다. 실행 한도는 업로드의 기본 3건과 함께 DB 연결 풀보다 충분히 낮게 설정해야 한다. 느린 S3 및 실제 운영 부하의 영향은 별도 검증이 필요하다.

업로드 실패 시 저장소 객체는 즉시 삭제하지 않는다. 예약된 정리 큐 항목을 통해 지연 정리하며, 서버 중단이나 저장소 쓰기 지연이 있는 실제 S3 환경에서의 복구는 아직 검증하지 않았다.
