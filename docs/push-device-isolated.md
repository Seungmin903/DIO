# 푸시 기기 연결 격리 구현

기준 develop 288089633f2992839bc629cc6105c94891c38a50. 이 작업은 대기열 생산과 외부 발송을 연결하지 않는다. V21은 제출 전 진행 중인 migration과 번호를 대조해야 한다.

## API

로그인 JWT를 사용하며 개발 서버의 X-DIO-Access-Token도 기존 검증을 재사용한다. 최초 등록은 POST /api/v1/push/installations에 installationId, requestId 및 settings(provider, platform, pushToken, permission, enabled)를 전달한다. 성공 시 201과 installationSecret, 문자열 bindingVersion/tokenVersion이 반환된다. 같은 세션·요청 ID·내용의 재시도는 24시간 내 원래 secret과 잠금 시점의 현재 bindingVersion/tokenVersion을 반환한다. 활성화 여부 등 현재 상태는 GET으로 확인한다. 시간이 지난 응답은 410이며 암호문은 정리 작업이 지우고 요청 이력은 유지한다.

GET /api/v1/push/installations/{id}는 본인 상태만 반환한다. PUT /{id}, POST /{id}/binding, DELETE /{id}/binding은 X-DIO-Installation-Secret 헤더와 requestId, 문자열 bindingVersion을 사용한다. 계정 전환은 새 로그인 JWT와 기존 자격증명으로 처리하며 버전을 올리고 과거 대상의 대기를 취소한다. 요청 ID 재사용 시 입력이 달라지면 충돌한다. 토큰·secret은 조회 응답에 포함되지 않는다.

## 설정과 한계

환경별 256비트 Base64 암호화 키는 PUSH_ENCRYPTION_KEY 환경변수로 제공해야 하며 미설정 시 등록/변경을 503으로 거부한다. 키는 소스나 로그에 넣지 않는다. 토큰과 최초 secret 응답은 AES-GCM 암호문으로 저장하며 credential/token 검색값은 SHA-256이다. 키 회전 구현은 아래 운영 절차를 따른다. 운영 키 보관·만료 이력 장기 정리는 운영 후속 작업이다. 등록 응답 암호문은 24시간이 지난 후 정리 작업에서 500건씩 제거한다. 허용 토큰은 ExpoPushToken[...] 또는 ExponentPushToken[...] 형식이다.

푸시 요청의 잠금 순서는 사용자 공유 잠금, 인증 세션 행, 설치 행이다. 회원 탈퇴는 사용자 행을 잠근 뒤 세션을 폐기하므로 이 순서가 필요하다. 전체 세션 폐기는 모든 세션 행을 ID 순서로 잠근 다음 설치를 잠근다. 로그아웃, refresh 재사용·비활성 사용자, 전체 세션 폐기, 만료 정리는 연결을 비활성화하고 이전 연결의 미발송 전달을 취소한다. 세션 폐기만으로 연결 버전을 올리지 않아 새 계정이 기기에 저장한 버전과 secret으로 재연결할 수 있으며, 구 세션 요청은 세션 행 재검증에서 거부한다. 외부 접수 완료된 알림 회수는 보장하지 않는다.

현재 기기 API와 대기열 스키마만 구현했다. 알림 생성 시 대기열 생산, 워커·Expo 서버 발송, Android/iPad 앱 등록·클릭 처리와 실기기 검증은 별도 범위다. 사용자의 비활성화와 등록 사이의 독립 경합 및 대기열 소비자의 세션 재검증은 별도 검증이 필요하다.

## 격리 검증 결과

- 전체 백엔드 H2 등 기본 test: 646개 중 431개 통과, 215개 조건부 제외, 실패 0. PostgreSQL 전용 항목은 여기에서 별도로 제외된다.
- 격리 PostgreSQL 17 및 전체 Flyway 적용 후 JWT HTTP·등록 재시도·동시 등록·계정 전환/로그아웃·전체 세션 폐기/재연결·중복 토큰·환경 격리·등록 응답 만료/정리 등 12개 통과. 테스트 DB에서만 전달 행을 준비해 계정 전환 시 취소도 확인했다. 임시 서버 종료 확인.
- 외부 발송, 대기열 생산, 실제 기기 검증은 실행하지 않았다. 테스트에서 사용한 암호화 키와 계정은 격리용이다.

