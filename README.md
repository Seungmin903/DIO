# S15P31F106 · 공유 다이어리

하루에 사진 한 장을 올리면 그 사진이 캔버스가 되고, 친구들이 그 위에 글씨·그림·스티커를 얹어 함께 완성하는 공유 다이어리입니다.

## 사전 준비

| 도구 | 버전 |
|---|---|
| JDK | 17 (Gradle toolchain이 17을 사용합니다. 설치돼 있지 않으면 빌드가 실패합니다) |
| Node.js | 24 LTS 이상 (`frontend/.nvmrc`) |
| pnpm | 10 이상 (모바일 프론트엔드 의존성 관리) |
| Docker Desktop | 최신 (로컬 PostgreSQL 용) |

## 시작하기

```bash
git clone https://lab.ssafy.com/s15-final/S15P31F106.git
cd S15P31F106
git switch develop

# 1) 환경변수 (필수: 복사 후 POSTGRES_PASSWORD 설정)
cp .env.example .env

# 2) DB 실행 (Docker Desktop 켜둔 상태에서)
docker compose up -d --wait postgres

# 3) 백엔드 실행 → http://localhost:8080/api/health
cd backend
./gradlew bootRun          # Windows CMD/PowerShell: .\gradlew.bat bootRun

# 4) 모바일 프론트 실행 (새 터미널)
cd frontend
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
pnpm install
pnpm android             # Android 에뮬레이터 또는 연결된 Android 기기에서 실행
# macOS에서는 pnpm ios 로 iOS 시뮬레이터에서 실행 가능
# 브라우저로 빠르게 확인하려면 pnpm web → http://localhost:8081
```

- 모바일 앱은 Expo 기반 React Native 앱입니다. 개발 서버만 열려면 `pnpm start`를 실행하고 Expo Go 또는 에뮬레이터에서 연결하세요.
- 모바일 환경에서는 `/api` 같은 상대 경로를 사용할 수 없습니다. `EXPO_PUBLIC_API_BASE_URL`에 API 전체 주소를 설정하세요. Android 에뮬레이터에서는 `http://10.0.2.2:8080/api`, 실제 기기에서는 개발 PC의 LAN IP를 사용합니다.
- IntelliJ에서는 `backend/` 폴더를 Gradle 프로젝트로 열고, Project SDK를 17로 지정하세요.
- 백엔드 테스트(`./gradlew test`)는 H2 인메모리 DB를 사용하므로 Docker 없이도 실행됩니다.
- PostgreSQL 설정·연결 확인은 [로컬 DB 안내](docs/다이어리%20저장/로컬%20PostgreSQL.md)를 참고하세요. Swagger는 http://localhost:8080/swagger-ui.html 에서 확인합니다.

## 폴더 구조

```
S15P31F106/
├── backend/             # 백엔드 (Spring Boot 4.1, Java 17, Gradle)
├── frontend/            # 모바일 프론트엔드 (Expo + React Native)
├── docs/                # 요구사항/API/DB/팀 문서 (docs/색인.md가 색인)
├── docker-compose.yml   # 로컬 개발용 PostgreSQL
├── .env.example         # 로컬 환경변수 예시 (.env 는 커밋 금지)
├── README.md
├── AGENTS.md            # AI 에이전트 공통 지침
├── CLAUDE.md            # Claude Code 지침 (AGENTS.md 를 import)
└── GIT_CONVENTION.md
```

## 협업 규칙

브랜치/커밋/MR 규칙은 [GIT_CONVENTION.md](./GIT_CONVENTION.md)를 따릅니다.
