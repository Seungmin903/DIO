# A 경쟁 앱 배치 — 꾸미기 공방 · 내 공간 리디자인용 조사

조사일 2026-10-31. 기존 `03 레퍼런스 앱.md` 와 겹치는 감성 층위는 뺐고, 보관함 허브 배치, 만들기 진입점, 빈 상태, 프로필·설정 구조, 버튼 문법만 본다.

## 먼저 밝혀 둘 한계

- 검증 도구가 WebSearch/WebFetch뿐이라 실제 앱 화면을 눈으로 보지 못했다. 이미지 대신 스토어 설명, 공식 도움말, 릴리스 노트, 디자인 비평, screensdesign 요약 텍스트에 의존했다.
- Goodnotes 도움말, Canva 도움말, Apple Journal 리뷰(MacStories), Mobbin 은 403/404 로 열리지 않았다. 해당 항목은 열린 2차 자료에서만 가져왔다.
- 표기: **[확인]** = 인용한 URL 본문에 그 말이 있음. **[추정]** = 내가 자료에서 추론했거나 자료끼리 어긋남. 스크린샷 요약 사이트(screensdesign)는 "화면 설명 텍스트"이며 Pro 잠금 화면이 많아 일부만 반영됐다.
- 한국 다꾸 앱(하루노트, Planny 등)은 검색에서 UI 분석 자료를 찾지 못했다. 자꾸다꾸·오늘의스티커·My Fashion Diary 는 스토어 설명 수준만 확인했다. 실제 UX 를 보려면 앱을 직접 설치해야 한다.

---

## 1. 앱별 정리

### 1-1. Goodnotes (6)
- **보관함 허브**: 도구바의 별 모양 **Elements** 아이콘을 누르면 작은 팝업 패널이 뜬다. 패널 안에 컬렉션이 탭/그룹으로 나뉜다(Tasks, Flags, Icons, Images, 구입처 이름 폴더). [확인] https://www.wendaful.com/2021/05/goodnotes-app-elements-feature/ (Goodnotes 5 시절 글이라 현재 6와 다를 수 있음 [추정])
- **기본 제공 컬렉션**: 모든 사용자에게 Sticky Notes, Mind Map Shapes 등 무료 기본 컬렉션이 있고, 일상 스티커·텍스트 스탬프 컬렉션도 있다. [확인] https://www.goodnotes.com/blog/elements-stickers-sticky-notes
- **만들기 진입점이 둘**: ① 노트에서 올가미/이미지 도구로 고른 뒤 팝업의 "Add Element"로 컬렉션에 저장(자기 손글씨·그림이 곧 재료). ② 패널 컬렉션 목록 끝의 **+** 로 들어가 "Import from…"(Files, 한 장씩) 또는 "Add Photos"(여러 장 한꺼번에). [확인] 위 wendaful 링크, goodnotes 블로그 링크
- **여러 개체를 묶어 한 요소로 저장**하면 삽입 후 분리 가능. [확인] wendaful
- **분할 보기**: 패널 오른쪽 위 Split window 아이콘으로 요소 창과 페이지를 나란히 놓고 끌어 붙인다. [확인] wendaful
- **Marketplace**: 라이브러리 화면 오른쪽 위 쇼핑백 아이콘으로 진입. 구매한 스티커는 자동으로 Elements 컬렉션에 들어가고 "준비됐다"는 팝업이 뜬다. [확인] 검색 결과 요약이 인용한 Goodnotes 서포트/샵 페이지 https://www.goodnotes.com/shop/stickers (직접 열람은 못 함, 검색 요약 기준)
- **라이브러리 사이드바(iPad)**: Documents, Favorites, Shared, Marketplace 4항목, 아이콘+라벨 한 줄씩. 선택 항목만 하이라이트. [확인] https://ixd.prattsi.org/2026/02/design-critique-goodnotes-ipad-app-2/
- **설정 위치**: 라이브러리 계열 앱(Goodnotes/Notability 비평)에서 설정은 프로필 아래에 중첩. Notability 쪽 비평 근거 [확인] https://ixd.prattsi.org/2024/09/design-critique-notability-ipad-app-2/
- **스토어 설명**: "Add, create, or import stickers, stamps, washi tapes, images" 로 스티커·스탬프·마스킹테이프를 한 줄에 묶는다. [확인] https://apps.apple.com/us/app/goodnotes-6-ai-notes-docs/id1444383602
- DIO 시사점: 재료 종류를 탭으로 쪼개지 않고 "컬렉션(폴더) + 끝에 +" 한 문법이다. 만든 것이 자동으로 같은 서랍에 쌓이는 구조.

