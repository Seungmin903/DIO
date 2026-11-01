# C 트렌드와 근거 (2025~2026 UI/UX, RN 구현 관점)

표기: **[확인]** = 원문을 열어 읽음 / **[2차]** = 검색 요약·2차 출처만 / **[추정]** = 조사자 해석.
기존 `04 원리와 트렌드.md`(Norman, peak-end, 틴트 그림자, 뉴모피즘 비추천 등)는 반복하지 않고, 거기 없는 화면 구조·버튼·플랫폼 근거만 다룬다.

## 1. 플랫폼 디자인 언어

### 1.1 Apple Liquid Glass (iOS/iPadOS 26)
- [확인] 컨트롤·툴바·내비게이션이 앱 콘텐츠 위의 **별도 레이어**로 재설계됨. 스크롤하면 탭 바가 줄어 콘텐츠에 집중, 올리면 다시 펼쳐짐. 컨트롤은 **묶음(grouping)** 으로 정리, 모서리는 기기 모서리와 **동심(concentric)**. https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- [2차] HIG 요지: 유리는 "떠 있는 기능 레이어"(내비·툴바·컨트롤)에만, 콘텐츠 레이어는 불투명 표준 소재. "sparingly". 툴바 배경·틴트 컨트롤을 줄이고 콘텐츠가 색을 정하게. 출처: https://developer.apple.com/design/human-interface-guidelines/materials (본문 못 읽음, 요약만), WWDC25 세션 284 https://developer.apple.com/videos/play/wwdc2025/284/
- [2차] SwiftUI 동심 모서리 API(`ConcentricRectangle`, iOS 26): https://developer.apple.com/documentation/swiftui/roundedrectangularshapecorners/concentric.md
- [확인] 비판: NN/g(Raluca Budiu, 2025.10) "Liquid Glass Is Cracked, and Usability Suffers in iOS 26" — 반투명 요소가 복잡한 배경 위에서 대비를 잃음, 글자 위 글자("illegible mess"), 탭 바 터치 영역이 좁아지고 빽빽함, 탭 바가 검색 시 접히는 등 레이아웃이 계속 바뀜, "Apple is prioritizing spectacle over usability". https://www.nngroup.com/articles/liquid-glass/ (페치 요약 기준; 일부 문장은 2차 인용 https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability)
- [2차] 투명도 줄이기·대비 높이기 접근성 설정으로 일부 완화: https://www.fastcompany.com (syndication fastcompanyme.com/?p=41660), https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/
- RN 구현: 진짜 유리(굴절)는 RN에서 불가. `expo-blur`는 iOS 정상, Android는 SDK 55+에서 stable이나 `BlurTargetView` 래핑 필요, Android 12(API 31) 미만은 RenderScript로 느림, 기본 `blurMethod`는 'none'(반투명 면만). https://docs.expo.dev/versions/latest/sdk/blur-view/ [확인]
- **DIO 시사점 [추정]**: 유리를 따라 하기보다 가져올 것은 (a) 컨트롤을 **묶음 하나의 알약/둥근 바**로 모으기, (b) **동심 모서리**(바깥 반지름 = 안쪽 반지름 + 여백), (c) 스크롤 시 줄어드는 헤더. 투명 패널은 불필요.

### 1.2 Google Material 3 Expressive (2025.05)
- [확인] 46개 연구·18,000명+ 참가. 전 연령에서 선호, **18~24세에서 최대 87%**. 활기·감성·장난·친근 점수 상승. 아이트래킹: 핵심 요소를 최대 4배 빠르게 발견(이메일 보내기 버튼), 45세 이상도 젊은 층과 같은 속도. https://design.google/library/expressive-material-design-google-research
- [확인] **자기 경고**: 패턴을 깨면 사용성 하락(자유 배치 앨범 아트 재생목록은 모던해 보였지만 사용성 낮음), **텍스트 라벨 제거 시 하락**, 강한 소수는 차분한 디자인 선호, "명확성을 감성으로 대체할 수 없다". 같은 URL.
- [2차] 구성요소: 5단계 버튼 크기(xs~xl), 눌림 시 반지름이 스프링으로 변하는 squish, 토글 시 둥근형↔각진형 모양 변형(morph), 연결형/간격형 **버튼 그룹**(눌린 버튼이 확장되고 이웃이 눌림). 공식 문서는 못 열었고 구현 패키지 설명 기준: https://pub.dev/documentation/m3e_buttons/latest , 연구 요약 https://www.dezeen.com/2025/05/28/google-ushers-in-age-of-expressive-interfaces-with-material-design-update/amp/
- RN 구현: 모양 변형은 Reanimated `withSpring`으로 `borderRadius`/`scale` 보간(가능, 가벼움). 진짜 path morph는 불필요(반지름 전환이면 충분) [추정].

