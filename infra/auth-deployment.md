# 인증 기능 배포 환경 계약

개발 배포와 release 브랜치 검증 배포는 모두 `compose/compose.dev.yml`과 `/home/gitlab-runner/dio-env/dev.env`를 사용한다. protected `release/*`의 수동 배포는 dev 백엔드 컨테이너를 해당 release 커밋으로 교체한다. 따라서 release 확인 중에는 develop 최신 코드가 아닌 release 코드가 dev 서버에서 실행된다. 운영 배포만 `compose/compose.prod.yml`과 `/home/gitlab-runner/dio-env/prod.env`를 사용한다. 이 비공개 파일은 Git에 넣지 않는다. 저장소만으로 실제 서버 값·SMTP 연결·S3 권한이 준비되었다고 판단할 수 없다.

전용 `release` 환경·`deploy-release` 잡·8083 컨테이너는 사용하지 않으며, release 브랜치는 운영 배포 경로가 아니라 공유 dev 환경의 수동 검증 경로다. 따라서 이전 release 전용 compose와 환경/DB 검사 스크립트도 유지하지 않는다. 운영 갱신은 `master`의 `deploy-production`만 사용한다.

`release/*`는 GitLab의 **Protected branches**로 지정해야 하며, `ec2-deploy` 러너도 protected ref에서만 작업하도록 설정한다. CI 규칙의 `$CI_COMMIT_REF_PROTECTED == "true"` 조건은 이 GitLab 보호 설정을 대신하지 않는다. 보호 설정이 없으면 release 코드가 공유 dev DB와 dev 서버에 배포되는 권한을 의도한 담당자로 제한할 수 없다.

release 검증 배포는 dev와 **같은 PostgreSQL DB와 Flyway 이력**을 공유한다. release의 migration은 dev DB에도 즉시 적용되며, `deploy-development`는 헬스 체크 실패 시 이전 이미지로 자동 복구하지 않는다. release 파이프라인은 `origin/develop`과 release의 migration 목록이 양방향으로 정확히 같은지 배포 전에 확인한다. 한쪽에만 있는 migration 또는 비교 자체의 Git 오류가 있으면 배포하지 않아 공유 DB에 release 전용 스키마를 적용하거나, release가 dev에 이미 적용된 migration보다 뒤처진 상태로 기동하는 일을 막는다. 따라서 release에 포함하는 migration은 develop의 이전·다음 애플리케이션 버전과 함께 기동할 수 있는 expand/contract 방식으로 작성한다. 새 테이블·컬럼·인덱스 추가와 새 코드 배포를 먼저 하고, 컬럼 삭제·이름 변경·제약 강화처럼 이전 코드와 호환되지 않는 변경은 release 검증과 develop 재배포가 끝난 뒤 별도 후속 배포로 분리한다. 헬스 체크 실패 시에는 컨테이너 로그와 적용된 Flyway 이력을 확인한 뒤, 호환되는 커밋을 수동 재배포한다. 이미 적용된 migration은 이미지 교체만으로 되돌아가지 않으므로 파괴적 변경의 복구에는 DB 백업·스냅샷 복원이 필요하다.

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

`AUTH_ALLOWED_ORIGINS`에는 실제 프론트 Origin을 설정한다. SMTP 기본 포트는 587이며 인증과 STARTTLS를 기본 사용한다. 다른 메일 서버라면 설정도 조정한다. 약관 버전은 `SIGNUP_SERVICE_TERMS_VERSION`, `SIGNUP_PRIVACY_TERMS_VERSION`, `SIGNUP_MARKETING_TERMS_VERSION`을 프론트와 맞춘다(SERVICE/PRIVACY 기본 v2, 선택 마케팅 기본 v1).

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

