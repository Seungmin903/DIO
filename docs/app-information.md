# 앱 정보와 문의

관련 Jira: [S15P31F106-161](https://ssafy.atlassian.net/browse/S15P31F106-161)

- 위치: 보관함 사이드 메뉴의 **내 공간 → 앱 정보**.
- **개인정보 처리방침**을 누르면 React Native `Linking.openURL`로 아래 문서를 외부 브라우저에 연다. 열기 실패 시 연결 상태를 확인하고 다시 시도하도록 안내한다.
  - https://docs.google.com/document/d/1JxZvkpKiEl7GXpVThQYxck0l_bwzg33FxGShE6rpqd0/edit?usp=sharing
- **문의 이메일**은 `dioapp.official@gmail.com`이며 텍스트 선택과 **복사** 버튼을 제공한다. 기존 의존성 `expo-clipboard`를 사용하고 복사 성공·실패를 화면에 안내한다. 이메일을 자동 전송하지 않는다.
- 저장 문서·저장 키·서버 API·의존성 선언 변경은 없고 마이그레이션도 필요하지 않다. 처리방침 원문은 앱에서 편집하지 않는다.

## 확인 기록

- 수정 JavaScript 2개 파일의 문법 해석과 Git 공백·충돌 표시를 확인했다. 오류 없음.
- 사용자 요청에 따라 테스트·웹/네이티브 빌드·앱 화면·실기기 조작은 수행하지 않는다.
- 미검증: Android/iOS/웹에서 외부 브라우저 열기, 문서의 비로그인 열람 권한, 연결 실패 안내, 이메일 선택·복사 및 실패 안내, 화면 크기별 배치. Google 문서의 공개 권한은 별도로 확인해야 한다.

## 콘텐츠 라이선스

- 앱 정보 하단의 **오픈소스 및 콘텐츠 라이선스** 버튼에서 앱 내부 전체 화면을 연다. 닫기 버튼과 Android 뒤로 가기로 닫는다.
- 현재 고지 대상은 Microsoft Fluent Emoji 64종(MIT)과 Google Noto Animated Emoji 36종(CC BY 4.0) 및 GIF 썸네일이다. 앱 전체 의존성 라이선스 목록을 완성한 것은 아니다.
- 제작자·콘텐츠 이름·라이선스·수정 내역·출처 링크·라이선스 링크를 표시한다. 전문은 함께 번들하는 JSON에서 읽어 오프라인에서도 펼쳐 볼 수 있다. 링크 열기에 실패하면 알림을 표시한다.
- `frontend/src/diary/data/contentLicenses.json`의 전문은 assets/stickers에 있는 원문을 복사한 것이며, 소재 변경 시 원문과 함께 갱신한다. 사용자 저장 데이터와 API는 변경하지 않는다.

### 콘텐츠 라이선스 확인 기록

- Expo 웹 export 성공. 인앱 브라우저에서 내 공간 → 앱 정보 → 라이선스 화면 열기, 두 종류의 전문 펼치기, 닫기·재진입 확인.
- 번들 JSON의 MIT·CC BY 4.0 전문이 기존 라이선스 파일과 일치함을 확인.
- Android/iOS 실기기, 시스템 뒤로 가기·안전 영역 및 외부 링크 열기/실패 경로는 미검증.

## 스티커 출처별 분류

- 기본 스티커 칩과 목록 제목을 Fluent Emoji(64종), Noto Animated Emoji(36종·GIF) 두 묶음으로 표시한다. 기존 주제별 분류는 보관함에 노출하지 않는다.
- asset ID·파일·스티커 이름과 각 출처 안의 순서를 유지한다. 즐겨찾기·최근·사용자 폴더·테이프·사진 기능은 변경하지 않는다. 검색은 기존 스티커 이름과 새 출처 이름에 적용한다.
- 기존 Noto 분류의 motion ID는 순서·숨김 설정 호환을 위해 유지한다. 합쳐진 Fluent 분류는 새 fluent-emoji ID를 사용하며 기존 주제별 순서·숨김은 합쳐진 분류에 승계하지 않는다. 저장된 설정을 삭제하거나 기존 문서의 asset 참조를 변경하지 않는다.

## Twemoji 추가

- Twemoji 14.0.2 정지 PNG 64종을 Twemoji 카테고리로 추가한다. 기존 100종의 ID·순서·출처 분류를 유지한다. 기본 소재 총 164종.
- 공식 twitter/twemoji v14.0.2의 assets/72x72 원본을 번들한다. 원본 바이트·파일별 URL·SHA-256·LICENSE-GRAPHICS·README를 보관하며 실행 중 CDN 요청은 없다.
- 라이선스 화면에 Twitter, Inc and other contributors, CC BY 4.0, 출처와 라이선스 링크, 원본 이미지 무변경, 전문을 추가한다. JS 라이브러리는 사용하지 않는다.
- 사진·GIF 등 기존 내보내기 규칙을 사용한다. 원본이 72px이므로 크게 확대하면 흐릴 수 있다.

### Twemoji 확인 기록

- 공식 원본 64종의 PNG 디코딩·72px 크기·SHA-256 확인, 전체 164개 asset 경로와 고유 ID 및 세 카테고리의 64/36/64 구성을 확인했다.
- 웹에서 Twemoji 목록, 캔버스 삽입과 실행 취소, 라이선스 정보·전문 펼치기를 확인했다. Android/iOS 실기기와 출력 파일 저장은 미검증.
