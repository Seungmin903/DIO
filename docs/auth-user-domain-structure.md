# 인증·회원 도메인 구조

인증·로그인은 `auth`, 회원 정보·프로필·약관은 `user`가 담당한다. 각 도메인 안에서 controller/service/domain/repository/dto로 역할을 나눈다. 설정·예외·외부 저장소 등은 별도 하위 패키지에 둔다.

| 패키지 | auth | user |
| --- | --- | --- |
| controller | SignupController, EmailVerificationController, LoginController | UserController |
| service | 회원가입 흐름, 이메일 인증, 로그인·토큰·세션 정리 | 회원 생성·중복 검사, 약관 검증·저장, 프로필 사진 처리 |
| domain | EmailAuthProvider, EmailVerification, RefreshToken, RefreshTokenHistory | User, ProfilePhoto, TermsAgreement, TermsType |
| repository | 인증 계정·인증번호·세션 저장소 | 회원·사진·약관 저장소 |
| dto | SignupRequest, SignupResponse, LoginRequest, LoginResponse, RefreshRequest, LoginUserResponse, EmailVerificationRequest, EmailVerificationSentResponse, EmailVerificationResponse | EmailRequest, NicknameRequest, AvailabilityResponse, Agreement |
| config | 인증 설정·Security·CORS | 약관 버전·사진 저장소 설정 |
| infrastructure | mail | storage |

## 의존 방향

### 엔티티·빈 이름 충돌 확인

2026-10-27에 최신 develop(`0d0af5a`)을 반영한 전체 `backend/src/main/java/com/f106/DIO`를 확인했다. User, UserController, UserService, UserRepository, ProfilePhoto 선언은 각각 하나뿐이며 동일한 이름을 명시한 엔티티·빈도 없다. Spring Boot 컨텍스트 기동을 포함한 회원가입 통합 테스트로 JPA 매핑과 빈 등록을 검증한다. 현재 충돌이 없어 임의의 별칭이나 클래스명 변경은 추가하지 않는다. 다른 팀은 회원 엔티티를 별도로 중복 생성하지 않고 `user.domain.User`를 재사용한다.

`auth.service`가 회원가입 절차를 조율하면서 `user.service`를 호출한다. `user`는 `auth`를 참조하지 않는다. 엔티티는 요청 DTO나 파일 저장소 타입을 받지 않고 필요한 값만 전달받는다. 회원 공통 엔티티는 `user.domain.User` 하나이며 `users` 테이블에 매핑한다.

기존 `SignupUser`는 `User`, `SignupProfilePhoto`는 `ProfilePhoto`로 이름을 바꿨다. 해당 Repository도 `UserRepository`, `ProfilePhotoRepository`로 변경했다. 이전 `auth.signup` 또는 `auth.login`을 import하는 미병합 브랜치는 이 표에 따라 import와 생성자 호출을 맞춰야 한다.

요청·응답 DTO는 다이어리와 동일하게 public record 하나당 Java 파일 하나로 관리한다. SignupDtos·LoginDtos·UserDtos 컨테이너는 제거했다. 기존 컨테이너 타입을 참조하는 브랜치는 각 DTO의 직접 import로 변경한다.

## API 호환성

`UserExceptionHandler`는 컨트롤러 종류와 관계없이 `UserException`만 공통 처리한다. 회원 API의 입력 검증·Spring MVC 오류는 `UserRequestExceptionHandler`가 `UserController`에 한정해 처리하며, 인증·다이어리의 기존 예외 처리 범위는 유지한다. 새로운 컨트롤러가 회원 서비스를 사용해도 UserException의 HTTP 상태·오류 코드·메시지가 동일하게 반환된다.

기존 URL·요청 필드·응답 필드·오류 코드는 유지한다. 패키지 이름과 API 경로는 별개이므로 프론트 수정 없이 사용할 수 있다.

| 담당 | 기존 경로 |
| --- | --- |
| SignupController | POST /api/v1/auth/signup (JSON·multipart) |
| EmailVerificationController | POST /api/v1/auth/email-verifications, POST /api/v1/auth/email-verifications/verify |
| LoginController | POST /api/v1/auth/login, /refresh, /logout |
| UserController | POST /api/v1/auth/email-availability, /nickname-availability; GET /api/v1/auth/profile-photos/{photoId} |

내 정보 조회·수정 등 새로운 API는 이 구조 변경에서 추가하지 않는다. 기존 닉네임 정책도 변경하지 않는다.

## DB·환경 설정

테이블·컬럼·Flyway SQL은 변경하지 않는다. 기존 DB 데이터를 그대로 사용한다. `SignupProperties`는 인증 비밀값·발신자를, `TermsProperties`는 약관 버전을 담당한다. 기존 `dio.signup.*` 설정 키와 환경변수는 동일하므로 추가 설정은 필요 없다.

회원가입은 이미지 변환·비밀번호 해싱·파일 업로드를 DB 트랜잭션 밖에서 처리하고, 회원·인증 계정·약관·사진 참조·인증 토큰 소비를 하나의 짧은 쓰기 트랜잭션으로 저장한다. 사진 저장 보상 처리와 공개 사진의 활성 회원 검사도 유지한다. 공개 사진 조회는 메타데이터 조회 트랜잭션 종료 후 외부 저장소를 읽는다.

## 검증

backend 폴더에서 `./gradlew.bat test`로 회귀 테스트를 실행한다. 격리 PostgreSQL 접속 변수를 설정한 뒤 `./gradlew.bat authPostgresTest`로 기존 Flyway 마이그레이션과 실제 PostgreSQL 인증 동작을 검증한다. 테스트 패키지는 `auth.integration`, `user.integration`에 있다. DomainStructureTests는 user→auth 참조가 다시 생기거나 엔티티가 DTO·외부 저장소에 의존하지 않도록 검사한다.

### 이번 변경의 검증 결과 (2026-10-27)

- 백엔드 전체: 132개 중 124개 통과, 환경 조건에 따른 8개 제외, 실패 0개.
- 격리 PostgreSQL: authPostgresTest 통과. 기존 마이그레이션·실제 DB 매핑·인증 동시 요청·세션 정리 검증.
- 프론트 test:auth: 29개 통과.
- 변경 파일 비밀키 검사 및 git diff --check 통과.
- 이번 작업에서는 Expo Go 실기기 수동 검증을 추가로 수행하지 않았다.