## 잠금 대기 중 만료 재검증

세션 잠금 획득 후 현재 시각으로 세션을 판정하고, 설치 잠금 또는 변경 작업 대기 이후에도 세션 만료를 다시 확인한다. 최초 등록 응답은 설치 행 잠금 획득 후 현재 시각으로 24시간 만료를 재확인한다. 만료 시 기존 credential을 반환하지 않고 410, 폐기/만료 세션은 401이다.

격리 PostgreSQL 전체 Flyway 및 관련 테스트 15개 통과. 세션 행 대기 중 세션 만료, 설치 행 대기 중 세션 만료, 설치 행 대기 중 최초 응답 만료를 독립 트랜잭션에서 각각 검증했다. 관련 H2 로그인·비밀번호 재설정·푸시 단위 회귀 39개 통과. 임시 PostgreSQL 종료 확인. 키 교체·유실 복구와 전역 UUID/환경별 복합키 선택은 아직 운영 결정 및 후속 구현 범위다.

## 키 버전·재암호화 구현

PUSH_ACTIVE_KEY_ID로 쓰기 키 ID를 선택하고 PUSH_ENCRYPTION_KEYS에는 `id=Base64키;id=Base64키` 형태의 읽기 키 집합을 설정한다. 기존 PUSH_ENCRYPTION_KEY는 legacy ID의 키로 지원하며 두 설정에 legacy 키가 함께 있으면 값이 일치해야 한다. 키 ID는 암호화 AAD에 포함하며 `token_key_id`, `response_key_id`, 암호문 형식 버전을 기록한다. 기존 형식 0은 기존 AAD로 복호화하고 새 형식 1로 재암호화한다. 키 ID가 없거나 복호화가 실패하면 등록 응답을 재발급하지 않고 503으로 거부한다.

`PushKeyRotation.rotateBatch(environment, appId, batchSize)`는 범위가 설정과 일치할 때만 최대 500개 설치 행을 잠금 또는 건너뛰기 방식으로 처리한다. 토큰 및 유효한 최초 등록 응답을 현재 쓰기 키로 바꾸며 bindingVersion/tokenVersion과 토큰 해시는 변경하지 않는다. 호출자가 실패·남은 행을 확인하고 재실행해야 한다. 잠긴 행이 있으면 배치 반환값 0도 완료를 뜻하지 않으며 `remaining(environment, appId)`으로 잔여량을 확인한다. 배치 실행이나 키 폐기를 자동으로 수행하지 않으며 외부 발송은 연결하지 않는다. 모든 인스턴스에 이전·신규 읽기 키를 먼저 배포하고 쓰기 키 전환이 끝난 것을 확인한 뒤, 남은 행이 없어질 때까지 배치를 반복해야 한다. 혼재된 구 인스턴스가 나중에 예전 키로 다시 쓰면 잔여 행이 재발생하므로 완료 확인 전에 쓰기 키 일치를 검증해야 한다.

V21은 아직 제출되지 않은 격리 초안이다. 기존 DB에 이전 V21이 적용된 경우 이를 덮어쓰지 말고 별도 후속 migration으로 key_id/format을 추가하고 기존 데이터에 legacy 키 ID 및 형식 0을 부여해야 한다. 실제 운영 키 저장·백업·교체 승인 및 secret 유실 복구 UX는 여전히 운영 후속 결정이다.

검증: 격리 PostgreSQL 17/Flyway에서 18개 통과. 키가 혼재한 인스턴스의 토큰 갱신과 계정 전환 중 잠긴 설치를 건너뛰고 재시도하며 버전·최신 토큰을 보존하는 경합, legacy 암호문 복호화·변환, 키 유실 시 503을 포함한다. 관련 H2 로그인·비밀번호 재설정·푸시 키링 단위 회귀 40개 통과. 임시 PostgreSQL 서버를 종료했다. 실제 운영 키·토큰은 사용하지 않았다. 운영자 전용 명령은 아래 절차를 따른다. 자동 스케줄은 제공하지 않는다.


