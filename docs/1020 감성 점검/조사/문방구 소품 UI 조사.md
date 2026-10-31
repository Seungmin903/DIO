# 문방구 소품 UI 악센트 리서치 (DIO)

## 0. 먼저 읽을 한계

- 총 34회 검색하고 12개 페이지를 직접 열었다. 검색 도구가 요약문만 돌려주는 경우가 많았다.
- **문방구 인덱스 탭의 mm 규격 표준은 찾지 못했다.** 제품 페이지 단편만 있고, 업계 표준 문서는 없다.
- Material 3 tabs 스펙 페이지와 Apple HIG 원문은 열리지 않았다.
- Goodnotes·Noteshelf·Zoomnotes의 탭 기하 수치는 공개 자료에서 못 찾았다.
- Chrome 탭 기하(반경·각도)도 Chromium 소스까지는 확인하지 못했다.
- 그래서 4장의 **수치는 대부분 "근거 있는 출발값"이며 확정 스펙이 아니다.** 각 수치 옆에 근거 또는 "제안"으로 표시했다.
- 검증 출처 없이 믿으면 안 되는 것도 표시했다. Inkbot의 tactile maximalism 글은 에이전시 마케팅 페이지다. 열어 보니 해당 내용이 없었고, 검색 요약에 있던 "grain·layered shadow·햅틱" 주장은 확인하지 못했다.

---

## 1. 핵심 결론

