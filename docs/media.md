# 미디어 API

모든 `/api/v1/media/**` API는 Bearer access token이 필요하며, 본인 소유의 파일만 조회·삭제할 수 있다.

| 기능 | 메서드·경로 | 응답 |
| --- | --- | --- |
| 업로드 | `POST /api/v1/media` (`multipart/form-data`, `file`, 선택 `libraryCategory`) | `201 Created` |
| 보관함 목록 | `GET /api/v1/media` | `200 OK` |
| 메타데이터 | `GET /api/v1/media/{mediaFileId}` | `200 OK` |
| 원본 파일 | `GET /api/v1/media/{mediaFileId}/file` | `200 OK` |
| 삭제 | `DELETE /api/v1/media/{mediaFileId}` | `204 No Content` |

서버는 파일 시그니처를 직접 검사하여 `mediaType`과 MIME을 저장한다. 지원 형식은 JPEG, PNG, WebP, GIF 및 MP3, M4A, WAV, WebM, OGG이며 최대 크기는 5MB다. GIF는 `IMAGE`로 저장되고 `mimeType=image/gif`로 구분한다.

`libraryCategory`는 이미지에서 `PHOTO`, `STICKER`, `TAPE`, 오디오에서 `AUDIO`만 허용한다. 생략하면 각각 `PHOTO`, `AUDIO`가 설정된다.

## 저장소 설정

기본값은 로컬 디렉터리 `.local-data/media`다. 개발·운영은 **서로 다른 S3 버킷**을 설정한다. S3 객체 키는 서버가 `media/{image|audio}/YYYY/MM/{uuid}.{ext}` 형식으로 생성하며, 클라이언트가 키나 버킷을 지정할 수 없다.

```dotenv
# 개발 환경 예시
MEDIA_STORAGE=s3
MEDIA_S3_BUCKET=dio-media-dev
MEDIA_S3_REGION=ap-northeast-2

# 운영 환경에는 별도의 dio-media-prod 버킷을 사용
```
