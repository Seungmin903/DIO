# 미디어 API

모든 `/api/v1/media/**` API는 Bearer access token이 필요하다. 메타데이터·삭제는 본인 소유 파일만 가능하며, 원본 파일은 소유자 또는 해당 미디어가 추가된 공유 보관함의 현재 참여자만 조회할 수 있다.

| 기능 | 메서드·경로 | 응답 |
| --- | --- | --- |
| 업로드 | `POST /api/v1/media` (`multipart/form-data`, `file`, 선택 `libraryCategory`) | `201 Created` |
| 보관함 목록 | `GET /api/v1/media?limit=30&cursor={nextCursor}` | `200 OK` |
| 메타데이터 | `GET /api/v1/media/{mediaFileId}` | `200 OK` |
| 원본 파일 | `GET /api/v1/media/{mediaFileId}/file` | `200 OK` |
| 미디어 썸네일 조회 | `GET /api/v1/media/{mediaFileId}/thumbnail` | `200 OK`, `image/png` |
| 삭제 | `DELETE /api/v1/media/{mediaFileId}` | `204 No Content` |

## 미디어 썸네일 조회

`GET /api/v1/media/{mediaFileId}/thumbnail`은 원본 파일과 같은 소유자·현재 공유 보관함/캔버스 접근 권한을 확인한다. 인증 없이는 401, 존재하지 않거나 읽을 수 없는 파일은 404, 이미지 외 파일은 `415 MEDIA_THUMBNAIL_UNSUPPORTED`다. 손상되거나 가로·세로 12,000px / 6,400만 화소 제한을 넘는 이미지는 `400 INVALID_MEDIA_FILE`이다.

