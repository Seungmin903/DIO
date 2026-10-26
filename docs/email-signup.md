# 이메일 인증 및 일반 회원가입

이 문서의 범위: 이메일·닉네임 중복 확인, 가입 인증번호 발송·확인, 회원가입. 일반 로그인·JWT·재발급·로그아웃은 [email-login.md](./email-login.md)에 별도로 정리했다. 소셜 인증, 비밀번호 재설정, 프론트 연결은 아직 포함하지 않는다. 가입 성공 후 로그인 화면으로 돌아가는 기존 화면 흐름에 맞춰 회원가입 응답에는 로그인 토큰을 발급하지 않는다.

## API와 Swagger 확인 순서

백엔드 실행 후 `http://localhost:8080/swagger-ui.html`의 **일반 회원가입** 그룹에서 순서대로 호출한다. Authorization은 필요 없다. 응답에는 `Cache-Control: no-store`를 적용한다.

| Method | 경로 | 요청 | 성공 |
|---|---|---|---|
| POST | `/api/v1/auth/email-availability` | `{"email":"member@example.com"}` | 200 `{"available":true}` |
| POST | `/api/v1/auth/nickname-availability` | `{"nickname":"디오사용자"}` | 200 `{"available":true}` |
| POST | `/api/v1/auth/email-verifications` | `{"email":"member@example.com"}` | 200 `{"expiresIn":600,"resendAfter":60}` |
| POST | `/api/v1/auth/email-verifications/verify` | `{"email":"member@example.com","code":"메일로 받은 6자리"}` | 200 `{"signupToken":"일회용 토큰","expiresIn":600}` |
| POST | `/api/v1/auth/signup` | 아래 예시 | 201 회원 정보. ID는 문자열 |

```json
{
  "email": "member@example.com",
  "signupToken": "인증번호 확인 응답의 signupToken",
  "password": "DioMember123!",
  "nickname": "디오사용자",
  "agreements": [
    {"termsType": "SERVICE", "termsVersion": "v1", "agreed": true},
    {"termsType": "PRIVACY", "termsVersion": "v1", "agreed": true},
    {"termsType": "MARKETING", "termsVersion": "v1", "agreed": false}
  ]
}
```

성공 응답은 `userId`, `email`, `nickname`, `profilePhotoUrl`, `createdAt`이다. 비밀번호·해시·가입 토큰·인증번호는 포함하지 않는다. 회원가입 요청·응답과 Swagger에서 `profileColor`를 제거했다. 사진이 없으면 `profilePhotoUrl`은 null이다. 기존 `users.profile_color`는 호환을 위해 보존하며 신규 회원에는 내부 기본값만 저장한다.

닉네임 중복 확인은 프론트의 `checkNickname(value)` 버튼용이며 인증 없이 호출한다. 형식 오류는 400, 중복·예약어는 200 `{"available":false}`다. 프론트에서 응답의 `available`을 반환하면 기존 버튼 흐름에 연결할 수 있다. 앞뒤 공백 제거·NFKC 정규화, 한글·영문·숫자·밑줄 2~12자, 영문 대소문자 무관, 관리자/dio 예약어 정책은 실제 가입 검사와 공유한다. 이 조회는 닉네임을 예약하지 않으므로 가입 시 재검사와 DB UNIQUE를 유지한다. DB·마이그레이션·프론트 변경은 없다.

현재 화면의 프로필 사진 선택을 지원하는 백엔드 저장/조회와 API의 색상 제거를 구현했다. 프론트는 아직 previewAuth이므로 파일 업로드 연결, 이메일 인증 화면, 실제 API 연동, 비밀번호 ASCII 허용 범위 통일은 후속 작업이다.

최신 ERD에 맞춰 회원가입 요청·응답과 Swagger에서 생년월일(`birthDate`)을 제거했다. Method와 Endpoint는 유지한다. 내 정보 조회·수정 API는 아직 구현되지 않았으며 구현 시 생년월일을 포함하지 않는다.