1. **탭의 연결 방식이 인덱스 탭 표현의 핵심이다.**
 - 선택된 탭은 패널과 같은 색을 쓴다. 탭 아래 테두리를 지우고 패널 윗선을 살짝 덮는다.
 - 이렇게 해야 "한 장의 종이에서 튀어나온 탭"으로 읽힌다.
 - CSS Secrets 갱신본이 이 방식이다. 선택 탭 배경을 패널과 같은 `#eee`로 하고, 탭을 `margin-bottom:-.08em`으로 패널 윗선 위로 내리며, `border-bottom:none`을 준다. (https://gist.github.com/csssecrets/1345dc9399dc8e794502 — "병합" 해석은 값에서 추정한 것)
2. **사다리꼴 vs 둥근 탭**
 - 브라우저 계열은 사다리꼴 탭을 오래 써 왔다. Chrome은 2008년부터 사다리꼴 탭을 썼고, 활성 탭은 곡선 모서리의 경사진 어깨 형태였다. (https://tech.slashdot.org/story/18/07/22/2140205/google-tests-curvy-chrome-tabs-with-material-design-overhaul)
 - 문방구 인덱스(스티커 탭·견출 탭)는 직사각 또는 모서리만 둥근 형태가 압도적으로 많다.
 - DIO에는 **윗모서리만 둥근 직사각 탭(문방구형)**을 기본으로 권한다. 사다리꼴은 어깨를 아주 약하게 줄 때만 쓴다.
3. **2024~2026 흐름은 "전부 사실적으로"가 아니라 "깊이는 핵심 순간에만"이다.**
 - Clay는 깊이를 아이콘·히어로·주요 버튼·빈 화면·온보딩에 쓰고, 도구줄·표·설정은 평면으로 두라고 한다. (https://clay.global/blog/skeuomorphism-ui)
 - 2025년 논문은 neo-skeuomorphism을 미묘한 어포던스와 깊이 + 깔끔한 현대 미감의 균형으로 요약한다. (https://rsisinternational.org/journals/ijriss/articles/revisiting-digital-interfaces-the-role-of-skeuomorphism-flat-design-and-neo-skeuomorphism-in-modern-ui/)
 - 반대로 같은 계열 리뷰는 "어포던스는 좋지만 시각 clutter와 인지 부하가 커진다"고도 쓴다. (https://ideas.repec.org/a/bcp/journl/v9y2025issue-4p216-230.html)
4. **제한된 팔레트(주색 1계열 + 버터노랑 1색)에서는 모양·질감·배치가 색을 대신한다.**
 - 단색 UI 자료의 공통점은 elevation·간격·굵기로 위계를 만들고, 그림자는 팔레트의 가장 어두운 색으로 틴트하라는 것이다. 순수 검정 그림자는 지저분해 보인다. (https://trends.daisyui.com/trend/monochrome-ui/, https://claudskills.com/skills/monochromatic-ui/SKILL.md, 둘 다 실무 의견 수준)
 - 저시력 사용자에게는 질감을 주 단서로 쓰지 말고 값(명도) 차이와 간격을 먼저 쓰라고 한다. 질감은 보조 단서다. (같은 daisyUI·Gravitee 계열 요약, https://gravitee.io/corpus/gen-27/go-artwork/texture-in-monochrome.html)
5. **한국 다꾸 시장은 이미 "텍스트·스티커·마스킹테이프·그리기" 4종 도구가 표준 어휘다.**
 - Hibi Calendar 리뷰가 이 4종을 꼽는다. 일력 한 장 + 찢어 넘기기 + 사진 컷아웃 스티커 + "와시 메이커"로 질감을 테이프로 만든다. (https://maily.so/whattheapp/posts/w6ovpndyok5)
 - 자꾸다꾸는 "디지털 문방구"를 표방한다. 250종 이상 손글씨 폰트와 500개 이상 작가 브랜드 스토어가 있다고 소개한다. (https://apps.apple.com/ma/app/%EC%9E%90%EA%BE%B8%EB%8B%A4%EA%BE%B8-%EB%94%94%EC%A7%80%ED%84%B8-%EB%AC%B8%EB%B0%A9%EA%B5%AC-%EB%8B%A4%EC%9D%B4%EC%96%B4%EB%A6%AC-%EC%95%B1/id1604145147?l=fr-FR)
 - 즉 소품이 콘텐츠(스티커·테이프)와 UI 악센트에 동시에 나오면 헷갈린다. **UI 악센트는 콘텐츠 소품과 구분되는 "정돈된 한 가지 어조"로 제한해야 한다.**
6. **RN 구현**
 - `react-native-svg` 필터 중 `FeColorMatrix`, `FeGaussianBlur`, `FeOffset`, `FeDropShadow` 등은 네이티브 지원 목록에 있고, **`FeTurbulence`는 그 목록에 없다.** (https://docsearch.algolia.com/mcp/docs/repo/software-mansion/react-native-svg — 2차 집계 페이지이므로 공식 README로 재확인 필요)
 - 종이 결(grain)은 실시간 필터 대신 **한 번 만든 작은 타일 PNG를 낮은 불투명도로 반복**하거나 아예 생략하는 쪽이 안전하다. (대안 자체는 검색 요약의 일반적 권고이며, 앱에서의 성능 수치는 확인하지 못했다.)

---

## 2. 인덱스 탭 사양 제안(수치)

### 2-1. 근거가 되는 사실

| 항목 | 사실 | 출처 |
|---|---|---|
| 실제 포스트잇 인덱스 탭 규격 | 25.4×38.1mm(중), 50.8×38.1mm(대), 11.9×43.1mm(소). 소형 필름 45×12mm, 종이 45×15mm, MUJI 35×15mm, 정사각 25×25mm | https://www.galaxus.at/en/s12/product/post-it-index-tabs-4320-x-2540-mm-sticky-notes-5630438 , https://muji.ca/products/sticky-page-marker-index-tab-thick-film-type-5-colour-set-35-x-15-mm-ndf65a3a , https://www.spk.com.cy/product/stickn-film-index-45x12mm-5x20-sheets , https://www.spk.com.cy/product/stick-n-paper-index-45x15mm-30sh-6pcspck-rainbow |
| 한 제품의 필름 두께 | PP 필름 0.0375mm. 투명 필름 탭은 글씨를 가리지 않는 것이 장점 | https://www.spk.com.cy/product/stickn-film-index-45x12mm-5x20-sheets |
| 바인더 칸막이 폭 | 확장형(Extra Wide) 칸막이는 A4 대비 240mm 폭이어서 탭이 시트 보호 포켓 밖으로 나온다 | https://localworks.doublet.com.au/product/marbig-36250-dividers-index-extra-wide-a4-colour-110-tab/8003266 |
| 삽입형 탭 폭 | 미국 Letter 5탭 세트에서 탭 폭 1.25인치(약 31.8mm), 칸막이 8.5×11인치 | https://www.ontimesupplies.com/bsn36692-insertable-tab-ring-binder-indexes-5-blank-tabs2-tab-width-85-divider-width-x-11-divider-length-letter-3-hole-punched-multicolor-tabs-5-set.html |
| 플라스틱 플래너 탭 | 한 제품 278×80×1mm (단일 제품, 표준 아님) | https://www.walmart.com/ip/17076818657 (요약상 표기) |
| 계단 배열(stagger) | 특허는 각 칸막이 탭을 같은 변의 서로 다른 위치에 두어 겹쳐도 모든 탭이 보이게 하는 구성으로 설명한다. 수치는 없음 | https://patents.google.com/patent/US8523234 , https://patents.google.com/patent/US11179961 |

### 2-2. CSS 구현 참고값

- **사다리꼴 탭 (Lea Verou / CSS Secrets 방식)**
- `::before` 박스에 `border-radius:.5em .5em 0 0`, `transform: scale(1.1,1.3) perspective(.5em) rotateX(5deg)`, `transform-origin: bottom`을 준다.
- 탭 링크는 `padding:.3em 1em 0`, `margin:0 -.3em`으로 이웃과 살짝 겹친다.
- 선택 탭은 `z-index:2`, 패널과 같은 배경, 아래 테두리 없음으로 처리한다.
- 콘텐츠 패널은 `border-radius:.15em`, `border:.1em solid rgba(0,0,0,.4)`.
- 출처: https://gist.github.com/csssecrets/1345dc9399dc8e794502
- 글 본문 (https://lea.verou.me/blog/2013/10/slanted-tabs-with-css-3d-transforms/) 에는 각도·perspective 값이 없고, `border-radius`를 더하면 탭처럼 보인다는 제안만 있다.
- **RN에서는 3D 변환이 아니라 SVG Path 또는 고정 Path로 대체해야 한다.**
- **Chrome 구형 사다리꼴 근사**
- `clip-path: polygon(5% 0%, 95% 0%, 100% 102%, 0% 102%)`. 102%는 1px 투명 선을 막기 위한 값이다. 탭 끝이 잘리고 탭끼리 겹치지 않는 한계가 있다고 한다. (https://forum.vivaldi.net/post/299257 외 Vivaldi 포럼)
- 이 폭 기준으로 어깨 경사는 가로 5%에 해당한다. 탭 높이 대비 경사각은 폭에 따라 달라지므로 DIO는 아래 제안 수치를 쓴다.
- **오목(inverted) 반경 모서리**
- CSS에는 기본 기능이 없고 radial-gradient 의사 요소나 별도 SVG로 만든다. (https://docs.automaticcss.com/borders-dividers/inverted-radius-framework)
- 이 오목 플레어가 "탭이 패널로 이어지는 모습"의 완성도를 좌우한다. SVG Path 한 개에 포함시키는 편이 RN에서 가장 단순하다.

### 2-3. 터치 타깃 한도 (탭 높이를 정하는 제약)

- Android 접근성 도움말은 터치 타깃 48×48dp 이상, 타깃 간 8dp 이상 간격을 권한다. 그리는 크기가 작아도 패딩으로 타깃을 확보하는 방식(32dp + 위아래 8dp)을 허용한다. (https://support.google.com/accessibility/android/answer/7101858 , https://developer.android.com/guide/topics/ui/accessibility/apps)
- WCAG 2.2 2.5.8(AA)은 포인터 타깃 24×24 CSS px 이상이며 간격·동등 컨트롤·인라인·UA·필수 예외가 있다. (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- 비텍스트 대비 3:1(WCAG 1.4.11)은 UI 구성요소의 인접색 대비에 적용된다. (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html 와 별개이며, 요약은 https://dequeuniversity.com/rules/axe/4.8/target-size 계열 2차 자료이므로 W3C 원문 재확인 권장)
- iOS 44pt는 2차 정리 자료에서만 확인했고 Apple 원문은 열리지 않았다. (https://smithery.ai/skills/ehmo/ios-design-guidelines)
- Material tabs의 48dp 높이는 Flutter 테스트값(TabBar 48.0)에서 간접 확인했다. M3 스펙 원문은 열리지 않았다. (https://api.flutter.dev/flutter/material/TabBar-class.html)

### 2-4. DIO 제안 사양 (확정 아님, 기기 실측 후 조정)

> 아래는 위 근거를 종합한 **제안값**이다. 색은 팔레트 규칙(주색 1계열 + #FEF0BF 하나)을 전제로 한다.

| 항목 | 태블릿 | 폰 | 근거 |
|---|---|---|---|
| 탭 시각 높이 | 40dp | 32dp | 포스트잇 소형 탭이 12~15mm 높이, 폭이 더 큰 장방형이라는 점 + 폰은 32dp에 위아래 8dp 패딩으로 48dp 타깃 확보 (Android 문서 방식) |
| 탭 터치 타깃 | 높이 48dp 이상 | 높이 48dp 이상 | Android 접근성 도움말 |
| 탭 최소 폭 | 72dp | 56dp | 라벨 2~4글자 기준 제안 |
| 탭 간 가로 간격 | -4dp(살짝 겹침) 또는 +4dp | +2dp | CSS Secrets의 `margin:0 -.3em` 겹침 방식. 터치 타깃이 겹치면 안 되므로 겹침은 **그림만** 겹치고 히트 영역은 분리 |
| 윗모서리 반경 | 10dp | 8dp | `.5em` 반경(약 8~10px) 근거, 패널 반경 `.15em`보다 크게 |
| 어깨 경사 | 0도(직사각) 기본 / 사다리꼴이면 안쪽 4~5% | 같음 | Vivaldi 근사 polygon 5%. 문방구형은 직사각이 기본 |
| 선택 탭 | 패널과 같은 면, 아래 선 없음, 패널 윗선 위로 1~2dp 덮음 | 같음 | CSS Secrets 병합 방식 |
| 비선택 탭 | 패널보다 한 단계 어두운 같은 계열 면, 높이 3dp 낮게(선택 탭이 약간 튀어나옴) | 2dp | 실물 칸막이가 선택 장에서 더 튀어나오는 모습. 제안 |
| 오목 플레어 | 선택 탭과 패널 사이 반경 6dp, 같은 SVG Path에 포함 | 5dp | Automatic CSS의 오목 반경 설명 + RN에서는 Path 하나로 처리하는 것이 안전 |
| 계단(stagger) | 여러 탭이 줄지어 있을 때 가로로 이어 붙여 같은 y를 쓴다 | 같음 | 계단식(수직 오프셋)은 문방구 바인더 방식이지만 좁은 화면에서는 가로 스크롤 탭이 낫다. 계단식은 "겹친 종이 더미" 장식(예: 카드 뒤 2장)에만 3~4dp 오프셋으로 사용 제안 |
| 그림자 | 선택 탭: 없음 또는 아래로 번지지 않는 1dp 윗선 / 비선택: 없음 | 같음 | 병합을 깨지 않기 위해. 그림자 색이 필요하면 팔레트 가장 어두운 색으로 틴트(daisyUI 가이드) |
| 텍스트 | 선택: 굵기 올림, 비선택: 보통 | 같음 | 색을 못 쓰므로 굵기로 위계 (monochromatic 가이드의 공통 조언) |
| 눌림 효과 | **없음** | **없음** | 프로젝트 메모리 규칙(눌림 효과 금지). Clay 글은 "눌려 보이면 눌려야 한다"고 하지만 DIO 규칙이 우선 |

**버터노랑(#FEF0BF)의 위치 제안:** 선택 탭 면을 노랑으로 하지 말고, **라벨 종이 부분(탭에 붙는 작은 라벨 스티커 직사각 또는 인덱스 라벨)**에만 쓰는 편이 낫다. 노랑 면에 주색 텍스트를 올리면 대비를 확보하기 쉽다. 이는 제안이며 대비는 실제 색 값으로 계산해야 한다.

### 2-5. 디지털 사례에서 얻은 것

- **Goodnotes**: 네이티브 탭/칸막이가 없어 사용자가 10년째 요청 중이다. 판매자들이 "클릭 가능한 탭이 있는 하이퍼링크 노트"를 만들어 판다. 즉 **사용자는 노트 오른쪽·위쪽 탭을 원하는 수요가 확인**되지만 공식 사양은 없다. (https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/39116767-tabs-and-section-dividers , https://jennylainedesigns.gumroad.com/l/goodnotes-space-digital-notebook)
- **Notability**: 칸막이(divider)-주제(subject)-노트 3단 계층. 주제에 색·아이콘을 줄 수 있다. 탭이 아니라 사이드바 구조다. (https://support.gingerlabs.com/hc/en-us/articles/5949216168474)
- **Noteshelf**: 모든 노트가 노트북, 섹션 계층 없음 — 탭 모델은 아님. (https://www.laptopmag.com/reviews/apps/noteshelf)
- **Whimsical**: 폴더를 탭 레이아웃으로 전환해 라벨을 훑어보게 한다. 탭 드래그로 순서 변경·이름 변경·추가를 지원한다. 시각 수치 없음. (https://whimsical.com/product-updates/tabbed-folders)
- **Design Systems Surf**: 탭이 물리적 파일 폴더에서 영감을 받았다고 설명. (https://designsystems.surf/components/tabs)
- 확인 못함: Zoomnotes 탭 UI, Dribbble 폴더 탭 시안의 구체 수치 (Dribbble 컬렉션 페이지들은 일반 탭 모음이었다).

---

## 3. 문방구 소품 → UI 요소 대응표

> 형태 규칙은 위 근거 + 제안이다. "참고 URL"은 해당 형태 구현·사례를 뒷받침하는 자료다. 모든 소품은 **주색 1계열 + #FEF0BF 한 색**으로만 표현한다는 전제.

| 소품 | UI 자리 | 형태 규칙 | 참고 URL |
|---|---|---|---|
| 인덱스 탭(칸막이) | 섹션/탭 전환 (책상·다이어리·보관함 등) | 윗모서리만 둥근 직사각, 선택 탭은 패널과 같은 면으로 병합, 비선택은 한 단계 어두운 면. 2장 수치 참조 | https://gist.github.com/csssecrets/1345dc9399dc8e794502 |
| 포스트잇 인덱스 필름 탭 | 페이지 책갈피, 읽지 않은 항목 표시 | 12~15mm 높이의 작은 장방형(약 3:1), 반투명 느낌은 불투명도 70~85%의 같은 계열 | https://www.spk.com.cy/product/stickn-film-index-45x12mm-5x20-sheets |
| 마스킹테이프 | 섹션 헤더 장식, 카드/사진 고정 표시 | 폭 15mm 규격이 흔함(길이 5~10m). 양끝 지그재그 또는 살짝 기울인 절단선, 반투명 + 단순 줄무늬. 한 화면에 1~2개만 | https://shop.mochithings.com/products/160024 , https://freefrontend.com/css-paper-effects/page/2/ |
| 견출지/라벨 스티커 | 섹션 제목, 칩/태그 | 모서리 반경 작은 장방형, 노랑 면 + 주색 글씨, 그림자 없음 | (일반 section header 가이드) https://ui.hotfix.jobs/docs/components/section-label |
| 포스트잇/메모지 | 카드, 빈 상태, 메모 입력 | 한 변 모서리만 약간 접힌 사각, 아주 약한 2~3도 기울임은 장식 카드 한 장에만 | https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/ (Journal 앱의 카드 + 부드러운 배경) |
| 영수증/티켓 | 토스트, 저장 완료, 공유 카드 | 위아래 톱니 또는 양옆 반원 노치. RN에서는 SVG Path 또는 `react-native-svg` 마스크로 구현, 고정 반경 약 10px | https://ishadeed.com/article/football-ticket-css-svg/ , https://freefrontend.com/css-tickets/ |
| 펀칭 구멍/바인더 링 | 카드 왼쪽 가장자리, 목록 구분선 | 지름 8~10dp의 원, 일정 간격 | https://clay.global/blog/skeuomorphism-ui (장식 과잉 주의: 달력의 장식 스티칭이 예) |
| 점선/절취선(perforation) | 구분선, 섹션 경계 | 점선 1dp, 한쪽 끝에 가위 아이콘은 쓰지 않는다(기능 없음) | https://freefrontend.com/css-tickets/page/2/ |
| 도장/스탬프 | 뱃지, 완료 표시, 스트릭/컬렉션 | 원형 또는 모서리 둥근 사각 테두리 + 안쪽 단색, 약간 눌린 불균일 가장자리는 SVG Path로 | https://gamificationnation.com/blog/gamification-mechanic-monday-collecting/ , https://21st.dev/community/components/s/award-badge.md |
| 스티커(컷아웃) | 버튼, 칩 | 흰 테두리 대신 같은 계열 밝은 테두리 2~3dp 외곽. 콘텐츠 스티커와 구분되도록 UI에서는 평면으로 | https://maily.so/whattheapp/posts/w6ovpndyok5 |
| 클립/집게 | 토글, 첨부 표시 | 상단에 걸린 작은 SVG 클립 아이콘. **토글 용도는 비추천**(상태 인지 어려움). 첨부·고정 표시용 | https://clay.global/blog/skeuomorphism-ui (메타포 현재성 점검) |
| 스테이플러 심 | 카드 두 장 묶음 표시 | 작은 가로 막대 한 개. 표시 전용 | 제안 |
| 고무줄 밴드 | 다중 선택/묶음 | 얇은 곡선 한 줄. 표시 전용 | 제안 |
| 투명 OPP 봉투 | 스티커·부속품 보관함 | 반투명 면 + 윗변 접착 띠 | 제안 |
| 하드보드/크라프트 | 앱 배경 | 같은 계열의 낮은 채도 면 + 아주 약한 타일 grain | https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/ (종이 질감 원리) |
| 지우개 | 삭제/실행취소 | 모서리 둥근 직사각 아이콘 | 제안 |
| 반창고 스티커 | 오류/수정 표시 | 가운데 패드 + 양쪽 접착부. 사용 빈도 낮으면 생략 | 제안 |

**참고: 앱 사례에서 확인한 대응**
- Hibi Calendar: 한 장 달력을 찢어 넘기기(종이 메타포), 월 보기는 "꾸민 날이 작은 앨범 카드처럼" 나타난다. (https://maily.so/whattheapp/posts/w6ovpndyok5)
- Apple Journal: 카드가 부드러운 배경 위에 놓인다는 평가. (https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/)
- Duolingo: 버튼에 어두운 하단 가장자리로 "눌림 가능"을 표현. (https://clay.global/blog/skeuomorphism-ui) — **DIO는 눌림 효과 금지 규칙이 있으므로 정적 하단 가장자리까지만 차용 가능 여부를 팀이 판단.**

---

## 4. 과하면 망하는 지점

1. **장식을 위한 장식**
 - Clay는 "달력의 장식 스티칭"을 기능 없는 장식 사례로 든다.
 - 질감은 전달하는 정보가 없으면 뺀다. (https://clay.global/blog/skeuomorphism-ui)
2. **밀도 높은 화면에 질감**
 - 도구줄·표·설정은 평면을 유지하고, 깊이는 아이콘·히어로·주요 버튼·빈 화면·온보딩에만 쓴다. (https://clay.global/blog/skeuomorphism-ui)
 - 아트박스 매장이 "빽빽한 진열"로 파는 것은 물건이지 화면이 아니다. (https://www.koreajoongangdaily.com/business/not-your-grandmas-stationery-shop-artboxs-cute-products-corner-market-with-tourists-young-people/10937173)
3. **낮은 대비의 부드러운 깊이**
 - Clay: 뉴모피즘은 목업에선 좋아 보였지만 실제 WCAG 검사에서 자주 실패했다. 고전적 스큐어모프 요소는 대비가 강한 편이라 위험은 "옅은 깊이 단서"에서 생긴다.
 - Apple Liquid Glass도 가독성 불만 때문에 frosted 변형과 투명도 줄이기 옵션을 안내했다. (https://clay.global/blog/skeuomorphism-ui)
 - 단색 팔레트에서는 면 간 대비가 이미 낮기 쉽다. 값 차이를 우선하고 질감은 보조로. (https://trends.daisyui.com/trend/monochrome-ui/ 계열 요약)
4. **정적 컨테이너가 버튼처럼 보임**
 - 뉴모피즘은 정적 컨테이너까지 버튼처럼 보이게 해 클릭 가능성 신호를 희석시켰다는 비판. (https://blog.simone.computer/is-skeumorphism-back)
 - 문방구 소품(탭·라벨)을 카드에도 쓰면 어떤 것이 누르는 것인지 흐려진다. **눌리는 것에만 탭/라벨 어휘를 쓴다.**
5. **터치 타깃 축소**
 - 작은 클립·심·인덱스 필름 탭은 시각이 작다. 시각 12~15mm급 탭을 그대로 쓰면 48dp 타깃에 못 미친다. 패딩으로 타깃을 확보하고 이웃 타깃과 8dp 이상 간격. (https://support.google.com/accessibility/android/answer/7101858)
6. **성능**
 - 무거운 렌더링·필터는 저사양에서 지연을 만든다. Clay는 CSS 그라디언트·SVG 노이즈를 비트맵 질감보다 권하고, 중간급 기기에서 테스트하라고 한다. (https://clay.global/blog/skeuomorphism-ui)
 - 단 RN에서는 `FeTurbulence`가 지원 목록에 없다. 작은 타일 이미지 1장을 반복하는 방식이 현실적이다.
7. **물리 법칙 불일치**
 - 눌려 보이는데 안 눌리거나, 비슷한 모양인데 동작이 다르면 사용자가 모델을 다시 짜야 한다. (https://clay.global/blog/skeuomorphism-ui) — DIO는 눌림 효과를 쓰지 않으므로 **눌려 보이는 입체감(두꺼운 하단 가장자리, 안쪽 그림자)은 쓰지 않는 쪽이 일관된다.**
8. **키치와 "유행 노후화"**
 - 소재 기반 룩은 빨리 낡는다. 아트박스처럼 상품 회전이 빠른 곳은 가능하나 앱 UI는 오래 쓴다. (https://clay.global/blog/skeuomorphism-ui , 아트박스 기사)
 - "tactile maximalism"은 정의가 느슨한 블로그 용어다. 인용할 만한 단일 기준이 없다. (예: https://digitalsynopsis.com/design/web-design-trends-2025/)
9. **콘텐츠 소품과 UI 소품 충돌**
 - 다꾸에서는 사용자가 스티커·테이프로 꾸민다. UI가 같은 소품으로 장식되면 사용자 작품과 앱 크롬이 섞인다. UI 소품은 **한 단계 정돈된 평면 + 단색**, 콘텐츠 소품은 **화려함**으로 역할을 나눈다. (제안)
10. **연령 선호 차이**
  - 일부 연구는 젊은 층은 스큐어모프 미니멀을, 노년·어린이는 스큐어모프 아이콘을 선호한다고 보고한다. 대상 연령에 따라 효과가 다르다. (https://sci.nu.ac.th/sciencejournal/index.php/sci/article/download/ID515/pdf , https://www.flatisbad.com/publications/Zhang-PPMT16.pdf)
11. **문구 규칙**
  - 프로젝트 메모리에 "안내 멘트 금지" 규칙이 있다. 영수증 토스트에 "~에 저장됐어요 / 두 번 누르면…" 같은 사용법 문구를 넣지 않는다.

---

## 5. 제한된 팔레트에서 세련되게 적용하는 법

- **색을 못 쓰니 모양·간격·굵기로 위계**: 선택 탭은 굵은 글씨 + 병합된 면, 비선택은 보통 글씨 + 어두운 면. (monochromatic 자료 공통, https://trends.daisyui.com/trend/monochrome-ui/)
- **그림자는 주색 계열 최암색으로 틴트**: 검정 그림자는 단색 팔레트에서 지저분해 보인다. (https://claudskills.com/skills/monochromatic-ui/SKILL.md)
- **노랑은 "표지판" 하나에만**: 라벨/인덱스 라벨, 도장 하나. 한 화면에서 노랑이 두 군데 이상이면 위계가 흐려진다. (제안)
- **질감은 3종만**: (1) 종이 결 타일(전체 배경, 불투명도 3~6%), (2) 지그재그/톱니 절단 가장자리(테이프·티켓), (3) 점선 절취선. 이 셋 밖은 쓰지 않는다. (제안, 근거: Clay의 "전달 정보 없는 질감은 삭제")
- **RN 구현 팁**
- 탭·티켓·테이프는 **SVG Path 한 개**로 그린다. 오목 플레어·노치·지그재그를 같은 Path에 넣으면 이음새 문제가 없다. (노치 반경은 Shadeed 사례처럼 고정 px로 두고 폭에 따라 Path를 재계산. https://ishadeed.com/article/football-ticket-css-svg/ — 이 사례는 상대 좌표 Path에서는 고정 크기 원을 만들 수 없고 ResizeObserver로 `d`를 다시 쓴다고 설명한다. RN에서는 `onLayout`으로 같은 방식 적용 가능, 제안)
- 그림자는 `box-shadow` 대신 레이어 분리: Shadeed 사례에서 clip-path와 box-shadow가 충돌해 wrapper에 `filter: drop-shadow()`로 옮겼다. RN은 `shadow*`/`elevation`이 클립 영역 밖에서 잘릴 수 있으니 **그림자용 Path를 한 장 더 겹치는 방식**을 권한다(제안, 기기 확인 필요).
- 지그재그 테이프 끝: 점 8~12개짜리 짧은 Path 두 개. 찢김 생성기(https://bushe.co/tools/svg-torn-paper-edge-generator/)로 Path를 만들어 **빌드 시 상수화**하면 런타임 비용이 없다.
- 종이 결: 64×64 안팎의 작은 타일 PNG를 `ImageBackground` + `resizeMode="repeat"`로 반복, 불투명도 낮게. `FeTurbulence` 실시간 필터는 피한다. (지원 목록 근거는 위 결론 6)
- 접근성: 모든 장식 Path에 `accessible={false}` / `importantForAccessibility="no"`, 탭은 `accessibilityRole="tab"` + 선택 상태. 시각 크기와 별개로 `hitSlop`으로 48dp 확보. (Android 문서의 패딩 방식 근거)
- 눌림 효과 없음: `Pressable`의 pressed 스타일을 비워 둔다. 대신 포커스 링(3:1 이상)은 접근성용으로 유지.
- **웹 확인(react-native-web)**: CSS `clip-path`, `mask-image` 구현과 RN SVG 구현이 달라질 수 있으니 **SVG 한 갈래로 통일**하는 편이 안전하다.

---

## 6. 참고 사례 목록 (확인 수준 표기)

**탭 / 폴더 UI**
- CSS Secrets 사다리꼴 탭 + 병합 코드 — https://gist.github.com/csssecrets/1345dc9399dc8e794502 (확인: 직접 열람)
- Lea Verou, Slanted tabs — https://lea.verou.me/blog/2013/10/slanted-tabs-with-css-3d-transforms/ (직접 열람, 수치 없음)
- Chrome 탭 역사 — https://tech.slashdot.org/story/18/07/22/2140205/google-tests-curvy-chrome-tabs-with-material-design-overhaul (검색 요약)
- Vivaldi 포럼 Chrome 스타일 탭 — https://forum.vivaldi.net/post/299257 (검색 요약)
- Automatic CSS 오목 반경 — https://docs.automaticcss.com/borders-dividers/inverted-radius-framework (검색 요약)
- 특허 — https://patents.google.com/patent/US8523234 , https://patents.google.com/patent/US11179961 (검색 요약, 수치 없음)
- Goodnotes 피드백 — https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/39116767-tabs-and-section-dividers
- Notability 구조 — https://support.gingerlabs.com/hc/en-us/articles/5949216168474
- Whimsical 탭 폴더 — https://whimsical.com/product-updates/tabbed-folders (직접 열람)
- Design Systems Surf — https://designsystems.surf/components/tabs

**터치/접근성**
- Android 터치 타깃 — https://support.google.com/accessibility/android/answer/7101858
- WCAG 2.5.8 — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (직접 열람)
- Flutter TabBar 48.0 — https://api.flutter.dev/flutter/material/TabBar-class.html (간접)

**스큐어모프/촉각 UI 흐름**
- Clay 가이드 — https://clay.global/blog/skeuomorphism-ui (직접 열람; 발행사가 자사 사례 포함)
- Simone, "Is skeuomorphism back" — https://blog.simone.computer/is-skeumorphism-back (직접 열람; 저자 본인이 UI 전문가가 아니라고 명시)
- 2025 neo-skeuomorphism 논문 — https://rsisinternational.org/journals/ijriss/articles/revisiting-digital-interfaces-the-role-of-skeuomorphism-flat-design-and-neo-skeuomorphism-in-modern-ui/ , https://ideas.repec.org/a/bcp/journl/v9y2025issue-4p216-230.html
- Apple Liquid Glass 보도 — https://www.techradar.com/phones/iphone/apples-new-liquid-glass-design-puts-the-spotlight-on-skeuomorphism-for-the-first-time-since-ios-6-and-im-all-for-it (검색 요약)
- 회의적 시각 — https://blog.logrocket.com/?p=164308 (검색 요약)
- tactile maximalism(느슨한 용어) — https://digitalsynopsis.com/design/web-design-trends-2025/ (검색 요약)
- Finch 디자인 비평 — https://ixd.prattsi.org/2024/09/design-critique-finch-ios-app (열람 실패, 검색 요약에서 "스큐어모프 요소로 현실 상호작용을 모방"이라는 문장만 확인)
- How We Feel — https://howwefeel.substack.com/p/we-feelgrateful (검색 요약: 2024 Apple Design Award 결선, "촉각적 감정 풍경", 기하학 도형)
- Locket — https://experiments.lazyweb.com/company/locket (검색 요약: "스큐어모프 디자인 언어를 약간 되살림"이라는 평)
- Apple Journal — https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/ (검색 요약)
- Poparazzi, Partiful, Arc, Things, Day One, Bear, Notion Calendar, Retro, Paper by WeTransfer, Gentler Streak: **디자인 분석 자료를 확인하지 못했다.** 요청 목록에 있었으나 본문에서 근거 없이 언급하지 않았다. (Paper by WeTransfer는 스크랩북 제작 안내만 확인: https://wetransfer.com/blog/story/171905-make-scrapbooks-and-photo-collages-with-paper)
- 토스: 보이스톤 메이커(UX 라이팅 도구), 3D 토스페이스 이모지, TDS — https://toss.im/slash-22/sessions/1-3 , https://developers-apps-in-toss.toss.im/design/components (검색 요약). 당근은 확인 못함.

**한국 다꾸 / 문구 시장**
- Hibi Calendar 리뷰 — https://maily.so/whattheapp/posts/w6ovpndyok5 (직접 열람)
- 자꾸다꾸 — https://apps.apple.com/ma/app/%EC%9E%90%EA%BE%B8%EB%8B%A4%EA%BE%B8-%EB%94%94%EC%A7%80%ED%84%B8-%EB%AC%B8%EB%B0%A9%EA%B5%AC-%EB%8B%A4%EC%9D%B4%EC%96%B4%EB%A6%AC-%EC%95%B1/id1604145147?l=fr-FR (검색 요약; 리뷰 수 적음)
- 아트박스 — https://www.koreajoongangdaily.com/business/not-your-grandmas-stationery-shop-artboxs-cute-products-corner-market-with-tourists-young-people/10937173 (직접 열람: 매장 218개(2025.12), 펜·노트·스티커·편지지·캐릭터 굿즈, 빽빽한 진열)
- 마스킹테이프 규격 — https://shop.mochithings.com/products/160024 , 다이소 20mm×20m(노루페인트) https://www.daisomall.co.kr/pd/pdr/SCR_PDR_0001?pdNo=57565 (검색 요약)
- Vogue Korea 2020 다꾸 기사 — https://www.vogue.co.kr/?p=219937 (검색 요약, 오래됨)
- 텐바이텐·교보 핫트랙스·"레트로 문방구" 트렌드: 의미 있는 자료를 못 찾았다.

**구현 자료**
- 티켓 노치 — https://ishadeed.com/article/football-ticket-css-svg/ (직접 열람)
- CSS 티켓 모음 — https://freefrontend.com/css-tickets/ , https://freefrontend.com/css-paper-effects/page/2/
- 찢김 SVG 생성기 — https://bushe.co/tools/svg-torn-paper-edge-generator/ , https://github.com/happy358/TornPaper
- 종이 질감 feTurbulence — https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/ (열람 403; 검색 요약. 옥타브 1~5, 많을수록 비용이라는 설명)
- react-native-svg 필터 지원 — https://docsearch.algolia.com/mcp/docs/repo/software-mansion/react-native-svg (2차)
- 단색 UI — https://trends.daisyui.com/trend/monochrome-ui/ , https://uxdesign.cc/how-to-effectively-design-a-monochromatic-user-interface-ui-897c07c5a09e (열람 403)

---

## 7. 후속 확인 권장

1. M3 tabs 스펙(m3.material.io), Apple HIG Tab bars, 공식 react-native-svg 문서(`FeTurbulence`)를 직접 확인.
2. 2장 제안 수치는 태블릿·폰 실기에서 Path 시안 3종(직사각 / 어깨 4% / 어깨 8%)으로 비교 후 확정.
3. #FEF0BF 위 주색 텍스트와 선택/비선택 탭 면 사이 대비를 실제 hex로 계산해 3:1(비텍스트), 4.5:1(텍스트) 확인. 기존 검사 스크립트(UI 색 규칙 메모)를 활용.
4. 미감 판단(모양·세기·그림자의 예쁨)은 프로젝트 규칙상 코덱스 몫이므로 이 보고서의 수치는 코딩 출발값으로만 쓴다.