## 운영자 수동 키 회전 (격리 환경에서 검증한 절차)

`PushKeyOperator`는 독립 JVM 명령이다. Spring 서버·스케줄러·발송기를 실행하지 않고 HTTP 엔드포인트도 열지 않는다. 실행 JAR과 DB 권한, 비밀 주입 및 로그 접근은 배포 플랫폼의 운영자 권한으로 제한해야 한다. 명령 자체는 운영자 인증을 구현하지 않는다. DB 계정은 필요한 push 테이블만 접근하게 제한하고, 비밀은 인자·소스·로그에 넣지 않는다. 다음 명령은 서버 JAR과 동일하게 패키징된 JAR의 클래스 경로를 사용한다.

```sh
java -Dloader.main=com.f106.DIO.push.service.PushKeyOperator -cp dio.jar org.springframework.boot.loader.launch.PropertiesLauncher status
java -Dloader.main=com.f106.DIO.push.service.PushKeyOperator -cp dio.jar org.springframework.boot.loader.launch.PropertiesLauncher batch 100 -
java -Dloader.main=com.f106.DIO.push.service.PushKeyOperator -cp dio.jar org.springframework.boot.loader.launch.PropertiesLauncher remaining
java -Dloader.main=com.f106.DIO.push.service.PushKeyOperator -cp dio.jar org.springframework.boot.loader.launch.PropertiesLauncher clear-expired
```

실행 환경에는 `PUSH_ENVIRONMENT`, `PUSH_APP_ID`, `PUSH_ACTIVE_KEY_ID`, `PUSH_ENCRYPTION_KEYS` 및 필요시 `PUSH_ENCRYPTION_KEY`를 명시한다. DB 명령에는 `DB_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`도 명시한다. status에는 `PUSH_INSTANCE_ID`와 `PUSH_KEY_SECRET_VERSIONS`가 필요하다. 예를 들어 `legacy=secret-version-1;new=secret-version-2`는 키 ID와 비밀관리 시스템의 **버전 식별자**이며 키 값이 아니다. 실제 비밀 값은 안전한 주입 경로로만 제공한다. status 결과와 실패 설치 UUID 역시 제한된 운영 로그로 취급한다.

1. 이전·신규 키를 모든 인스턴스의 읽기 키 집합에 배포한다. 기존 키를 백업·복구 정책에 따라 보관한다. 각 인스턴스에 고유한 `PUSH_INSTANCE_ID` 및 비밀관리 시스템 버전 참조를 설정하고 `DIO_PUSH_DEPLOYMENT_REPORT_ENABLED=true`로 실행하면 실제 서비스 프로세스가 시작 시 `push_key_deployment` 로그에 로드된 키 ID, 활성 ID와 선언된 버전만 기록한다. 선언이 빠지거나 유효하지 않으면 오류를 기록한다. 키 본문은 출력하지 않는다.
2. 배포 플랫폼에서 실행 중·종료 중인 전체 인스턴스 목록과 각 인스턴스의 최신 시작 로그를 확인한다. 로그의 ID·환경·앱·활성 키·버전을 읽고 인스턴스별 properties 파일(`instance`, `environment`, `app`, `active`, `versions`)을 만든다. 이 파일은 검토용 메타데이터이며 신뢰된 운영 경로에서 생성·보관한다. 인스턴스가 교체되면 목록과 로그를 다시 수집한다. 독립 `status`는 해당 명령 프로세스의 환경만 확인하므로 서비스 프로세스의 시작 로그를 대신하지 않는다.
3. 전환이 끝난 뒤 아래처럼 실제 인벤토리와 필수 읽기 키를 지정해 비교한다. 인스턴스 누락·중복, 범위·쓰기 키·키 버전 불일치 시 종료 코드 2다. `verify` 결과는 선언된 메타데이터의 일치만 의미한다. 동일한 비밀 버전이 실제로 주입됐는지는 비밀관리 시스템과 배포 설정에서 별도로 확인해야 하며, 프로세스 외부에서 키 값의 일치를 증명하지 않는다.

```sh
java -Dloader.main=com.f106.DIO.push.service.PushKeyOperator -cp dio.jar org.springframework.boot.loader.launch.PropertiesLauncher verify production dio new legacy,new instance-a,instance-b instance-a.properties instance-b.properties
```

