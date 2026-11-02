# B 감성 앱 배치 — 다이어리 경쟁작이 아닌 감성 앱은 '내 물건 허브 · 프로필 · 설정'을 어떻게 짜나

조사일 2026-10-31. 범위: 꾸미기 공방(내 자산 보관함 + 만들기 도구)과 내 공간(프로필 · 통계 · 앱 정보 · 설정)에 옮길 수 있는 배치 · 버튼 문법.
기존 `03 레퍼런스 앱.md`, `04 원리와 트렌드.md`의 결론(감성은 4곳에 몰고 나머지는 절제, ZEPETO식 미리보기+격자, BeReal/Widgetable식 모아 보기, Day One식 흰 목록 설정)은 반복하지 않는다.

표기: **[확인]** = 아래 URL 본문에서 직접 읽음 / **[2차]** = 제3자 정리 · 역공학 자료 / **[추정]** = 내 해석.

## 0. 조사의 한계 (먼저 읽기)

- 도구가 요약형 웹 조회라 **스크린샷 자체는 못 봤다.** 화면 구성은 screensdesign.com의 화면 캡션, 공식 블로그 · 뉴스룸, 리뷰 글 텍스트에서 읽었다. 크기(px)나 색은 대부분 못 얻었다.
- **찾지 못한 것**: 오늘의집 · 당근 · 무신사 · 29CM · Kream 마이페이지 개편 글(검색 결과에 한국 앱 디자인 글이 거의 안 걸림), Lemon8 프로필, Widgetable 화면, Opal 보석 화면, Stoic/Rosebud 설정, Cosmos/Are.na 프로필, Apple Fitness 어워드 화면 실물, Calm. 이 앱들은 주장하지 않는다.
- 화면 수준 확인이 가장 많이 된 앱: Airbnb, Finch, Duolingo, Structured. 나머지는 부분 증거다.

## 1. 앱별 발견

### 1-1. Airbnb (2025 여름 개편) — '프로필 = 여권/이력', 3D는 캡슐 안에서
- **[확인]** 새 앱 탭에 'Profile'이 있고 "여행한 곳을 공유하고 만난 사람들을 본다"고 설명. 예시 프로필 캡션: "24 trips, 22 reviews, 8 years on Airbnb". 신원 인증 완료 사용자 2억 명 이상을 강조. https://news.airbnb.com/product-releases/airbnb-2025-summer-release/
- **[확인]** 앱 디자인 · UI · 3D · 일러스트를 사내 팀이 만들었고, 성격 키워드는 "Fun, alive, and simple", 모서리가 더 둥글고 부드러워짐, 아이콘을 2년에 걸쳐 쌓았음, 모션은 "subtle intensities". 프로필은 3D로 렌더한 폰 안에 위치 + 여행 수 · 후기 수 · 가입 연수 세 숫자. https://www.itsnicethat.com/articles/airbnb-app-redesign-140525
- **[확인]** 프로필 화면 구조(화면 캡션 기준): 맨 위 개인 정보 → 지난 여행 · 연결된 사람 **기능 카드 둘** → 호스팅 안내 카드 → 아이콘 달린 **세로 계정 설정 목록**(개인 정보, 로그인 및 보안, 개인정보 …) → 하단 탭. 지원 메뉴(도움말, 안전 문제, 피드백)는 별도 진입점. 빈 상태는 캐리어 일러스트 + "Book a trip" 버튼 하나. 관심사 선택은 **아이콘 칩 격자 + "3/20" 카운터 + 저장**. https://screensdesign.com/apps/airbnb/
- 시사점 **[추정]**: 통계는 카드가 아니라 **한 줄 세 숫자**. 설정은 프로필 아래쪽의 평범한 아이콘 목록으로 내려가 있고, 감성(3D · 일러스트)은 위쪽 정체성 영역과 빈 상태에만 있다.

