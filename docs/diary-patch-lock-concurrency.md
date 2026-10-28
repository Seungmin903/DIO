# !184 PATCH 사용자 잠금 범위 개선

2026-10-28. `feature/common/diary-contract-integration`의 잠금 성능 INFO를 검토했다. PATCH만 users 행을 FOR UPDATE로 잠가 같은 계정의 다른 다이어리 요청까지 대기시키고 있었다.

## 변경

MemberDiaryContractService가 기존 DiaryDetailRepository.lockActiveUser를 사용하도록 바꿨다. PostgreSQL에서는 FOR SHARE로 활성 사용자 상태를 보호하며, H2에서는 기존 저장소의 FOR UPDATE 대체 동작을 유지한다. 비활성 사용자는 즉시 기존 401 계약으로 거부한다.

잠금 순서는 **user SHARE → diary UPDATE → membership SHARE**로 유지한다. 다이어리 쓰기 잠금은 권한 상세 조회보다 먼저 잡아 SHARE→UPDATE 승격 경합을 피한다. 멤버십 잠금을 다이어리보다 먼저 잡는 식으로 순서를 바꾸지 않는다. 계정 비활성화·멤버십 해제와의 직렬화, 같은 다이어리의 version/CAS 및 응답 일관성은 보존한다. API·DTO·오류 코드·migration·FE 코드는 변경하지 않는다.

## 실제 PostgreSQL 동시성 검증

전용 `postgresMemberDiaryHttpTest`가 선택하는 MemberDiaryContractPostgresTests에 4개 시나리오를 추가했다. 기존 HTTP 24개와 같은 실제 JWT·세션·전체 Flyway fixture를 사용한다. 새 테스트가 H2의 잠금 모사를 PostgreSQL 검증으로 대신하지 않는다.

1. PATCH 트랜잭션을 커밋 전 유지한 채 같은 계정의 다른 다이어리 상세·목록·PATCH·휴지통·복원·영구 삭제·생성을 완료한다. 첫 트랜잭션의 해제 latch가 아직 닫혀 있고 첫 Future도 끝나지 않았음을 확인한다.
2. 같은 다이어리의 stale PATCH와 GET은 실제 PostgreSQL 대기 관계를 관찰한 뒤 해제한다. PATCH는 409, GET은 커밋된 version=2를 반환하며 version은 한 번만 증가한다.
3. 계정 비활성화 UPDATE가 유지 중 PATCH의 잠금을 기다리는 것을 pg_blocking_pids로 확인한다. 해제 후 비활성화가 커밋되고 같은 토큰의 후속 PATCH는 401이며 추가 version 증가는 없다.
4. 멤버십 left_at UPDATE도 같은 방식으로 대기한 뒤 커밋한다. 후속 PATCH는 404이며 추가 version 증가는 없다.

타이밍 sleep만으로 성공을 판정하지 않는다. latch·Future·각 연결의 pg_backend_pid와 pg_blocking_pids를 사용한다. 409 서비스 예외는 테스트의 외부 트랜잭션도 rollback-only로 표시하므로 그 정상 rollback을 테스트 래퍼에서 구분한다. 모든 스레드·스키마·임시 PostgreSQL 서버는 테스트 종료 시 정리한다.

실행 명령: 명시적인 폐기용 루프백 `dio_member_contract_qa`의 DB_URL/POSTGRES_USER/POSTGRES_PASSWORD를 제공하고 backend에서 `gradlew.bat postgresMemberDiaryHttpTest`를 실행한다. HTTP opt-in은 전용 태스크가 설정한다. 로컬 증적은 워크스페이스 `tmp/diary184-patch-lock/`, 최종 실행·CI·자동 리뷰 결과는 !184 본문에 기록한다.

원본·248·다른 세션 작업 폴더를 수정하지 않는다. Draft 해제나 MR 병합은 하지 않는다. 실제 공유/운영 서버 부하·장시간 처리량 벤치마크·실기기·배포 검증은 이번 동시성 계약 검증에 포함하지 않는다.

로컬 결과: 기존 HTTP 24개와 새 PostgreSQL 동시성 4개를 검증했다. 최초 28개 중 27개 통과 후 테스트 외부 트랜잭션의 정상 rollback 처리를 보완한 1개만 재실행해 통과했다. H2 인증 10·상세 12·회원 HTTP 24 = 46개 통과, 실패·제외 0. 최종 테스트 소스 컴파일도 통과했다. 이 실행 이력은 최종 CI 결과와 구분한다.


## 비멤버 PATCH 잠금 전 거부 (2026-10-28)

사용자 공유 잠금 뒤, 잠금 없는 SELECT로 활성 다이어리와 현재 활성 멤버십·소유권 일치를 확인한다. 비참여·탈퇴·VIEWER·소유권 불일치·삭제 자료는 404, 활성 EDITOR는 기존과 같이 403으로 다이어리 쓰기 잠금 전에 거부한다. OWNER 후보만 diary UPDATE 잠금을 취득한다. 사전 확인은 권한 부여가 아니며 기존 getAuthorized가 user SHARE → diary UPDATE → membership SHARE 순서 안에서 권한을 다시 검증한다. 따라서 사전 확인 뒤 멤버십 해제·삭제가 커밋된 경우 쓰지 못한다. 버전/CAS·계정 비활성화 보호도 유지한다.

실제 PostgreSQL에 3개 시나리오를 추가한다. 소유자의 PATCH 트랜잭션을 유지한 동안 EDITOR 403 및 VIEWER/소유권 불일치/탈퇴/비참여 404가 소유자의 해제를 기다리지 않고 반환한다. 이미 삭제된 다이어리는 별도 행 잠금이 유지돼도 즉시 404를 반환한다. 마지막으로 OWNER PATCH가 사전 확인 후 실제 diary 잠금에 대기하는 것을 pg_blocking_pids로 확인하고 그 사이 멤버십을 해제한다. 잠금을 풀어도 404이며 version은 증가하지 않는다. 기존 동시성 4개도 함께 검증한다. 요청이 반환했다는 사실만으로 운영 부하/TPS 개선 수치를 주장하지 않는다.

이번 보완의 로컬 검증: H2 회원 HTTP·상세 권한 37개, 실제 PostgreSQL 회원 HTTP 32개(필터 회귀와 기존 동시성 4개·신규 동시성 3개 포함), 실제 Spring 응답을 사용하는 FE 계약·스토어 24개가 모두 통과했다. 실패·제외는 0이다. 폐기용 PostgreSQL은 종료했다. 최종 커밋의 원격 CI·자동 리뷰와 원본 보존 감사는 !184 본문 및 워크스페이스 `tmp/diary184-shared-precheck/`에 기록한다.

원격 CI 248134에서 기존 MemberDiaryListPostgresTests의 구 커서 테스트가 v3 문자열 치환에 의존해 새 v4를 그대로 보내는 실패 1개를 발견했다. 제품 코드는 바꾸지 않고 해당 테스트를 JSON 버전 필드 수정으로 보완해 v1·v2·v3 거부를 검증했다. 보완 후 실제 PostgreSQL 목록 4개(Unicode 검색·페이지 이동·구 버전 거부·삭제 페이지/탈퇴 멤버 집계)가 모두 통과했다. 최초 실패 파이프라인은 성공으로 기록하지 않으며 후속 최종 CI는 MR 본문을 따른다.
