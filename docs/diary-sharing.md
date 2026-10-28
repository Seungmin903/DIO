# 공유 다이어리 API

Jira S15P31F106-324~333의 기존 공유 구현에 이메일 초대를 확장했다. 새 테이블은 만들지 않는다. 합의된 diary_members의 별칭·사진 컬럼 2개와 FK/인덱스를 V9로 추가한다. 프론트 화면은 변경하지 않는다.

## API 목록

| Method | Endpoint | 동작 |
|---|---|---|
| PATCH | `/api/v1/diaries/{diaryId}/profile` | 내 즐겨찾기·마지막 페이지 UUID·다이어리별 별칭·사진 수정 |
| GET | `/api/v1/diaries/{diaryId}/members` | 멤버·계정 닉네임/사진·현재 인원/최대 인원 |
| DELETE | `/api/v1/diaries/{diaryId}/members/{userId}` | 본인 나가기·소유자의 강퇴, 204 |
| POST | `/api/v1/diaries/{diaryId}/transfer-owner` | 소유권 양도만 처리, 기존 소유자는 편집자로 유지, 204 |
| GET | `/api/v1/diaries/{diaryId}/invites` | 현재 링크와 보낸 이메일 초대 목록 |
| POST | `/api/v1/diaries/{diaryId}/invites` | 링크 발급·재발급, 201 |
| POST | `/api/v1/diaries/{diaryId}/invites/email` | 이메일 직접 입력 초대, 202 |
| DELETE | `/api/v1/diaries/{diaryId}/invites/{inviteId}` | 보낸 초대 취소, 204 |
| GET | `/api/v1/me/invites` | 로그인한 수신자의 받은 이메일 초대 목록 |
| GET | `/api/v1/invites/{token}` | 수락 전 정보 조회. 이메일 초대는 지정 수신자 로그인 필요 |
| POST | `/api/v1/invites/{token}/accept` | 링크/이메일 초대 수락, 200 |
| POST | `/api/v1/me/invites/{inviteId}/decline` | 수신자의 이메일 초대 거절, 204 |

검색 API·별도 재발송 API는 없다. 업무 API 12개와 다이어리 전용 사진 조회 GET을 Swagger의 ‘공유 다이어리’에서 확인한다. 공개 일반 링크 미리보기를 제외하면 로그인 accessToken을 Bearer로 전달한다. 이메일 초대 미리보기는 같은 GET 경로를 사용하지만 반드시 수신자 계정으로 로그인해야 한다.

## 멤버 정책

- OWNER/EDITOR만 지원한다. 소유자를 포함해 최대 4명이다.
- 소유자·편집자 모두 링크/이메일 초대 생성·조회·취소가 가능하다. 강퇴만 소유자 전용이다.
- 내 상태 수정은 favorite와 lastOpenedPageId(UUID)를 받는다. 한 항목 이상 필요하고 null은 변경하지 않는다. 마지막 페이지는 해당 다이어리의 삭제되지 않은 페이지여야 한다.
- 별칭·사진은 해당 diary_members 행에만 저장한다. 계정 프로필을 수정하지 않는다. member_color는 작업자 커서 색상 전용이며 신규 멤버에 랜덤 색을 배정하고 기존 색은 유지한다.
- 다른 멤버가 있으면 소유자는 newOwnerUserId로 후임을 지정하고 나가야 한다. 양도만 원자적으로 처리하고 기존 소유자는 EDITOR로 남는다. 나가려면 별도 DELETE members/{본인 ID}를 호출한다.
- 혼자 남아도 공유 상태를 유지하고 재초대할 수 있다. 마지막 멤버가 나가면 다이어리·페이지·요소·획·이력·알림·연결·초대를 영구 삭제한다. 원본 미디어/S3 객체와 계정은 보존한다.
- 강퇴·나가기는 기존 작업과 작성자 참조를 유지한다. 강퇴 시 기존 공유 링크도 무효화한다.

## 링크 초대

