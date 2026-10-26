# PDF 파일 저장·공유 연결 (112)

## 구현

- 생성 시 고정된 result.fileName·Blob/URI를 그대로 저장한다. 현재/개별 선택/전체 선택/범위의 접미사와 현지 시각은 기존 스냅샷 계약을 유지한다. 저장 재시도는 PDF를 다시 만들지 않는다.
- 웹 PNG/PDF 저장은 saveWebFile을 공유한다. picker는 첫 await 전에 호출한다. write와 close 완료 후만 saved, picker 취소는 cancelled, 다운로드 fallback은 download-started다. fallback URL은 생성 결과 URL과 독립적으로 만들고 60초 뒤 해제한다.
- PDF 결과 화면에 웹 PDF 파일 저장, 모바일 PDF 파일 저장·공유 버튼을 제공한다. 저장 중 중복 실행·닫기·페이지 다시 선택을 막는다. 오류/취소 후 유효한 PDF로 재시도한다. PNG 사진첩 저장은 유지한다.
- 모바일은 Expo SDK 호환 expo-sharing 57.0.23과 isAvailableAsync/shareAsync를 쓴다. application/pdf, com.adobe.pdf와 생성 파일명을 보존한다. 사진첩 권한/API를 호출하지 않는다. [Expo SDK 57 Sharing 문서](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/)와 설치된 모듈 소스를 확인했다.
- 공유 API의 일반 반환은 share-finished이며 최종 저장 성공으로 표시하지 않는다. “공유 창을 닫았어요. 선택한 앱에서 결과를 확인해 주세요”로 안내한다. 확인 가능한 AbortError만 cancelled로 구분한다. 공유 불가 시 웹 파일 저장을 안내한다.

## 임시 파일 수명

- 네이티브 생성 결과 파일과 공유 복사본은 별도 소유다. 생성 결과의 dispose는 기존 흐름대로 처리한다. 공유용 복사본은 cache/ dio-pdf-share-v1 / export-UUID 하위에만 만든다.
- 서명을 확인하고 복사가 완료된 뒤 공유한다. 복사 실패는 이 호출의 폴더만 제거한다. 원본 결과·문서·미디어는 삭제하지 않는다.
- 공유 중에는 해당 폴더를 활성 집합으로 보호한다. 공유 반환/예외 뒤 lease의 만료 시각을 현재+24시간으로 갱신한다. OS 소비 완료를 보장하지 않으므로 즉시 삭제하지 않는다.
- 앱 시작/다음 공유 때 만료된 비활성 폴더만 정리한다. 프로세스가 공유 도중 종료되면 최초 생성 시 기록한 24시간 lease로 다음 실행에서 처리한다. 읽을 수 없는 lease/정리 오류는 안전하게 건너뛴다. 파일 시스템 전체나 원본을 재귀 검색하지 않는다.
- 실제 강제 종료와 외부 앱의 파일 소비 시점은 실기기 미검증이다. Expo cache는 OS가 먼저 비울 수 있으므로 영구 보관소가 아니다.

## 검증·제한

- 전체 node 테스트 139개 통과. 새 테스트 6개는 picker 활성화·write/close 완료·취소/실패/재시도·독립 다운로드 URL, 공유 중 캐시 보호·24시간 만료·공유 불가/취소/예외, 네이티브 복사·서명·원본 보존·실패 정리를 확인한다. native I/O 및 공유 API는 mock이다.
- 웹 번들 및 Android 번들 생성 통과. iOS 빌드와 실제 Android/iPad/iPhone 실행은 수행하지 않았다. expo-sharing을 추가했으므로 개발 클라이언트 사용 시 해당 모듈을 포함해 다시 빌드해야 한다.
- pnpm qa:pdf 7개, 기존 pnpm qa:region 11개 통과. 세부 결과는 [PDF QA](./PDF%20내보내기%20QA.md) 참조.
- 앱 저장 스키마/서버 API 변경 없음. 별도 PDF 공유 캐시 lease만 신규다.
- 작업 브랜치 feature/fe/pdf-file-export에서 MR로 검토한다. 실제 공유 시트/사진 앱·파일 앱 결과/권한/메모리는 113번 진행 중으로 추적한다.
