# S15P31F106 · 공유 다이어리

하루에 사진 한 장을 올리면 그 사진이 캔버스가 되고, 친구들이 그 위에 글씨·그림·스티커를 얹어 함께 완성하는 공유 다이어리입니다.

## 사전 준비

| 도구 | 버전 |
|---|---|
| JDK | 17 (Gradle toolchain이 17을 사용합니다. 설치돼 있지 않으면 빌드가 실패합니다) |
| Node.js | 24 LTS 이상 (`frontend/.nvmrc`) |
| Docker Desktop | 최신 (로컬 MySQL 용) |

## 시작하기

```bash
git clone https://lab.ssafy.com/s15-final/S15P31F106.git
cd S15P31F106
git switch develop

# 1) 환경변수 (선택: 기본값을 바꿀 때만 수정)
cp .env.example .env

# 2) DB 실행 (Docker Desktop 켜둔 상태에서)
docker compose up -d

# 3) 백엔드 실행 → http://localhost:8080/api/health
cd backend
./gradlew bootRun          # Windows CMD/PowerShell: .\gradlew.bat bootRun

# 4) 프론트 실행 (새 터미널) → 웹은 http://localhost:8081
cd frontend
npm install
npm run web                # 태블릿/폰: npm start 후 Expo Go 앱으로 QR 스캔
```

- 프론트는 Expo(React Native) 앱이며, 16:10 가로형 태블릿을 기준으로 합니다. 웹 브라우저에서도 같은 코드가 동작합니다.
- 백엔드 연동은 아직 없습니다. 연동할 때 API 주소 설정 방식을 정해 이 문서에 추가하세요.
- IntelliJ에서는 `backend/` 폴더를 Gradle 프로젝트로 열고, Project SDK를 17로 지정하세요.
- 백엔드 테스트(`./gradlew test`)는 H2 인메모리 DB를 사용하므로 Docker 없이도 실행됩니다.

## 폴더 구조

```
S15P31F106/
├── backend/             # 백엔드 (Spring Boot 4.1, Java 17, Gradle)
├── frontend/            # 프론트엔드 (Expo · React Native, 웹 겸용)
├── docs/                # 요구사항/API/DB/팀 문서 (docs/README.md가 색인)
├── docker-compose.yml   # 로컬 개발용 MySQL
├── .env.example         # 로컬 환경변수 예시 (.env 는 커밋 금지)
├── README.md
├── AGENTS.md            # AI 에이전트 공통 지침
├── CLAUDE.md            # Claude Code 지침 (AGENTS.md 를 import)
└── GIT_CONVENTION.md
```

## 협업 규칙

브랜치/커밋/MR 규칙은 [GIT_CONVENTION.md](./GIT_CONVENTION.md)를 따릅니다.