1시간 유효. 재발급하면 이전 LINK만 즉시 무효화하고 이메일 초대는 유지한다. 다이어리 전체 기준 최근 5분 3회 생성 가능하며 취소/무효 이력도 계산한다. 429는 Retry-After를 반환한다.

## 이메일 초대

발송 본문:
```json
{"email":"friend@example.com"}
```

- 가입된 활성 회원만 수신자 ID로 지정한다. 이메일은 trim·소문자로 정규화한다. 미가입·비활성·이미 참여한 회원은 초대/메일을 추가하지 않는다.
- 성공 안내는 202 `{"message":"가입된 이메일이라면 초대가 전달됩니다."}`로 통일한다. 이는 본문 공통화이며 응답 시간이 완전히 같다는 보장은 아니다.
- 같은 다이어리·수신자에게 대기 중인 초대가 있으면 중복 발송하지 않는다. 재발송 전용 API는 없다.
- 같은 다이어리·수신자 기준 최근 5분 3회 발송을 허용한다. 소유자/편집자가 바뀌어도 같은 예산이며 취소·거절·전송 실패 이력도 포함한다. 다른 수신자와 LINK 예산은 독립적이다.
- 자동 만료 없음. 수락·거절·취소까지 유지한다. 정원은 수락 시 다시 확인하며, 만원이면 409이고 초대는 대기 상태로 남는다.
- 수신자만 정보 조회·수락·거절 가능하다. 수락 후 다시 나가도 과거 이메일 초대를 재사용할 수 없다. 링크로 먼저 참여하면 대기 중 이메일 초대도 수락 처리한다.
- 초대 취소/거절은 이미 참여한 멤버를 내보내지 않는다. 처리된 이메일 초대의 다른 상태 변경은 409, 같은 취소·거절 재요청은 204로 처리한다.
- SMTP는 DB 커밋 후 공유 전용 제한된 실행기에서 보낸다. DB 연결/잠금을 유지한 채 메일을 기다리지 않는다. 큐/SMTP 실패는 DELIVERY_FAILED로 기록해 새 발송이 가능하게 하며 실패도 5분 예산에 포함한다.
- 취소와 실제 외부 메일 전송의 완전한 동시 취소는 보장하지 않는다. 취소 전에 발송 중이던 메일이 도착해도 해당 토큰은 사용할 수 없다.

## 스키마를 변경하지 않는 저장 규칙

기존 diary_invites의 invite_type을 다음 값으로 사용한다. 이 규칙은 공유 도메인 내부에서만 처리하고 API에서는 inviteType=EMAIL과 status를 구분해 반환한다.

| DB invite_type | API 상태 |
|---|---|
| EMAIL | PENDING |
| EMAIL_ACCEPTED | ACCEPTED |
| EMAIL_DECLINED | DECLINED |
| EMAIL_CANCELLED | CANCELLED |
| EMAIL_FAILED | DELIVERY_FAILED |

EMAIL 계열은 기존 invitee_user_id를 수신자로 사용한다. accepted는 use_count=1, 취소/거절/실패는 revoked_at도 기록한다. 필수 expires_at은 `9999-12-31T23:59:59Z`를 저장하고 이메일 초대의 유효성 판정에는 사용하지 않는다. 이메일 관련 모든 API의 expiresAt은 null(만료 없음)이다. PostgreSQL과 H2에서 같은 저장 규칙을 검증한다.

토큰 원문은 DB에 저장하지 않는다. 기존 ID·다이어리·생성/만료 시각을 HMAC 서명하고 SHA-256 해시를 저장한다. 비밀키 교체 후 기존 이메일 대기 초대에 다시 발송하면 이전 초대를 취소하고 새 키로 발급한다.

## 목록 응답·호환성

두 목록 모두 page=0, size=20이 기본이고 size는 1~100이다. 생성 시각과 ID의 내림차순으로 조회한다.