### 1.3 Samsung One UI 8
- [2차] One UI 8 자체는 변화가 작고(One UI 7에서 대개편), 8.5 유출본에서 설정 화면 모서리 더 둥글고 간격 넓음, 알약 컨테이너, 스쿼클 버튼. 공식 확인 아님. https://www.sammobile.com/news/one-ui-8-samsung-reminder-app-new-design-leak/ , https://www.androidauthority.com/one-ui-8-5-hands-on-3601412/ — 갤럭시 탭 사용자(주 테스트 기기)에게는 "둥글고 넉넉한 간격"이 이미 익숙하다는 정도로만 활용.

## 2. 카드 수프를 대체하는 레이아웃

- [확인] NN/g 카드: 카드가 **돕는 경우** = 여러 종류의 콘텐츠를 섞어 보여주는 대시보드, 탐색(browse), 요약→상세 링크. **해치는 경우** = 검색·스캔(순위가 약해지고 공간 많이 먹음), 비교, **같은 종류 항목 반복(→ 리스트/그리드)**. 사진 앨범처럼 자기완결적이면 카드 불필요. "현대적으로 보이려고 리스트를 대체"하는 용도 경계. https://www.nngroup.com/articles/cards-component/
- [확인] NN/g 공통 영역(Common Region): 경계는 근접성보다 강한 묶음 신호. 그러나 "불안해서 넣은 테두리는 화면을 번잡하게" 하고, **전폭 블록은 '가짜 바닥'** 이 되어 스크롤을 멈추게 함. 컨테이너 넣기 전 "여백으로 되나?" 먼저. https://www.nngroup.com/articles/common-region/ , 근접성: https://www.nngroup.com/articles/gestalt-proximity/
- [2차] 컨테이너 과다의 정량 비용을 재 본 연구는 못 찾음(NN/g 인용 수치 "47%"는 벤더 블로그, 미검증이라 쓰지 말 것).
- **가로 선반(shelf/carousel)** [확인] NN/g: 사람들은 캐러셀을 자주 지나침, 특히 첫 장 이후. **다음 항목을 잘라 보여주기(peek/bleed)** 가 "더 있다"의 신호, 점 표시는 모바일에서 약함, 모바일에서 5장 이하 권장, 자동 넘김 금지, 중요 정보는 캐러셀 밖에도. https://www.nngroup.com/articles/designing-effective-carousels/ . 반론: Smashing(상품 이미지 캐러셀 2번째 장 상호작용 15.7%) https://www.smashingmagazine.com/2015/02/carousel-usage-exploration-on-mobile-e-commerce-websites . 가로 스와이프에선 F패턴이 안 맞는다는 2026 프리프린트 https://alphaxiv.org/abs/2604.21019v1 (비동료심사).
  - 공방 에셋(글꼴·스티커·표지·속지)은 **같은 종류가 많은 목록**이라 NN/g 기준으로는 큰 카드 반복이 아니라 **섹션 제목 + 가로 선반(마지막 항목 잘라 보이기) 또는 촘촘한 그리드**가 맞다 [추정].
- **벤토** [2차] 비정형 블록 배치. 모바일에선 "세로로 쌓이며 비대칭이 무너짐", 2023~24 과열로 진부화 우려, 모바일 엄밀 연구 없음(전부 에이전시 의견). https://www.freecodecamp.org/news/bento-grids-in-web-design/ , https://www.saasframe.io/blog/designing-bento-grids-that-actually-work-a-2026-practical-guide . 태블릿 가로에선 2열 비정형이 가능하나 **폰에선 1~2열 고정**으로 접어야 함 [추정].
- **인셋 그룹 리스트** [확인/2차] iOS 설정 앱 표준(UIKit iOS 13~, SwiftUI iOS 14~). 한 덩어리 둥근 면 안에 행 + 얇은 구분선 = **컨테이너 하나로 여러 항목**을 묶어 카드 수를 줄이는 정석. https://sarunw.com/tips/inset-grouped-in-swiftui/ . 안드로이드도 목록→상세 패턴 권장 https://developer.android.com/design/ui/mobile/guides/patterns/settings
- **히어로 + 레일**, **색 띠로 구역 구분(tinted section)**, **서랍/수납함 은유**: 웹 검색에서 근거 자료 못 찾음 → [추정] 전부 "컨테이너 대신 배경색·여백으로 구역을 나눈다"는 위 NN/g 원칙의 응용.