### 1-2. Finch — 프로필 = 펫 + 수집 진행도, 설정은 별도 화면 안
- **[확인]** 프로필: 펫 정보 + 연속일 카드 + '마이크로펫' 컬렉션, 친구 코드(복사 토스트), 잠긴 아이템 격자, "Finchie Forest" 위치 진행 카드, 도감 'Micropedia 0/56 found' + Discovery 진행 구역. https://screensdesign.com/apps/finch-self-care-pet/
- **[확인]** 꾸미기: 펫 미리보기 + 카테고리 내비 + 의상 격자 + 색 선택 모달. 가방(inventory) 모달에 메일 · 의상 · 가구 **세 버튼**. 상점은 Outfit / Furniture 카테고리, Color / Travel은 비활성(곧 열림) 표시. (같은 페이지)
- **[확인]** 설정: 맨 위 프로필 카드(구독 표시) → **내비게이션 격자** → 커뮤니티 · 계정 목록. 하위 화면(프로필, 알림, 환경설정, 연속일, 내 데이터, 구독, 도움말, 정보)로 쪼갬. 설정 진입점은 캡션만으로는 불명. (같은 페이지)
- **[확인]** Pratt 비평: 홈이 "중앙 허브"인데 상점 · 여정 · 커뮤니티 · 업그레이드 유도가 한꺼번에 있어 복잡. 보조 옵션을 접는 메뉴로 옮기라고 제안. https://ixd.prattsi.org/2025/09/design-critique-finch-ios-app-2/
- 시사점 **[추정]**: '모은 개수 / 전체 개수'(0/56)와 비활성 카테고리 칩이 컬렉션 욕구를 만든다. 설정 메인에서 '격자 + 목록' 혼합으로 목록 길이를 줄인다.

### 1-3. Duolingo — 트로피 선반, 개인 기록, 물리적으로 눌리는 버튼
- **[확인]** 업적 개편: 예전엔 프로필에 "묻혀" 있던 배지를 한곳에 모아 "선반 위 트로피처럼" 쌓이게 함. 개인 기록 4종(Longest Streak, Daily Most XP, Perfect Lessons, Highest League) + 어워드. https://blog.duolingo.com/achievement-badges
- **[확인]** 화면 캡션: 업적 화면은 **맨 위 개인 기록 → 진행도 달린 어워드 배지 격자**, 얻은 것과 잠긴 것이 같은 격자에 보임. 월별 배지는 자물쇠 달린 동그란 자리 격자. 프로필은 통계 + 주간 진행 차트 + 연속일/XP 카드 + 친구 연속일 슬롯 + 친구 추가 버튼. 아바타 꾸미기는 중앙 미리보기 + 카테고리 탭(눈 · 머리 · 배경색) + 옵션 격자 + DONE. 설정은 계정 · 구독 · 지원 그룹 + **상단 Done 버튼**. https://screensdesign.com/apps/duolingo-language-lessons/
- **[2차]** 버튼 깊이: 면 #58cc02 + 아래 4px 짙은 테두리(#58a700), 반경 16px, 글자 17px 700 대문자. 눌리면 아래 테두리 0 + margin-top 4px로 면이 내려앉고 brightness 0.95, 전환 100ms. 역공학 CSS이며 공식 스펙 아님. https://blakecrosley.com/guides/design/duolingo
- **[2차]** 마스코트 표정 9종을 사용자 상태(연속일 유지=행복, 끊김 직전=울음, 오늘 아직=잠 등)에 매핑. 같은 출처.
- 시사점 **[추정]**: 같은 격자 안에 '가진 것/못 가진 것'을 함께 보여 주면 수집 동기가 생긴다. 두꺼운 아래 테두리 = 가장 값싼 '입체 버튼'.