V2는 로컬 DB에 실제 적용된 원본(email NOT NULL, 체크섬 -1086657833)으로 복구했다. V3가 이메일 NULL 허용, 인증 계정 테이블·컬럼 이름 변경, 약관 버전 길이 20자 확장을 적용한다. nullable `birth_date`는 기존 데이터 보호를 위해 호환용으로 보존하며 API와 엔티티에서 사용하지 않는다.

### DB 적용과 팀 작업 영향

- V1 및 다이어리 테이블은 변경하지 않는다. 회원가입 관련 V3는 기존 행을 삭제하지 않고 이름과 제약만 변경한다. `nickname_key`와 가입 전 인증 테이블은 구현에 필요한 확장으로 유지한다. ERD의 다른 도메인을 일괄 생성하거나 교체하지 않는다.
- 로컬 DB 적용 전 `pg_dump -Fc`로 전체 백업한다. 이번 로컬 백업은 Git 외부 `C:/Users/SSAFY/Documents/Codex/dio-before-signup-v3-20261026.dump`에 보관했다. 복원 검토 시 실행 중인 앱을 중지하고 우선 별도 DB에 `pg_restore`로 복원 확인한다. 사용 중인 DB에 무조건 덮어쓰지 않는다.
- 정상 V2 체크섬은 `-1086657833`이다. 수정된 V2(`-1046705262`)를 이미 적용한 다른 개발 DB가 있다면 실제 스키마를 먼저 비교해야 한다. 전역 자동 repair나 검증 비활성화는 추가하지 않았다.
- 인증 계정 이름을 사용하는 코드와 V3는 함께 배포해야 한다. 다른 개발자의 로컬 DB나 공용 서버에는 직접 적용하지 않았다. 팀 합류 시 변경 SQL과 엔티티를 함께 반영한다.

## 현재 가정한 입력 정책

### 로컬 파일 / S3 저장 설정

`ProfilePhotoStorage` 인터페이스를 `LocalProfilePhotoStorage`, `S3ProfilePhotoStorage`가 구현한다. 회원가입/사진 조회의 URL과 요청·응답은 저장소 전환 시 바뀌지 않는다. S3도 비공개 버킷의 객체를 서버에서 읽어 기존 PNG API로 반환한다. 공개 ACL을 설정하지 않는다.

| 설정 | 기본값 / 용도 |
|---|---|
| `SIGNUP_PHOTO_STORAGE` | `local`. `s3`로 명시하면 S3 구현 사용 |
| `SIGNUP_PHOTO_LOCAL_DIRECTORY` | `.local-data/profile-photos`. backend 작업 폴더 기준. 실행 폴더에 따라 달라지지 않도록 공유 실행 환경에서는 고정 절대 경로 권장 |
| `SIGNUP_PHOTO_S3_BUCKET` | S3 모드에서 필수, 기존 버킷 이름. 앱이 버킷을 생성하지 않음 |
| `SIGNUP_PHOTO_S3_REGION` | `ap-northeast-2`. 실제 버킷의 리전에 맞출 것 |
| `dio.signup.photos.migrate-legacy` | 기본 false. 실행 인자로 true를 주면 DB/로컬 사진을 현재 저장소로 이전 |

local 프로필은 루트 .env를 읽으므로 지금은 추가 설정 없이 파일로 저장한다. .local-data는 Git에서 제외한다. 파일은 재시작 후에도 유지되지만 디렉터리를 삭제하거나 실행 위치를 바꾸면 읽을 수 없다. 로컬 데이터 복구에는 **DB와 사진 디렉터리 둘 다** 필요하다. Docker에서 로컬 모드를 쓰려면 영속 볼륨을 따로 마운트해야 한다.

prod 프로필은 사진 저장소의 기본값이 s3다. 배포 환경에서 버킷/리전과 DB 설정을 실제 환경변수로 주입한다. S3 모드인데 버킷·리전이 없거나 storage 값이 잘못되면 시작에 실패하며 로컬로 대체하지 않는다. 로컬 테스트에서는 AWS 클라이언트나 자격 증명이 필요 없다.

