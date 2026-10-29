# 미디어 API

모든 `/api/v1/media/**` API는 Bearer access token이 필요하다. 메타데이터·삭제는 본인 소유 파일만 가능하며, 원본 파일은 소유자 또는 해당 미디어가 추가된 공유 보관함의 현재 참여자만 조회할 수 있다.

| 기능 | 메서드·경로 | 응답 |
| --- | --- | --- |
| 업로드 | `POST /api/v1/media` (`multipart/form-data`, `file`, 선택 `libraryCategory`) | `201 Created` |
| 보관함 목록 | `GET /api/v1/media?limit=30&cursor={nextCursor}` | `200 OK` |
| 메타데이터 | `GET /api/v1/media/{mediaFileId}` | `200 OK` |
| 원본 파일 | `GET /api/v1/media/{mediaFileId}/file` | `200 OK` |
| 삭제 | `DELETE /api/v1/media/{mediaFileId}` | `204 No Content` |

서버는 파일 시그니처를 직접 검사하여 `mediaType`과 MIME을 저장한다. 지원 형식은 JPEG, PNG, WebP, GIF 및 MP3, M4A/M4B, WAV, OGG이며 최대 크기는 5MB다. GIF는 `IMAGE`로 저장되고 `mimeType=image/gif`로 구분한다. ISO BMFF 오디오는 `ftyp` major brand가 `M4A ` 또는 `M4B `인 파일만 받는다. `mp42`·`isom`은 영상과 안전하게 구별할 수 없어 거절한다. WebM도 오디오·비디오를 안전하게 구별하는 EBML 트랙 파서를 추가하기 전까지 업로드하지 않는다.

5MB 파일이 서비스에 닿기 전에 막히지 않도록 Spring multipart는 파일당 5MB, 요청당 6MB이고, dev·prod Nginx `client_max_body_size`는 6m이다. 테스트용 `application.yml`이 본 설정을 가리므로 `MediaUploadLimitConfigTests`가 실제 설정 파일을 읽어 세 값을 함께 확인한다.

`libraryCategory`는 이미지에서 `PHOTO`, `STICKER`, `TAPE`, 오디오에서 `AUDIO`만 허용한다. 생략하면 각각 `PHOTO`, `AUDIO`가 설정된다.

보관함 목록은 최신순 커서 페이지네이션을 사용한다. `limit`은 1~100이며 기본값은 30이다. 응답의 `nextCursor`가 있으면 다음 요청의 `cursor`에 그대로 넣는다.

## 다이어리 공유 보관함

모든 `/api/v1/diaries/{diaryId}/media-library/**` API도 Bearer access token이 필요하다. OWNER·EDITOR는 본인이 올린 활성 미디어 중 `STICKER`·`TAPE`만 공유 보관함에 추가하거나 제거할 수 있고, OWNER·EDITOR·VIEWER는 목록을 조회할 수 있다.

| 기능 | 메서드·경로 | 요청·응답 |
| --- | --- | --- |
| 추가 | `POST /api/v1/diaries/{diaryId}/media-library` | 본문 `{ "mediaFileId": "UUID" }`, `201 Created` |
| 목록 | `GET /api/v1/diaries/{diaryId}/media-library?limit=30&cursor={nextCursor}` | `200 OK`, 최신 추가순 `mediaFiles` 배열과 `nextCursor` |
| 연결 삭제 | `DELETE /api/v1/diaries/{diaryId}/media-library/{mediaFileId}` | `204 No Content` |

공유 보관함 목록도 개인 보관함과 같은 커서 페이지네이션을 쓴다. `limit`은 1~100이고 기본값은 30이다. 응답의 `nextCursor`가 있으면 다음 요청의 `cursor`에 그대로 넣는다. 범위를 벗어난 `limit`은 `400 INVALID_MEDIA_LIMIT`, 잘못된 커서는 `400 INVALID_MEDIA_CURSOR`다. 원본이 삭제된 공유 항목은 조회 단계에서 빠지므로 페이지가 짧아지지 않는다.

