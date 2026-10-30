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

- 프로필 사진은 미디어와 같은 `MEDIA_STORAGE`·`MEDIA_S3_BUCKET`·`MEDIA_S3_REGION`을 쓴다. dev·prod 기본은 `s3`다.
- `MEDIA_S3_BUCKET`은 실제 비공개 버킷 이름, `MEDIA_S3_REGION`은 해당 리전으로 설정한다(기본 ap-northeast-2). 버킷이 비어 있으면 배포 단계에서 실패한다.
- EC2 IAM 역할 등 AWS 기본 자격 증명 체인으로 해당 사진 객체의 Put/Get/Delete 권한을 부여한다. AWS 키를 저장소나 프론트에 넣지 않는다.
- 로컬은 Compose의 `signup-profile-photos` 볼륨에 저장한다. 저장소를 옮길 때 원본 볼륨을 보존한다.
- `SIGNUP_PHOTO_MIGRATE_LEGACY`는 기본 false이며 필요할 때만 true로 주입한다. 이전 중 항목별 실패는 ID와 개수만 기록하고 다음 ID로 진행한다. 실패 항목은 원본 참조를 유지하며 다음 실행에서 다시 시도한다. 모든 대상이 완료되면 옵션을 끈다.

## 프록시와 배포 전 검증

Nginx dev/prod 설정은 `proxy_set_header X-Forwarded-For $remote_addr;`로 외부에서 보낸 값을 덮어쓴다. 백엔드는 Compose에서 호스트 루프백에만 포트를 노출하고, Tomcat은 `AUTH_TRUSTED_PROXY_REGEX`에 해당하는 프록시만 신뢰한다. 실제 프록시 IP가 예를 들어 172.20.0.2라면 정규식은 `172\.20\.0\.2`다. 예시 IP를 그대로 배포하지 않으며 `.*`처럼 모든 주소를 신뢰하는 식을 쓰지 않는다. 프록시 컨테이너 재생성 후 IP가 바뀌면 설정도 갱신한다.

CI는 이미지 빌드·컨테이너 교체 **전에** `docker compose ... config --quiet`로 필수 변수 주입을 확인한다. 렌더링된 전체 Compose 설정은 비밀번호가 포함되므로 출력하지 않는다. `dev.env.example`, `prod.env.example`은 변수 목록을 위한 양식이며 빈 비밀값을 실제 값으로 채워 비공개 경로에 둔다.

배포 담당자는 실제 환경에서 건강 상태, 테스트 메일 도착, 프로필 사진 저장·조회, 서로 다른 클라이언트 IP가 분리되는지 확인한다. 외부 X-Forwarded-For를 임의 지정해도 Nginx가 덮어쓰는지도 확인한다. 로컬 계약 테스트는 실제 서버의 자격 증명·네트워크 권한을 대신 검증하지 않는다.

## 자동 PostgreSQL 검증과 헬스 체크

`backend-postgres-auth-test`, `backend-postgres-sharing-test`, `backend-postgres-diary-test`, `backend-postgres-lifecycle-test`는 실행 시간을 줄이기 위해 다음처럼 실행한다. MR에서는 Flyway migration, `infra/scripts/test-auth-postgres.sh`, 해당 묶음의 PostgreSQL 테스트 파일이 바뀐 경우에만 자동 실행하고, 그 밖의 백엔드·CI 변경에서는 파이프라인을 막지 않는 수동 작업으로 남긴다. SQL·트랜잭션·락 동작을 바꾼 MR은 작성자가 해당 묶음을 수동 실행해 결과를 MR에 남긴다. develop에 백엔드 변경이 병합되면 네 작업을 모두 실행하며, 실패하면 개발 서버 배포 단계로 넘어가지 않는다. 각 작업은 CI_JOB_ID별 폐기용 PostgreSQL 17을 만들고 호스트 포트를 공개하지 않는다. 테스트 JVM만 DB 네트워크 네임스페이스에 참여하며 실제 배포 환경 파일·DB·볼륨을 사용하지 않고, 성공·실패 시 trap으로 테스트 DB와 익명 볼륨을 정리한다. 결과는 각 테스트 task의 JUnit artifact에 남긴다. 일반 H2 테스트도 별도로 유지한다.