GET `/diaries/{diaryId}/invites`는 기존 최상위 available/token/inviteUrl/expiresAt 필드를 유지하고 linkInviteId(공유 링크 취소용 ID)와 emailInvites를 추가한다. emailInvites와 GET `/me/invites`는 items/page/size/hasNext/totalElements를 반환한다.
각 이메일 항목에는 inviteId, diaryId, diaryTitle, inviterUserId/닉네임, recipientUserId/닉네임/이메일, status, createdAt, expiresAt, token, inviteUrl이 있다. 이메일/토큰 정보는 해당 다이어리 멤버 또는 수신자에게만 반환한다. 토큰은 현재 유효한 대기 초대에만 제공한다. 받은 목록에서는 전송 실패 항목을 제외하고 보낸 목록에서는 실패도 확인할 수 있다.

## 설정·연결 범위

- SHARING_INVITE_SECRET: 별도 32바이트 이상 Base64 비밀키. 같은 환경의 서버 인스턴스끼리 동일하게 설정한다. JWT/이메일 인증 키를 재사용하지 않는다. 미설정은 링크 기능 503이며 다른 기능의 기동은 유지한다.
- SHARING_INVITE_BASE_URL: 실제 초대 화면 주소 접두사. 일반 링크 API는 기본 상대 경로 `/invite/`를 허용한다. **이메일 발송은 클릭 가능한 절대 주소(http/https 또는 dio 스킴)가 필수**이며 미설정/상대 경로이면 INVITE_URL_NOT_CONFIGURED 503이다. 프론트의 실제 라우팅과 함께 설정한다. 예시 주소를 실제 배포 주소로 사용하지 않는다.
- 메일은 기존 SIGNUP_MAIL_FROM·SPRING_MAIL_* 설정을 재사용한다. 메일 발송 자체는 비동기이므로 202가 실제 받은편지함 도착을 보장하지 않는다. 실제 도착은 배포 환경에서 별도 확인한다.
- 기존 AUTH_JWT_SECRET·CORS·신뢰 프록시 설정 유지. dev/prod Compose는 위 공유 변수들을 이미 전달한다.

최신 develop의 인증된 다이어리 생성 API가 owner_user_id와 소유자 멤버를 저장한다. 공유 기능과 다이어리/페이지 권한은 같은 diary.domain.DiaryMember 및 DiaryMemberRepository를 재사용한다. 소유자 없는 기존 비회원 행은 요청자 소유로 임의 연결하지 않는다. 새로 로그인해서 POST /api/v1/diaries로 만든 다이어리는 수동 SQL 없이 초대를 테스트할 수 있다. 강퇴된 계정의 페이지 접근 차단과 양도 후 기존 소유자의 편집 권한 유지도 통합 테스트한다. 프론트 공유 화면·메일 링크 라우팅은 별도 연결이 필요하며, 알림 연계는 이번 병합에서 별도 기능으로 추가하지 않는다.

## 검증 명령

- H2: `./gradlew test --tests "com.f106.DIO.sharing.SharingTests" --tests "com.f106.DIO.sharing.EmailInviteTests"`.
- 실제 PostgreSQL: 별도 폐기용 dio_sharing_qa DB를 만들고 DIO_SHARING_POSTGRES_URL=`jdbc:postgresql://127.0.0.1:포트/dio_sharing_qa`, DIO_SHARING_POSTGRES_PASSWORD를 설정한 뒤 `./gradlew sharingPostgresTest`.
- 전용 이름/루프백이 아니거나 환경변수가 없으면 거부한다. 개인/공용 DB로 폴백하지 않는다. 테스트는 고유 사용자/다이어리를 생성하며 개인 DB를 초기화하지 않는다.
- CI는 기존 격리 PostgreSQL 스크립트에서 공유 task도 실행한다. 테스트 메일은 목으로 검증하며 실제 SMTP 전송은 하지 않는다.

