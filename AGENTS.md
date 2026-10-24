# AGENTS.md

이 저장소에서 작업하는 모든 AI 에이전트(Claude Code, Codex, Cursor 등)를 위한 공통 지침입니다.

## 프로젝트 개요

하루 한 장의 사진을 캔버스 삼아, 같은 방의 친구들이 그 위에 텍스트·이모지·손글씨/그림을 얹어 함께 완성하는 **공유 다이어리** 서비스입니다.

## 기술 스택

- Backend: Spring Boot 4.1, Java 17, Gradle, Spring Data JPA, PostgreSQL 17, Flyway
- Frontend: Expo SDK 58, React Native 0.88 (JavaScript) — 창 크기로 폰·태블릿 배치를 나눔(태블릿은 16:10 가로 프레임, 폰은 전용 배치. `docs/phone-tablet-layout.md`), react-native-web으로 브라우저 확인 가능
- Local infra: Docker Compose (PostgreSQL)

## 디자인 기준

- 화면·UI를 새로 만들거나 고칠 때는 [docs/design-guide.md](./docs/design-guide.md)(DIO 디자인 가이드)를 따른다. 색·글자·간격·아이콘·공용 컴포넌트·문구 규칙이 다른 문서와 다르면 이 가이드가 우선이다.
- 새 디자인 규칙을 만들면 가이드(md가 원본)를 같은 커밋에서 고친다. Word·PDF 본은 md에서 다시 만든다.

## 개발 명령어

| 작업 | 명령어 (해당 폴더에서 실행) |
|---|---|
| DB 실행 | `docker compose up -d --wait postgres` (루트) |
| 백엔드 실행 | `./gradlew bootRun` (backend/, 기본 프로필 `local`) |
| 백엔드 빌드/테스트 | `./gradlew build` / `./gradlew test` (테스트는 H2 인메모리 DB 사용) |
| 실제 PostgreSQL 다이어리 CRUD 테스트 | `./gradlew postgresTest` (backend/, 로컬 DB 필요, 테스트 행 롤백) |
| 프론트 의존성 설치 | `pnpm install` (frontend/) |
| Android 실행 | `pnpm android` (frontend/, Android 에뮬레이터 또는 기기 필요) |
| iOS 실행 | `pnpm ios` (frontend/, macOS 필요) |
| 웹에서 확인 | `pnpm web` (frontend/, http://localhost:8081 · react-native-web) |

- React Native 앱은 Vite proxy를 사용하지 않습니다. API 요청에는 `EXPO_PUBLIC_API_BASE_URL`로 설정한 전체 주소(예: Android 에뮬레이터의 `http://10.0.2.2:8080/api`)를 사용하세요. 실제 기기에서는 개발 PC의 LAN IP를 지정합니다.
- 백엔드 기본 패키지: `com.f106.DIO`

## Git 작업 규칙

브랜치 전략, 커밋 메시지 형식, MR 규칙은 [GIT_CONVENTION.md](./GIT_CONVENTION.md)에 정의되어 있습니다. **모든 git 작업은 반드시 이 문서를 따르세요.**

- Git 명령을 실행하기 전에는 최신 `GIT_CONVENTION.md`를 다시 확인합니다.

핵심 요약:
- `master`, `develop`에 직접 커밋/푸시 금지. 새 작업 브랜치는 Jira 키 없이 `종류/포지션/기능-이름` 형식입니다(예: `feature/fe/diary-landing`, `fix/be/...`). 포지션은 `fe`·`be`, 그 외는 `infra`·`common`을 씁니다. 진행 중인 이전 형식 브랜치는 해당 MR까지 유지할 수 있습니다.
- Jira의 에픽→태스크 구조와 태스크당 최대 3시간 규칙을 따릅니다. 브랜치·MR은 기능 하나 단위이며, 같은 기능의 태스크는 한 브랜치에서 이어서 작업하고 기능이 모두 완성되면 MR을 올려 병합합니다.
- 커밋은 `type(scope): 한국어 설명` 형식입니다. type은 `feat/fix/docs/style/refactor/test/chore/build/ci/perf/merge/revert`를 사용합니다. scope는 선택 사항입니다.
- 일반 커밋에는 Jira 키를 반복하지 않고 MR 제목에 실제 `S15P31F106-번호`를 씁니다. 최종 Squash 메시지는 MR 제목과 맞춥니다.
- 일반 작업은 develop에 Squash merge하고 release/hotfix는 master에 Merge commit합니다. 작성자 외 최소 1명의 승인과 검증 기록이 필요합니다.
- 공유 브랜치 force-push를 금지하며, 히스토리를 되돌릴 때는 `git revert`를 우선 고려합니다. 원격 보호·승인·CI 설정은 실제 GitLab 설정을 확인합니다.
- 사용자가 명시적으로 요청하지 않으면 커밋/푸시/MR 생성을 먼저 하지 않습니다.
- `.env`, 루트의 PDF(기획 자료) 등 `.gitignore` 대상 파일은 절대 커밋하지 않습니다.

## 폴더 구조

```
S15P31F106/
├── backend/             # 백엔드 (Spring Boot 4.1, Java 17, Gradle)
├── frontend/            # 모바일 프론트엔드 (Expo + React Native)
├── docs/                # 요구사항/API/DB/팀 문서 (docs/README.md가 색인)
├── docker-compose.yml   # 로컬 개발용 PostgreSQL
├── .env.example         # 로컬 환경변수 예시 (.env 는 커밋 금지)
├── README.md
├── AGENTS.md            # AI 에이전트 공통 지침
├── CLAUDE.md            # Claude Code 지침 (AGENTS.md 를 import)
└── GIT_CONVENTION.md
```
