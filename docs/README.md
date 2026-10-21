# docs

프로젝트 문서 색인입니다. 문서를 추가하면 아래 목록도 함께 갱신하세요.

| 문서 | 설명 |
|---|---|
| [ios-export-pixels.md](./ios-export-pixels.md) | 162 iOS 기기 배율 중복 보정·실제 PNG 픽셀 검증 및 재확인 항목 |
| [app-information.md](./app-information.md) | 내 공간의 개인정보 처리방침 링크·문의 이메일 복사와 미검증 범위 |
| [hand-pan.md](./hand-pan.md) | 159 손바닥 이동 좌표 누적·경계 공통화와 회귀 검증 |
| [qa-editor-integration.md](./qa-editor-integration.md) | 98 편집·저장 복원 통합 QA, 횟수·시간·미검증 환경 |
| [element-selection.md](./element-selection.md) | 94~97 요소 선택·이동·크기 조절·회전·Undo/Redo 검증 |
| [diary-delete-persistence.md](./diary-delete-persistence.md) | 비회원 다이어리 실제 PostgreSQL 삭제·204·404·테스트 |
| [diary-update-persistence.md](./diary-update-persistence.md) | 비회원 다이어리 수정의 PostgreSQL 반영·부분 수정·테스트 |
| [diary-detail-persistence.md](./diary-detail-persistence.md) | 비회원 다이어리 상세의 PostgreSQL 조회·404·테스트 |
| [diary-list-persistence.md](./diary-list-persistence.md) | 비회원 다이어리 목록의 실제 PostgreSQL 조회·정렬·테스트 |
| [diary-create-persistence.md](./diary-create-persistence.md) | 비회원 다이어리 생성의 실제 PostgreSQL 저장·규격·스키마·테스트 |
| [local-postgresql.md](./local-postgresql.md) | 로컬 PostgreSQL 실행·Spring 연결·환경변수 안내 |
| [diary-api.md](./diary-api.md) | 58 비회원 다이어리 CRUD API 계약·실행 방법 |
| [GIT_CONVENTION.md](../GIT_CONVENTION.md) | DIO 브랜치·커밋·MR·리뷰·검증 기준 |
| [MR 기본 템플릿](../.gitlab/merge_request_templates/Default.md) | GitLab MR 생성 시 사용할 본문 양식 |
| [mvp1-media-export-contract.md](./mvp1-media-export-contract.md) | 56 속지 기준 규격·로컬 미디어·공통 출력·오류·수명 및 API 연동 차이 |
| [local-media-import.md](./local-media-import.md) | 67·68 이미지 가져오기·로컬 원본 저장 계약 및 검증 |
| [local-media-binding.md](./local-media-binding.md) | 69 로컬 미디어 조회·캔버스 연결 및 검증 |
| [local-media-recovery.md](./local-media-recovery.md) | 70 누락·손상·저장 실패 안내 및 표시 URL 수명 |
| [page-export-renderer.md](./page-export-renderer.md) | 71 전용 페이지 PNG 렌더러·미리보기·검증 |
| [page-image-renderer.md](./page-image-renderer.md) | 109 공통 이미지 생성 함수·전용 surface·취소·자원 수명 |
| [gif-first-frame-export.md](./gif-first-frame-export.md) | 73 GIF 첫 프레임 PNG 변환·원본 보존·검증 |
| [png-file-export.md](./png-file-export.md) | 74 PNG 파일 저장·진행·오류·재시도 계약 |
| [diary-template-creation.md](./diary-template-creation.md) | 다이어리 생성 속지 포함 여부·양식·장수 선택과 저장 호환 |
| [landscape-svg-templates.md](./landscape-svg-templates.md) | 114 가로형 SVG 속지·페이지 좌표·저장 호환·검증 |
| [region-png-export-contract.md](./region-png-export-contract.md) | 115 선택 영역 PNG 좌표·비율·출력·저장 계약 |
| [pdf-export-contract.md](./pdf-export-contract.md) | 108 PDF 범위·출력 규격·순차 생성·저장·실패 처리 계약 |
| [multi-page-pdf.md](./multi-page-pdf.md) | 110 PDF 페이지 선택·순차 조립·RGB·한도·취소 및 검증 |
| [pen-stroke.md](./pen-stroke.md) | 88·89 펜 획 입력·종류·굵기·색상 설정·저장 형식 및 검증 |
| [highlighter.md](./highlighter.md) | 90 형광펜 끝 모양·굵기·색상·반투명 렌더링 및 검증 |
| [eraser.md](./eraser.md) | 135 지우개 획 전체 삭제·변형 좌표·이력·취소 및 검증 |
| [lasso-selection.md](./lasso-selection.md) | 네모·자유형 올가미 선택·추가·제외 및 사용자 확인 항목 |
| [text-editing.md](./text-editing.md) | 91 텍스트 생성·한글 입력·재편집 및 저장 계약 |
| [diary-library-storage.md](./diary-library-storage.md) | 121 다이어리 목록 로컬 저장·복원·편집 문서만 남은 다이어리 복구 |
| [qa-local-media-export.md](./qa-local-media-export.md) | 75 로컬 미디어 저장·복원·PNG 수치 검증 및 남은 항목 |
| [mvp1-ui-spec.md](./mvp1-ui-spec.md) | MVP1 UI/UX 범위, 디자인 토큰, 화면·상호작용 명세 |
| [full-schema.mysql.sql](./full-schema.mysql.sql) | MySQL 8.4 기준 경량 DDL — 공유 다이어리, 캔버스, 미디어·GIF·오디오, 템플릿, AI 손글씨 폰트 포함 |
| [api.md](./api.md) | REST·WebSocket API 초안 — 인증, 다이어리, 미디어, 캔버스, 사용자별 undo/redo, 알림함 |
| [prototypes/dakku-mvp1-palette-applied.html](./prototypes/dakku-mvp1-palette-applied.html) | MVP1 팔레트·범위 적용본 인터랙티브 목업 |
| [export-menu-pdf-ui.md](./export-menu-pdf-ui.md) | 111 공유 메뉴·페이지 선택·PDF 생성 연결 및 검증 |
| [region-selection-ui.md](./region-selection-ui.md) | 116 내보내기 영역 드래그·이동·크기 조절 및 검증 |
| [region-presets-ui.md](./region-presets-ui.md) | 117 내보내기 영역 비율·출력 프리셋 및 검증 |
| [region-png-export.md](./region-png-export.md) | 118 선택 영역 스냅샷·클리핑·PNG 생성·저장 연결 및 검증 |
| [region-png-qa.md](./region-png-qa.md) | 119 영역 PNG QA 재현 명령·픽셀·회귀·실기기 미검증 항목 |
| [pdf-file-save.md](./pdf-file-save.md) | 112 PDF 웹 저장·모바일 공유·24시간 캐시 및 검증 |
| [pdf-export-qa.md](./pdf-export-qa.md) | 113 PDF 면 구성·메타데이터·저장·취소 QA 및 실기기 미검증 |
| [export-content-and-resolution.md](./export-content-and-resolution.md) | 72 필기·부분 색상·폰트 준비와 122 표시본 대체 정책 및 QA |
| [tool-options-ui.md](./tool-options-ui.md) | 139 툴바 옵션 위치·헤더·표면 통일 및 검증 |
| [pen-input-conflict.md](./pen-input-conflict.md) | 145·160 필기 입력 충돌·끝점 보존·레이어 가상 목록 및 검증 범위 |
| (예정) requirements.md | 기능 요구사항 |
| (예정) api.md | API 명세 |
| (예정) erd.md | DB 설계 |

> 기획 PDF 등 원본 자료는 저장소에 올리지 않습니다 (Notion 등 외부에서 관리).