메일 발행은 TransactionTemplate이 반환해 DB 연결까지 정리된 뒤 수행한다. 큐 포화의 실패 상태 기록도 발송 요청의 DB 연결을 붙잡지 않는다. 새 outbox 테이블을 만들지 않으므로 DB 커밋 직후 프로세스가 종료되는 경우의 영속 전송 재시도는 보장하지 않는다. 이 경우 관리자가 초대를 취소한 뒤 다시 발송할 수 있다.

## 다이어리별 별칭·사진 (확정 명세)

- `PATCH /api/v1/diaries/{diaryId}/profile`로 경로 변경. 예전 `/membership` 경로는 유지하지 않는다.
- `POST /api/v1/diaries/{diaryId}/transfer-owner`로 경로/동작 변경. 예전 양도 후 나가기 경로는 유지하지 않는다.
- `nickname`: 한글·영문·숫자·밑줄 2~12자, NFKC 정규화. 중복 허용. 필드를 생략하면 유지, 명시적 null이면 계정 닉네임으로 복원.
- `memberProfilePhotoId`: 본인이 이 프로필 기능으로 업로드한 유효한 이미지 ID를 선택할 수 있다. 생략하면 유지, 명시적 null이면 계정 사진 자동 사용. 다른 사람의 사진 ID·삭제된 사진·일반 에셋의 임의 저장 경로는 사용할 수 없다.
- 별도 사진이 없거나 사용 불가하면 현재 계정 사진을 반환한다. 계정 사진도 없으면 profilePhotoUrl=null이며 프론트가 기본 아이콘을 표시한다. 계정 사진을 나중에 바꾸면 계정 사진을 사용 중인 다이어리에도 반영된다.
- 별칭·사진을 바꿔도 커서 색(memberColor)은 바뀌지 않는다.

JSON 예시:
```json
{"favorite":true,"nickname":"여행친구"}
```
계정 프로필로 되돌리기:
```json
{"nickname":null,"memberProfilePhotoId":null}
```

사진 파일은 새 업로드 경로 없이 같은 PATCH의 multipart/form-data로 전송한다. `profile` 파트는 application/json 메타데이터이고 `photo` 파트는 JPEG/PNG 파일이다. 사진은 5MB·1600만 화소 이하만 받고 기존 계정 사진 검증기와 EXIF 방향 보정·512px 이하 PNG 변환을 재사용한다. profile JSON에는 파일 업로드와 memberProfilePhotoId를 동시에 지정하지 않는다(명시적 null도 동시 지정으로 간주).

예시:
```bash
curl -X PATCH "$API/api/v1/diaries/$DIARY_ID/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'profile={"nickname":"여행친구"};type=application/json' \
  -F 'photo=@profile.png;type=image/png'
```

응답에는 기존 상태 필드 외에 nickname(최종 표시값), memberNickname(직접 설정한 값), memberProfilePhotoId, profilePhotoUrl, memberColor, usingAccountPhoto가 있다. 멤버 목록에도 같은 프로필 정보를 반환한다.

### 저장·조회·권한

