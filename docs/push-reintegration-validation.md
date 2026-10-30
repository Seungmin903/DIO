# 푸시 기기 재통합 검증 (2026-10-30)

- 최신 develop b67ac4512593d6aae8b0c99a0d209dbb359c9b54 기반 독립 사본이다. 원본 변경과 다른 세션 작업을 건드리지 않았다.
- 사용자·세션·설치 순서로 잠그도록 보완했다. !226과 결합한 PostgreSQL 테스트에서 먼저 사용자 잠금과 세션 잠금 순서 차이로 교착을 재현했으며 수정 후 등록 우선·탈퇴 우선 경합이 통과했다.
- 세션 폐기 후 회원 탈퇴의 JDBC 세션 삭제 전에 JPA 변경을 flush하도록 보완했다. 이 보완 전에는 탈퇴에서 JPA 업데이트 대상 행이 사라져 실패했다.
- 최신 develop 사본 푸시 PostgreSQL 27개 통과. !226 cf62395b2bedacdb6ab0d86df76cf7cd2e14c94f 결합 사본은 29개 통과. 테스트용 PostgreSQL과 백업 DB는 정리했다.
- !226은 아직 열린 MR이며 그 변경은 제출 후보 develop 사본에 포함하지 않았다. 검증용 사본에서만 결합했다.
- 배포 설정은 docs/push-deployment-draft.md에 후보로만 남겼다. 운영 키·환경·권한은 설정하지 않았다. 키 버전의 선언값 비교는 실제 비밀관리 시스템의 주입 버전을 입증하지 않는다.
- 대기열 생산, 외부 발송, Android/iPad 연결·실기기 검증과 원격 CI는 범위 밖이며 수행하지 않았다.
- 최종 잠금·세션 폐기 변경 후 인증/비밀번호 재설정 및 푸시 잠금 H2 테스트 42개 통과. 사용자→세션 잠금 순서 단위 테스트를 추가해 2개 재통과했다.

## PostgreSQL 테스트 실행 보호 및 CI

`pushPostgresTest`는 `DIO_PUSH_TEST_DISPOSABLE=true`, 루프백 JDBC 주소 `jdbc:postgresql://127.0.0.1:<port>/pushqa_<12자리 16진수>`, 비밀번호 및 일회성 `DIO_PUSH_GUARD`가 명시돼야 한다. Spring/Flyway 시작 전에 별도 `push_test_guard.marker` 테이블의 값과 표식을 대조한다. 사용자 데이터가 있는 DB에서 표식을 만들거나 이 테스트를 실행하지 않는다. 일반 `test`에서 `DIO_PUSH_TEST=true`로 직접 켜는 경우에도 동일한 가드가 적용된다.

보호 브랜치 push의 푸시 관련 변경은 `backend-postgres-push-test`가 새 PostgreSQL 17 tmpfs 컨테이너와 네트워크 네임스페이스, 일회성 DB·비밀번호·표식을 만들어 `pushPostgresTest`를 실행하고 결과를 JUnit으로 보관한다. MR에서는 이 작업이 실행되지 않으므로 별도 격리 환경에서 PostgreSQL 회귀를 수행한다. 개발·운영 DB나 환경 파일을 사용하지 않는다. 테스트 JVM 이미지에 PostgreSQL CLI를 설치하지 않으므로 `DIO_PUSH_PGBIN`이 필요한 백업 복원 테스트는 CI에서 조건부 제외된다. 백업 복원은 별도 격리 환경에서 도구를 갖춘 상태로 실행해야 한다.
- 보호 표식과 전용 Gradle 작업을 적용한 뒤 develop b67ac45에서 PostgreSQL 28개, 최신 회원 탈퇴 MR !226 9e296f4를 별도 결합한 PostgreSQL 29개가 통과했다. 비밀번호 변경·회원 탈퇴 우선/푸시 등록 우선 경합을 포함한다. 가드 단위 2개 및 잘못된 표식 거부가 통과했다.
- 설정이 없거나 루프백이 아닌 호스트를 지정한 전용 Gradle 작업은 테스트 DB 접속 전에 실패했다. GitLab YAML 파싱과 bash 문법은 통과했으나 로컬 Docker 엔진이 없어 CI 컨테이너 래퍼와 원격 GitLab CI 실제 실행은 검증하지 못했다.
- CI 래퍼 정리 안전성: 컨테이너 생성 성공 시에만 정리하도록 수정하고, 모의 Docker로 정상·이름 충돌·테스트 실패 세 경로를 검사했다. 이름 충돌에서는 기존 컨테이너를 삭제하지 않는다. 실제 Docker CI 실행은 미검증이다.
