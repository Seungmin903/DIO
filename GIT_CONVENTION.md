# DIO Git 브랜치·커밋·MR 컨벤션

이 문서는 DIO 저장소에서 사람과 AI 에이전트가 함께 사용하는 협업 기준이다.
이전 프로젝트의 컨벤션을 현재 [Jira 운영 규칙](./JIRA_RULES.md)과 실행 환경에 맞게 조정했다.
이 변경안은 팀 공유와 MR 리뷰를 거쳐 `develop`에 병합한 뒤 공통 기준으로 적용한다.

| 항목 | 기준 |
| --- | --- |
| 서비스 / Jira 프로젝트 | DIO / `S15P31F106` |
| 원격 저장소 | `https://lab.ssafy.com/s15-final/S15P31F106.git` |
| 기본 통합 브랜치 | `develop` |
| 배포 브랜치 | `master` |
| 일반 기능 병합 | GitLab Merge Request(MR), Squash merge |
| 프로젝트 구조 | `frontend/` Expo·React Native, `backend/` Spring Boot·Gradle, `docs/` 공통 문서 |

## 1. 작업 흐름과 Jira 단위

```text
승인된 에픽 아래 태스크 등록
→ 최신 develop에서 기능 이름으로 작업 브랜치 생성
→ 기능에 속한 태스크를 같은 브랜치에서 개발·검증·커밋
→ 기능이 모두 완성되면 MR 생성
→ 코드 리뷰
→ Squash merge
→ 작업 브랜치 삭제
```

- 실행 단위는 Jira `태스크`다. 스토리·버그 타입을 새로 만들지 않는다.
- 태스크의 SP는 예상 시간이며 정수 1~3으로 작성한다. 3시간을 넘으면 처음부터 나눈다.
- 브랜치와 MR은 기능 하나 단위로 만든다. 같은 기능에 속한 여러 태스크는 한 브랜치에서 이어서 작업하고, MR에는 관련 태스크를 모두 적는다.
- 기능이 모두 완성되고 검증까지 끝난 뒤에 MR을 올려 `develop`에 병합한다. 기능 일부만 끝난 상태로는 병합하지 않는다(리뷰가 필요하면 Draft MR 사용).
- 기반 작업(저장소·공통 오류·환경 설정)은 관심사와 완료 조건으로 나눈다.
- 풀스택 담당자도 같은 사용자 기능 안의 FE·BE 변경을 한 브랜치에서 다룰 수 있다. Jira 제목의 `[FE]`·`[BE]`는 각 태스크의 작업 영역을 나타낸다.
- 신규 에픽 생성·parent 연결·중복 검색·담당자·SP는 `JIRA_RULES.md`를 따른다.

## 2. 브랜치

### 이름

```text
<종류>/<영문-기능-이름>
```

브랜치 이름에는 기능 이름만 쓴다. Jira 키, `fe`·`be` 같은 scope 경로, 작업자 이름은 넣지 않는다.
FE·BE 구분은 폴더와 Jira 태스크에서 확인하고, Jira 추적은 MR 제목과 본문에서 한다.
이미 진행 중인 `feature/fe/...`, `feature/S15P31F106-...` 등 이전 형식 브랜치는 해당 MR까지 사용해도 된다.

| 브랜치 | 시작점 | 용도 / 대상 |
| --- | --- | --- |
| `master` | — | 실제 배포 가능한 버전 |
| `develop` | — | 다음 배포에 포함할 개발 통합 |
| `feature/image-import` | 최신 `develop` | 기능 추가 → `develop` |
| `fix/missing-media` | 최신 `develop` | 결함 수정 → `develop` |
| `refactor/media-service` | 최신 `develop` | 동작 변화 없는 구조 개선 → `develop` |
| `docs/git-convention` | 최신 `develop` | 문서만 변경 → `develop` |
| `chore/project-config` | 최신 `develop` | 설정·의존성 작업 → `develop` |
| `release/v1.0.0` | 최신 `develop` | 릴리스 준비 → `master`, 변경을 `develop`에도 반영 |
| `hotfix/image-open-error` | 최신 `master` | 운영 긴급 수정 → `master`, 변경을 `develop`에도 반영 |

- 기능 브랜치는 `feat/` 대신 `feature/`를 사용한다.
- 기능 이름은 영어 소문자·숫자·하이픈으로 짧게 쓴다. 예: `feature/diary-landing`, `feature/pdf-export`
- 같은 기능의 후속 태스크를 위해 새 브랜치를 만들지 않는다. 기능 브랜치가 남아 있으면 그 브랜치에서 이어서 작업한다.
- 브랜치 이름에 Jira 키를 넣지 않아도 Jira 이슈 없는 작업은 하지 않는다. 일반 문서·설정 변경도 태스크로 관리한다.
- `master`, `develop`에는 직접 커밋·푸시하지 않는다.

