# Git Convention

이 프로젝트(S15P31F106)의 폴더 구조, 브랜치 전략, 커밋 규칙을 정의합니다.
사람과 AI 에이전트(Claude Code 등) 모두 이 문서를 기준으로 작업합니다.

## 1. 폴더 구조 (모노레포)

```
S15P31F106/
├── backend/             # 백엔드 (Spring Boot 4.1, Java 17, Gradle)
├── frontend/            # 프론트엔드 (React 19 + Vite)
├── docs/                # 요구사항/API/DB/팀 문서 (docs/README.md가 색인)
├── docker-compose.yml   # 로컬 개발용 MySQL
├── .env.example         # 로컬 환경변수 예시 (.env 는 커밋 금지)
├── README.md
├── AGENTS.md            # AI 에이전트 공통 지침
├── CLAUDE.md            # Claude Code 지침 (AGENTS.md 를 import)
└── GIT_CONVENTION.md
```

- `backend/`, `frontend/`는 각자 독립적으로 빌드/실행 가능해야 합니다.
- 공통 문서·설정은 루트에 둡니다. 새로운 최상위 폴더(`ai/`, `infra/` 등)를 추가할 때는 이 문서도 함께 갱신합니다.

## 2. 브랜치 전략 (Git Flow)

| 브랜치 | 용도 | 병합 대상 |
|---|---|---|
| `master` | 배포 가능한 안정 버전. Protected. | `release/*`, `hotfix/*` 에서만 병합 |
| `develop` | 다음 배포를 위한 개발 통합 브랜치. Protected. | `feature/*`, `fix/*` 에서 MR로 병합 |
| `feature/{scope}/{ISSUE-KEY}-{설명}` | 기능 개발 | → `develop` |
| `fix/{scope}/{ISSUE-KEY}-{설명}` | 버그 수정 | → `develop` |
| `release/{version}` | 배포 준비 (버전 고정, QA) | → `master` (+ `develop`로 백머지) |
| `hotfix/{ISSUE-KEY}-{설명}` | 운영 중 긴급 수정 | → `master` (+ `develop`로 백머지) |

- `scope`는 `be`(backend) 또는 `fe`(frontend)를 사용합니다.
- `ISSUE-KEY`는 지라(Jira) 이슈 번호를 그대로 사용합니다. (팀 Jira 프로젝트 키에 맞춰 예시를 갱신하세요)
- 예: `feature/be/F106-12-login-api`, `fix/fe/F106-20-button-click-error`, `hotfix/F106-30-payment-null-error`

### 규칙
- `master`, `develop`에는 직접 커밋/푸시하지 않습니다. 반드시 MR을 통해서만 병합합니다.
- `master`, `develop`는 force-push를 금지합니다 (GitLab protected branch로 설정).
- 브랜치는 작업이 끝나고 MR이 병합되면 삭제합니다.

## 3. 커밋 컨벤션 (Conventional Commits)

```
<type>(<scope>): <subject>

<body (선택)>

<footer (선택, 이슈 연동)>
```

### type
| type | 설명 |
|---|---|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 수정 |
| `style` | 코드 포맷팅, 세미콜론 등 동작에 영향 없는 변경 |
| `refactor` | 기능 변경 없는 코드 구조 개선 |
| `test` | 테스트 코드 추가/수정 |
| `chore` | 빌드, 패키지 매니저, 설정 등 기타 변경 |
| `build` | 빌드 시스템, 외부 의존성 변경 |
| `ci` | CI 설정 변경 |
| `perf` | 성능 개선 |

### scope
`be`, `fe`, `infra` 등 변경된 영역. 전역 변경(문서, 설정)은 생략 가능합니다.

### subject
- 한글로 간결하게, 마침표 없이, 명령형/현재형으로 작성합니다.
- 빈 메시지("a", "8/27" 등)나 의미 없는 메시지는 금지합니다.

### 예시
```
feat(be): 로그인 API 구현
fix(fe): 로그인 버튼 클릭 시 발생하는 오류 수정
docs: README 프로젝트 소개 갱신
chore: 깃 컨벤션 문서 추가

이슈: F106-12
```

## 4. MR(Merge Request) 규칙

GitLab(lab.ssafy.com)을 사용하므로 PR 대신 MR(Merge Request)이라고 부릅니다.

- MR 제목은 커밋 컨벤션과 동일한 형식(`type(scope): subject`)을 따릅니다.
- 리뷰어 최소 1명의 승인(Approve)이 있어야 병합할 수 있습니다.
- `feature/*`, `fix/*` → `develop`: Squash and merge를 사용합니다 (커밋 히스토리를 깔끔하게 유지).
- `release/*`, `hotfix/*` → `master`: Merge commit을 사용합니다 (릴리즈 이력 보존).
- MR 설명에는 관련 지라 이슈 링크/번호를 반드시 포함합니다.

## 5. 이슈 연동

- 모든 작업은 지라 이슈를 기반으로 시작합니다. 이슈 없는 작업 브랜치는 만들지 않습니다.
- 브랜치명과 커밋 footer에 이슈 키(`F106-xx`)를 포함해 추적성을 확보합니다.

## 6. 초기 브랜치 세팅 (최초 1회)

`master`에 초기 세팅 커밋을 올린 뒤 `develop`을 만들고, GitLab에서 두 브랜치를 protected로 설정합니다.
이후 모든 작업은 `develop`에서 분기합니다. (Settings → Repository → Protected branches, Default branch는 `develop` 권장)
