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
