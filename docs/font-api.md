# 손글씨 폰트 API

모든 API는 로그인 인증이 필요하다. `mediaFileId`와 `diaryId`는 UUID다.

## 내 폰트 저장과 조회

- `POST /api/v1/media`: multipart `file`로 완성된 TTF/OTF를 업로드한다. `libraryCategory=FONT`는 선택 사항이며 생략하면 서버가 형식에 따라 분류한다. 폰트는 최대 25 MiB, 이미지·오디오는 최대 5 MiB다. 저장 성공 시 201과 `mediaFileId`를 반환한다.
- `GET /api/v1/handwriting-fonts`: 소유한 `FONT`, `READY`, 미삭제 파일 목록을 반환한다. 각 항목은 `mediaFileId`, `name`(없으면 null), `mimeType`, `fileSize`, `enabled`를 포함한다.
- `GET /api/v1/media/{mediaFileId}/file`: 소유 폰트를 내려받는다. 일반 미디어 API의 기존 공유 이미지 접근 정책도 유지된다.

업로드는 동기 처리한다. 성공 응답 전에 연결이 끊기면 저장 결과가 불확실할 수 있으며 별도 업로드 상태 추적 API는 없다.

## 다이어리 폰트

활성 다이어리의 활성 OWNER·EDITOR만 접근할 수 있다. VIEWER와 비회원·탈퇴 멤버는 접근할 수 없다.

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | `/api/v1/diaries/{diaryId}/fonts` | 공유 폰트 목록 조회. 비활성 공유는 `enabled=false`; 삭제되거나 준비되지 않은 파일은 제외 |
| POST | `/api/v1/diaries/{diaryId}/fonts` | `{"mediaFileId":"UUID"}`로 소유한 폰트 공유, 204 반환 |
| PATCH | `/api/v1/diaries/{diaryId}/fonts/{mediaFileId}` | `{"enabled":true}` 또는 `false`로 상태 변경, 204 반환 |
| GET | `/api/v1/diaries/{diaryId}/fonts/{mediaFileId}/file` | 공유가 활성이고 파일이 `FONT`·`READY`·미삭제인 경우 파일 반환 |

반복 공유는 기존 상태를 유지하며 204를 반환한다. 원본이 삭제되면 목록과 다운로드에서 제외된다. 클라이언트는 목록·권한을 다시 확인해 사용 불가한 캐시를 적용하지 않아야 한다.

## 오류

- 미인증은 401, 잘못된 UUID·누락된 필드는 400이다. 접근할 수 없는 다이어리나 존재하지 않는 폰트는 404로 처리한다.
- 폰트 파일을 찾을 수 없으면 `FONT_NOT_FOUND`, 저장소에 접근할 수 없으면 503 `FONT_STORAGE_UNAVAILABLE`을 반환한다.
- 업로드 크기 초과는 413 `MEDIA_FILE_TOO_LARGE`, 업로드 동시 실행 한도 초과는 503 `MEDIA_UPLOAD_BUSY`와 `Retry-After`를 반환한다.
- 공유 폰트 다운로드 동시 실행·대기 한도 초과 시 503과 `Retry-After: 1`을 반환한다. 기본 프로세스별 한도는 실행 2건, 대기 4건, 대기 시간 250ms이며 `dio.font.download.max-concurrent`, `max-waiters`, `wait-millis`로 조정한다.

폰트 다운로드는 저장소 읽기 동안 DB 잠금과 연결을 유지하며 같은 파일의 다운로드는 직렬화된다. 실행 한도는 업로드의 기본 3건과 함께 DB 연결 풀보다 충분히 낮게 설정해야 한다. 느린 S3 및 실제 운영 부하의 영향은 별도 검증이 필요하다.

업로드 실패 시 저장소 객체는 즉시 삭제하지 않는다. 예약된 정리 큐 항목을 통해 지연 정리하며, 서버 중단이나 저장소 쓰기 지연이 있는 실제 S3 환경에서의 복구는 아직 검증하지 않았다.
