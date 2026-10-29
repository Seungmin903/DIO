# DIO 전체 백엔드 구조 보고서

## 1. 개요

백엔드는 Java 17, Spring Boot 4.1, Spring Data JPA, PostgreSQL 17, Flyway로 구성한다. REST API는 `/api/v1` 아래에 제공하며 Swagger UI는 `/swagger-ui.html`, 상태 확인은 `/actuator/health`에서 확인한다.

이 문서는 특정 페이지·캔버스 기능 명세가 아니라, 현재 백엔드 전체의 모듈 경계·요청 흐름·데이터·외부 연동·운영 상태를 보고하기 위한 기준 문서다.

```text
React Native 앱 / 웹 / Swagger
          │ HTTP(S) + JSON 또는 form-urlencoded
          ▼
Controller ──► Service ──► Repository ──► PostgreSQL
    │              │
    │              ├── JWT 인증 · 다이어리 권한 검사
    │              └── 로컬 파일 / S3 프로필 사진 저장소
    ▼
ProblemDetail 오류 응답
```

## 2. 도메인 중심 패키지 구조

백엔드는 **도메인 우선 구조**다. 먼저 업무 영역(`auth`, `user`, `diary`, `page`)으로 분리하고, 각 영역 안에서 MVC와 영속성 계층을 둔다. 즉, 최상위에 `controller/`, `service/`를 모아두는 구조가 아니다.

```text
com.f106.DIO/
├─ auth/                              # 인증 도메인
│  ├─ controller/                     # 로그인·가입·이메일 인증 HTTP API
│  ├─ service/                        # 가입·로그인·토큰 갱신 업무 규칙
│  ├─ domain/                         # 인증 계정·Refresh Token·이메일 인증 엔티티
│  ├─ repository/                     # 인증 엔티티 JPA 접근
│  ├─ dto/                            # 인증 요청·응답 계약
│  ├─ security/                       # JWT 발급·해석
│  ├─ infrastructure/mail/            # SMTP 구현체
│  ├─ config/                         # Security·CORS·토큰·스케줄 설정
│  ├─ exception/                      # 인증 오류와 HTTP 오류 응답
│  └─ support/                        # 비밀키·요청 제한 보조 로직
│
├─ user/                              # 사용자 도메인
│  ├─ controller/                     # 중복 확인·프로필 사진 API
│  ├─ service/                        # 사용자·약관·사진 업무 규칙
│  ├─ domain/                         # User·TermsAgreement·ProfilePhoto
│  ├─ repository/                     # 사용자 관련 JPA 접근
│  ├─ dto/                            # 사용자 요청·응답
│  ├─ infrastructure/storage/         # Local·S3 사진 저장소 구현체
│  ├─ config/                         # 사진 저장소·약관 설정
│  ├─ exception/                      # 사용자 오류 처리
│  └─ support/                        # 입력값·이미지·JPEG 방향 보정
│
├─ diary/                             # 다이어리·공유 권한 도메인
│  ├─ controller/                     # 다이어리 CRUD API
│  ├─ service/                        # 생성·조회·수정·권한 검사
│  ├─ domain/                         # Diary·DiaryMember
│  ├─ repository/                     # 다이어리·멤버 JPA 접근
│  ├─ dto/                            # 다이어리 요청·응답
│  └─ support/                        # 없음·권한 오류 처리
│
├─ page/                              # 페이지·캔버스 도메인
│  ├─ controller/                     # 페이지·요소 HTTP API
│  ├─ service/                        # 페이지·요소 저장과 일괄 변경
│  ├─ domain/                         # DiaryPage·CanvasElement·PageTemplate
│  ├─ repository/                     # 페이지·요소·속지 JPA 접근
│  ├─ dto/                            # JSON·Swagger 폼 요청·응답
│  └─ support/                        # 페이지·요소 오류 처리
│
├─ localseed/                         # local 프로필에서만 실행하는 데모 데이터 적재
└─ global/                            # 모든 도메인이 공유하는 OpenAPI·health 구성
```

### 도메인 내부 MVC 흐름

