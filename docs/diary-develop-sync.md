# !184 최신 develop 충돌 해결

2026-10-28, source `feature/common/diary-contract-integration`. 기존 `0faf733`에 develop `ef92ae766ba3e37b023e266344798ff01b0efacb`를 실제 merge로 반영한다. 이력·검증의 이전 단계는 [통합 CI 보고서](./diary-ci-integration.md)에 유지한다.

## 충돌 해결과 경계

- 충돌 6개: Gradle, DiaryModificationService, DiaryQueryService, OpenApiConfig, application.yml, 문서 색인. 회원 전용 태스크와 develop의 로컬 seed 리소스 제외를 함께 유지하고, 문서 색인의 회원·페이지 항목 양쪽을 보존했다.
- 최신 develop의 로그인·페이지/캔버스 API·펜 변경과 회원 API 7개를 공존시킨다. OpenAPI에는 회원·기존 다이어리·페이지·인증 경로를 함께 노출한다. 개발용 인증 헤더를 선택할 수 있는 기존 보안 스키마도 유지한다.
- 기존 `/api/v1/diaries`는 이제 공개 경로가 아닌 로그인 API다. 최신 develop의 인증 읽기·페이지 권한 흐름을 유지하며, 기존 경로의 타인 접근 403과 무인증 401을 회원 전용 경로의 오류 계약과 구분한다.
- 회원 생성 receipt가 연결된 다이어리는 기존 PATCH/DELETE로 version·휴지통 기한을 우회하지 못하게 `MemberDiaryWriteBoundary`에서 404로 차단한다. `/api/v1/member/diaries`의 전용 수정·휴지통·복원·영구 삭제를 사용한다. receipt 응답이 만료돼 비워져도 살아 있는 diary FK가 유지되므로 우회 차단을 유지한다. 페이지·캔버스 쓰기 경로는 이 guard를 적용하지 않고 최신 develop 권한을 유지한다.
- 새 JPA 매핑의 H2 자동 생성 테이블에는 JDBC 전용 카탈로그 열과 SQL 기본값이 빠진다. 테스트 전용 MemberH2Fixture로 실제 V1의 필드/기본값을 보충하고 PostgreSQL에서는 실행하지 않는다. 운영 매핑을 임의 변경하거나 실제 migration을 수정하지 않는다.

## 영향 검증

- 초기 전체 BE: 450개 중 49개 fixture 실패·137개 조건부 제외. 실패 원인은 새 페이지 JPA 최소 매핑과 기존 회원 JDBC fixture의 불일치였으며 이 이력을 성공으로 표기하지 않는다.
- 보완 후 영향 H2: 인증 10·기존 다이어리 8·회원 HTTP 24·휴지통 10·영구 삭제 5·페이지 9 = 66개. 두 기존 경로 기대값(401/403)을 수정한 뒤 해당 2개만 재실행해 통과했다. H2에서 조건부 제외된 PostgreSQL 페이지 시나리오는 실제 PostgreSQL에서 별도 검증한다.
- FE CI 계약 40개·최신 develop 펜 회귀 106개 통과. Expo 웹 번들 성공. 격리 Edge의 회원·휴지통·영구 삭제 각각 1280×800·1024×768·412×892·667×375에서 모두 pageerror 0.
- 실제 PostgreSQL 결과와 원격 CI/자동 리뷰 결과는 완료 후 !184 본문에 기록한다. 이전 단계의 서비스·영구 삭제 검증 이력은 유지하며 불필요하게 중복 실행하지 않는다.

증적은 워크스페이스 `tmp/diary184-develop-sync/`에 보존한다. 원본·248·다른 세션 작업 폴더는 변경하지 않고 기존 MR 상태도 유지한다. 공유/운영 서버·객체 저장소·실기기·스크린리더·배포 및 자동 만료·미디어 GC는 기존 제외 범위를 유지한다. Draft 해제나 MR 병합은 하지 않는다.

실제 PostgreSQL 최종: 회원·휴지통 45개와 페이지 1개·기존 다이어리 3개 모두 통과. 기존 정렬 fixture의 Instant 직접 바인딩을 Timestamp로 고친 뒤 해당 1개만 재검증했다. 운영 SQL은 변경하지 않았다.
