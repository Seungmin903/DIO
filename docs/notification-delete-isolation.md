# 알림 삭제 의존성 분리·H2 격리 반영

현재 제출 상태(2026-10-27): 이 문서의 아래 본문은 원본 BE 작업 폴더에서 수행한 분리·검증 이력이다. 제출 브랜치 `codex/notification-api-integration`에는 기본 API와 삭제 서비스, 최소 H2 fixture 및 독립 기본 API 테스트만 선별했다. 아래의 전체 읽음 Controller·서비스·혼합 테스트·248 이벤트는 제출 대상이 아니다. 현재 범위와 최종 검증은 [최종 선별 보고서](./notification-final-selection.md)를 따른다.

2026-10-27. 통합 검토의 BE 삭제 의존성과 H2 fixture 충돌을 원본에 반영했다. 인증 연결·watermark 정책·248 이벤트 로직·DB migration·프런트 기능은 변경하지 않았다. 커밋·푸시·브랜치 병합도 하지 않았다.

## 의존성 분리

기본 NotificationController는 NotificationService와 새 NotificationDeleteService만 주입한다. 삭제 서비스는 NotificationRepository와 Clock만 사용한다. 기존 소프트 삭제·본인 소유권·반복204·최초 삭제 시각/마이크로초 정밀도 보존·타인/없는 ID404를 그대로 옮겼다.

기존 read-watermarks/read-all 경로는 NotificationReadAllController로 이동했다. 기본 Controller 생성자에는 watermark 서비스가 필요하지 않으며 전체 읽음 Controller가 기존 principal 검증 함수를 재사용한다. JWT나 임의 사용자 헤더 처리는 추가하지 않았다. 예외 advice는 알림 controller 패키지에 한정해 두 Controller의 기존 오류 응답을 유지한다.

NotificationMutationService에서 삭제 메서드와 삭제 전용 Repository 주입만 제거했다. TTL·한도·발급·적용·만료·재시도 규칙은 바꾸지 않았다. 기존 PostgreSQL 경합 테스트의 생성자/삭제 호출 지점만 새 서비스에 맞췄으며 이벤트·경합 단언은 유지했다. 이벤트 소스/receipt/migration 파일은 수정하지 않았다.

## H2 fixture 소유권

- NotificationFrontendContractTests: ddl-auto=none을 원본에 반영하고 회원/알림2개 테이블만 만드는 notification-core-h2.sql을 사용한다. watermark·이벤트 테이블 없이4개 API를 검증한다.
- NotificationApiTests: ddl-auto=none을 H2 클래스에만 적용한다. 기존 fixture에서 Hibernate가 암묵적으로 만들던 diaries 테이블을 명시해 조회/이벤트 회귀를 보존했다. 기존 watermark/receipt 정의는 유지했다.
- NotificationDeleteIsolationTests: Spring JDBC/트랜잭션과 기본 서비스만 구성하며 JPA·watermark Bean이 없다. 같은 최소 SQL을 사용한다. Bean 종류/DB metadata를 검사하고 삭제·재삭제·권한 차단을 확인한다. 테스트에도 watermark 클래스의 정적 참조를 두지 않았다.

생산/공통 테스트 설정이나 실제 PostgreSQL DDL은 바꾸지 않았다. PostgreSQL 모드도 H2 테스트 SQL/독립 DB에만 적용한다.

## 검증

- 기본 backend test: 기존 알림·이벤트·전체 읽음 포함 회귀 통과. PostgreSQL 전용은 기존 조건에 따라 제외했다.
- 새 독립 삭제3개: watermark Bean/테이블 없음,204 빈 body,다른 시각의 재시도에도 최초 deleted_at 유지,타인/없는 ID404,미검증 principal/위조 헤더401 통과.
- 현재 BE→FE 계약: Spring 생산자1개+FE8개 통과.
- develop b90e818 backend+현재 알림 소스/생산자/core SQL 사본: 추가 수동 보정 없이 Spring1개+FE8개 통과.
- 기본 알림만 포함한 사본: 전체 읽음 Controller/서비스/저장소와248 event 클래스 없이 core Java12개·최소 SQL만 넣어 컴파일 후 Spring1개+FE8개 통과. FE 전체 읽음까지 분리했다는 뜻은 아니다.

H2 격리 첫 검사에서 diaries 자동 생성 의존성을 발견해 명시 SQL로 보완한 뒤 전체 backend를 재실행했다. 독립 삭제 검사는 Clock의 두 반환 시각을 다르게 해 덮어쓰기를 감지한다.

## 재현과 남은 범위

Java17 환경의 backend에서:

```powershell
./gradlew.bat test --offline --console=plain
./gradlew.bat test --tests 'com.f106.DIO.notification.NotificationDeleteIsolationTests' --offline --console=plain
```

원본 분리 작업 폴더에서는 FE의 qa/run-notification-contract.ps1에 -BackendRoot를 지정해 계약을 실행했다. 현재 전용 제출 작업 폴더에서는 같은 checkout의 ../backend가 기본값이므로 생략할 수 있다. 계약 스크립트는 전용 build/cache init script로 다른 세션의 결과와 분리한다.

전체 알림 검토 사본: workspace/tmp/notification-integration-review-1793072712783. 기본 알림만 포함한 사본: workspace/tmp/notification-delete-core-review-1793074072097. 두 사본은 원본 Git worktree의 병합 결과가 아닌 임시 source copy다. Flyway/실제 PostgreSQL·JWT·공유 서버·실기기는 이번에 검증하지 않았다.

후속 완료: FE 서버 watermark 노출/호출 분리, 알림 55개 파일 선별, 계약 스크립트의 같은-checkout 기본 경로, 충돌하는 신규 migration 제외와 최신 색인 정리를 마쳤고 전용 제출 브랜치에 적용했다. 기존 목 전체 읽음은 유지한다. 원본 BE·FE 및248 작업은 보존했다. 이전 proposed.patch는 원본 작업의 반영 이력이며 제출 조합에 포함하거나 현재 소스에 재적용하지 않는다. 실제 PostgreSQL/Flyway·JWT·공유 서버·실기기 검증은 계속 후속 범위다.