## 3. 버튼

- [확인] 터치 목표: Android 48dp, 간격 약 8dp, 시각 크기보다 터치 영역을 키워도 됨 https://support.google.com/accessibility/android/answer/7101858 . iOS 44×44pt는 HIG 버튼 페이지에 있으나 내가 연 페이지는 본문이 없어 [2차]: https://developer.apple.com/design/human-interface-guidelines/buttons . WCAG 2.2 2.5.8 AA는 최소 24×24 CSS px(+간격 예외), 44px는 AAA(2.5.5) — 44/48은 플랫폼 지침이지 WCAG AA가 아님. https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html [2차]
- [확인] WCAG 1.4.11: 컨트롤을 알아보는 데 필요한 시각 단서(테두리·면)는 인접색 대비 **3:1** 이상(비활성은 예외). https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html → 파스텔 위 연한 틴트 버튼은 면 대비 3:1이 안 나오는 경우가 많으니 **글자(4.5:1)·아이콘이 단서**가 되게 하고 면은 보조로 둘 것. (기존 문서의 border 1.39:1 부채와 연결.)
- **틴트/토널 버튼**: Material FilledTonal은 "채움과 윤곽 사이의 중간 강조" 공식 컴포넌트 https://developer.android.com/reference/kotlin/androidx/compose/material3/FilledTonalButton.composable [2차]. Apple도 tinted/filled/glass 3종 스타일. 주 CTA 1개만 채움, 나머지 토널로 위계를 만들면 버튼 많은 공방에서 시각 소음이 준다 [추정].
- **알약 vs 스쿼클**: 2025 트렌드 보고서는 못 찾음. M3E 5단계 크기 + 라운드/각진 모양 선택, Samsung 8.5 스쿼클 유출 정도가 신호. [추정] 알약은 칩·필터·단일 CTA, 스쿼클(큰 반지름 사각)은 그리드 타일·아이콘 버튼에 구분 사용.
- **클레이/촉각 3D 버튼**: 시장 추세를 뒷받침하는 자료 못 찾음(스톡 이미지 목록뿐). daisyUI 트렌드 페이지가 "부풀린 클레이 컴포넌트, 파스텔, 큰 반지름, 부드러운 입체 그림자"를 dopamine design 특징으로 서술 https://trends.daisyui.com/trend/dopamine-design/ [2차, 도구 벤더 페이지]. 뉴모피즘은 기존 문서에서 비추천.
- **눌림 애니메이션**: [2차] 관례값 `onPressIn` scale≈0.95 → `onPressOut` 1, `withSpring`(damping 10~15, stiffness 150~200). https://npmjs.com/package/react-native-pressable-scale (Android Modal 안에서 버그 보고 있음). M3E의 눌림 반지름 squish와 같은 결. 동작 줄이기 대응 필수(기존 문서 §5).
- **버튼 그룹**: Apple(컨트롤 묶음)과 M3E(연결형 그룹) 모두 "관련 버튼을 하나의 덩어리로". 공방의 [가져오기/만들기/정렬] 류를 흩어진 큰 버튼 대신 **세그먼트형 한 덩어리**로 묶는 근거 [추정].
- **FAB vs 인라인 만들기**: 직접 근거 못 찾음. [추정] 공방은 '만들기'가 섹션별(글꼴/스티커…)로 다르므로 화면 전역 FAB 하나보다 **각 선반 맨 앞에 점선 '+' 타일**이 맥락에 맞음.

## 4. 감성·귀여움 트렌드 (Z세대 여성, 국내외)