S3 자격 증명은 AWS SDK v2 기본 자격 증명 공급자를 사용한다. 배포 서버의 IAM 역할을 사용할 수 있으며, 로컬 S3 실연결 검증은 AWS 프로필 또는 실제 프로세스 환경변수를 사용한다. Spring에서 읽는 `.env` 파일의 AWS 키가 자동으로 OS 환경변수가 되는 것은 아니다. 키를 코드/.env.example/Git에 저장하지 않는다. 버킷의 `profile-photos/*` 범위에 `s3:PutObject`, `s3:GetObject`, 실패 보상 삭제용 `s3:DeleteObject` 권한이 필요하다. 버킷 생성·공개 정책 변경은 구현하지 않았다. [AWS SDK v2 자격 증명 문서](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html)

S3 전환 시 실제 설정 예시(버킷 이름은 인프라에서 생성한 실제 값으로 교체):

```properties
SIGNUP_PHOTO_STORAGE=s3
SIGNUP_PHOTO_S3_BUCKET=your-existing-private-bucket
SIGNUP_PHOTO_S3_REGION=ap-northeast-2
```

1. DB와 로컬 사진 디렉터리를 백업한다. 이번 로컬 DB 백업은 `C:/Users/SSAFY/Documents/Codex/dio-photo-storage-v5-20261026.dump`에 보관했다.
2. 기존 사진 파일에 접근 가능한 머신에서 S3 설정/권한을 준비한다. DB에 저장한 provider/key/bucket을 사용하므로 새 사진만 S3로 저장해도 기존 로컬 사진은 기존 디렉터리가 있으면 계속 읽는다.
3. 기존 사진도 이전하려면 한 번만 실행한다. `backend/`에서 `./gradlew.bat bootRun --args="--spring.profiles.active=local --dio.signup.photos.migrate-legacy=true"` (이때 SIGNUP_PHOTO_STORAGE=s3). 로컬 모드에서 실행하면 기존 DB 사진만 로컬 파일로 이전한다.
4. 사진별 잠금·트랜잭션으로 복사 성공 후 DB 참조만 바꾸고 기존 사진 URL은 유지한다. 실패한 사진은 이전 참조를 유지하며, 재실행 시 완료된 항목을 건너뛴다. 자동 이전은 기본으로 켜지 않는다. 기존 로컬 원본은 즉시 삭제하지 않으므로 이전 완료·백업 확인 후 별도로 정리한다.

파일 업로드는 DB 커밋 전 수행되므로 롤백 보상 삭제가 있다. 강제 종료 등으로 남은 객체는 DB의 storage_key와 대조해 정리해야 한다. 서로 다른 저장소의 데이터가 남아 있는 동안에는 해당 파일/버킷 읽기 권한을 유지한다. S3→local 역전환은 현재 S3 어댑터가 비활성화되므로 자동 이전 대상으로 지원하지 않는다.

실제 AWS 버킷/권한을 받지 않은 상태이므로 S3는 SDK 요청·응답/실패를 대체한 테스트까지 검증한다. 실제 S3 업로드·조회는 배포 인프라 연결 후 추가 확인이 필요하다.

저장소 분리 검증(2026-10-26): 전체 테스트 126개 중 117개 통과, 기존 PostgreSQL 전용 9개 제외, 실패 0개. 로컬 파일 재생성 후 조회, 경로 이탈 거절, 커밋/롤백 파일 보존·삭제, 실제 가입 DB 실패 시 새 파일 정리, V4 DB 사진 조회·로컬 이전·동일 URL 유지, 로컬→S3 이전, SDK의 비공개 PNG 업로드 요청/기존 버킷 참조 조회/삭제, S3 오류 정제, 잘못된 설정 거절을 확인했다. 실제 PostgreSQL에서 V5 검증과 저장소 위치 제약을 확인했으며 테스트 행은 롤백했다. 로컬 서버를 임시 자동 포트로 실행해 health UP, 사진 URL 필드 유지와 색상 제거를 확인하고 검증용 서버만 종료했다. 기존 회원 1건을 유지했고 현재 기존 사진은 0건이라 실제 데이터 이전은 수행할 대상이 없었다. 실제 S3·실기기 프론트 전송은 미검증이다.