### 1-4. Structured — 설정이 길어도 질서 있는 '그룹 목록 + 미리보기 카드'
- **[확인]** 설정: 상단 프로모션 배너 → 일반 · 연동 그룹. 맞춤 설정 화면은 **미리보기 카드 + 색 견본 + 팔레트 편집 버튼 + 레이아웃 옵션(Simplified/Minimal)**, 앱 아이콘은 테마 격자. 개인정보 화면은 **자물쇠 일러스트 + 약속 카드 3장**. 위험 동작(Reset App)은 고급 그룹 맨 아래 빨강. https://screensdesign.com/apps/structured-daily-planner/
- 시사점 **[추정]**: 설정도 '결과 미리보기 + 견본'으로 시작하면 설정 앱 같지 않다(조명 설정 → 책상 조명 미리보기).

### 1-5. Apple Journal — 통계는 세 구역, 숫자 요약이 입구
- **[확인]** Insights는 Journal 홈 상단의 연속일 · 글자 수 · 기록일 요약을 눌러 열고, **Streaks / Stats / Calendar** 세 구역. 기록한 날은 보라색 점. Current Streak 타일에 메뉴(일간/주간 전환, 알림, 공유). https://adityadarekar.substack.com/p/one-year-with-the-apple-journal-app , https://www.tapsmart.com/tips-and-tricks/insights-in-journal/?amp=1
- 시사점 **[추정]**: 통계는 홈에 얇은 한 줄로 두고, 누르면 달력 점으로 펼친다. 카드를 따로 만들 필요가 없다.

### 1-6. Bear — 테마가 앱 전체를 물들이고 설정은 사이드바 아이콘 뒤
- **[확인]** 테마가 사이드바 · 목록 · 에디터 배경, 글자색, 태그/링크 강조색까지 바꿈. 라이트/다크 합쳐 약 30개(Pro). 설정은 사이드바의 설정 아이콘 → General. 사이드바 오른쪽 스와이프로 설정 · 태그 · 휴지통 노출. https://blog.bear.app/2018/10/write-your-way-with-beautiful-themes-and-bear-pro/ , https://www.imore.com/bear-notes-iphone-ipad-and-mac-everything-you-need-know
- **[확인]** 한계: 사이드바가 라이트 테마에서도 어둡게 남는 불만. https://community.bear.app/t/sidebar-is-always-dark/18818

### 1-7. Pokémon GO / Pokémon Sleep — 메달 · 도감은 층(티어)과 목표 버튼
- **[2차]** GO: 메달이 프로필에 두 구역(일반 마일스톤 / 타입별 포획)으로 나뉘고 각각 티어순 정렬. 아바타는 프로필 화면에서 다시 꾸밈. https://breezewiki.discard.no/pokemongo/wiki/Medals , https://www.siliconera.com/latest-pokmon-go-update-lets-re-customize-avatar/
- **[확인]** Sleep: 수면 스타일 도감(졸림 · 쿨쿨 · 숙면 3종), 메인 메뉴에 도감 + 메인 화면에 '다음 목표까지' 버튼. 비평: 초반 메뉴가 정보 밀도 높음. https://nintendolife.com/features/hands-on-pokemon-sleep-open-beta-an-absolute-snoozefest (요약 기준), https://www.techradar.com/gaming/my-sleep-has-gotten-worse-since-playing-pokemon-sleep-but-i-still-wont-stop

### 1-8. Animal Crossing: Pocket Camp Complete — 옷장은 하단 메뉴 셔츠 탭, 설정은 More 안쪽
- **[확인]** 옷 = 하단 메뉴 셔츠 아이콘 탭, 외형 옵션은 More → Settings 안에 묻혀 찾기 어렵다는 가이드 평가. 커스텀 디자인은 연필+셔츠 아이콘. https://www.supercutekawaii.com/2025/03/animal-crossing-pocket-camp-custom-designs-guide/ (가이드 글 기준)
- 시사점 **[추정]**: 반면교사 — 자주 쓰는 외형 설정이 설정 깊은 곳에 있으면 찾기 어렵다. DIO 책상 조명은 이미 설정 카드에 있어 같은 문제가 없다.