- JPEG·PNG·WebP·GIF에서 긴 변 최대 320px, 비율·투명도를 유지한 정지 PNG를 반환한다. JPEG EXIF 방향을 반영하고 GIF는 첫 장면만 사용한다. 선택·편집에는 기존 `/file` 원본을 사용한다.
- 최초 조회 시 생성하고 기존 원본 키 뒤에 `.thumbnail-v1.png`를 붙여 같은 저장소(S3 또는 로컬)에 보관한다. 이후 요청은 저장한 파생 파일을 읽지만 접근 권한은 매번 확인한다. 과거 업로드도 최초 조회 때 생성하므로 DB 뷰·별도 테이블·마이그레이션·일괄 백필은 필요 없다.
- 원본을 바꾸지 않으며, 썸네일을 `media_files` 목록에 별도 사진으로 추가하지 않는다. 원본 물리 삭제/업로드 복구의 저장소 정리에서 썸네일도 함께 삭제한다. 파생 파일 저장은 원본 행 잠금으로 물리 삭제와 직렬화한다.
- 서버 생성은 기존 미디어 메모리 예산에서 건당 3 units를 차지한다(기본값 6 units에서 최대 2건). 같은 프로세스의 동일 파일 생성은 잠금 후 저장된 파일을 다시 확인하여 중복 작업을 줄인다.
- 손상·픽셀 제한 등 디코딩의 `INVALID_MEDIA_FILE` 실패는 원본 저장소 키별로 2분간 기억한다(인스턴스당 최대 1,024건). 반복 요청에서도 권한은 먼저 확인하며 실패 캐시가 유효하면 원본 읽기·디코딩·permit 획득을 생략한다. 만료 또는 항목 밀림 후에는 다시 시도한다. 네트워크·저장소 장애와 admission의 503은 실패 캐시에 넣지 않는다. Redis·DB 스키마·인프라 설정 추가는 없다.
- 응답은 `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`다. 앱의 명시적 캐시는 서버 주소·계정별로 분리해 24시간 보관하며, 네이티브는 계정별 100장, 웹 IndexedDB는 전용 저장소 전체 100장을 기준으로 정리한다. 표시 중인 네이티브 파일은 아래 참조 보호 정책에 따라 일시적으로 상한을 초과할 수 있다. 기기 캐시가 사라지거나 만료되면 API에서 다시 받는다.
- 화면에 보이는 `PhotoRow`가 참조를 얻고, 화면 밖으로 나가거나 언마운트되면 반환한다. 메모리 LRU는 참조 중인 URI를 해제하지 않으며 네이티브 파일 정리도 같은 파일의 모든 참조가 반환될 때까지 보호한다. 같은 사진을 여러 행/런타임에서 보여도 첫 행의 종료만으로 해제하지 않는다. 표시 중인 항목만으로 100개를 넘으면 잠시 보존하고 참조 반환 시 정리한다. 웹에서는 디스크 Blob 삭제와 표시 URL 수명을 분리한다. 로그아웃·세션 종료의 전체 삭제는 참조 유무와 관계없이 실행한다.
- 행이 다시 보이면 미리보기를 새로 조회하며, 화면 밖의 행은 이전 URI를 이미지 컴포넌트에 계속 넘기지 않는다. 이미지 표시 오류는 디스크를 유지한 채 한 번 다시 읽는다. 같은 네이티브 URI도 이미지 인스턴스를 새로 만들며 이전 시도의 늦은 오류는 무시한다. 두 번째 표시 오류에만 해당 URI의 디스크 캐시를 삭제한다. 재조회 네트워크 오류로는 삭제하지 않으며, 이전 URI의 오류가 새 URI를 삭제하지 않도록 예상 URI를 비교한다.
- 로그아웃·명시적 토큰 만료·계정 삭제·비밀번호 변경으로 세션이 종료되면 썸네일 전용 캐시 전체를 삭제한다(웹 IndexedDB의 모든 계정 Blob과 생성한 표시 URL / 네이티브 썸네일 캐시 폴더). 원본 미디어와 서버 S3 파일은 삭제하지 않는다. 진행 중 저장은 세대 검사와 저장소 작업 순서로 차단해 삭제 후 늦은 응답이 다시 저장되지 않게 한다.
- 디코딩 범위의 `RuntimeException`도 `INVALID_MEDIA_FILE`로 변환해 같은 실패 캐시에 포함한다. JVM `Error`는 변환하지 않는다. 생성 락은 사진 id 해시로 고르는 64개 락이라 서로 다른 사진이 같은 락을 함께 쓸 수 있다(앱은 패널마다 동시 2개만 요청하고, 503이면 0.4·1·2초 뒤 3번 다시 시도한다). 락은 최대 250ms 대기하며 락 안에서 저장된 썸네일·실패 캐시를 재확인한 뒤 실제 생성할 때만 admission permit을 얻는다. 대기자는 이미지 처리 예산을 점유하지 않는다.
- S3의 기존 제한은 연결·소켓·시도별 5초 / API 호출 전체 20초다. 원본 행 잠금과 썸네일 저장의 직렬화는 유지한다. 저장 실패 시 트랜잭션 롤백·다른 트랜잭션의 행 잠금 획득·커넥션 반환은 별도 H2/저장소 장애 대체 테스트로 검증하며, 실제 S3·PostgreSQL 장애 검증과 구분한다.
- 썸네일 `put` 동안 DB 커넥션·원본 행 잠금을 유지하되, 같은 프로세스의 생성/저장은 admission 안에서만 실행한다. 64개 stripe는 전역 동시성 상한이 아니다. 기본 6 units에서 썸네일은 최대 2건, 최소 2 units를 쓰는 일반 업로드까지 고려한 미디어 저장 최대 동시성은 3건이며 Hikari 기본 풀은 10개다. `MEDIA_UPLOAD_MAX_IN_FLIGHT_UNITS`(이전 `MEDIA_UPLOAD_MAX_CONCURRENT` 포함)를 높이거나 `spring.datasource.hikari.maximum-pool-size`를 줄일 때에는 `floor(units/2) + 일반 API 여유 <= 풀 크기`를 확인해야 한다. 테스트의 여유 기준은 최소 2개다. 이는 미디어 쓰기 점유에 대한 기준이며 다른 API·정리 작업까지 포함한 운영 부하 보장은 아니다.
- `MediaThumbnailPoolTests`는 저장을 latch로 지연시킨 채 실제 Hikari 풀의 활성 커넥션 수, 초과 요청의 503, 같은 풀을 쓰는 일반 SELECT의 완료를 검사한다. 기본 6 units/풀 4개에서 썸네일 2건, 변경 설정 12 units/풀 8개에서 4건이 저장 중이어도 SELECT가 완료되어야 한다. `GuardedThumbnailFailureTests`는 실패 시 락·커넥션 반환을 별도로 확인한다. 실제 S3 대신 지연 저장소를 사용하며, 기본 H2와 명시적인 일회용 PostgreSQL에서 같은 풀 계약을 실행한다.
- 네이티브는 `.saved-at` 파일에 저장 시각을 기록해 `modificationTime` 누락과 무관하게 TTL을 유지한다. 저장 시각이 없는 이전 캐시는 첫 확인 시각부터 TTL을 시작한다. 이미지 정리 시 저장 시각 파일도 함께 지우고, 100장 상한에는 PNG만 센다. 100장을 넘겨 지울 때도 TTL과 같은 기준(`.saved-at` → `modificationTime`)의 저장 시각이 오래된 것부터 지우고, 저장 시각을 알 수 없는 이전 캐시를 먼저 지운다.
- 웹에서 IndexedDB가 차단되거나 저장 용량이 부족하면 받은 Blob을 메모리 object URL로 표시하고 영속 저장을 건너뛴다. 해당 URL도 종료·로그아웃 때 해제한다. 세션 무효화 오류는 폴백으로 복구하지 않는다.