공유 보관함 삭제는 해당 다이어리의 연결만 없애며 원본 미디어는 삭제하지 않는다. 반대로 원본 미디어가 삭제되지 않은 다이어리의 공유 보관함에 하나라도 남아 있으면 `409 MEDIA_FILE_SHARED`로 삭제를 거절한다. 먼저 그 연결을 제거해야 한다. 삭제된 다이어리의 연결은 세지 않는다. 이런 연결은 다이어리를 물리 삭제할 때 지워지고, 그때까지는 정리 배치가 원본 파일을 남겨 둔다.

연결 제거는 원래 OWNER·EDITOR만 할 수 있다. 다만 **미디어 원본 소유자**는 다이어리에서 나갔거나 VIEWER가 된 뒤에도, 다이어리가 삭제된 뒤에도 자기 미디어의 공유 연결을 제거할 수 있다. 그래서 공유 때문에 원본 삭제가 영구히 막히지 않는다. 공유 보관함 추가와 원본 삭제는 같은 미디어 행을 `PESSIMISTIC_WRITE`로 잠근다. 동시에 일어나도 삭제된 미디어의 공유 연결이 새로 생기지 않는다. 같은 미디어를 같은 다이어리에 다시 추가하면 `409 MEDIA_LIBRARY_ALREADY_CONTAINS_MEDIA`, 사진·오디오를 추가하면 `400 UNSUPPORTED_SHARED_MEDIA_CATEGORY`다.

## 저장소 설정