### 1-9. Headspace — Journey로 흩어진 기능을 한 페이지 허브로, 알약 버튼
- **[확인]** 개편에서 'Your Journey'가 허브이며 새 기능을 한 페이지로 응축, 탭마다 기능 목적을 설명하는 툴팁을 흐름에 심음. https://goodux.appcues.com/blog/headspaces-redesign-is-a-beautiful-expansion-of-the-core-product
- **[2차]** 2024 리브랜드: 일러스트 규칙은 원 · 타원 기본형의 둥근 형태, 맞춤 서체의 곡선이 웃음 모양. 버튼은 알약(9999px) 파랑이라는 토큰 요약은 역공학 자료. https://designcompass.org/en/2024/04/30/headspace/ , https://www.shadcn.io/design/headspace
- 시사점 **[추정]**: '진행/모은 것'을 한곳에 응축한 허브 하나 + 나머지는 숨김.

### 1-10. Toss — 한 화면 한 그래픽, 요소 억제 (공식 개발자 가이드)
- **[확인]** 아이콘은 화면에서 24–40px, 아이콘 · 이모지를 둘 이상 나란히 쓰지 말 것, 화면에서 가장 중요한 그래픽 하나만 쓰고 나머지는 아이콘으로 대체, 의미 없는 일러스트 · 파티클 · 과한 그라디언트 금지, 3D 그래픽은 제공 모듈만, 중간 톤 색이 라이트/다크 모두에서 보이게. 문구는 해요체, 긍정형, CTA는 결과를 예측 가능하게, 대화상자 왼쪽은 "취소"가 아니라 "닫기". 탭바는 2~5개. https://developers-apps-in-toss.toss.im/landing-page/landing-page-en/design/consumer-ux-guide
- 마이페이지 · 전체 탭의 구체 배치는 **못 찾음**.

### 1-11. Spotify Wrapped 2024 — 통계의 감성은 '큰 글자 + 평면 색면 + 공유 전용 레이아웃'
- **[확인]** 제한된 고대비 색과 그라디언트, 글자는 항상 단색 면 위, 숫자를 키우고 복제해 패턴으로, 주제마다 애니메이션 인트로 → 단순 텍스트 화면 → 타 SNS용 별도 공유 레이아웃. https://alexjimenezdesign.substack.com/p/three-design-elements-that-made-spotify
- **[2차 비판]** UI가 화면마다 변화가 적다는 반론. https://uxdesign.cc/whats-happened-to-spotify-wrapped-cdfc32bf56a7

### 1-12. 그 밖의 부분 증거
- **Partiful** [확인]: 하단 탭 3개 — 홈(왼) / 새 초대(가운데) / 내 프로필(오른). 프로필 화면 자체는 못 봄. https://ixd.prattsi.org/2025/02/design-critique-partiful/
- **How We Feel** [확인]: 감정을 추상 기하 도형 + 색으로, 색 상한 = 에너지 · 쾌/불쾌, 진하기 = 강도. 트렌드는 Analyze 탭. https://medicine.yale.edu/news-article/the-how-we-feel-app-helping-emotions-work-for-us-not-against-us/
- **Retro** [확인]: 쓸수록 프로필이 '가장 기억할 만한 순간의 사진 일지'가 됨. https://techcrunch.com/2023/07/07/retro-is-a-deeply-personal-photo-journaling-app-for-close-friends/
- **Cosmos** [확인 약함]: 클러스터(컬렉션)가 조직 단위, 여러 클러스터에 동시 저장, 광고 없는 깔끔함. https://techradar.com/computing/websites-apps/this-app-is-like-pinterest-if-it-were-cooler-and-ad-free
- **Pinterest** [확인, 오래됨]: 보드 대표 이미지 = 가장 최근 핀 크게 + 아래 최근 4장(과거 버전). 2012 단일 이미지 방식은 불만. 컬렉션 표지를 내 핀 콜라주로 만드는 실험. https://www.socialmediatoday.com/news/pinterests-looking-to-give-profiles-a-fresh-look-with-new-cover-images-and/521274
- **Apple 활동 어워드** [확인]: 배지가 카테고리(링 닫기 · 한정판 · 운동 · 경쟁)로 묶이고, 피트니스+ 배지는 고유 모양으로 구분. https://www.idropnews.com/news/ios-16-introduces-activity-awards-for-fitness-workouts/191297/
- **Apple Games 앱 (iOS 26)** [확인]: 프로필은 오른쪽 위 아바타 탭 → 업적 · 친구. https://www.macrumors.com/guide/ios-26-games-app
- **Arc** [확인 약함]: Space마다 색이 달라 공간을 색으로 구분. https://blakecrosley.com/de/guides/design/arc (2차)
- **Things 3** [확인 약함]: Magic Plus(+) 버튼을 원하는 곳으로 옮길 수 있음, 시각 디자인이 핵심 판매점. https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/ . 2차 수치(체크 완료 약 500ms, 선택 시 강조색 20% 불투명, 거의 중립색)는 저자 예시 코드라 공식 아님: https://blakecrosley.com/guides/design/things