### 프로필 사진을 첨부한 회원가입

같은 `POST /api/v1/auth/signup`에서 두 Content-Type을 지원한다.

- 사진 없음: 기존 `application/json` 가입 요청. 응답의 `profilePhotoUrl`은 null이다.
- 사진 있음: `multipart/form-data`. 필수 `signup` 파트는 위 가입 JSON이며 **파트 Content-Type은 `application/json`**으로 지정한다. 선택 `photo` 파트는 파일이다. 서버가 파일의 원본 이름이나 기기의 `photoUri` 문자열을 저장하는 방식은 아니다.
- 응답 `profilePhotoUrl`은 `/api/v1/auth/profile-photos/{UUID}` 형태의 상대 경로다. 프론트의 API 서버 origin(예: `http://localhost:8082`)에 연결해서 이미지 URL로 사용한다. `/api` 등의 base path를 중복으로 붙이지 않는다.
- `GET /api/v1/auth/profile-photos/{photoId}`는 PNG 바이너리, 사진 미존재·비활성/탈퇴 회원은 404다. 공개 프로필 이미지이므로 인증 없이 읽을 수 있다. 이메일·회원 ID를 URL에 넣지 않는다.
- 실제 JPEG/PNG만 허용하며 원본 5MiB, 최대 8192px/축 및 총 1600만 화소로 제한한다. MIME·확장자만으로 승인하지 않는다. 서버에서 비율을 유지해 긴 변 512px 이하 PNG로 변환하고 원본 메타데이터를 보존하지 않는다. 저장 파일은 최대 1MiB다. HEIC/WebP/GIF 등은 업로드 전에 클라이언트에서 JPEG/PNG로 변환해야 한다. 프론트 변환 로직은 이번 범위에 포함하지 않았다.
- Spring multipart 전체 제한은 파일 5MB/요청 6MB다. 413은 요청/파일 크기 초과, 잘못된 이미지 400 `INVALID_PROFILE_PHOTO`다. 가입 전 검증에 실패하면 회원·사진·약관이 저장되지 않고 유효한 가입 토큰은 재사용 가능하다.
- 회원·인증 계정·약관·사진 메타데이터·가입 토큰 소비는 동일 DB 트랜잭션이다. 파일/S3 저장은 별도이므로 DB 실패 시 새로 쓴 객체만 보상 삭제한다. 삭제 실패는 로그에 남기고 원래 가입 실패를 유지한다. 프로세스 강제 종료/네트워크 장애까지 DB와 원자적으로 묶을 수는 없으므로 배포 시 고아 객체 점검을 운영해야 한다.
- 신규 사진 파일은 `ProfilePhotoStorage` 구현체(로컬 파일 또는 S3)에 저장하며 DB에는 회원 연결, 저장소 종류, 객체 키, S3 버킷만 저장한다. V4의 기존 `BYTEA` 사진은 손실 없이 조회하고 명시적인 이전 작업으로 파일로 옮길 수 있다. 기존 media/diary 테이블은 변경하지 않는다.
- V5는 사진 테이블에 저장소 참조를 추가하고 기존 image_bytes를 nullable로 바꾼다. V1~V4 체크섬·기존 users 컬럼은 유지한다. 사진 메타데이터의 `user_id` UNIQUE/FK는 유지하며 회원 물리 삭제 시 메타데이터 CASCADE한다. 외부 파일은 DB CASCADE로 지워지지 않으므로 향후 탈퇴/사진 수정 API에 파일 삭제를 함께 구현해야 한다. 비활성·탈퇴 회원 사진은 API가 반환하지 않는다.

Swagger에서 `/signup`의 request Content-Type을 `multipart/form-data`로 선택하고 `signup`에 가입 JSON, `photo`에 파일을 선택한다. `signupToken`은 이메일 인증 확인 API에서 받은 실제 값을 넣는다. 사진 없는 가입은 `application/json`을 선택한다.