### 1-2. Notability
- 2025 개편: 라이브러리 사이드바에서 Recents, Favorites, Unfiled, Shared Notes 를 한데 묶어 공간을 줄이고, 전역 검색을 두고, Gallery 를 라이브러리 안에서 바로 열게 했다. 툴박스(테이프·자·레이저 포인터)는 화면 위에서 움직이는 플로팅. [확인] https://martechseries.com/mobile/in-app-marketing/notability-unveils-a-fresh-design/
- 이전 "Subjects/Dividers" 가 16.0 에서 Folders 로 자동 변환됨. 깊은 이중 구조를 단일 폴더로 평탄화. [확인] https://support.gingerlabs.com/hc/en-us/articles/5949216168474
- 비평: 홈은 이전에 만든 노트가 곧 라이브러리, "New" 버튼이 눈에 띄는 위치. Gallery 는 템플릿·테마 카드. 설정은 프로필 아래. [확인] https://ixd.prattsi.org/2024/09/design-critique-notability-ipad-app-2/
- DIO 시사점: 보관함 "분류"는 작은 고정 묶음(최근·즐겨찾기·미분류)으로 압축.

### 1-3. Zinnia (Pixite)
- 스토어에 "curated digital Studio"(저널·플래너·트래커·스티커·마스킹테이프·저널 카드·프레임)와 월별 신규·작가 컬렉션. 저장한 디자인의 개인 라이브러리는 v1.43 에서 **"Favorites"** 로 이름이 바뀜(= 저장함을 하트/즐겨찾기 어휘로). [확인] https://apps.apple.com/us/app/-/id1485310935
- 큰 화면에서 툴바를 끌어 옮길 수 있는 플로팅 툴바, 큰 투명도 슬라이더. [확인] 같은 링크
- 별점 4.6(약 5.7만 개 평가). iPad 호평/iPhone 아쉽다는 리뷰 존재. [확인] https://pixiteapps.com/apps/zinnia/ 및 검색 요약
- DIO 시사점: "내 보관함"을 라이브러리가 아니라 "즐겨찾기" 어휘로 부르는 선택지.

### 1-4. Collanote
- 25종 이상 펜·브러시, 150종 이상 색 종이 템플릿, AI로 설명을 써서 스티커 생성, 커뮤니티 룸·실시간 협업. [확인] https://updf.com/de/annotate-pdf/collanote/ 와 앱스토어 요약(검색 결과 인용)
- "내 스티커" 보관함의 화면 구조는 확인 못 함. [추정 불가]