4. `batch 100 -`로 한 배치를 시작하고 출력된 `next_cursor`로 다음 배치를 호출한다. 암호문 실패 행은 `failed_installation`으로 보고되고 동일 배치의 정상 행은 처리된다. 실패는 종료 코드 2다. 키 누락과 손상 원인을 제한된 환경에서 조사하고 올바른 이전 키를 복구한 후 커서를 `-`로 되돌려 재시도한다. 잘못된 키를 같은 ID로 덮어쓰지 않는다. DB 오류는 배치 트랜잭션 전체를 되돌린다.
5. `SKIP LOCKED` 때문에 커서가 끝에 도달하거나 처리 건수가 0이어도 완료가 아니다. 커서를 `-`로 되돌려 재순회하고 `remaining`이 0인지 확인한다. 이 값은 잠긴 행도 포함한다. `orphan_ciphertexts_global`은 범위 정보가 없는 고아 응답 전체를 별도 집계한다. 만료 전 암호문은 건드리지 않으며 24시간 만료 후 `clear-expired`를 반복해 정리한다. 기존 요청 이력은 남긴다. 정리 작업도 잠긴 행을 건너뛰므로 재시도하고 남은 고아 암호문이 0인지 확인한다.
6. 쓰기 키가 이전 키인 인스턴스가 다시 들어오면 이전 키 암호문이 재발생한다. 전체 인벤토리·버전과 잔여량을 다시 확인하고, 운영자가 롤백·백업 보관 기간과 복구 연습을 확인한 뒤에만 이전 키 폐기를 결정한다. 이 도구는 키 폐기를 수행하지 않는다. 백업에는 이전 키가 계속 필요할 수 있다.

`batch` 결과의 실패 목록을 무시하거나 `remaining_installations=0`만으로 고아 응답과 모든 인스턴스의 배포 상태까지 검증됐다고 판단하면 안 된다. 현재 절차는 실제 비밀관리 시스템 연동, 운영 계정 권한과 로그 수집·인벤토리 자동 검증을 제공하지 않는다.

### 이번 격리 검증

- 임시 PostgreSQL 17/Flyway에서 푸시 통합·경합 22개 통과. 실패 암호문 행과 정상 행의 분리, 키 누락 후 이전 키 복구·재실행 및 최초 응답 복호화, 만료 고아 응답의 잠금 건너뛰기·재시도를 포함한다.
- 배포 선언 비교·누락 인스턴스 및 버전 불일치·키 미출력, 실제 서비스 보고 컴포넌트의 로그 검증과 키링 단위 테스트를 통과했다. 테스트 키로 패키징된 JAR의 독립 `status` 명령 실행을 확인했다.
- develop 58e1f86 기준 V21 직접 충돌 없음. 열린 !222와 !213은 서로 다른 V20을 사용하므로 제출 시 재확인한다. 운영 DB 이력, 실제 비밀관리 시스템 주입·인스턴스 인벤토리, 운영자 권한 및 백업 복원은 검증하지 않았다.


### 추가 완료 검증과 남은 운영 의존성

- 만료 전 고아 응답은 환경·앱 정보가 없고 설치 ID의 삭제·재등록과 경쟁할 수 있어 조기 삭제하지 않는다. 실제 PostgreSQL에서 설치 삭제 트랜잭션과 같은 UUID 재등록 및 정리를 경합시켜 암호문이 유지되는 것을 확인했다. 만료 이후에는 범위와 무관하게 암호문만 삭제하고 요청 이력은 남긴다.
- 임시 PostgreSQL의 테스트 데이터를 `pg_dump`로 백업해 별도 임시 DB에 복원하고 기존 테스트 키로 토큰을 복호화했다. 다른 키로는 복호화되지 않았다. 복원 DB와 백업 파일은 테스트 종료 시 정리한다.
- 이전 V21 원본과 적용 이력은 아래 추가 조사에서 격리 DB 기준으로 확인했다. 실제 운영 DB 적용 이력은 확인되지 않았다. 이력이 존재하는 환경에는 수정된 V21을 덮어쓰거나 Flyway checksum을 임의 복구하지 않는다. 그 환경의 정확한 원본 migration·schema history와 백업을 확보한 후 별도 버전 migration을 작성하고 해당 원본으로 재현해 검증해야 한다.
- 운영자 제한은 배포 플랫폼의 실행 권한과 최소 DB 권한에 의존한다. 서비스 프로세스의 선언 및 운영 도구 비교는 실제 비밀관리 시스템의 값 또는 버전 주입을 독립적으로 증명하지 않는다. 운영 플랫폼에서 신뢰된 인벤토리 및 비밀 버전 참조를 대조해야 한다.