웹 연동 예시(가입 JSON에 비밀번호 확인·profileColor·photoUri는 보내지 않음):

```javascript
const form = new FormData();
form.append('signup', new Blob([JSON.stringify(signupRequest)], { type: 'application/json' }));
form.append('photo', selectedFile);
const response = await fetch(`${apiOrigin}/api/v1/auth/signup`, { method: 'POST', body: form });
```

multipart의 전체 Content-Type은 boundary를 포함하도록 클라이언트가 자동 생성하게 둔다. Expo SDK 58에서는 expo/fetch와 함께 `photo`를 expo-file-system의 File로, `signup`을 application/json 메모리 Blob으로 전송한다. 비밀번호가 담긴 JSON 임시 파일은 만들지 않는다. 선택 결과의 로컬 URI를 그대로 다른 기기에 제공하지 않는다.

사진 기능 검증(2026-10-26): 전체 테스트 119개 중 110개 통과, PostgreSQL 전용 기존 9개 제외, 실패 0개. PNG 축소 저장·바이너리 조회, JPEG 변환, 잘못된/빈 이미지 및 5MiB 초과 거절, 사진 실패 시 회원·인증 계정·약관·토큰 소비 롤백, 비활성 회원 사진 404, 사진 없는 JSON/multipart 가입을 확인했다. 실제 로컬 PostgreSQL에 V4 적용 및 JPA 검증 성공, BYTEA 저장·FK·회원 삭제 시 사진 CASCADE는 테스트 트랜잭션 후 롤백했다. 기존 회원 1건/다이어리 0건은 보존했다. Swagger 실응답에서 두 요청 Content-Type과 profileColor 제거를 확인했다. 프론트·실기기 파일 전송 및 HEIC 변환은 미검증이다.

상세 명세가 없으므로 기존 프론트 임시 규칙을 기준으로 구현했다. 운영 전 팀 합의가 필요하다.

- 이메일은 trim 및 소문자 정규화, 최대 254자. 전체 회원 이메일을 중복 확인하며 가입 시 재검사하고 DB UNIQUE로 동시 중복도 막는다. 소셜 계정의 이메일만 같다고 자동 연결하지 않는다.
- 비밀번호는 영문과 숫자를 모두 포함한 공백 없는 ASCII 8~32자. BCrypt 비용 12로 해시한다. 원문을 DB·응답·로그에 기록하지 않는다.
- 닉네임은 trim/NFKC 정규화 후 한글·영문·숫자·밑줄 2~12자. `nickname_key`로 영문 대소문자 무관 중복을 막으며 관리자/dio는 예약어다. 이 컬럼은 제공 ERD에서 추가한 파생 키다.
- SERVICE/PRIVACY 동의는 필수, MARKETING은 선택이다. 중복 종류·현재 버전 불일치·필수 미동의는 거절한다. 전달된 선택 미동의도 저장한다.
- 약관 버전 기본값 `v1`은 개발용이다. 배포 전 실제 게시된 약관 버전을 환경변수로 지정해야 한다. 버전별 약관 본문 제공 API는 이번 범위 밖이다.

## 이메일 발송 설정

실제 발송은 Spring JavaMailSender/SMTP를 사용한다. 아래 환경변수를 실행 환경에서 설정한다. 자격 증명과 비밀키는 커밋하지 않는다. 로컬 프로필은 저장소 루트 `.env`의 Spring 속성도 읽는다.

| 환경변수 | 의미 |
|---|---|
| `SPRING_MAIL_HOST` | SMTP 호스트 |
| `SPRING_MAIL_PORT` | SMTP 포트 |
| `SPRING_MAIL_USERNAME` | SMTP 인증 계정 |
| `SPRING_MAIL_PASSWORD` | SMTP 비밀번호/앱 비밀번호 |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH` | 인증 사용 여부 |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE` | STARTTLS 사용 여부. 제공자 지침에 따름 |
| `SIGNUP_MAIL_FROM` | 제공자에서 허용한 발신 주소 |
| `SIGNUP_VERIFICATION_SECRET` | 최소 32바이트, 운영 환경의 충분히 무작위인 비밀키 |
| `SIGNUP_SERVICE_TERMS_VERSION` | 현재 이용약관 버전, 최대 20자 |
| `SIGNUP_PRIVACY_TERMS_VERSION` | 현재 개인정보 동의 버전, 최대 20자 |
| `SIGNUP_MARKETING_TERMS_VERSION` | 현재 선택 수신동의 버전, 최대 20자 |