```text
HTTP Request
  → {domain}/controller     요청 파싱·DTO 검증·HTTP 상태 결정
  → {domain}/service        트랜잭션·업무 규칙·다른 도메인 권한 협력
  → {domain}/repository     JPA 조회·저장
  → {domain}/domain         엔티티 상태 변경
  → DTO Response
```

`dto`는 웹 요청/응답 계약이고, `domain`은 DB 엔티티와 상태 변경을 담당한다. `support`·`exception`은 도메인 안에서만 쓰는 보조 로직과 오류 응답을 둔다. 외부 기술 의존 구현은 해당 도메인의 `infrastructure`에 둬서 서비스 계층이 저장소·SMTP 구현을 직접 알지 않게 한다.

서버 렌더링 화면이 없는 REST API이므로 MVC의 **View는 React Native·웹 클라이언트**다. 백엔드 Controller는 화면을 렌더링하지 않고 DTO와 HTTP 상태만 반환하며, Model은 도메인 엔티티·서비스 규칙·DTO로 구성된다.

| 도메인 | 책임 | 대표 서비스 |
|---|---|---|
| `auth` | 이메일 인증, 가입, 로그인, 토큰·세션 | `EmailVerificationService`, `EmailSignupService`, `EmailLoginService` |
| `user` | 사용자 중복 확인, 약관, 프로필 사진 | `UserService`, `UserTermsService`, `UserPhotoService` |
| `diary` | 다이어리 CRUD, 소유자·멤버 권한 | `DiaryService`, `DiaryAccessService` |
| `page` | 페이지·속지·캔버스 요소 저장 | `PageService`, `CanvasElementService` |

## 3. API 전체 지형

| API 그룹 | 경로 | 인증 | 현재 역할 |
|---|---|---|---|
| 상태 확인 | `/api/health`, `/actuator/health` | 불필요 | 서버·의존성 상태 확인 |
| 가입 준비 | `/api/v1/auth/email-verifications/**` | 불필요 | 이메일 인증번호 발송·확인, signupToken 발급 |
| 사용자 확인 | `/api/v1/auth/email-availability`, `/nickname-availability` | 불필요 | 가입 전 이메일·닉네임 중복 확인 |
| 회원가입 | `/api/v1/auth/signup` | 불필요 | JSON 또는 프로필 사진 포함 multipart 가입 |
| 로그인·세션 | `/api/v1/auth/login`, `/refresh`, `/logout` | 로그아웃만 필요 | Access·Refresh Token 관리 |
| 프로필 사진 | `/api/v1/auth/profile-photos/{photoId}` | 불필요 | 공개 PNG 조회 |
| 다이어리 | `/api/v1/diaries/**` | 필요 | 내 다이어리 생성·조회·수정·삭제 |
| 편집 저장 | `/api/v1/pages/**`, `/api/v1/diaries/{diaryId}/pages/**` | 필요 | 저장된 페이지·요소·순서 관리 |

Swagger UI는 `/swagger-ui.html`, OpenAPI JSON은 `/v3/api-docs`다. 인증이 필요한 저장 API는 Swagger에서 자물쇠로 표시된다.

## 4. 인증과 권한

### 로그인 흐름

1. 이메일 인증 후 회원가입한다.
2. `/api/v1/auth/login`이 Access Token과 Refresh Token을 발급한다.
3. 클라이언트는 저장 API 요청에 `Authorization: Bearer {accessToken}`을 넣는다.
4. `LoginSecurityConfig`가 JWT 서명과 활성 세션을 검증한다.
5. 만료 전 Access Token은 `/api/v1/auth/refresh`로 교체하고, 로그아웃 시 해당 기기 세션을 폐기한다.

Access Token 기본 만료는 15분, Refresh Token 세션의 기본 최대 수명은 30일이며 환경변수로 조절한다.

### 보호 범위

아래 경로는 인증이 필요하며 Swagger에서 자물쇠로 표시된다.

| 경로 | 인증 | 권한 |
|---|---|---|
| `/api/v1/diaries`, `/api/v1/diaries/**` | 필수 | 소유자·활성 멤버만 조회 |
| `/api/v1/pages/**` | 필수 | 페이지가 속한 다이어리의 권한 적용 |
| `/api/v1/auth/logout` | 필수 | 현재 토큰의 세션만 로그아웃 |
| 로그인·회원가입·이메일 인증·토큰 재발급 | 불필요 | 공개 진입점 |