- 파일은 기존 프로필 저장소 설정(SIGNUP_PHOTO_STORAGE=local/s3, 동일 버킷/디렉터리)을 재사용하고, 메타데이터는 기존 media_files에 등록한다. signup_profile_photos의 사용자당 1개 제약을 변경하지 않는다.
- media_files.storage_key는 기존 규칙의 객체 키만 저장한다. 임시 URL·클라이언트 파일 경로·버킷 주소를 저장하지 않는다. 기존 media_files 컬럼 값 IMAGE/UPLOAD/PHOTO/READY를 사용한다.
- 다이어리 전용 사진 응답 URL은 `GET /api/v1/diaries/{diaryId}/members/{userId}/profile-photo?v={사진ID}`다. 이것은 업무 기능 추가가 아닌 파일 조회 경로이며 현재 참여자의 Bearer 인증이 필요하다. 프론트 이미지 요청에도 인증 헤더를 전달해야 한다. v는 사진 변경 시 이미지 소스를 갱신하기 위한 버전 값이다.
- 계정 사진을 사용할 때는 기존 공개 계정 사진 URL을 그대로 반환한다. 별도 사진은 사진 주인이 나갔거나 조회자가 강퇴된 경우 읽을 수 없다.
- 이미지 처리·업로드·파일 조회는 DB 트랜잭션 밖에서 수행한다. 업로드 전 권한을 확인하고 저장 직전에 다시 확인한다. 중간에 강퇴되면 DB 저장을 거부하고 새 업로드 파일 정리를 시도한다. 계정 사진과 다른 다이어리 사진은 수정하지 않는다.
- 사진 교체 시 기존 media_files 행/원본은 자동 삭제하지 않는다. 다른 다이어리에서도 같은 이미지를 사용할 수 있으므로 기존 미디어 삭제·보관 정책을 따른다. 매번 새 파일 ID로 등록해 다른 다이어리의 파일 내용을 덮어쓰지 않는다.
- 일반 미디어와 마찬가지로 환경의 저장소·버킷을 전제로 한다. local에서 S3 또는 다른 버킷으로 전환한다면 기존 다이어리 프로필 파일도 별도 이전해야 한다. 기존 계정 사진 마이그레이션은 signup_profile_photos만 처리하므로 다이어리 사진까지 자동 이전된다고 가정하지 않는다.

### V9 적용

기존 V1~V8 파일은 수정하지 않는다. V9는 member_nickname VARCHAR(30) NULL, member_profile_photo_id UUID NULL만 추가하고 media_files FK를 ON DELETE SET NULL로 연결한다. 기존 회원/다이어리/파일 데이터는 삭제하지 않는다. 이미 동일 컬럼을 추가한 DB에는 IF NOT EXISTS로 대응한다. 기존 사진 참조가 잘못되어 있다면 FK 검증에서 실패하므로 데이터를 임의 삭제해서 진행하지 않는다.

### 역할 분리

- DiaryProfileController/Service: 내 상태·별칭·사진 수정, 이미지 I/O와 DB 쓰기 분리
- DiaryMemberPhotoService + SharingPhotoStorage: 권한 확인 후 전용 사진 조회·기존 이미지 저장소 재사용
- DiaryOwnershipController/Service: 소유권 양도만 담당
- DiaryMembershipController/Service: 멤버 목록·나가기·강퇴
- MemberProfileResolver: 계정 기본값과 다이어리별 프로필의 표시값 조합
- SharingProfileMediaRepository/domain: 기존 media_files의 프로필용 이미지 참조, 새 테이블 없음

### 최종 프로필·소유권 검증 (2026-10-28)

- H2 공유 10개·이메일 9개·프로필 7개·기존 다이어리 저장 8개·Swagger 2개·배포 계약 3개: 39개 통과.
- PostgreSQL 공유 12개·이메일 9개·프로필 8개: 29개 통과. V9 컬럼·FK의 실제 적용 및 미디어 삭제 시 NULL 복원 확인.
- 별도 인증 DB에서 스키마/JPA 4개·비밀번호 재설정 16개: 20개 통과.
- 테스트 전용 PostgreSQL 컨테이너와 임시 DB 볼륨은 정리했다. 실제 SMTP·S3 연결 및 프론트 연동은 이 자동 검증의 범위가 아니다.

### develop 통합

멤버 엔티티/복합 키/저장소를 diary 도메인의 기존 모델로 통합했다. 동일한 테이블을 별도 JPA 엔티티·동일 이름 빈으로 이중 등록하지 않는다. 기존 다이어리 조회·페이지 접근·소유자 생성 API와 공유 기능이 같은 멤버 상태를 사용한다. 회원 다이어리 생성 후 초대·수락·페이지 생성·강퇴 차단을 실제 로그인 토큰으로 검증한다.

병합 검증: 백엔드 기본 test 전체 통과, 공유-다이어리 연동 테스트 2개 통과, sharingPostgresTest 29개와 authPostgresTest 22개 통과. 실제 SMTP/S3 연결은 포함하지 않는다.