설정 누락/발송 실패는 503이며 인증번호를 응답하거나 로그로 대신 출력하지 않는다. 접속·읽기·쓰기 SMTP 타임아웃은 각 5초다. 단위 테스트는 메일 발송 경계만 대체하므로 실제 메일 도착 확인을 대신하지 않는다.

## 데이터·오류·보안 경계

- V2 마이그레이션이 `users`, `user_auth_providers`, `user_terms_agreements`, `signup_email_verifications`를 추가한다. V3 적용 후 인증 계정 테이블은 `user_auth_accounts`이며 ID는 `auth_account_id`, 제공자 식별값은 `provider_subject`, 연결 시각은 `linked_at`이다. 기존 V1 다이어리 데이터는 변경하지 않는다. V6는 일반 로그인용 `refresh_tokens`와 토큰 교체 이력 테이블을 추가한다.
- EMAIL provider_user_id는 정규화 이메일이다. 인증번호는 이메일과 결합한 HMAC-SHA256, 가입 토큰은 무작위 256비트 값의 SHA-256만 저장한다.
- 인증번호 10분, 재발송 간격 60초, 오답 최대 5회. 재발송 시 이전 번호·가입 토큰을 무효화한다. 인증 성공한 번호로 토큰을 다시 발급하지 않는다.
- 가입 토큰은 이메일에 귀속되고 발급 후 10분, 가입 성공 시 소비한다. 회원·인증 계정·약관·토큰 소비는 같은 트랜잭션이다. 실패하면 함께 롤백한다.
- 같은 이메일의 검증·가입은 DB 행 잠금으로 직렬화한다. 최초 인증 요청의 동시 생성은 PK 제약으로 충돌을 처리한다. 이메일/닉네임/로그인 제공자 키에도 UNIQUE 제약을 적용한다.
- 오류는 `application/problem+json`을 사용한다. 입력 오류 400, 중복·동시 충돌 409, 횟수 제한 429, 인증 설정·SMTP 실패 503이다. 서비스 오류의 `code` 필드로 구분한다. validation 오류는 Spring 기본 ProblemDetail이다.
- 이메일 중복 확인은 가입 여부를 공개하는 API다. 가입 인증 메일에는 아래 IP별 제한을 추가했다. 다중 서버 공통 제한·일일 총 발송량·악용 탐지 정책은 인프라와 별도로 협의한다.
- 인증 행은 이메일별 한 건을 갱신한다. 만료·소비된 행의 정기 삭제/보관 기간은 운영 정책 확정 후 적용해야 한다. 만료/소비 여부는 매 요청 검증하므로 오래된 행으로 인증할 수는 없다.
- 회원가입 기능이 기존 다이어리에 소유권 검사를 추가하지는 않는다. 현재 비회원 다이어리 API는 운영 회원 데이터에 연결하기 전 별도로 보호해야 한다.

## 검증

`backend/`에서 `./gradlew.bat test`. H2 기반 회원가입 API/저장 테스트는 이메일 정규화, 해시, 필수 약관·버전, 중복, 오답 횟수 커밋, 만료, 토큰 이메일 귀속, 재발송 무효화, 메일 실패 롤백, Swagger 노출을 검증한다. 실제 PostgreSQL 마이그레이션과 SMTP 도착, 프론트/실기기 연동은 각각 별도 확인 대상이다.

2026-10-26 확인 결과:

- 회원가입 통합 테스트 21개 및 메일/비밀키 테스트 4개 통과. 기존 다이어리 회귀 테스트를 포함한 전체 Gradle test 성공. PostgreSQL 전용 기존 9개 테스트는 이 명령에서 제외된다.
- 별도의 임시 PostgreSQL 17 컨테이너에서 V1 및 V2 SQL 적용 성공. 회원·인증 계정·약관 저장, 중복 이메일/잘못된 회원 외래 키 거절, 트랜잭션 롤백 후 회원 0건을 확인했다. 기존 개발 DB는 변경하지 않았고 임시 컨테이너는 정리했다. 이는 SQL 직접 실행 검증이며 PostgreSQL에서의 전체 JPA 통합 테스트를 대신하지 않는다.
- 실제 SMTP 발송/메일 수신, 프론트 연결, Android/iOS 실기기 검증은 미실시다.

V3 후속 검증(2026-10-26): 전체 테스트 111개 중 102개 통과, PostgreSQL 전용 9개 제외, 실패 0개. 로컬 PostgreSQL에서 테스트 회원·인증·약관을 넣고 V3 적용 후 ID·식별값·해시·생년월일 데이터 유지와 20자 약관 버전/NULL 이메일 저장을 확인한 뒤 테스트 트랜잭션을 롤백했다. 백업 후 실제 로컬 DB의 V1~V3 이력 검증과 JPA 스키마 검증에 성공했다. 수정된 서버를 임시 8082 포트로 실행해 health UP, Swagger 4개 회원가입 경로, 생년월일 스키마 제거, 이메일 중복 확인 200을 확인하고 임시 서버를 종료했다. 기존 8080 프로세스는 종료하지 않았다. 실제 SMTP 발송은 이 검증에 포함하지 않았다.

## 가입 인증 메일 IP 제한 보완

MR !149 자동 리뷰의 메일 발송 남용 항목만 보완했다. `POST /api/v1/auth/email-verifications`는 유효한 요청 본문 검증 후 같은 클라이언트 IP의 요청을 **15분에 최대 20회** 허용한다. 이메일 주소를 바꾸거나 이미 가입된 이메일을 요청하거나 SMTP 발송이 실패해도 요청 횟수에 포함한다. 제한 초과 시 SMTP·인증 서비스 호출 전에 429, `SIGNUP_MAIL_IP_RATE_LIMITED`, `Retry-After`(현재 제한 창의 남은 초), `Cache-Control: no-store`를 반환한다. 다른 IP의 예산은 독립적이다.

이메일별 기존 재발송 간격 60초와 기존 `VERIFICATION_RATE_LIMITED` 오류·Retry-After 60은 유지한다. 성공 응답 본문과 인증번호 확인·가입·로그인·Refresh 정책은 변경하지 않았다. DB 마이그레이션·새 환경변수·프론트 변경은 없다.

IP는 servlet의 remoteAddr를 사용하며 외부 X-Forwarded-For 값을 직접 파싱하지 않는다. 기존 개발/운영 신뢰 Nginx 설정이 정확히 주입되어야 실제 사용자 IP로 제한된다. 같은 NAT·공유 네트워크는 IP 예산을 공유한다.

이 제한은 서버 한 대의 메모리에서 동작하며 IP 해시 키를 최대 2만 개 보관한다. 재시작·인스턴스 간 공통 제한이나 캐시 축출에 걸친 보장은 하지 않는다. 다중 서버·일일 전체 발송량 제한과 CAPTCHA는 이번 범위 밖이다. 로컬 테스트의 SMTP는 대체하며 실제 이메일을 발송하지 않는다.

보완 검증(2026-10-26): backend 전체 테스트 155개 중 145개 통과·환경 조건에 따른 10개 제외·실패 0개. 서로 다른 이메일로 같은 IP에서 21번째 요청 차단, 위조 X-Forwarded-For 헤더로 우회 불가, 다른 IP의 정상 발송, 창 만료 후 해제·남은 Retry-After, 동시 40건 중 최대 20건 허용, 409·503 요청도 예산 소모, 기존 이메일 제한의 Retry-After 60 유지 등을 검증했다. 실제 SMTP 발송은 하지 않았다.
