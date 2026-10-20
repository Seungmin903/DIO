# DIO 프런트엔드

## 실행

```bash
pnpm install
pnpm start
```

Android 기기·에뮬레이터는 `pnpm android`, 웹은 `pnpm web`으로 실행한다.

## 빠르게 찾기

- 보관함·검색·다이어리 생성 화면: `src/diary/screens/`
- 다이어리 편집 화면: `src/editor/screens/EditorScreen.js`
- 편집기의 레이어·사진·스티커·자르기 UI: `src/editor/components/panels/`
- 이미지 선택·기기 저장: `src/editor/services/`

## 화면·기능 구조

`App.js`는 화면 전환과 다이어리 목록 상태만 관리한다. 화면을 구성하는 코드는 기능 폴더 안에서 찾는다.

```text
frontend/
├── App.js                         # 앱 진입점, 화면 전환·공통 상태
└── src/
    ├── assets/                    # 앱 번들에 포함되는 이미지·GIF·라이선스
    │   └── stickers/              # 기본 스티커 원본 파일
    ├── shared/                    # 모든 기능에서 재사용하는 기반 코드
    │   ├── layout.js               # 16:10 태블릿 프레임 계산
    │   └── theme.js                # 에디터 공통 색상·모서리·그림자 토큰
    ├── diary/                     # 다이어리 보관함(랜딩) 기능
    │   ├── screens/               # 한 파일 = 한 화면
    │   ├── components/            # 보관함 화면에서 함께 쓰는 UI
    │   ├── constants.js           # 표지 색상, 필터, 캐러셀 값
    │   └── styles.js               # 보관함 화면 스타일
    └── editor/                    # 다이어리 편집기 기능
        ├── screens/               # 편집기 전체 화면
        ├── components/
        │   ├── canvas/            # 페이지 위 오브젝트·선택·자르기 렌더링
        │   ├── chrome/            # 상단바·도구 리본
        │   ├── controls/          # 아이콘·슬라이더·저장 표시 등 작은 공통 조작 UI
        │   └── panels/            # 레이어·페이지·사진·자르기 등 열리고 닫히는 패널
        ├── assets/                # 기본 스티커 정의와 앱 번들 자산 연결
        ├── services/              # 기기 저장소·사진 선택·미디어 파일 처리
        ├── hooks/                 # 편집 상태와 제스처 훅
        ├── state/                 # 문서 기본값과 reducer
        ├── utils/                 # 좌표·도형·오브젝트 계산 같은 순수 함수
        └── constants.js           # 페이지 크기와 편집기 프리셋
```

## 화면별 위치

| 화면 | 시작 파일 | 함께 보는 폴더 |
| --- | --- | --- |
| 내 다이어리 / 캐러셀 / 그리드 | `diary/screens/LibraryScreen.js` | `diary/components/DiaryCard.js`, `Cover.js` |
| 기록 찾기 | `diary/screens/SearchScreen.js` | `diary/components/DiaryCard.js` |
| 새 다이어리 / 표지 수정 | `diary/screens/DiaryFormScreen.js` | `diary/components/Cover.js` |
| 다이어리 상세 | `diary/screens/DiaryDetailScreen.js` | `diary/components/Cover.js` |
| 휴지통 | `diary/screens/TrashScreen.js` | `diary/components/EmptyState.js` |
| 내 공간 | `diary/screens/ProfileScreen.js` | 없음 |
| 다이어리 편집 | `editor/screens/EditorScreen.js` | `editor/components/*` |

## 수정할 때 기준

- 화면의 배치나 문구를 바꾸면 해당 기능의 `screens/` 파일을 수정한다.
- 같은 기능의 두 화면 이상에서 반복되는 UI는 그 기능의 `components/`에 둔다.
- 캔버스 위 오브젝트 동작은 `editor/components/canvas/`에 둔다.
- 열고 닫는 편집기 UI는 `editor/components/panels/`에 둔다.
- AsyncStorage, 사진 권한·선택, 파일 저장은 `editor/services/`만 담당한다.
- reducer와 문서 데이터 구조는 `editor/state/`에서만 변경한다.
- 다른 기능에도 필요한 값은 `shared/`로 옮긴다. `shared/`는 `diary`, `editor`를 import하지 않는다.