로컬 개발·테스트의 기본값은 로컬 디렉터리 `.local-data/media`다. 배포 서버의 컨테이너 디스크는 재배포·증설 때 사라지므로 `dev`·`prod` 프로필에서는 로컬 저장소로 기동하지 않고, 두 프로필 모두 `MEDIA_STORAGE=s3`이 기본값이다. 개발·운영은 **서로 다른 S3 버킷**을 설정한다. `infra/compose/compose.{dev,prod}.yml`이 `MEDIA_STORAGE`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_DELETE_RETENTION`, `MEDIA_EXPIRY_CLEANUP_ENABLED`를 컨테이너에 넘긴다. 미디어와 프로필 사진은 키 접두사(`media/`, `profile-photos/`)가 달라 같은 버킷을 써도 된다. 그래서 `MEDIA_S3_BUCKET`과 `SIGNUP_PHOTO_S3_BUCKET`(리전도 마찬가지) 중 하나만 설정하면 나머지가 같은 값을 쓴다. 따로 두려면 둘 다 설정한다. 러너의 `dio-env/{dev,prod}.env`에 둘 다 없으면 배포 단계의 `docker compose config`에서 실패한다. S3 객체 키는 서버가 `media/{image|audio}/YYYY/MM/{uuid}.{ext}` 형식으로 생성하며, 클라이언트가 키나 버킷을 지정할 수 없다.

삭제 API는 DB 행에 `deletedAt`만 기록하는 소프트 삭제다. 원본 객체는 즉시 지우지 않는다. 삭제 직후부터 이 API의 메타데이터·원본 조회는 404다.

정리 배치가 참조로 보는 곳은 캔버스 요소, 공유 보관함(`diary_media_library`), 손글씨 폰트(`diary_handwriting_fonts`), AI 작업(`ai_jobs`), 파생 미디어(`media_files.source_media_file_id`)다. 캔버스 요소 API는 `mediaFileId`를 받지 않고(400 `MEDIA_FILE_NOT_SUPPORTED`) 공유 보관함만 현재 참조를 만드는 API다. 공유 보관함에 연결된 원본은 직접 삭제를 409로 막아 표시가 깨지지 않게 한다.

위 참조를 만드는 기능을 추가할 때는 같은 작업에서 두 가지를 함께 넣는다. 첫째, 활성 참조가 있는 미디어의 보관함 삭제를 409로 거절하는 정책을 넣는다. 둘째, 그 정책을 검증하는 테스트를 넣는다. 소프트 삭제 직후 조회 404로 참조하는 쪽 표시가 깨지거나, 참조가 사라진 뒤 바로 물리 삭제되는 일을 막기 위해서다.

사용자별 총 저장 용량이나 일일 업로드 횟수 제한은 아직 없다. 파일당 5MB 검사만 있으므로, 운영 공개 전에 사용자별 상한이나 Nginx·애플리케이션 rate limit을 정한다.

## 삭제 보존·정리 정책

- 보관함에서 직접 삭제한 미디어는 **24시간** 보관한 뒤 정리 배치가 S3(또는 로컬 저장소) 원본과 DB 행을 물리 삭제한다.
- 삭제된 다이어리는 **30일** 보관한 뒤 하위 페이지·캔버스 요소·공유 정보와 함께 물리 삭제한다. 다이어리에 연결된 미디어 원본은 이 과정에서 삭제하지 않는다.
- 미디어는 캔버스 요소, 공유 보관함, 손글씨 폰트, AI 작업 또는 파생 미디어가 참조하는 동안 물리 삭제하지 않는다. 따라서 삭제된 다이어리가 미디어를 참조하는 경우에도 다이어리의 30일 보존 기간이 끝난 뒤에야 미디어 정리 대상이 될 수 있다.
- 정리 배치는 참조 경합으로 깨진 링크가 생기지 않도록 조건부 DB 삭제와 저장소 삭제 대기 등록을 같은 트랜잭션에서 확정한 뒤 저장소 원본을 삭제한다. 저장소 삭제가 실패하면 `media_storage_deletion_queue`에 키·원본 미디어 ID·시도 횟수·다음 재시도 시각을 남긴다. 재시도 간격은 1분부터 최대 64분까지 지수로 늘어나며, 다음 배치가 자동 재시도한다. 업로드도 저장소 쓰기 전에 같은 대기 행을 만들고 성공한 DB 저장과 함께 지워서, 중간 종료로 생긴 원본도 회수한다.

정리 배치는 기본적으로 **비활성화**되어 있으며, 운영의 백업·복구 절차를 확인한 뒤 `MEDIA_EXPIRY_CLEANUP_ENABLED=true`로 켠다. 실행 시 1시간마다 저장소 삭제 대상을 최대 100건(`batch-size`) 처리한다. 기존 대기열 재시도에는 최대 절반만 쓰므로, 반복 실패 항목이 쌓여도 최소 절반은 신규 만료 미디어에 할당된다. 후보는 `deleted_at`, `media_file_id` 순으로 커서를 넘기며 최대 5페이지까지 본다. 그래서 DB 삭제가 계속 실패하는 행이 앞쪽에 쌓여도 그 뒤의 정리 대상을 처리한다. 실패한 행은 매 실행 `Expired media cleanup failed` 경고 로그에 `mediaFileId`와 함께 남으므로, 같은 ID가 반복되면 운영자가 원인을 확인한다.

정리 조회와 조건부 삭제는 `MediaFileRepository.PHYSICALLY_DELETABLE` 조건 문자열 하나를 같이 쓴다. `MediaPhysicalDeletePostgresTests`는 Flyway로 만든 실제 스키마에서 이 문자열을 그대로 실행한다. 참조 다섯 종류, 보존 기간 전후, 삭제되지 않은 행, 커서 조건을 확인하며, CI의 `postgresDiaryPurgeTest`(일회용 `dio_trash_qa`)에서 돈다.

PostgreSQL 운영 환경에서는 트랜잭션 advisory lock으로 여러 인스턴스 중 하나만 실행하며, 트랜잭션 종료 시 락은 자동 해제된다. 락을 잡은 커넥션은 정리하는 동안 계속 열려 있고, 정리 작업은 별도 커넥션을 쓴다. 따라서 배치 실행 중에는 인스턴스마다 DB 커넥션 2개가 필요하며, 커넥션 풀은 요청 처리분에 2개를 더한 크기 이상이어야 한다(Hikari 기본값 10). 락을 얻지 못하면 정리를 건너뛰고, 실패하면 롤백 후 커넥션 설정을 되돌린다. 이 분기는 `MediaExpiryScheduleLockTests`가 검증하며, 실제 다중 인스턴스 경합은 PostgreSQL 환경에서 확인한다.

```dotenv
# 개발 환경 예시
MEDIA_STORAGE=s3
MEDIA_S3_BUCKET=dio-media-dev
MEDIA_S3_REGION=ap-northeast-2

# 삭제 보존 정책 (ISO-8601 Duration)
MEDIA_DELETE_RETENTION=PT24H
MEDIA_EXPIRY_CLEANUP_ENABLED=true
MEDIA_EXPIRY_CLEANUP_DELAY_MS=3600000
MEDIA_EXPIRY_CLEANUP_BATCH_SIZE=100

# 운영 환경에는 별도의 dio-media-prod 버킷을 사용
```