### 1-5. Day One
- 2024-11: 상단 바 한 줄로 통합(왼쪽 저널 제목+햄버거, 오른쪽 검색+프로필 아바타). 아바타가 동기화 표시를 겸하고, 누르면 **전체 화면 모달**로 설정이 열린다. 뷰 탭은 상단(List/Calendar/Map/Media + Home). [확인] https://dayoneapp.com/blog/new-navigation-layout-2024-11/
- 2025.6(iOS): **Journals, More** 두 탭 신설. More 탭은 알림, On This Day, Daily Prompt(셔플 버튼), 사진 보관함에서 추가, Streaks 를 한 허브로 묶음. [확인] https://dayoneapp.com/releases/major-navigation-update-with-journals-more-tab/
- Settings > Journals 는 개인+공유 저널을 **한 목록**으로 통합, 핸들로 순서 변경, 행을 누르면 이름·설명·색·고급 설정. [확인] https://dayoneapp.com/?p=120063 (릴리스 노트, 검색 요약 기준)
- 새 항목 작성은 우하단 원형 + 버튼(FAB). 뷰 전환은 가운데 분절 메뉴 List/Calendar/Media/Map, 선택 항목은 흰 바탕+작은 막대. [확인] https://ixd.prattsi.org/2026/09/design-critique-day-one-iphone-app/
- 설정 화면은 "토글·쉐브론 행·하단 설명 글"의 그룹 리스트, 테마·글꼴·아이콘 선택기는 체크 표시로 현재 값 표시, 저널 삭제는 빨간 글씨+확인창. [확인] https://screensdesign.com/apps/day-one-journal-private-diary/?vs=315343
- DIO 시사점: "내 공간"에서 아바타를 누르면 설정 화면이 열리는 방식, 목록 한 줄=행 하나.

### 1-6. Apple Journal
- 메인은 날짜순 항목 목록(짧은 미리보기), 아래쪽 큰 **+** 하나가 새 항목. 오른쪽 위 필터 아이콘(세 줄)으로 사진 있는 것·음성·북마크만 보기. 항목 옆 점 세 개로 수정/삭제. 항목 화면 아래에 사진·음성·위치 아이콘 줄. [확인] https://www.popsci.com/diy/apple-journal-app/
- **앱 설정은 앱 안에 거의 없고 iOS 설정 앱에 있다**: 제안 켜기, 잠금(Face ID), 알림 시각. [확인] 같은 링크
- + 를 누르면 전체 화면 시트에 제안·성찰 질문·"빈 항목 시작" 버튼. [확인] https://www.guidingtech.com/use-journal-app-on-iphone/ (검색 요약)
- DIO 시사점: 내 공간의 설정 카드를 아예 줄이는 사례(설정을 시스템 쪽으로 밀기).

### 1-7. Journey
- iOS 2024-11: 하단 내비를 새로 다듬고, **새 항목 추가 버튼을 하단 내비 바 옆으로 분리**, 검색은 오른쪽 위에 고정, 클라우드 저장소 선택은 왼쪽 위 드롭다운, 스토리는 시차 캐러셀. [확인] https://blog.journey.cloud/journey-ios-november-24-update-new-interface-design/
- 2024-03: 클라우드 서비스 옵션을 "Profile" 시트로 옮겨 사용자 관련 설정과 모음. [확인] https://blog.journey.cloud/journey-ios-updates-march-2024-shared-web-links-odyssey-ai-refreshed-design/ (검색 요약)
- Android 설정 화면 개편: 둥근 색 아이콘 + 새 머리말 스타일. [확인] https://blog.journey.cloud/journey-android-november-2023-updates/ (검색 요약)

### 1-8. Moleskine Flow
- 컬렉션으로 아이디어를 정리, 무한 캔버스, 인터페이스 숨김, 펜·연필·마커·형광펜·붓·만년필 6종. 보관함 허브나 스티커 구조는 확인 못 함. [확인] https://www.macstories.net/reviews/moleskine-flow-review-an-elegant-accessible-digital-notebook-for-ipad-and-iphone/ (검색 요약)

### 1-9. daplit (스티커 저널·진)
- 컬렉션을 주제별(여행·카페·취미·일상) 카드로 두고 홈에서 **길게 눌러 순서 변경**, 날짜순 정렬 두 가지(찍은 날/추가한 날). v1.3.0 에서 **Mine / Ours** 두 공간으로 개인·공유 분리. 컬렉션당 25개 한도 보고(리뷰어). 스티커 세트는 의도적으로 소수(예: "Little Sparks"). [확인] https://apps.apple.com/app/6758196739
- DIO 시사점: 공유 다이어리인 DIO 의 "내 것 / 우리 것" 분리 어휘.