`backend-postgres-auth-test`, `backend-postgres-sharing-test`, `backend-postgres-diary-test`, `backend-postgres-lifecycle-test`는 실행 시간을 줄이기 위해 다음처럼 실행한다. MR에서는 Flyway migration, `infra/scripts/test-auth-postgres.sh`, 해당 묶음이 실행하는 테스트 파일(부모 테스트 클래스 포함)이 바뀐 경우에만 자동 실행하고, 그 밖의 백엔드·CI 변경에서는 파이프라인을 막지 않는 수동 작업으로 남긴다. SQL·트랜잭션·락 동작을 바꾼 MR은 작성자가 해당 묶음을 수동 실행해 결과를 MR에 남긴다. develop 파이프라인에서는 변경 경로와 무관하게 네 작업을 모두 실행하며, 실패하면 개발 서버 배포 단계로 넘어가지 않는다. 앞선 파이프라인이 취소돼도 배포하는 파이프라인이 직접 검증한다. MR 자동 실행 경로가 Gradle 테스트 필터와 맞는지는 `DeploymentAuthContractTests`가 확인한다. 각 작업은 CI_JOB_ID별 폐기용 PostgreSQL 17을 만들고 호스트 포트를 공개하지 않는다. 테스트 JVM만 DB 네트워크 네임스페이스에 참여하며 실제 배포 환경 파일·DB·볼륨을 사용하지 않고, 성공·실패 시 trap으로 테스트 DB와 익명 볼륨을 정리한다. 결과는 각 테스트 task의 JUnit artifact에 남긴다. 일반 H2 테스트도 별도로 유지한다.

`management.health.mail.enabled=false`로 외부 SMTP 장애를 기본 `/actuator/health`에서 제외한다. DB 등 다른 헬스 검사는 유지한다. 메일 발송 API의 실패 응답·오류 처리는 유지하므로 운영자는 실제 테스트 메일 도착과 발송 실패를 별도로 관찰한다.

만료 로그인 세션 정리 작업은 기본 활성화되어 있으며 원래 만료 시각이 지난 세션만 정리한다. 상세 정책과 실행 간격은 [세션 정리 문서](../docs/auth-session-retention-followup.md)를 참고한다.
## 공유 초대 링크 설정

공유 링크 사용 시 `SHARING_INVITE_SECRET`에 별도의 32바이트 이상 Base64 비밀키를 지정한다. 운영(production)은 이 값을 필수로 요구해 누락 시 컨테이너를 만들지 않는다. Compose dev/prod에서는 미설정이어도 다른 기능은 기동하며 초대 링크 기능만 503을 반환한다. `SHARING_INVITE_BASE_URL`은 실제 초대 화면 URL/딥링크 접두사이며 기본 `/invite/`는 상대 경로다. 프론트 라우팅 준비 후 실제 주소를 설정한다. 키 교체 시 기존 링크는 재발급해야 한다. [공유 API 문서](../docs/diary-sharing.md)를 참고한다.

이메일 초대 발송은 `SHARING_INVITE_BASE_URL`이 클릭 가능한 절대 주소(http/https 또는 dio 스킴)여야 한다. 기본 상대 경로는 링크 API 확인용이며 메일 발송 시에는 503으로 거부한다. 기존 SMTP 설정을 재사용하며 전용 제한 실행기에서 커밋 후 발송한다. 실제 메일 도착과 프론트 초대 화면 라우팅은 배포 환경에서 확인한다.


## 회원 목록 PostgreSQL ICU 점검

로컬 Compose와 격리 CI는 postgres:17을 선언하지만 dev/prod backend Compose는 외부 DB 네트워크에 접속하므로 저장소에 실제 DB 이미지/콜레이션이 고정되어 있지 않다. 이미지 이름만으로 운영 DB 지원을 확정하지 않는다. 실제 운영자가 사용하는 Docker 호스트에서 DB 컨테이너 이름을 확인한 뒤 다음 읽기 전용 검사를 실행한다.

```bash
bash infra/scripts/check-member-list-icu.sh <실제-DB-컨테이너-이름>
```

스크립트는 docker inspect/exec만 사용하고 컨테이너의 POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD를 내부 프로세스에서 사용한다. 환경 전체나 비밀값을 출력하지 않는다. 공식 이미지의 기본 사용자/DB도 지원한다. psql의 각 질의는 BEGIN READ ONLY / ROLLBACK으로 감싸 pg_catalog의 deterministic ICU root 존재와 실제 ÉÄ→éä lower 연산을 확인한다. DB·설정·Flyway 이력을 바꾸거나 컨테이너를 시작/종료하지 않는다. 종료 코드 0은 지원, 2는 ICU catalog 부재, 3은 접속·권한·예상 밖 응답·연산 오류이므로 확인 불가/오류를 미지원으로 단정하지 않는다.