## 2. 두 화면에 옮길 수 있는 패턴 10개

| # | 패턴 | 근거 | 공방 / 내 공간 적용 | 등급 |
|---|---|---|---|---|
| 1 | **통계는 카드 대신 한 줄 세 숫자** ("24 trips · 22 reviews · 8 years") | Airbnb https://news.airbnb.com/product-releases/airbnb-2025-summer-release/ | 내 공간: "다이어리 6 · 즐겨찾기 0 · 함께한 N일"을 프로필 이름 바로 아래 한 줄로. 통계 카드 삭제 | 확인 |
| 2 | **프로필 아래 순서: 이력 기능 카드 2장 → 아이콘 달린 설정 목록**, 설정은 평범하게 | Airbnb https://screensdesign.com/apps/airbnb/ | 내 공간: 위 = 정체성(아바타 · 이름 · 한 줄 숫자), 아래 = 앱 정보 + 조명을 하나의 inset 목록 한 덩이로 합침(카드 4장 → 위 영역 + 목록 1) | 확인 |
| 3 | **'가진 것/못 가진 것'을 같은 격자에, 개수/전체** (Micropedia 0/56, 잠금 배지 격자) | Finch https://screensdesign.com/apps/finch-self-care-pet/ , Duolingo https://screensdesign.com/apps/duolingo-language-lessons/ | 공방 각 구역 제목 옆에 "스티커 12" "표지 3" 개수만, 빈 칸은 점선 슬롯 | 확인 |
| 4 | **트로피 선반 — 쌓이는 것을 한곳에 모아 선반처럼** | Duolingo https://blog.duolingo.com/achievement-badges | 공방 홈을 구역 카드 5장이 아니라 **선반 5단**(폰트 · 스티커 · 표지 · 속지 · 프리셋)으로: 각 단에 썸네일 3~5개가 가로로 놓이고 끝에 "더 보기". 제목은 선반 위 작은 글자 | 확인(선반 비유) + 추정(적용) |
| 5 | **만들기 도구는 '가방/도구함' 모달 하나의 버튼 세 개**로 접기 | Finch 가방 모달(메일 · 의상 · 가구) https://screensdesign.com/apps/finch-self-care-pet/ | 공방: 스티커 분리 · 사진 오려내기 · 폰트 만들기 도구를 각 구역 안 큰 제작 카드가 아니라 상단 "만들기" 버튼 하나(시트) 안으로 | 확인(구조) + 추정(적용) |
| 6 | **미리보기 + 견본 칩으로 시작하는 설정** (미리보기 카드 + 색 견본 + 옵션 둘) | Structured https://screensdesign.com/apps/structured-daily-planner/ , Duolingo 아바타 꾸미기 | 속지 기본 글꼴 · 색, 책상 조명: 글자 설명 대신 속지/책상 작은 미리보기 + 칩 | 확인 |
| 7 | **허브 한 페이지 + 내용은 위계로**: 위에 큰 개인화 요소, 아래 작은 목록 (Journey, Games 프로필) | Headspace https://goodux.appcues.com/blog/headspaces-redesign-is-a-beautiful-expansion-of-the-core-product , Apple Games https://www.macrumors.com/guide/ios-26-games-app | 내 공간: 프로필은 오른쪽 위 아바타에서 열려도 되고, 지금 탭이면 상단을 큰 정체성 영역으로 | 확인(약) |
| 8 | **눌리는 입체 버튼 = 아래 테두리 4px 짙은 색 + 눌리면 내려앉기**, 반경 16 | Duolingo(2차 역공학) https://blakecrosley.com/guides/design/duolingo | 로그인 · 만들기 같은 주 버튼 한두 개만. 나머지는 틴트 알약. 단 DIO UI 색 규칙(UI HUE 계열)에 맞춘 색 선택은 코덱스 | 2차 |
| 9 | **그래픽은 한 화면에 하나, 아이콘 24–40px, 의미 없는 장식 금지**; 문구는 해요체 · 긍정형 · "취소" 대신 "닫기" | Toss https://developers-apps-in-toss.toss.im/landing-page/landing-page-en/design/consumer-ux-guide | 두 화면 공통 가드레일: 구역마다 아이콘 타일을 다는 대신 화면당 일러스트 한 점(내 공간 = 모아 캐릭터 한 컷, 공방 = 도구 상자 한 점) | 확인 |
| 10 | **위험 · 내보내기는 목록 맨 아래 빨강 한 줄, 개인정보는 자물쇠 사물 + 약속 3칸** | Structured(Reset App, 자물쇠 + 카드 3장) https://screensdesign.com/apps/structured-daily-planner/ , Finch '내 데이터' https://screensdesign.com/apps/finch-self-care-pet/ | 내 공간: 개인정보 처리방침 · 연락처 · 라이선스를 맨 아래 조용한 목록으로 | 확인 |