`management.health.mail.enabled=false`로 외부 SMTP 장애를 기본 `/actuator/health`에서 제외한다. DB 등 다른 헬스 검사는 유지한다. 메일 발송 API의 실패 응답·오류 처리는 유지하므로 운영자는 실제 테스트 메일 도착과 발송 실패를 별도로 관찰한다.

만료 로그인 세션 정리 작업은 기본 활성화되어 있으며 원래 만료 시각이 지난 세션만 정리한다. 상세 정책과 실행 간격은 [세션 정리 문서](../docs/auth-session-retention-followup.md)를 참고한다.
## 공유 초대 링크 설정

공유 링크 사용 시 `SHARING_INVITE_SECRET`에 별도의 32바이트 이상 Base64 비밀키를 지정한다. Compose dev/prod에서 백엔드로 전달한다. 미설정이면 다른 기능은 기동하며 초대 링크 기능만 503을 반환한다. `SHARING_INVITE_BASE_URL`은 실제 초대 화면 URL/딥링크 접두사이며 기본 `/invite/`는 상대 경로다. 프론트 라우팅 준비 후 실제 주소를 설정한다. 키 교체 시 기존 링크는 재발급해야 한다. [공유 API 문서](../docs/diary-sharing.md)를 참고한다.

이메일 초대 발송은 `SHARING_INVITE_BASE_URL`이 클릭 가능한 절대 주소(http/https 또는 dio 스킴)여야 한다. 기본 상대 경로는 링크 API 확인용이며 메일 발송 시에는 503으로 거부한다. 기존 SMTP 설정을 재사용하며 전용 제한 실행기에서 커밋 후 발송한다. 실제 메일 도착과 프론트 초대 화면 라우팅은 배포 환경에서 확인한다.


## 회원 목록 PostgreSQL ICU 점검

로컬 Compose와 격리 CI는 postgres:17을 선언하지만 dev/prod backend Compose는 외부 DB 네트워크에 접속하므로 저장소에 실제 DB 이미지/콜레이션이 고정되어 있지 않다. 이미지 이름만으로 운영 DB 지원을 확정하지 않는다. 실제 운영자가 사용하는 Docker 호스트에서 DB 컨테이너 이름을 확인한 뒤 다음 읽기 전용 검사를 실행한다.

```bash
bash infra/scripts/check-member-list-icu.sh <실제-DB-컨테이너-이름>
```

스크립트는 docker inspect/exec만 사용하고 컨테이너의 POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD를 내부 프로세스에서 사용한다. 환경 전체나 비밀값을 출력하지 않는다. 공식 이미지의 기본 사용자/DB도 지원한다. psql의 각 질의는 BEGIN READ ONLY / ROLLBACK으로 감싸 pg_catalog의 deterministic ICU root 존재와 실제 ÉÄ→éä lower 연산을 확인한다. DB·설정·Flyway 이력을 바꾸거나 컨테이너를 시작/종료하지 않는다. 종료 코드 0은 지원, 2는 ICU catalog 부재, 3은 접속·권한·예상 밖 응답·연산 오류이므로 확인 불가/오류를 미지원으로 단정하지 않는다.

격리 CI의 `backend-postgres-diary-test`는 버려지는 PostgreSQL 컨테이너의 준비 완료 뒤 같은 검사를 실행하도록 연결했다. 이는 실제 dev/prod 검사와 다르다. 스크립트 회귀는 `bash infra/scripts/test-member-list-icu.sh`로 지원·기본 환경·미지원·컨테이너/질의/연산 오류 8개를 확인한다.

ICU가 없더라도 앱 전체 기동은 이 기능 때문에 실패하지 않는다. 인증·회원 생성/상세/수정과 검색 없는 created/updated/pages 목록은 유지하고 검색/title 정렬만 503 DIARY_LIST_UNAVAILABLE로 제한한다. 지원 복구 후 앱 요청을 재시도할 수 있으며 ICU 라이브러리 설치·DB 재시작 등 운영 조치는 별도다. ASCII 검색으로 조용히 대체하거나 live DB의 collation/locale을 자동 수정하지 않는다.
