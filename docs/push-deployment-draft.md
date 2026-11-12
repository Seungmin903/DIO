# 푸시 기기 연결 배포 설정 초안

아직 배포·키 발급을 하지 않는다. 개발·운영 별 키와 환경값을 분리하고 비공개 저장소에서 안전하게 주입한다. 아래는 값이 없는 설정 예시이며 운영자와 주입 경로 및 접근 정책을 확정해야 한다.

```yaml
# 기존 backend 서비스의 environment에 추가할 후보
PUSH_ENVIRONMENT: "${PUSH_ENVIRONMENT:?explicit environment required}"
PUSH_APP_ID: "${PUSH_APP_ID:?explicit app id required}"
PUSH_ACTIVE_KEY_ID: "${PUSH_ACTIVE_KEY_ID:?active key id required}"
PUSH_ENCRYPTION_KEYS: "${PUSH_ENCRYPTION_KEYS:?keyring required}"
PUSH_INSTANCE_ID: "${PUSH_INSTANCE_ID:-}"
PUSH_KEY_SECRET_VERSIONS: "${PUSH_KEY_SECRET_VERSIONS:-}"
DIO_PUSH_DEPLOYMENT_REPORT_ENABLED: "${DIO_PUSH_DEPLOYMENT_REPORT_ENABLED:-false}"
```

Compose의 환경변수는 호스트 Docker 권한을 가진 사용자에게 노출될 수 있다. 비밀관리 체계와 컨테이너 접근 통제 결정 후 적용하며, 렌더링된 설정을 로그에 출력하지 않는다. PUSH_ENCRYPTION_KEYS는 id=Base64키를 세미콜론으로 구분하고 256비트 무작위 키를 사용한다. 기존 legacy 키가 없으면 PUSH_ENCRYPTION_KEY를 설정하지 않는다. 앱과 운영자 도구의 환경·앱 범위는 일치해야 한다.

운영자 명령은 HTTP를 열지 않지만 자체 인증이 없으므로 OS·컨테이너 실행 권한을 분리하고 전용 DB 역할의 최소 SELECT/UPDATE 및 행 잠금 권한을 검증한다. PUSH_KEY_SECRET_VERSIONS는 신고된 메타데이터이며 실제 비밀관리 시스템의 주입 버전과 운영자가 대조해야 한다. 백업 복구에 필요한 기존 키 유지기간과 실패 재시도 절차는 기존 docs/push-device-isolated.md를 참조한다. 운영 환경의 V21 미적용은 담당자 전달사항이며 배포 직전 이력을 재확인한다.


## 검증 기준

- develop b67ac4512593d6aae8b0c99a0d209dbb359c9b54. 본문 설정은 제안이며 배포 Compose 자체를 변경하지 않았다.
- 회원 탈퇴 MR !226 cf62395b2bedacdb6ab0d86df76cf7cd2e14c94f을 별도 격리 사본에 결합해 PostgreSQL 푸시 테스트 29개를 통과했다. 푸시 등록 우선·탈퇴 우선 경합과 비밀번호 변경 경합을 포함한다. MR 자체는 수정하지 않았다.
- 푸시 요청은 사용자 공유 잠금 → 세션 → 설치 순서다. 전체 세션 폐기는 삭제 전 JPA 상태를 flush한다. 사용자 잠금의 영향과 회원 탈퇴 MR이 병합될 때의 최신 통합 상태를 다시 확인한다.
