# docs

프로젝트 문서 색인입니다. 문서를 추가하면 아래 목록도 함께 갱신하세요.

| 문서 | 설명 |
|---|---|
| [diary-delete-persistence.md](./diary-delete-persistence.md) | 비회원 다이어리 실제 PostgreSQL 삭제·204·404·테스트 |
| [diary-update-persistence.md](./diary-update-persistence.md) | 비회원 다이어리 수정의 PostgreSQL 반영·부분 수정·테스트 |
| [diary-detail-persistence.md](./diary-detail-persistence.md) | 비회원 다이어리 상세의 PostgreSQL 조회·404·테스트 |
| [diary-list-persistence.md](./diary-list-persistence.md) | 비회원 다이어리 목록의 실제 PostgreSQL 조회·정렬·테스트 |
| [diary-create-persistence.md](./diary-create-persistence.md) | 비회원 다이어리 생성의 실제 PostgreSQL 저장·규격·스키마·테스트 |
| [local-postgresql.md](./local-postgresql.md) | 로컬 PostgreSQL 실행·Spring 연결·환경변수 안내 |
| [diary-api.md](./diary-api.md) | 58 비회원 다이어리 CRUD API 계약·실행 방법 |
| [GIT_CONVENTION.md](../GIT_CONVENTION.md) | DIO 브랜치·커밋·MR·리뷰·검증 기준 |
| [MR 기본 템플릿](../.gitlab/merge_request_templates/Default.md) | GitLab MR 생성 시 사용할 본문 양식 |
| [local-media-import.md](./local-media-import.md) | 67·68 이미지 가져오기·로컬 원본 저장 계약 및 검증 |
| [local-media-binding.md](./local-media-binding.md) | 69 로컬 미디어 조회·캔버스 연결 및 검증 |
| [local-media-recovery.md](./local-media-recovery.md) | 70 누락·손상·저장 실패 안내 및 표시 URL 수명 |
| [page-export-renderer.md](./page-export-renderer.md) | 71 전용 페이지 PNG 렌더러·미리보기·검증 |
| [page-image-renderer.md](./page-image-renderer.md) | 109 공통 이미지 생성 함수·전용 surface·취소·자원 수명 |
| [gif-first-frame-export.md](./gif-first-frame-export.md) | 73 GIF 첫 프레임 PNG 변환·원본 보존·검증 |
| [png-file-export.md](./png-file-export.md) | 74 PNG 파일 저장·진행·오류·재시도 계약 |
| [landscape-svg-templates.md](./landscape-svg-templates.md) | 114 가로형 SVG 속지·페이지 좌표·저장 호환·검증 |
| [region-png-export-contract.md](./region-png-export-contract.md) | 115 선택 영역 PNG 좌표·비율·출력·저장 계약 |
| [pdf-export-contract.md](./pdf-export-contract.md) | 108 PDF 범위·출력 규격·순차 생성·저장·실패 처리 계약 |
| [multi-page-pdf.md](./multi-page-pdf.md) | 110 PDF 페이지 선택·순차 조립·RGB·한도·취소 및 검증 |
| [pen-stroke.md](./pen-stroke.md) | 88·89 펜 획 입력·종류·굵기·색상 설정·저장 형식 및 검증 |
| [highlighter.md](./highlighter.md) | 90 형광펜 끝 모양·굵기·색상·반투명 렌더링 및 검증 |
| [text-editing.md](./text-editing.md) | 91 텍스트 생성·한글 입력·재편집 및 저장 계약 |
| [diary-library-storage.md](./diary-library-storage.md) | 121 다이어리 목록 로컬 저장·복원·편집 문서만 남은 다이어리 복구 |
| [mvp1-ui-spec.md](./mvp1-ui-spec.md) | MVP1 UI/UX 범위, 디자인 토큰, 화면·상호작용 명세 |
| [full-schema.mysql.sql](./full-schema.mysql.sql) | MySQL 8.4 기준 경량 DDL — 공유 다이어리, 캔버스, 미디어·GIF·오디오, 템플릿, AI 손글씨 폰트 포함 |
| [api.md](./api.md) | REST·WebSocket API 초안 — 인증, 다이어리, 미디어, 캔버스, 사용자별 undo/redo, 알림함 |
| [prototypes/dakku-mvp1-palette-applied.html](./prototypes/dakku-mvp1-palette-applied.html) | MVP1 팔레트·범위 적용본 인터랙티브 목업 |
| [export-menu-pdf-ui.md](./export-menu-pdf-ui.md) | 111 공유 메뉴·페이지 선택·PDF 생성 연결 및 검증 |
| [region-selection-ui.md](./region-selection-ui.md) | 116 내보내기 영역 드래그·이동·크기 조절 및 검증 |
| [region-presets-ui.md](./region-presets-ui.md) | 117 내보내기 영역 비율·출력 프리셋 및 검증 |
| (예정) requirements.md | 기능 요구사항 |
| (예정) api.md | API 명세 |
| (예정) erd.md | DB 설계 |

> 기획 PDF 등 원본 자료는 저장소에 올리지 않습니다 (Notion 등 외부에서 관리).