격리 CI의 `backend-postgres-diary-test`는 버려지는 PostgreSQL 컨테이너의 준비 완료 뒤 같은 검사를 실행하도록 연결했다. 이는 실제 dev/prod 검사와 다르다. 스크립트 회귀는 `bash infra/scripts/test-member-list-icu.sh`로 지원·기본 환경·미지원·컨테이너/질의/연산 오류 8개를 확인한다.

ICU가 없더라도 앱 전체 기동은 이 기능 때문에 실패하지 않는다. 인증·회원 생성/상세/수정과 검색 없는 created/updated/pages 목록은 유지하고 검색/title 정렬만 503 DIARY_LIST_UNAVAILABLE로 제한한다. 지원 복구 후 앱 요청을 재시도할 수 있으며 ICU 라이브러리 설치·DB 재시작 등 운영 조치는 별도다. ASCII 검색으로 조용히 대체하거나 live DB의 collation/locale을 자동 수정하지 않는다.


## 가입 동의 버전 배포 확인

새 프론트는 ageConfirmed=true와 SERVICE/PRIVACY v2, 선택 항목 v1을 전송한다. dev/prod Compose와 env.example은 이 값과 일치한다. 실제 서버 환경변수에 v1이 남아 있으면 기본값보다 우선하므로 담당자는 배포 전 비밀값 없이 약관 버전 세 개만 확인한다. 구형 앱은 연령 확인 누락으로 400을 받으므로 신규 가입 화면과 서버를 함께 배포하고, 기존 배포 앱이 있으면 업데이트 안내/가입 진입 관리 계획을 정한다. 연령 확인을 서버에서 임의로 true로 대체하지 않는다. 기존 회원 로그인에는 이 가입 조건이 적용되지 않는다.

로컬 저장소의 설정 확인은 실제 배포 서버 환경변수 확인을 의미하지 않는다.


## Android Expo Go WebSocket Origin 점검 (2026-11-03)

REST가 성공해도 WebSocket handshake는 별도로 Origin을 검사한다. 회원 JWT는 101 연결 성공 후 첫 AUTH 프레임에서 검증되므로 HTTP 403과 연결 후 1008 종료를 구분한다.

- dev 외부 주소는 `https://k15f106.p.ssafy.io:8443`, prod는 `https://k15f106.p.ssafy.io`다. `AUTH_ALLOWED_ORIGINS`에는 경로·마지막 슬래시 없이 scheme/host/외부 포트까지 정확히 넣는다. `ws://`, `wss://` 주소를 넣는 설정이 아니다.
- Compose 기본값과 배포 env 양식에 각각 실제 주소를 포함했다. prod 기본 허용 목록은 운영 HTTPS Origin 하나만 사용하고 localhost는 dev에만 둔다. 기존 비공개 env가 localhost만 명시했다면 기본값이 적용되지 않으므로 그 파일도 수정해야 한다. 다른 프론트 허용 주소는 유지하고 쉼표로 추가한다. 와일드카드로 전체 허용하지 않는다.
- dev는 외부 8443을 Nginx 내부 443으로 매핑한다. `/ws/`의 `Host $host`는 외부 포트를 잃으므로 `Host $http_host`로 전달한다. 신뢰 프록시의 `X-Forwarded-Proto`, `X-Forwarded-Port` 설정과 함께 사용한다. WebSocket 경로는 외부 바인딩과 같은 dev 8443/prod 443을 고정 전달하며 Tomcat `remoteip.port-header`가 이를 읽는다. 이 헤더는 신뢰 프록시에만 적용된다. 다른 API 경로에서도 같은 고정 포트로 덮어써 클라이언트가 보낸 X-Forwarded-Port를 신뢰하지 않는다. 외부에서 받은 X-Forwarded-For는 기존대로 덮어쓴다.
- dev Basic 인증과 WebSocket AUTH 회원 검증은 그대로 유지한다.

배포 담당자 확인 순서:

1. 실제 backend 컨테이너에서 `printenv AUTH_ALLOWED_ORIGINS`만 확인한다. 환경 전체나 Compose 렌더링 전체는 비밀값 때문에 출력하지 않는다.
2. 비공개 env에 dev Origin을 추가하고 기존 배포 절차로 backend를 재생성한다. 이미지만 재시작하면 변경된 Compose 환경이 적용되지 않을 수 있다.
3. 변경된 Nginx 설정을 배포하고 `nginx -t`를 확인한다. 현재 실행 중인 Nginx 설정에 `/ws/` Host가 `$http_host`인지 확인한다.
4. 앱의 같은 요청을 다시 연결해 HTTP 101 뒤 AUTH/READY가 오는지 확인한다. REST만 성공하는 것으로 검증을 끝내지 않는다.
5. 계속 403이면 Nginx access log의 status/upstream_status와 백엔드의 Origin 거절 로그를 같은 시각으로 비교한다. Nginx라는 Server 헤더만으로 403 발생 계층을 확정하지 않는다. Basic 인증이 빠진 요청의 401은 Origin 거절과 별개다.

로컬 검증에서 동일 backend에 localhost Origin은 101, PC LAN Origin은 403이 재현됐다. 추가 통합 테스트는 프록시가 외부 Host 포트를 보존하면 미등록 Origin도 same-origin으로 101이 되고, 포트를 잃거나 다른 Origin이면 403이 됨을 검증한다. 이는 실제 배포 컨테이너 설정 확인을 대신하지 않는다.

## Refresh 토큰 복구의 배포·키·시각 조건

저장소의 compose.dev.yml·compose.prod.yml은 환경별 backend 서비스 하나와 고정 호스트 포트(개발 8080, 운영 8082)를 사용하며, replicas·scale·blue/green 롤링 배포 설정은 없다. Nginx도 환경별 단일 backend 주소로 전달한다. 이 확인은 저장소 구성에 한정되며 실제 호스트에서 별도 복제·프록시를 운영하지 않는다는 보증은 아니다.

- 같은 DB의 로그인 세션을 처리하는 모든 인스턴스는 동일한 AUTH_JWT_SECRET과 토큰 회전 구현을 사용해야 한다. 일반 앱 재배포마다 키를 다시 생성하지 않는다. 키 원문·해시·환경 전체를 로그나 MM에 출력해 대조하지 말고 비밀 저장소의 참조·배포 설정으로 확인한다. 개발·운영을 임의로 같은 키로 통합하라는 의미는 아니다.
- 현재 코드는 서명 키 다중 버전 검증을 제공하지 않는다. 키 교체가 필요하면 유지 보수 시간·재로그인 영향·세션 폐기 및 복구 계획을 정한 뒤 단일 버전으로 교체한다. 서로 다른 키·무작위 토큰 회전 구버전과 새 버전이 같은 세션을 번갈아 처리하는 롤링 배포를 하지 않는다.
- 무작위 토큰을 발급하던 구버전의 갱신 응답이 유실된 경우, 새 버전이 30초 이내라도 후속 토큰을 복원하지 못할 수 있다. 복원이 일치하지 않으면 기존 재사용 방어에 따라 해당 세션을 폐기하고 401 INVALID_TOKEN으로 재로그인을 안내한다. 무조건 허용하거나 유예 시간을 늘리지 않는다.
- 위 불일치는 고정 로그 코드 REFRESH_RECOVERY_MISMATCH로 구분한다. 토큰·키·회원 식별정보를 기록하지 않는다. 발생 시 배포 버전 혼재와 키 참조를 먼저 확인한다. 코드만으로 원인이 키 변경인지 구버전 토큰인지 단정하지 않는다.
- 현재 단일 인스턴스 구성에서는 애플리케이션 시각 판정과 기존 30초 경계를 유지한다. 실제 호스트의 NTP/chrony 동기화 상태 및 시간 역행 경보는 배포 담당자가 확인한다. 컨테이너 타임존 표시는 절대 시각 동기화의 증거가 아니다. 다중 인스턴스로 확장하기 전에는 모든 노드의 시각 동기화를 확인하고, 공통 DB 시각 등 일관된 회전·유예 기준을 별도 검증한다. 시계가 뒤처져 rotatedAt이 미래로 보이면 현재 구현은 유예를 허용하지 않으므로, 점검 없이 수평 확장하지 않는다.

배포 후 테스트 계정으로 정상 갱신·직전 토큰 재시도를 확인하고 해당 진단 코드의 새 발생 여부를 점검한다. 실제 키를 바꿔 운영 사용자로 시험하지 않는다.
