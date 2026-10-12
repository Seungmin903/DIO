# AGENTS.md

이 저장소에서 작업하는 모든 AI 에이전트(Claude Code, Codex, Cursor 등)를 위한 공통 지침입니다.

## 프로젝트 개요

하루 한 장의 사진을 캔버스 삼아, 같은 방의 친구들이 그 위에 텍스트·이모지·손글씨/그림을 얹어 함께 완성하는 **공유 다이어리** 서비스입니다.

## 기술 스택

- Backend: Spring Boot 4.1, Java 17, Gradle, Spring Data JPA, MySQL 8.4
- Frontend: React 19, Vite (JavaScript), oxlint
- AI: Python 3.12, FastAPI, SAM 2.1 (uv)
- Local infra: Docker Compose (MySQL)

## 개발 명령어

| 작업 | 명령어 (해당 폴더에서 실행) |
|---|---|
| DB 실행 | `docker compose up -d` (루트) |
| 백엔드 실행 | `./gradlew bootRun` (backend/, 기본 프로필 `local`) |
| 백엔드 빌드/테스트 | `./gradlew build` / `./gradlew test` (테스트는 H2 인메모리 DB 사용) |
| 프론트 실행 | `npm install && npm run dev` (frontend/, http://localhost:5173) |
| 프론트 빌드/린트 | `npm run build` / `npm run lint` |
| AI 서버 실행 | `uv sync && uv run uvicorn app.main:app --port 8000` (ai/, http://localhost:8000) |

- 프론트의 `/api/**` 요청은 Vite proxy를 통해 `http://localhost:8080` 으로 전달됩니다. API 경로는 `/api` 로 시작하게 만드세요.
- 백엔드 기본 패키지: `com.ssafy.dio`

## Git 작업 규칙

브랜치 전략, 커밋 메시지 형식, MR 규칙은 [GIT_CONVENTION.md](./GIT_CONVENTION.md)에 정의되어 있습니다. **모든 git 작업은 반드시 이 문서를 따르세요.**

핵심 요약:
- `master`, `develop`에 직접 커밋/푸시 금지. 항상 `feature/{be|fe|ai}/{ISSUE-KEY}-{설명}` 또는 `fix/{be|fe|ai}/{ISSUE-KEY}-{설명}` 브랜치를 만들어 작업하고 MR로 병합합니다.
- 커밋 메시지는 Conventional Commits 형식(`type(scope): subject`)을 사용합니다. `type`은 `feat/fix/docs/style/refactor/test/chore/build/ci/perf` 중 하나. "a", "wip" 같은 의미 없는 메시지는 사용하지 않습니다.
- `master`, `develop`는 protected branch이므로 force-push가 불가능합니다. 히스토리를 되돌려야 할 때는 `git revert`를 우선 고려하세요.
- 사용자가 명시적으로 요청하지 않으면 커밋/푸시/MR 생성을 먼저 하지 않습니다.
- `.env`, 루트의 PDF(기획 자료) 등 `.gitignore` 대상 파일은 절대 커밋하지 않습니다.

## 폴더 구조

```
S15P31F106/
├── backend/             # 백엔드 (Spring Boot 4.1, Java 17, Gradle)
├── frontend/            # 프론트엔드 (React 19 + Vite)
├── ai/                  # AI 서버 (FastAPI + SAM 2, 스티커 누끼)
├── docs/                # 요구사항/API/DB/팀 문서 (docs/README.md가 색인)
├── docker-compose.yml   # 로컬 개발용 MySQL
├── .env.example         # 로컬 환경변수 예시 (.env 는 커밋 금지)
├── README.md
├── AGENTS.md            # AI 에이전트 공통 지침
├── CLAUDE.md            # Claude Code 지침 (AGENTS.md 를 import)
└── GIT_CONVENTION.md
```