### 명령 예시

작업 트리에 미커밋 변경이 있으면 먼저 보존하고 브랜치를 전환한다. 다른 기능의 변경을 섞지 않는다.

```sh
git switch develop
git pull --ff-only origin develop
git switch -c feature/image-import
```

작업 도중 최신 통합 내용을 반영할 때:

```sh
git fetch origin
git merge origin/develop
```

공유 브랜치의 기본 갱신 방식은 merge다. rebase·force push로 팀원의 기록을 덮어쓰지 않는다.
운영 긴급 수정만 최신 `master`에서 hotfix 브랜치를 만든다.

## 3. 커밋

```text
<type>(<선택적 scope>): <한국어 설명>
```

- type은 영어 소문자, 설명은 구체적인 한국어로 쓰고 끝에 마침표를 붙이지 않는다.
- scope는 `media`, `editor`, `diary`, `storage`, `api`, `fe`, `be`, `infra` 등 변경을 설명하는 짧은 범위다. 전체 문서·설정은 생략할 수 있다.
- 한 커밋에는 한 작업 목적을 담는다. `수정`, `변경`, `a`, `wip`만 쓰지 않는다.
- 일반 작업 커밋에는 Jira 키를 반복해서 쓰지 않는다. 추적은 MR 제목·본문에서 하고, 최종 Squash 커밋에는 MR 제목을 통해 Jira 키가 남도록 한다.
- 실제 정의된 요구사항 ID가 있을 때만 근거로 적는다. 임의 ID를 만들지 않는다.

| type | 용도 | 예시 |
| --- | --- | --- |
| `feat` | 기능 추가 | `feat(media): 이미지 원본 로컬 저장 추가` |
| `fix` | 결함 수정 | `fix(storage): 저장 실패 시 이미지 메타데이터 롤백` |
| `docs` | 문서 변경 | `docs: 로컬 이미지 저장 계약 정리` |
| `style` | 동작 변화 없는 코드 서식 | `style: 편집기 코드 들여쓰기 통일` |
| `refactor` | 동작 변화 없는 구조 개선 | `refactor(media): 플랫폼별 저장소 분리` |
| `test` | 테스트 변경 | `test(media): GIF 원본 보존 검증 추가` |
| `chore` | 기타 유지보수·의존성 | `chore(fe): Expo 호환 의존성 정리` |
| `build` | 빌드 시스템 | `build(fe): Android 번들 설정 갱신` |
| `ci` | CI 설정 | `ci: MR 검증 작업 추가` |
| `perf` | 성능 개선 | `perf(editor): 썸네일 중복 디코딩 감소` |
| `merge` | 수동 작성한 병합 메시지 | `merge: develop 최신 변경 반영` |
| `revert` | 변경 되돌리기 | `revert: 이미지 캐시 변경 되돌리기` |

기존 저장소에서 허용한 `build`, `ci`는 유지한다. Git이 생성한 기본 merge·revert 메시지도 허용한다.
`style`은 화면 디자인 변경을 뜻하지 않는다. UI 기능 추가는 `feat`, 잘못된 화면 동작 수정은 `fix`로 쓴다.

## 4. GitLab MR

### 제목

```text
<type>(<선택적 scope>): <한국어 설명> [S15P31F106-<번호>]
```

```text
feat(media): 이미지 파일 검사와 로컬 원본 저장 구현 [S15P31F106-67, S15P31F106-68]
docs: DIO Git 협업 규칙 정리 [S15P31F106-99]
```

MR 제목은 전체 변경을 대표해야 한다. GitLab의 Squash commit message를 MR 제목과 맞춰 최종 커밋에도 이슈 키가 남게 한다.
실제 GitLab 템플릿 설정이 다르면 병합 직전에 최종 메시지를 확인한다.

### 본문

기본 양식은 [.gitlab/merge_request_templates/Default.md](./.gitlab/merge_request_templates/Default.md)를 사용한다.

- 한국어로 작성하고 관련 Jira 링크와 작업 범위를 적는다.
- 수행한 검증 명령·결과와 미검증 항목을 구분한다. 빌드 성공을 실기기 실행 성공으로 표현하지 않는다.
- 구현으로 데이터 형식·UI 동작·오류 코드가 달라졌으면 같은 MR에서 관련 `docs/` 문서도 갱신한다.
- 영향받는 저장 데이터와 마이그레이션·복구 방법을 적는다.
- 작업 중인 변경은 Draft MR로 올릴 수 있다.
- 토큰·비밀번호·개인정보·`.env` 및 ignore 대상 원본 자료는 커밋하거나 첨부하지 않는다.
- 기존 프로젝트의 Jenkins job·자동 배포·파이프라인 이름은 적용하지 않는다. CI는 DIO 저장소 파일과 GitLab 프로젝트 설정에서 확인한 검증만 기록한다.