다이어리 생성자는 `owner_user_id`와 `diary_members`의 `OWNER`로 함께 기록된다. `OWNER`·`EDITOR`는 페이지와 캔버스 요소를 변경할 수 있고 `VIEWER`는 조회만 가능하다. 권한이 없으면 `403 DIARY_ACCESS_DENIED`, 토큰이 없거나 유효하지 않으면 `401 INVALID_TOKEN`을 반환한다.

비로그인 사용자의 그림은 프런트 로컬 임시 상태여야 하며 저장 API를 호출하지 않는다.

## 5. 핵심 데이터와 저장 구조

```text
users
 ├─ user_auth_accounts / refresh_tokens / signup_profile_photos
 └─ diaries (owner_user_id)
     ├─ diary_members / diary_invites
     ├─ pages → canvas_elements → element_strokes
     ├─ diary_media_library / diary_handwriting_fonts
     └─ notifications
```

| 데이터 그룹 | 주요 테이블 | 현재 백엔드 역할 |
|---|---|---|
| 계정·세션 | `users`, `user_auth_accounts`, `refresh_tokens`, `refresh_token_history`, `signup_email_verifications`, `user_terms_agreements` | 이메일 가입·로그인·약관·세션 폐기 |
| 다이어리 협업 | `diaries`, `diary_members`, `diary_invites` | 소유자·멤버 권한 확인. 초대 API는 후속 범위 |
| 편집 데이터 | `pages`, `page_templates`, `canvas_elements`, `element_strokes`, `canvas_history_operations` | 페이지·요소 REST 저장. 획 이력·Undo API는 후속 범위 |
| 미디어·AI | `media_files`, `diary_media_library`, `diary_handwriting_fonts`, `ai_jobs` | 프로필 사진 저장소는 구현, 편집 미디어·AI API는 후속 범위 |
| 알림 | `notifications` | 스키마 준비, API·푸시 연결은 후속 범위 |

| 테이블/엔티티 | 용도 |
|---|---|
| `diaries` / `Diary` | 제목, 표지, 공개 범위, 소유자, 소프트 삭제 |
| `diary_members` / `DiaryMember` | 멤버 역할과 참여 상태 |
| `pages` / `DiaryPage` | 속지, 페이지별 속지 설정, 캔버스 크기, 격자, 순서 |
| `canvas_elements` / `CanvasElement` | 텍스트·사진·스티커·테이프·획·도형의 위치·크기·스타일·소프트 삭제 |
| `page_templates` / `PageTemplate` | 공통 속지 기본값과 캔버스 규격 |
| `media_files` | 사진·스티커·테이프·폰트 등 미디어 메타데이터 참조용 |

페이지와 요소 모두 UUID를 사용한다. 요소별 확장 데이터는 `properties_json` JSONB로 보존하며, 좌표와 공통 배치 정보는 조회·정렬 성능을 위해 개별 컬럼으로 저장한다.

### 페이지·요소 API 특징

- 페이지 생성·수정, 요소 생성·수정은 JSON과 `application/x-www-form-urlencoded`를 함께 지원한다.
- Swagger에서 폼 콘텐츠 타입을 고르면 제목·좌표·크기 등을 입력칸별로 작성할 수 있다.
- `templateConfig`, `propertiesJson`은 중첩 데이터라 JSON 문자열 입력칸으로 유지한다.
- 페이지·요소는 소프트 삭제한다. 요소 삭제 성공 응답은 `200 OK`다.
- 요소 일괄 변경은 하나의 트랜잭션으로 생성·수정·삭제·복구를 처리한다.
- 검증 상한: 요소 단건 `propertiesJson` 128KiB, 페이지 `templateConfig` 512KiB, 일괄 배열별 최대 100개다.

상세 API 계약은 [페이지·캔버스 API](./다이어리%20저장/페이지·캔버스%20API.md)를 따른다.