보조 패턴(채택 보류): 테마가 앱 전체를 물들임(Bear) — DIO는 색 규칙이 엄격해 보류; 공간별 색 구분(Arc); 통계 시각물(Apple Journal 달력 점, How We Feel 도형)은 기존 문서의 '모아 보기'와 겹침; 큰 글자 + 평면 색면(Wrapped)은 앱 안이 아니라 공유용 이미지에만.

## 3. 버튼 모양 관찰 요약
- 깊이: Duolingo의 아래 테두리형이 가장 확실히 확인된 입체 방식(2차). Headspace는 알약 형태 토큰(2차). Things 3는 선택 상태를 강조색 20% 불투명 틴트로(저자 예시, 비공식).
- 형태 규칙: Airbnb는 "더 둥글고 부드럽게", Headspace는 원 · 타원 기본형. 공통적으로 반경이 커진다.
- 버튼 수: 감성 앱은 화면당 주 버튼 하나(Airbnb 빈 상태 'Book a trip', Duolingo 'DONE')가 일반적이고, 나머지는 목록 행과 아이콘.

## 4. 반례 · 주의
- Finch는 허브에 기능이 많아 비평에서 복잡하다는 지적. 선반에 구역을 많이 넣어도 '오늘 해야 할 한 가지'가 보여야 한다.
- Pocket Camp는 자주 쓰는 옵션을 설정 깊이 숨겨 불평. 조명은 눈에 띄게 두기.
- Pokémon Sleep은 초반 메뉴 밀도 비판. 선반 단을 5개로 고정하고 각 단 썸네일은 5개 이하로.
- Wrapped 비판: 화면마다 변화 없음 — 앱 안 상시 화면에는 쓰지 않음.
- 한국 앱(토스 · 오늘의집 · 당근 · 무신사) 마이페이지는 이번 도구로 구체 근거를 못 얻었다. 직접 앱 캡처나 별도 조사가 필요하다.