### 변경별 검증

| 변경 | 실행·기록할 검증 예시 |
| --- | --- |
| Expo 웹 UI | `cd frontend`, `pnpm exec expo export --platform web`, 실제 화면 흐름 확인 |
| 네이티브 기능 | Android/iOS 대상 번들 또는 빌드, 해당 기기 실행 결과. iOS 빌드는 macOS에서 수행 |
| 이미지 저장 | 해당 브랜치에 스크립트가 있으면 `pnpm test:media`, 파일 선택·저장·재실행 복원 확인 |
| Spring 기능 | `cd backend`, Windows `./gradlew.bat test`, macOS/Linux `./gradlew test` |
| 문서만 변경 | 링크·명령·이슈 키·규칙 간 일관성 확인. 앱 전체 빌드를 필수로 요구하지 않음 |

실제 `package.json`·Gradle 설정에 존재하는 명령을 사용한다. 실행하지 않은 테스트를 통과로 적지 않는다.
코드 변경과 관련된 검사만 실행하고, 기존 실패는 원인·영향을 구분해 기록한다.

## 5. 리뷰와 병합

리뷰 의견은 필요에 따라 다음 접두사를 사용한다.

- `must:` 병합 전에 고쳐야 하는 문제
- `suggestion:` 작성자가 판단할 개선안
- `question:` 의도·동작에 대한 질문

일반 MR의 병합 조건:

- 브랜치의 기능이 모두 완성되고, MR에 적은 관련 태스크의 완료 조건을 충족
- 작성자 외 최소 1명의 승인
- 모든 `must:` 의견 해결
- 해결되지 않은 리뷰 대화와 브랜치 충돌 없음
- 검증 명령·결과·미검증 사항 기록
- 프로젝트에 설정된 필수 CI가 있으면 통과

일반 `feature`, `fix`, `refactor`, `docs`, `chore` → `develop`은 Squash merge한다.
기존 DIO 릴리스 정책에 따라 `release`, `hotfix` → `master`는 Merge commit을 사용한다.
릴리스·긴급 수정 내용은 `develop`에도 반영하고, 병합 뒤 더 이상 필요 없는 작업 브랜치를 삭제한다.
공유된 히스토리를 되돌릴 때는 `git revert`를 우선 사용한다.

`master`·`develop` 보호와 승인 수·필수 CI·병합 방식은 GitLab 설정에서도 적용해야 한다. 문서를 수정하는 것만으로 원격 설정이 변경되지는 않는다.

## 6. 호환되지 않는 변경과 버전

기존 서버 API뿐 아니라 로컬 서비스 함수, 저장 스키마, 요소 좌표·자르기 규칙을 바꿔 기존 데이터가 깨지는 변경도 표시한다.

```text
feat(storage)!: 이미지 원본 참조 형식 변경 [S15P31F106-68]

BREAKING CHANGE: 기존 이미지 참조 형식과 새 형식의 차이, 영향받는 데이터,
변환 방법과 실패 시 복구 방법을 설명한다
```

일반 커밋에서 breaking change를 표시할 때도 `!`와 본문을 사용하되 Jira 키는 MR 제목에 둔다.

정식 릴리스를 운영하기 시작하면 SemVer를 적용한다. 호환되지 않는 변경은 MAJOR, 하위 호환 기능 추가는 MINOR, 버그·호환되는 성능 개선은 PATCH다.
초기 개발 단계에서는 MR마다 앱 버전을 올리지 않는다. 버전 자동화가 존재한다고 가정하지 않는다.

## 7. 작업 전후 확인

시작 전에는 Jira 태스크·승인된 parent·담당자·SP를 확인하고 관련 UI/UX·저장·API 명세를 읽는다.
MR 전에는 변경 목적·문서·검증 기록·최신 develop 반영·민감정보 제외를 확인한다.
Jira 상태는 실제 프로젝트의 전환을 확인해 갱신한다. 로컬 구현만 끝났거나 실기기 확인이 남았다면 최종 완료로 표시하지 않는다.
AI 에이전트는 사용자의 명시적 요청 없이 커밋·푸시·MR 생성·병합을 수행하지 않는다.

## 8. 저장소 구조

```text
S15P31F106/
├── backend/        # Spring Boot / Java 17 / Gradle
├── frontend/       # Expo / React Native / react-native-web
├── docs/           # docs/README.md를 색인으로 사용
├── .gitlab/merge_request_templates/Default.md
├── AGENTS.md
├── GIT_CONVENTION.md
└── JIRA_RULES.md
```

두 앱은 독립적으로 실행 가능해야 한다. 공통 문서는 루트 또는 `docs/`에 두고 문서 색인을 갱신한다.
새로운 최상위 코드 폴더를 추가할 때는 이 구조 설명도 갱신한다.