## 6. 데이터베이스와 마이그레이션

Flyway 마이그레이션은 `backend/src/main/resources/db/migration/`에 둔다.

| 버전 | 내용 |
|---|---|
| V1 | 사용자·다이어리·페이지·캔버스·공유·미디어의 초기 PostgreSQL 스키마 |
| V2 | 인증 계정 제약과 이메일 인증 테이블 |
| V3 | 로그인 세션·Refresh Token 회전 이력 |
| V4 | 기존 프로필 사진 바이너리 저장 |
| V5 | 프로필 사진을 로컬/S3 저장소 참조로 전환 |
| V6 | 만료 로그인 세션 정리용 인덱스 |

로컬 프로필은 `ddl-auto: validate`이므로 엔티티를 바꿀 때 기존 PostgreSQL 컬럼 타입과 일치해야 한다. 예를 들어 색상 컬럼은 PostgreSQL `CHAR(7)`에 맞춰 `@JdbcTypeCode(SqlTypes.CHAR)`를 사용한다.

## 7. 파일 저장소와 로컬 시드

프로필 사진은 `ProfilePhotoFiles`를 통해 저장한다.

- 로컬: `.local-data/profile-photos` 아래 파일 저장
- 운영: S3 객체 저장소 사용 가능
- DB: 실제 바이트 대신 저장소 제공자·키·버킷을 `signup_profile_photos`에 보관

로컬 데모 시드는 `backend/src/main/resources/db/seed/local-demo.json`에서만 읽는다. 이 경로는 Git과 Docker 빌드에서 제외되며 Flyway가 읽지 않는다. 실행은 `local` 프로필과 `DIO_LOCAL_SEED_ENABLED=true`가 모두 필요하다. 시드 다이어리에는 `ownerEmail`을 지정해 로그인 사용자 소유로 연결한다.

세부 사용법은 [로컬 시드](./다이어리%20저장/로컬%20시드.md)를 참고한다.

## 8. 환경 설정과 실행

| 항목 | 위치/환경변수 |
|---|---|
| DB 접속 | `DB_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| JWT 서명 키 | `AUTH_JWT_SECRET` |
| SMTP | `SPRING_MAIL_*` |
| 프로필 사진 저장소 | `MEDIA_STORAGE`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION` (미디어와 공용) |
| 로컬 시드 | `DIO_LOCAL_SEED_ENABLED`, `DIO_LOCAL_SEED_FILE` |

인증 관련 CORS는 `AUTH_ALLOWED_ORIGINS`에 지정한 출처에만 `/api/v1/auth/**` 경로로 적용된다. 다이어리·페이지 API를 브라우저 웹에서 직접 호출할 경우에는 별도 CORS 정책과 프런트 API 어댑터가 필요하다.

```powershell
# 저장소 루트: PostgreSQL 실행
docker compose up -d --wait postgres

# backend/: 서버 실행
$env:JAVA_HOME='C:\Users\SSAFY\.jdks\azul-17.0.20'
.\gradlew.bat bootRun

# backend/: 전체 테스트
.\gradlew.bat test --no-daemon
```

Swagger에서 로그인한 뒤에는 **Authorize**에 로그인 응답의 Access Token 값을 입력한다. HTTP Bearer 보안 방식이므로 Swagger가 `Bearer` 접두사를 붙인다.

## 9. 테스트와 남은 경계

기본 테스트는 H2 인메모리 DB에서 실행하고, `postgresTest`는 로컬 PostgreSQL에서 Flyway 스키마를 검증한다. 주요 검증 범위는 로그인·토큰 회전, 프로필 사진 처리, 다이어리 CRUD, 페이지·캔버스 저장, 폼 입력, 권한 없는 접근 401/403, 로컬 시드다.

현재 멤버 권한 검사는 동작하지만, 초대 생성·수락·멤버 역할 변경 API는 아직 별도 구현이 필요하다. 실시간 공동 편집 WebSocket, 편집용 미디어 업로드·보관함 API, 캔버스 작업 이력/Undo API, AI 작업·알림 API도 DB 설계는 준비돼 있으나 API 연결 범위는 후속 작업이다.