### 1-10. 자꾸다꾸 (한국, 디지털 문방구)
- 스토어 설명: 다이어리·플래너와 스티커를 고르는 **스토어**, 연필·크레용·펜, 스티커 오리기, 다이어리·메모 **폴더 분류+폴더 잠금**, 누구나 입점해 자기 스티커·다이어리를 판매 가능. 평점 표본 1개라 신뢰도 낮음. [확인] https://apps.apple.com/us/app/%EC%9E%90%EA%BE%B8%EB%8B%A4%EA%BE%B8-%EB%94%94%EC%A7%80%ED%84%B8-%EB%AC%B8%EB%B0%A9%EA%B5%AC-%EB%8B%A4%EC%9D%B4%EC%96%B4%EB%A6%AC-%EC%95%B1/id1604145147?l=ko (검색 요약 기준, 직접 열람 실패)
- 스티커 전용 보관함 구조는 확인 못 함.

### 1-11. My Fashion Diary (스티커 다이어리)
- 150종 이상 스티커, 코디 만들기, 데이터는 기기 저장+선택적 클라우드 백업, 프리미엄은 스티커·테마·동기화·광고 제거. [확인] https://apps.apple.com/us/app/%EB%A7%88%EC%9D%B4%ED%8C%A8%EC%85%98%EB%8B%A4%EC%9D%B4%EC%96%B4%EB%A6%AC-my-fashion-diary/id1521425844?l=ru

### 1-12. Picsart
- 스티커 만들기: + → 사진 선택 → Remove BG → Apply → Next → **Sticker 토글을 켜면 개인 스티커 보관함에 저장**, Free-to-Edit 토글로 공유 여부. 즉 "보관함 저장"이 별도 메뉴가 아닌 **저장 단계의 토글 한 줄**. [확인] https://picsart.com/blog/how-to-make-custom-stickers-free/
- 스티커 화면: 검색창 + 해시태그/태그 칩 + 다열 격자 + 하단 내비. 홈은 하단 **플로팅 만들기 버튼**. 프로필은 통계·팔로워·**스티커 캐러셀**·게시물 격자. 프로필 메뉴 모달에 상태·크레딧·저장공간. 설정은 그룹 리스트. [확인] https://screensdesign.com/apps/picsart-ai-video-photo-editor/?vs=290361
- 빈 상태 패턴(일러스트+짧은 설명+버튼 하나), 편집 도구바는 Cancel/Apply 쌍, 다단계는 Next/Continue. [확인] 같은 링크
- DIO 시사점: 프로필 안의 "내 스티커 캐러셀" = 내 공간에 공방 결과물을 보여 주는 고리. "사진 속 대상 오리기"의 끝을 "스티커로 저장" 토글로.

### 1-13. Canva (모바일)
- 하단 내비에 Tools, Uploads 등. 프로젝트 화면(Your Designs; 옛 이름 Projects)은 검색+필터 칩+최근 디자인과 폴더 격자/목록, 롱프레스/더보기에서 바텀시트, 삭제 시 Undo 토스트와 30일 휴지통. [확인] https://screensdesign.com/apps/canva-ai-photo-video-editor/, https://www.canva.com/help/navigate-canva-mobile-app/ (후자는 검색 요약 기준)
- Uploads 화면: 검색창 아래 **"Upload files" 버튼 + 썸네일 격자**, 선택하면 하단 플로팅 액션 바. 업로드 시트는 사진첩/카메라/파일 3택. [확인] screensdesign 링크
- Brand Kit 대시보드: 로고·색·글꼴 등을 **에셋 카드 격자**로, 색은 헥스 코드가 붙은 팔레트 + "테마 생성"/"직접 만들기". [확인] screensdesign 링크
- 프로필/설정: 맨 위에 계정 카드, 아래 세로 그룹 리스트(환경설정·구독·결제), 테마 선택은 시트(라이트/다크/시스템). [확인] screensdesign 링크
- 버튼: 기본 CTA 는 전체 폭 라벨 버튼(Continue, Get started, Done), 보조는 "Not now / Skip" 글자 버튼을 아래에 쌓음, 확인·삭제는 모달, 되돌리기는 토스트. [확인] screensdesign 링크
- Brand Kit 무료 제한: 색 3개 등은 2차 블로그 근거라 [추정]. https://brendacadman.com/how-to-set-up-your-canva-brand-kit/ (검색 요약 기준)
- DIO 시사점: "내 프리셋(색)" 은 Brand Kit 처럼 팔레트 한 줄로.

