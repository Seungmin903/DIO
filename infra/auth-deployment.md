# 인증 기능 배포 환경 계약

개발 배포는 `compose/compose.dev.yml`, 운영 배포는 `compose/compose.prod.yml`을 사용한다. CI는 각각 `/home/gitlab-runner/dio-env/dev.env`, `/home/gitlab-runner/dio-env/prod.env`를 읽는다. 이 비공개 파일은 Git에 넣지 않는다. 저장소만으로 실제 서버 값·SMTP 연결·S3 권한이 준비되었다고 판단할 수 없다.

## 필수 환경변수

| 변수 | 설정 기준 |
|---|---|
| `AUTH_JWT_SECRET` | 무작위 32바이트 이상을 Base64로 변환한 로그인 서명 전용 키 |
| `SIGNUP_VERIFICATION_SECRET` | 인증번호 HMAC 전용 비밀키, UTF-8 기준 32바이트 이상. JWT 키와 분리 |
| `AUTH_TRUSTED_PROXY_REGEX` | 백엔드에서 관측되는 실제 Nginx 출발지 IP와 일치하는 정규식. 누락 시 Compose와 Spring dev/prod 모두 실패 |
| `SIGNUP_MAIL_FROM` | 메일 제공자에게 허용된 발신 주소 |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD` | SMTP 서버와 발신 계정 자격 증명 |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | 배포 대상 DB 연결 정보 |
| `BACKEND_IMAGE` | CI가 빌드할 커밋의 이미지 이름으로 주입 |

`AUTH_ALLOWED_ORIGINS`에는 실제 프론트 Origin을 설정한다. SMTP 기본 포트는 587이며 인증과 STARTTLS를 기본 사용한다. 다른 메일 서버라면 설정도 조정한다. 약관 버전은 `SIGNUP_SERVICE_TERMS_VERSION`, `SIGNUP_PRIVACY_TERMS_VERSION`, `SIGNUP_MARKETING_TERMS_VERSION`을 프론트와 맞춘다(기본 v1).

## 사진 저장소

- dev 기본은 `SIGNUP_PHOTO_STORAGE=local`, prod 기본은 `s3`다.
- S3 사용 시 `SIGNUP_PHOTO_S3_BUCKET`은 실제 비공개 버킷 이름, `SIGNUP_PHOTO_S3_REGION`은 해당 리전으로 설정한다(기본 ap-northeast-2). 버킷·리전이 비어 있으면 애플리케이션 기동이 실패한다.
- EC2 IAM 역할 등 AWS 기본 자격 증명 체인으로 해당 사진 객체의 Put/Get/Delete 권한을 부여한다. AWS 키를 저장소나 프론트에 넣지 않는다.
- 로컬은 Compose의 `signup-profile-photos` 볼륨에 저장한다. 저장소를 옮길 때 원본 볼륨을 보존한다.
- `SIGNUP_PHOTO_MIGRATE_LEGACY`는 기본 false이며 필요할 때만 true로 주입한다. 이전 중 항목별 실패는 ID와 개수만 기록하고 다음 ID로 진행한다. 실패 항목은 원본 참조를 유지하며 다음 실행에서 다시 시도한다. 모든 대상이 완료되면 옵션을 끈다.

## 프록시와 배포 전 검증

Nginx dev/prod 설정은 `proxy_set_header X-Forwarded-For $remote_addr;`로 외부에서 보낸 값을 덮어쓴다. 백엔드는 Compose에서 호스트 루프백에만 포트를 노출하고, Tomcat은 `AUTH_TRUSTED_PROXY_REGEX`에 해당하는 프록시만 신뢰한다. 실제 프록시 IP가 예를 들어 172.20.0.2라면 정규식은 `172\.20\.0\.2`다. 예시 IP를 그대로 배포하지 않으며 `.*`처럼 모든 주소를 신뢰하는 식을 쓰지 않는다. 프록시 컨테이너 재생성 후 IP가 바뀌면 설정도 갱신한다.

CI는 이미지 빌드·컨테이너 교체 **전에** `docker compose ... config --quiet`로 필수 변수 주입을 확인한다. 렌더링된 전체 Compose 설정은 비밀번호가 포함되므로 출력하지 않는다. `dev.env.example`, `prod.env.example`은 변수 목록을 위한 양식이며 빈 비밀값을 실제 값으로 채워 비공개 경로에 둔다.

배포 담당자는 실제 환경에서 건강 상태, 테스트 메일 도착, 프로필 사진 저장·조회, 서로 다른 클라이언트 IP가 분리되는지 확인한다. 외부 X-Forwarded-For를 임의 지정해도 Nginx가 덮어쓰는지도 확인한다. 로컬 계약 테스트는 실제 서버의 자격 증명·네트워크 권한을 대신 검증하지 않는다.