## 현재 배포 방식 조사 및 이전 V21 업그레이드 검증

현재 저장소의 dev/prod 배포는 EC2 GitLab Runner가 비공개 `dev.env`/`prod.env`와 Docker Compose를 사용해 backend 컨테이너를 교체하는 구조다. Dockerfile에는 전용 비루트 사용자가 지정되지 않았고, 푸시 키·버전 변수도 Compose의 backend environment에 전달되지 않는다. 저장소에서 비밀 버전 관리 시스템 연동이나 운영자 전용 Docker/DB 역할 정의는 확인되지 않았다. Docker 접근은 호스트에 대한 높은 권한을 수반하므로 Java 명령의 별도 진입점만으로 운영자 접근 통제를 보장할 수 없다. 실제 호스트 계정·파일 권한·비밀 버전 설정은 이 조사에서 접근하거나 확인하지 않았다.

기존 격리 PostgreSQL Flyway 이력과 작업 대화의 변경 기록으로 키 버전 도입 직전 V21을 복원했다. Flyway CRC32 `-212152374`가 여러 격리 DB의 적용 이력과 일치한다. 이는 격리 이력의 증거이며 운영 DB 적용 증거가 아니다. 별도 `push-legacy-migrations` 테스트 fixture에 해당 V21과 V22를 두었다. V22는 기존 암호문에 legacy 키 ID와 형식 0을 기입하고 제약과 회전 인덱스를 추가한다. 기존 V21 파일을 수정한 채 실행하면 Flyway 체크섬이 달라 검증에 실패한다. 실제 배포용 마이그레이션은 대상 DB의 원본 V21과 checksum 확인 후 이전 원본을 보존하고 후속 버전으로 적용해야 한다. fixture를 운영 마이그레이션으로 자동 배포하지 않는다.

비밀 버전 검증을 운영에서 완료하려면 현재 비공개 환경 파일의 관리 책임자와 버전 출처를 확인해야 한다. 선언 문자열만 비교해서 실제 주입된 비밀 버전을 증명하지 않는다. 인스턴스 시작 로그는 비밀 내용을 내보내지 않으며, 배포 플랫폼 인벤토리와 신뢰할 수 있는 버전 이력 대조가 별도로 필요하다. 운영자 전용 실행은 배포 호스트의 OS 접근, Docker 권한, 비밀 파일 읽기 및 최소 DB 권한을 함께 분리한 뒤 검증해야 한다.


## 자동 리뷰 반영

사용자 삭제가 설치를 cascade 삭제할 때 해당 설치의 전달 이력도 함께 삭제한다. 타 사용자의 outbox는 보존한다. 푸시 암호화 키가 설정돼도 `PUSH_ENVIRONMENT`가 비어 있으면 기기 암호화 작업을 503으로 거부한다. 운영 환경을 개발 범위로 묵시적으로 분류하지 않는다.

등록 요청 이력과 변경 요청 이력의 삭제 정책은 아직 확정되지 않았다. 최초 등록 암호문은 만료 시 제거하지만 재발급 방지를 위한 이력은 남는다. 무기한 증가를 방지할 보존 기간과 재시도 계약을 합의한 후 별도 정리 작업이 필요하다. 기존 ec2-deploy 러너는 배포 호스트와 공유되므로 테스트 전용 러너 또는 운영자가 승인한 자원 격리 설정도 필요하다.

이전 V21 업그레이드 검증용 V22 fixture에는 설치 삭제 시 delivery FK cascade도 포함한다. 실제 배포용 migration은 대상 DB 이력 확인 후 별도 결정한다.