### 1-14. Instagram Edits
- 하단 5탭: Ideas, Inspiration, Projects, Create & edit, Insights. [확인] https://napoleoncat.com/blog/instagram-edits/ (다른 글은 Home/Camera/Projects/Inspiration 으로 4탭, 출처끼리 불일치 [추정])
- 스티커는 에디터에서 텍스트·오디오·자막·효과와 같은 **레이어 유형**. 오른쪽 위 Export. [확인] napoleoncat 링크
- 2025 가을 업데이트의 **"Kits"**: 색, 텍스트 스타일, 자막, 오디오를 저장해 재사용(= DIO "내 프리셋"과 같은 개념). 저장 색은 헥스 코드로. 앱스토어 What's New 로 확인. [확인] https://apps.apple.com/us/app/-/id6738967378, https://www.socialmediatoday.com/news/instagram-updates-edits-video-editing-app-fonts-sounds-media-kit/ (후자는 "Media Kit"=성과 PDF라 다른 기능)
- 홈은 폴더, 저장 텍스트 스타일도 별도로 존재(앱스토어 What's New). [확인] 같은 앱스토어 링크

### 1-15. CapCut / Lemon8 (약한 근거)
- CapCut: 하단 Templates 탭에 피드·카테고리·검색, 템플릿 기능은 모바일 전용. [확인] https://www.hooked.so/capcut-templates (2차). 보관함/내 에셋 구조는 확인 못 함.
- Lemon8: 프로필에서 **Share Profile**(QR·링크 복사·QR 저장), 저장함은 사용자가 만드는 컬렉션, 좋아요 숨김 토글. [확인] https://www.lindseygamble.com/blog/lemon8-introduces-new-share-profile-option 외 검색 요약. 편집기는 필터·스티커·글꼴·템플릿.

---

## 2. 반복되는 구조 비교

| 질문 | 관찰 | 근거 앱 |
|---|---|---|
| 허브 구조 | 탭이나 카드 7장이 아니라 **컬렉션/폴더 한 겹**. 종류별 세부는 그 안에서 | Goodnotes, Notability(Folders 평탄화), Canva |
| 정렬·분류 | 최근·즐겨찾기·미분류 같은 **고정 소수 묶음** + 사용자 폴더 | Notability, Zinnia(Favorites) |
| 만들기 진입점 | ① 목록 끝의 + ② 사용 중인 개체에서 "요소로 추가" ③ 저장 단계 토글 ④ 하단 플로팅 버튼 | Goodnotes ①②, Picsart ③④, Day One·Journey ④ |
| 빈 상태 | 일러스트(작게) + 한두 줄 + **버튼 하나** | Picsart(screensdesign) |
| 격자 | 검색창 + 칩 + 다열 정사각 격자, 선택 시 하단 액션 바 | Canva Uploads, Picsart 스티커 |
| 컨테이너 | 카드 대신 **분절 메뉴, 구분선, 그룹 리스트(한 겹)**. 카드는 요약 대시보드(Brand Kit)에만 | Day One, Canva |
| 프로필/설정 | 아바타 → 전체 화면 모달 / 맨 위 계정 카드 + 그룹 리스트 / 설정을 시스템으로 위임 | Day One, Canva, Apple Journal |
| 버튼 | 주 버튼은 전체 폭 라벨 버튼, 보조는 글자 버튼, 플로팅 원형 +, 편집은 Cancel/Apply 쌍 | Canva, Day One, Picsart |

버튼 모양(알약/스쿼클/고스트/틴티드) 의 정확한 반지름·크기 수치는 자료에서 확인하지 못했다. 위 표는 역할 위계만 확인된 것이다.

---

## 3. 꾸미기 공방·내 공간에 쓸 10가지 패턴

1. **컬렉션 한 겹 + 끝의 "+"** (Goodnotes). 5개 카드 대신, 스티커·표지·속지 모두 "서랍(컬렉션)" 한 문법으로 보이고 마지막 칸이 +. https://www.wendaful.com/2021/05/goodnotes-app-elements-feature/
2. **만든 것이 곧 재료**: 사용 중인 개체를 "요소로 추가"로 저장(Goodnotes). 공방에서 오리기·시트 분리 결과를 자동으로 같은 서랍에 쌓는다. https://www.goodnotes.com/blog/elements-stickers-sticky-notes
3. **저장 단계의 토글**로 보관함 등록(Picsart). 오리기 결과 화면에 "스티커 보관함에 저장" 스위치 한 줄. https://picsart.com/blog/how-to-make-custom-stickers-free/
4. **내 공간에 "내 스티커 캐러셀"**(Picsart 프로필). 공방 산출물을 프로필에 가로 한 줄로 노출. https://screensdesign.com/apps/picsart-ai-video-photo-editor/?vs=290361
5. **고정 소수 묶음 + 사용자 폴더**(Notability, Zinnia "Favorites"). 공방 상단에 최근/즐겨찾기만 칩으로. https://martechseries.com/mobile/in-app-marketing/notability-unveils-a-fresh-design/
6. **내 프리셋 = Kits/Brand Kit**: 색 팔레트를 헥스 점 한 줄로, 텍스트 스타일·펜 색을 같은 묶음에(Edits Kits, Canva Brand Kit). https://apps.apple.com/us/app/-/id6738967378, https://screensdesign.com/apps/canva-ai-photo-video-editor/
7. **프로필 아바타 → 전체 화면 설정 모달**(Day One), 개인+공유를 한 목록으로. 내 공간의 앱 정보·설정 카드 2장을 "설정" 한 곳으로 접는다. https://dayoneapp.com/blog/new-navigation-layout-2024-11/
8. **카드 대신 그룹 리스트 한 겹**(토글, 쉐브론 행, 하단 설명글, 체크로 현재 값 표시, 삭제는 빨간 글씨+확인) — 내 공간의 정보·설정. https://screensdesign.com/apps/day-one-journal-private-diary/?vs=315343 (단, 우리 "안내 멘트 금지" 규칙상 하단 설명글은 제외)
9. **분절 메뉴로 뷰 전환 + 선택 항목만 흰 바탕**(Day One List/Calendar/Media/Map). 공방 종류 전환을 카드 5장 대신 상단 분절 메뉴로. https://ixd.prattsi.org/2026/09/design-critique-day-one-iphone-app/
10. **빈 상태는 작은 그림 + 한 줄 + 버튼 하나**, 삭제는 Undo 토스트(Picsart, Canva). https://screensdesign.com/apps/picsart-ai-video-photo-editor/?vs=290361, https://screensdesign.com/apps/canva-ai-photo-video-editor/

번외: **Mine / Ours** 분리 어휘(daplit) — 공유 방 앱인 DIO 의 내 보관함 vs 방 공유 구분에 참고. https://apps.apple.com/app/6758196739

## 4. 주의할 점

- 위 앱 대부분이 **성숙한 도구 앱**이라 감성보다 구조 참고용이다. 10~20대 여성 다꾸 감성은 기존 문서의 ZEPETO·하루콩·MOODA 쪽이 더 가깝다.
- 반대로 **구조 면에서 의외로 카드를 안 쓴다**는 점이 공통이다: Day One 설정은 그룹 리스트, Goodnotes 사이드바는 아이콘+라벨 한 줄, Canva 프로필은 계정 카드 하나 + 리스트.
- 한국 다꾸 앱의 레이아웃은 이번에 근거를 못 찾았다. 자꾸다꾸·오늘의스티커·폴라리스 등은 설치 후 직접 캡처가 필요하다.
