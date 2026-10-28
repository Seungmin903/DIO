# 실제 Spring 응답과 프런트 계약 회귀

NotificationFrontendContractTests는 실제 MockMvc 직렬화·ProblemDetail·OpenAPI 응답을 생성하고 프런트 소비자 테스트가 이를 읽는다. 이 DTO 생산자는 필터를 끈 H2 fixture를 사용하므로 실제 JWT·공유·PostgreSQL 검증과 구분한다. 실제 로그인 JWT 보안은 별도 NotificationAuthenticationHttpTests가 실제 HTTP로 검증한다.

frontend에서 Java 17과 Node, 설치된 의존성을 준비한 뒤 실행한다.

```sh
node qa/run-notification-contract.cjs
# 별도 checkout의 backend를 지정할 때
node qa/run-notification-contract.cjs --backend-root /path/to/backend
```

package.json의 test:notifications:contract도 같은 Node runner를 사용한다. 기존 PowerShell wrapper는 이 runner에 위임한다. Java wrapper JAR를 직접 실행하여 powershell/gradlew.bat/sh 의존을 없앴다. Windows에서 실행을 검증하며 Linux/macOS 실행 결과는 MR의 해당 검증 기록을 따른다.

매번 UUID 이름의 .expo/notification-contract/*.json을 생성한다. 생산자 실패·파일 미생성은 실패이며 과거 응답으로 대체하거나 skip하지 않는다. Gradle은 전용 build/cache와 --rerun-tasks를 사용한다. 생성 응답은 ignore 대상이다. 소비자 단독 실행에는 현재 실행의 DIO_NOTIFICATION_CONTRACT_OUTPUT이 필요하다.

## 검사 범위

목록·커서·문자열 BIGINT·null 초대·미읽음 수·읽음 200·삭제/반복 삭제 204, 미인증·타인·삭제된 대상·잘못된 limit/cursor, PATCH와 DELETE 양쪽 비숫자/범위 초과 ID 400, 이전 /read 경로 404를 확인한다. OpenAPI의 DTO 참조·필수 필드·nullable·오류 상태/code enum도 실제 응답과 대조한다.

## CI 경계

backend-test는 Spring 생산자를 포함한 기본 테스트를 실행한다. backend-postgres-test는 별도 폐기용 DB에서 authPostgresTest를 실행하며 NotificationPostgresSchemaTests도 포함한다. 이 테스트는 실제 V1 및 최신 전체 Flyway 체인을 각각 독립 스키마에 적용하고 NotificationRepository의 목록·페이지·읽음·삭제 SQL을 확인한 뒤 스키마를 정리한다.

backend-test CI는 Spring 생산자에 출력 경로를 주입한 뒤 Node 컨테이너에서 프런트 계약 소비자를 실행한다. 소비자는 Node 내장 모듈과 알림 어댑터만 사용하므로 프런트 의존성 설치나 PowerShell이 필요하지 않다. 생성 응답 누락·계약 소비자 실패는 CI 실패다. 알림 FE·계약 스크립트 변경도 해당 CI 작업을 실행한다. 현재 실행 결과와 SHA는 [MR !164](https://lab.ssafy.com/s15-final/S15P31F106/-/merge_requests/164)에 기록한다.

## Swagger 경로 필터 보완 (2026-10-28)

기본 application.yml의 springdoc.paths-to-match가 인증·다이어리·페이지 경로만 포함해 알림 컨트롤러가 OpenAPI에서 제외됐다. 기존 항목을 유지하면서 /api/v1/notifications 및 /api/v1/notifications/**를 추가했다. 인증 정책·API 동작·DB 스키마 변경은 없다.

실제 기본 설정을 사용하는 SwaggerDocumentationTests에서 알림 목록/미읽음 수/개별 읽음/삭제4개, bearerAuth와401오류 스키마·404·204무본문, 기존 로그인·다이어리·페이지 경로를 함께 검사한다. 기존 Swagger UI/다이어리 응답·알림 인증/사용자격리/읽음/삭제/프런트 계약 회귀도 실행했다.

검증: backend에서 `.\gradlew.bat test --tests '*Swagger*Tests' --tests '*Notification*Tests'` 성공. 총28개 중26개 통과·PostgreSQL 명시 환경이 필요한2개는 skip, 실패0. 실제 서버 DB·개발/운영 컨테이너 배포는 수행하지 않았다. 개발8443 Swagger는 접근 인증401로 배포된 문서 내용을 직접 대조하지 못했으므로 병합·재배포 후 확인한다.
