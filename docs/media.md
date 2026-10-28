# 미디어 API

모든 `/api/v1/media/**` API는 Bearer access token이 필요하며, 본인 소유의 파일만 조회·삭제할 수 있다.

| 기능 | 메서드·경로 | 응답 |
| --- | --- | --- |
| 업로드 | `POST /api/v1/media` (`multipart/form-data`, `file`, 선택 `libraryCategory`) | `201 Created` |
| 보관함 목록 | `GET /api/v1/media?limit=30&cursor={nextCursor}` | `200 OK` |
| 메타데이터 | `GET /api/v1/media/{mediaFileId}` | `200 OK` |
| 원본 파일 | `GET /api/v1/media/{mediaFileId}/file` | `200 OK` |
| 삭제 | `DELETE /api/v1/media/{mediaFileId}` | `204 No Content` |

서버는 파일 시그니처를 직접 검사하여 `mediaType`과 MIME을 저장한다. 지원 형식은 JPEG, PNG, WebP, GIF 및 MP3, M4A, WAV, OGG이며 최대 크기는 5MB다. GIF는 `IMAGE`로 저장되고 `mimeType=image/gif`로 구분한다. WebM은 오디오·비디오를 안전하게 구별하는 EBML 트랙 파서를 추가하기 전까지 업로드하지 않는다.

`libraryCategory`는 이미지에서 `PHOTO`, `STICKER`, `TAPE`, 오디오에서 `AUDIO`만 허용한다. 생략하면 각각 `PHOTO`, `AUDIO`가 설정된다.

보관함 목록은 최신순 커서 페이지네이션을 사용한다. `limit`은 1~100이며 기본값은 30이다. 응답의 `nextCursor`가 있으면 다음 요청의 `cursor`에 그대로 넣는다.

## 저장소 설정

기본값은 로컬 디렉터리 `.local-data/media`다. `prod` 프로필에서는 로컬 저장소를 사용할 수 없고, `MEDIA_STORAGE=s3`이 기본값이다. 개발·운영은 **서로 다른 S3 버킷**을 설정한다. S3 객체 키는 서버가 `media/{image|audio}/YYYY/MM/{uuid}.{ext}` 형식으로 생성하며, 클라이언트가 키나 버킷을 지정할 수 없다.

삭제 API는 DB 행에 `deletedAt`만 기록하는 소프트 삭제다. 원본 객체는 즉시 지우지 않는다.

## 삭제 보존·정리 정책

- 보관함에서 직접 삭제한 미디어는 **24시간** 보관한 뒤 정리 배치가 S3(또는 로컬 저장소) 원본과 DB 행을 물리 삭제한다.
- 삭제된 다이어리는 **30일** 보관한 뒤 하위 페이지·캔버스 요소·공유 정보와 함께 물리 삭제한다. 다이어리에 연결된 미디어 원본은 이 과정에서 삭제하지 않는다.
- 미디어는 캔버스 요소, 공유 보관함, 손글씨 폰트, AI 작업 또는 파생 미디어가 참조하는 동안 물리 삭제하지 않는다. 따라서 삭제된 다이어리가 미디어를 참조하는 경우에도 다이어리의 30일 보존 기간이 끝난 뒤에야 미디어 정리 대상이 될 수 있다.
- 저장소 삭제가 실패하면 DB 행을 남겨 다음 배치에서 재시도한다.

정리 배치는 기본적으로 1시간마다 최대 100건씩 실행한다. `RETENTION_CLEANUP_ENABLED=false`로 비활성화할 수 있으며, 보존 기간과 배치 크기는 아래 환경변수로 바꿀 수 있다.

```dotenv
# 개발 환경 예시
MEDIA_STORAGE=s3
MEDIA_S3_BUCKET=dio-media-dev
MEDIA_S3_REGION=ap-northeast-2

# 삭제 보존 정책 (ISO-8601 Duration)
MEDIA_DELETE_RETENTION=PT24H
DIARY_DELETE_RETENTION=P30D
RETENTION_CLEANUP_DELAY_MS=3600000
RETENTION_CLEANUP_BATCH_SIZE=100

# 운영 환경에는 별도의 dio-media-prod 버킷을 사용
```