- [2차] **스크랩북/스티커 UI**: 스티커·테이프·도장·낙서를 겹쳐 '손으로 붙인' 느낌. 컷아웃에 두꺼운 흰 테두리를 둬 스티커처럼 읽히게. https://trends.daisyui.com/trend/scrapbook-sticker-ui/ , https://pixlr.com/blog/handmade-scrapbooked-and-dopamine-bright-the-design-trend-bringing-back-the-human-touch/ (모두 마케팅·도구 벤더, 사용량 데이터 없음). 손그림 UI(불완전한 선, 종이결, 손글씨): https://trends.daisyui.com/trend/hand-drawn-ui/
- [2차] 국내 맥락: 트렌드 코리아 2025 '토핑경제'(취향을 더하는 꾸미기), '별다꾸', 키링 거래액 +178%(29cm, 2024.10~2025.1; 단일 플랫폼 수치), 직접 만드는 스티커·AI 스티커 앱 등장, 'Sticker Sensation / Doodle Details'가 2025 그래픽 흐름. 검색 요약 출처: https://www.wkorea.com/?p=322802 , https://apps.apple.com/kr/app/id6639608927 . 인스타 스토리를 '전시 공간'으로 보는 해석은 마케팅 글(i-boss)이며 → 앱 결과물이 **공유하기 좋은 이미지**여야 한다는 정도만 [추정]으로 참고.
- [2차] **마스코트 UI**: Duolingo는 마스코트를 '친구'로 두고 피드백·모션의 정서 채널로 씀(TechCrunch https://techcrunch.com/?p=2145036 ), 다만 알림이 점점 공격적이 된다는 지적 — 수치(재방문 20% 등)는 미검증. Finch(Pratt 비평): 즐거움과 강한 가시성·피드백, 단 **시작이 압도적이고 점진적 공개 위반** https://ixd.prattsi.org/2025/09/design-critique-finch-ios-app-2/ . → 캐릭터는 **빈 상태·완료·헤더 한 곳**에 쓰고 도구 목록을 방해하지 않게.
- [2차] **도파민 디자인**: 대부분 인테리어 기사. UI에서는 대비 위험(파스텔 위 파스텔) 경고, "과학 이론이 아니라 유행 라벨"이라는 서술. UI 반발·백래시 자료는 못 찾음. https://www.techwyse.com/blog/website-design/web-design-trends-dopamine-design-2026 , https://trends.daisyui.com/trend/dopamine-design/
- 소프트 3D·그레인: 기존 문서 §2(질감 유효, 글자 뒤 금지)로 갈음. 추가 근거 못 찾음.
- **DIO 시사점 [추정]**: 감성은 컨테이너 모양이 아니라 **'붙은 것'(테이프·스티커·손글씨 라벨·캐릭터 도장)** 으로. 브랜드 색 제약상 색 폭주 불가 → 형태·질감·소품으로 귀여움.

## 5. 설정/프로필 페이지 모범

- [2차] 카테고리로 묶고 제목+구분선/여백, 현재 값을 목록에서 바로 보이게, 자주 쓰는 순, **로그아웃·계정 삭제는 맨 아래**(숨기면 다크 패턴), 상단 프로필 헤더가 진입점, 설명은 짧게. https://source.android.com/docs/core/settings/settings-guidelines , https://www.sap.com/design-system/fiori-design-android/v26-4/patterns/profile-and-settings/usage , https://uxcel.com/lessons/settings-best-practices-572 , https://developer.android.com/design/ui/mobile/guides/patterns/settings
- "설정을 톱니바퀴 뒤로 숨기기 / 프로필을 수집품 전시로" 에 대한 직접 근거는 못 찾음. [추정] 설정이 **하나뿐**이라면 따로 카드로 세우지 말고 인셋 그룹 리스트의 한 행(+앱 정보 행들)으로 합치고, 상단은 프로필 + 통계를 카드 없이 큰 숫자·캐릭터로 전시.

## 6. 근거가 없거나 약한 곳 (정직하게)
- Apple HIG 원문 일부(Materials, Buttons)는 페치가 본문을 못 줘 2차 요약에 의존. 44pt 수치는 Apple 지침으로 널리 알려져 있으나 이번에 원문으로 확인하지 못함.
- 토스 디자인 블로그의 카드·덜어내기 글은 못 찾음(요즘IT·디토데이 일반 글만).
- 벤토·캐러셀 모바일 정량 증거 약함, 클레이 버튼·알약 vs 스쿼클 트렌드 보고서 없음, 한국 10~20대 여성 대상 UI 선호 정량 자료 없음.
- 위 [추정] 항목은 설계 가설이지 검증된 결론이 아님 → 시안에서 확인 필요.