WebP 디코딩에는 [TwelveMonkeys ImageIO](https://github.com/haraldk/TwelveMonkeys) 3.15.0의 `imageio-webp`를 사용한다. 서버 저장소 재사용과 앱 캐시는 별개이며, 목록 페이지 크기(기본 30)는 변경하지 않는다.

테스트 기본 DB URL은 테스트 전용 `FixedTestDatabaseInitializer`가 컨텍스트 초기화 시 한 번 생성해 고정한다. 이후 Environment 재조회와 데이터소스 바인딩에서 같은 URL을 사용하며, 다른 컨텍스트는 다른 이름을 쓴다. 테스트에서 명시한 H2/PostgreSQL URL은 덮어쓰지 않는다. `${random.uuid}`를 URL에서 직접 평가하지 않으며 운영 설정·배포 JAR에는 이 초기화기가 포함되지 않는다.

```powershell
# backend/에서 기본 H2 검증
.\gradlew.bat test --tests 'com.f106.DIO.testinfra.FixedTestDatabaseInitializerTests' --tests 'com.f106.DIO.media.service.MediaThumbnailPoolTests' --tests 'com.f106.DIO.media.service.GuardedThumbnailFailureTests'
# 공유 DB가 아닌 일회용 loopback PostgreSQL DB dio_thumbnail_pool_qa를 먼저 준비한다.
$env:DIO_THUMBNAIL_POOL_POSTGRES_QA='true'
$env:DIO_THUMBNAIL_POOL_POSTGRES_URL='jdbc:postgresql://127.0.0.1:포트/dio_thumbnail_pool_qa'
$env:DIO_THUMBNAIL_POOL_POSTGRES_PASSWORD='일회용 DB 비밀번호'
.\gradlew.bat test --tests 'com.f106.DIO.media.service.MediaThumbnailPoolTests'
```

프론트 회귀는 `frontend/`에서 `node --test tests/media-thumbnail-*.test.js tests/media-library-runtime.test.js tests/photo-source-runtime-lifecycle.test.js`로 실행한다. `media-thumbnail-lifetime.test.js`는 150장 이후 표시 URI 보호, 다중 참조·해제, 180장 조회 후 첫 행 재진입, 늦은 오류와 1회 재시도를 검사한다. 네이티브 정리 테스트는 실제 Expo 파일 API 대체 객체로 보관 파일 보호를 검증한다(실기기 실행과 구분).

`qa/thumbnail-scroll-browser.cjs`는 전용 Expo 서버(`pnpm exec expo start --web --port 18081 --localhost`) 및 설치된 Chrome 경로(`PLAYWRIGHT_EXECUTABLE_PATH`)와 `EXPO_QA_PORT=18081`을 지정해 실행한다. 합성 사진 180개를 실제 `PhotoSourcePicker`·Blob·IndexedDB로 표시해 100개 넘게 스크롤하고 첫 행 복귀·패널 재열기를 검증한다. 원본/사용자 계정/운영 API를 사용하지 않는다.

2026-11-12 URI 수명 검증: 관련 테스트 30건 통과. Chrome 1280×800에서 177장, 390×844에서 173장 조회 후 첫 사진 복귀·패널 재열기 성공, `미리보기 실패`/디스크 무효화 0건. 웹 export 성공. 전체 프론트 회귀는 3,512건 중 3,494건 통과·17건 실패·1건 제외였으며, 동일한 실패 17건을 수정 전 `0f62d241` 사본에서도 재현했다. 실패는 색 창, 선택/도구/읽기 화면의 테스트 대체 객체·소스 기대값, 알림 계약 파일 사전 조건 등이며 이번 썸네일 수명 변경에 섞어 수정하지 않는다. 이후 계정 검사 테스트 1건을 추가해 관련 30건을 다시 실행했다. 네이티브 실기기 QA는 수행하지 않았다.

서버는 파일 시그니처를 직접 검사하여 `mediaType`과 MIME을 저장한다. 지원 형식은 JPEG, PNG, WebP, GIF 및 MP3, M4A/M4B, WAV, OGG, TTF/OTF, PDF다. GIF는 최대 15MiB, 그 밖의 이미지·오디오는 최대 5MiB, 폰트와 PDF 원본은 최대 25MiB다. PDF는 첫 1,024바이트 안의 `%PDF-` 헤더가 있어야 하며 `DOCUMENT`·`application/pdf`로 저장한다. PDF 암호화 여부나 페이지 내용은 서버에서 해석하지 않는다. GIF는 `IMAGE`로 저장되고 `mimeType=image/gif`로 구분한다. ISO BMFF 오디오는 `ftyp` major brand가 `M4A ` 또는 `M4B `인 파일만 받는다. `mp42`·`isom`은 영상과 안전하게 구별할 수 없어 거절한다. WebM도 오디오·비디오를 안전하게 구별하는 EBML 트랙 파서를 추가하기 전까지 업로드하지 않는다.

25MiB PDF·폰트가 서비스에 닿기 전에 막히지 않도록 `backend/src/main/resources/application.yml`의 Spring multipart는 파일당 25MB, 요청당 26MB이고, 업로드 경로의 dev·prod Nginx `client_max_body_size`도 26m이다. `MediaUploadLimitConfigTests`가 이 값을 정확히 검증한다.

`MediaService`는 업로드 원본을 `byte[]`로 보유하므로 `dio.media.upload.max-in-flight-units`로 프로세스별 원본 페이로드 예산을 가중 제한한다. 기본 6 units는 일반 5MiB 업로드 3건 또는 15MiB GIF 2건을 동시에 허용해 원본 합계 약 30MiB를 기준으로 삼는다. 이는 힙 상한이 아니다. `readNBytes`의 임시 버퍼와 저장소 클라이언트 복사본 때문에 실제 피크 힙 사용량은 더 클 수 있으므로 운영 힙은 부하 측정으로 정한다. 25MiB 폰트·PDF를 허용하려면 최소 5 units가 필요하다. 기존 `dio.media.upload.max-concurrent` 또는 `MEDIA_UPLOAD_MAX_CONCURRENT`가 설정된 배포는 한 건을 2 units로 변환해 호환하며, 이전 값 1·2처럼 변환 결과가 5보다 작으면 서버가 경고를 남기고 5 units로 올린다. 신규 설정은 `MEDIA_UPLOAD_MAX_IN_FLIGHT_UNITS`를 사용한다.

`libraryCategory`는 이미지에서 `PHOTO`, `STICKER`, `TAPE`, 오디오에서 `AUDIO`, 폰트에서 `FONT`, PDF 원본에서 `DOCUMENT`만 허용한다. 생략하면 각각 `PHOTO`, `AUDIO`, `FONT`, `DOCUMENT`가 설정된다. `DOCUMENT`는 개인 미디어 목록과 다이어리 공유 보관함에 노출·추가되지 않는다. PDF 원본 파일은 캔버스에서 참조하는 구성원만 다운로드할 수 있다.

업로드 형식이 맞지 않으면 `400 INVALID_MEDIA_FILE`, 파일 크기를 넘으면 `413 MEDIA_FILE_TOO_LARGE`를 반환한다. PDF의 25MiB 초과는 `PDF 원본은 25MiB 이하로 올려 주세요.`라는 상세 메시지를 반환한다.

## 캔버스 PDF 원본 참조

PDF를 페이지별 PNG로 표시하는 요소는 기존 `mediaFileId`에 PNG의 서버 UUID를 유지하고, `propertiesJson`에 원본 PDF의 서버 UUID를 함께 저장한다.

```json
{
  "pdfSource": {
    "mediaFileId": "<DOCUMENT uuid>",
    "pageIndex": 0,
    "edge": 3000
  }
}
```

`pdfSource`는 `propertiesJson`의 **최상위 객체 하나**여야 하며, `pdfSource.mediaFileId`는 반드시 `DOCUMENT`여야 한다. 기존 `mediaFileId` 및 `cells[].mediaFileId`를 포함한 나머지 참조는 반드시 `IMAGE`여야 한다. 같은 UUID를 이미지와 PDF 원본 슬롯에 동시에 둘 수 없다. 중첩 객체·배열의 `pdfSource`는 저장 전에 거절한다. 이 참조는 다이어리 OWNER·EDITOR의 원본 파일 읽기 권한 및 삭제 보존 대상에 포함된다.

보관함 목록은 최신순 커서 페이지네이션을 사용한다. `limit`은 1~100이며 기본값은 30이다. 응답의 `nextCursor`가 있으면 다음 요청의 `cursor`에 그대로 넣는다.

## 다이어리 공유 보관함

모든 `/api/v1/diaries/{diaryId}/media-library/**` API도 Bearer access token이 필요하다. OWNER·EDITOR는 본인이 올린 활성 미디어 중 `STICKER`·`TAPE`만 공유 보관함에 추가하거나 제거할 수 있고, OWNER·EDITOR·VIEWER는 목록을 조회할 수 있다.

| 기능 | 메서드·경로 | 요청·응답 |
| --- | --- | --- |
| 추가 | `POST /api/v1/diaries/{diaryId}/media-library` | 본문 `{ "mediaFileId": "UUID" }`, `201 Created` |
| 목록 | `GET /api/v1/diaries/{diaryId}/media-library?limit=30&cursor={nextCursor}` | `200 OK`, 최신 추가순 `mediaFiles` 배열과 `nextCursor` |
| 연결 삭제 | `DELETE /api/v1/diaries/{diaryId}/media-library/{mediaFileId}` | `204 No Content` |

공유 보관함 목록도 개인 보관함과 같은 커서 페이지네이션을 쓴다. `limit`은 1~100이고 기본값은 30이다. 응답의 `nextCursor`가 있으면 다음 요청의 `cursor`에 그대로 넣는다. 범위를 벗어난 `limit`은 `400 INVALID_MEDIA_LIMIT`, 잘못된 커서는 `400 INVALID_MEDIA_CURSOR`다. 원본이 삭제된 공유 항목은 조회 단계에서 빠지므로 페이지가 짧아지지 않는다.

공유 보관함 삭제는 해당 다이어리의 연결만 없애며 원본 미디어는 삭제하지 않는다. 반대로 원본 미디어가 공유 보관함에 하나라도 남아 있으면 `409 MEDIA_FILE_SHARED`로 삭제를 거절한다. 대상은 활성 다이어리와, 휴지통에 있지만 아직 복원할 수 있는 다이어리(삭제 후 30일, `DiaryRetention.PERIOD`)다. 먼저 그 연결을 제거해야 한다. 휴지통 다이어리를 복원했을 때 공유한 스티커·테이프가 아무 안내 없이 사라져 있지 않도록 복원 기간 동안에도 막는다. 복원 기간이 지난 다이어리는 복원 API가 `410 DIARY_RESTORE_EXPIRED`로 거절하므로 연결을 세지 않는다. 이런 연결은 다이어리를 물리 삭제할 때 지워지고, 그때까지는 정리 배치가 원본 파일을 남겨 둔다.

연결 제거는 원래 OWNER·EDITOR만 할 수 있다. 다만 **미디어 원본 소유자**는 다이어리에서 나갔거나 VIEWER가 된 뒤에도, 다이어리가 삭제된 뒤에도 자기 미디어의 공유 연결을 제거할 수 있다. 그래서 공유 때문에 원본 삭제가 영구히 막히지 않는다. 공유 보관함 추가와 원본 삭제는 같은 미디어 행을 `PESSIMISTIC_WRITE`로 잠근다. 동시에 일어나도 삭제된 미디어의 공유 연결이 새로 생기지 않는다. 같은 미디어를 같은 다이어리에 다시 추가하면 `409 MEDIA_LIBRARY_ALREADY_CONTAINS_MEDIA`, 사진·오디오를 추가하면 `400 UNSUPPORTED_SHARED_MEDIA_CATEGORY`다.

## 저장소 설정

로컬 개발·테스트의 기본값은 로컬 디렉터리 `.local-data/media`다. 배포 서버의 컨테이너 디스크는 재배포·증설 때 사라지므로 `dev`·`prod` 프로필에서는 로컬 저장소로 기동하지 않고, 두 프로필 모두 `MEDIA_STORAGE=s3`이 기본값이다. 개발·운영은 **서로 다른 S3 버킷**을 설정한다. `infra/compose/compose.{dev,prod}.yml`이 `MEDIA_STORAGE`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_DELETE_RETENTION`, `MEDIA_EXPIRY_CLEANUP_ENABLED`를 컨테이너에 넘긴다. 프로필 사진도 같은 `MEDIA_STORAGE`·`MEDIA_S3_BUCKET`·`MEDIA_S3_REGION`을 쓴다. 키 접두사(`media/`, `profile-photos/`)가 달라 한 버킷에서 충돌하지 않는다. 이전의 `SIGNUP_PHOTO_STORAGE`·`SIGNUP_PHOTO_S3_*`는 읽지 않는다. 기존 사진은 DB에 기록된 provider·버킷에서 읽으므로 계속 조회된다. 러너의 `dio-env/{dev,prod}.env`에 `MEDIA_S3_BUCKET`이 없으면 배포 단계의 `docker compose config`에서 실패한다. S3 객체 키는 서버가 `media/{image|audio}/YYYY/MM/{uuid}.{ext}` 형식으로 생성하며, 클라이언트가 키나 버킷을 지정할 수 없다.

삭제 API는 DB 행에 `deletedAt`만 기록하는 소프트 삭제다. 원본 객체는 즉시 지우지 않는다. 삭제 직후부터 이 API의 메타데이터·원본 조회는 404다.

정리 배치가 참조로 보는 곳은 캔버스 요소, 공유 보관함(`diary_media_library`), 손글씨 폰트(`diary_handwriting_fonts`), AI 작업(`ai_jobs`), 파생 미디어(`media_files.source_media_file_id`)다. 캔버스 요소 API는 `mediaFileId`를 받지 않고(400 `MEDIA_FILE_NOT_SUPPORTED`) 공유 보관함만 현재 참조를 만드는 API다. 공유 보관함에 연결된 원본은 직접 삭제를 409로 막아 표시가 깨지지 않게 한다.

위 참조를 만드는 기능을 추가할 때는 같은 작업에서 두 가지를 함께 넣는다. 첫째, 활성 참조가 있는 미디어의 보관함 삭제를 409로 거절하는 정책을 넣는다. 둘째, 그 정책을 검증하는 테스트를 넣는다. 소프트 삭제 직후 조회 404로 참조하는 쪽 표시가 깨지거나, 참조가 사라진 뒤 바로 물리 삭제되는 일을 막기 위해서다.

사용자별 총 저장 용량이나 일일 업로드 횟수 제한은 아직 없다. 파일당 크기 검사(이미지 5MiB, GIF 15MiB)만 있으므로, 운영 공개 전에 사용자별 상한이나 Nginx·애플리케이션 rate limit을 정한다.

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
