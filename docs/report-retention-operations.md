# 신고 자동 정리와 법적 보존 운영 (내부용)

운영 책임자: 신승민. 기존 V32는 수정하지 않고 V33으로 user_reports의 보존 컬럼을 추가한다. 새 공개 API·테이블은 없다. 실제 DB 작업은 권한 있는 운영자만 수행한다.

## 법적 보존 설정

자동 정리는 retention_hold=false인 완료·위반 미확인 신고만 처리한다. 아래는 검토용 SQL 예시이며 :report_id 등은 DB 도구에서 바인딩한다. 사유에는 불필요한 개인정보를 적지 않는다.

```sql
BEGIN;
SELECT report_id, status, resolved_at, retention_hold
FROM user_reports WHERE report_id = :report_id FOR UPDATE;
UPDATE user_reports
SET retention_hold = true,
    retention_hold_reason = :reason,
    retention_hold_by = :operator,
    retention_hold_at = CURRENT_TIMESTAMP
WHERE report_id = :report_id;
COMMIT;
```

대상 1건이 존재하고 UPDATE가 1행인지 확인한다. 설정 시 사유·담당자·시각이 모두 필요하며 DB 제약으로 누락을 거절한다. 이미 삭제된 신고·삭제 대기열의 파일을 소급 복구하는 기능은 아니다. 삭제 대상이 되기 전에 보존을 설정한다. 배치와 같은 신고 행 잠금을 사용하므로 먼저 완료된 트랜잭션을 기준으로 처리된다.

## 보존 해제

분쟁 종료 등 보존 근거가 끝났는지 검토하고 아래처럼 해제한다. 원래 완료 시각은 변경하지 않는다. 이미 30일이 지난 신고는 다음 배치에서 즉시 삭제 대상이 될 수 있다.

```sql
BEGIN;
SELECT report_id FROM user_reports WHERE report_id = :report_id FOR UPDATE;
UPDATE user_reports
SET retention_hold = false, retention_hold_reason = NULL,
    retention_hold_by = NULL, retention_hold_at = NULL
WHERE report_id = :report_id;
COMMIT;
```

보존 건은 정기적으로 근거·필요성을 재검토하고 종료 시 해제한다. 임의로 무기한 보존하지 않는다. 운영 접근·변경 기록은 기존 제한된 감사 절차로 관리한다.

## 증빙 오류와 재시도

증빙 JSON이 배열이 아니거나 저장 키가 없거나 잘못되면 그 신고는 삭제하지 않는다. 유효한 키가 일부 있어도 전체 검증이 끝나기 전에는 대기열을 만들지 않는다. 로그에는 신고 ID·예외 유형만 남기며 사진·설명·저장 경로·회원정보는 출력하지 않는다. 운영자가 실제 파일 위치를 확인해 evidence_json을 복구하면 다음 배치에서 재검사한다. 빈 배열 []은 증빙 없는 정상 신고다. 위치 확인 없이 임의로 []로 바꾸지 않는다.

오류 건은 남겨두고 한 번의 실행 범위(최대 20묶음) 안에서 키셋 순회로 다음 신고도 처리한다. 오류 건이 실행 상한 이상으로 쌓이면 운영자가 복구·정리해 뒤쪽 적체를 해소해야 한다. 파일 삭제 장애는 기존 대기열에 시도·다음 시각을 남겨 재시도하고 성공 후 대기열 행을 삭제한다.

## 배포

V32·V33 적용과 테스트 결과, 실제 저장소 삭제, DB 보존 설정 권한·절차를 확인하기 전에는 REPORT_RETENTION_CLEANUP_ENABLED=false를 유지한다. 기본값 true만 보고 준비 완료로 판단하지 않는다. 테스트·운영 승인 후 활성화한다. 파일 삭제는 현재 MediaFiles 저장소를 사용하므로 이전 provider 자료가 있으면 별도로 확인한다. 이번 코드 작업에서 운영 DB·환경변수·개인정보처리방침 공개 상태는 변경하지 않는다.

## 검증 명령

전용 폐기용 PostgreSQL에만 DIO_REPORT_RETENTION_URL=jdbc:postgresql://127.0.0.1:<port>/dio_report_retention_qa와 DIO_REPORT_RETENTION_PASSWORD를 설정하고 backend에서 `./gradlew.bat reportRetentionPostgresTest`를 실행한다. 개발·운영 DB로 대체하지 않는다. 일반 테스트는 `./gradlew.bat test --tests com.f106.DIO.moderation.ReportRetentionCleanupTests --tests com.f106.DIO.sharing.ModerationTests`로 실행한다.
