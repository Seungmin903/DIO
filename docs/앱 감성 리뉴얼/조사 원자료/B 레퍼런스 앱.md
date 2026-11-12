# B 레퍼런스 앱 — 감성 앱은 5개 화면을 어떻게 만드나 (2026-10-31)

> 조사일 2026-10-30~31 · 대상 20개 앱 · 수집한 스크린샷 156장을 전부 눈으로 확인했고, 그중 앱당 4~6장(총 110장)을 `레퍼런스 스크린샷/<앱 이름>/` 에 저장했다.
> 목적: DIO의 다이어리 홈 · 꾸미기 공방 · 내 공간 · 휴지통 · 로그인·가입 화면을 1020 여성에게 감성적으로 보이게 바꿀 때 쓸 UI 층위의 레퍼런스. 마스코트·그림체는 [캐릭터 디자인 / 01 레퍼런스 조사](../../캐릭터%20디자인/01%20레퍼런스%20조사.md)가, 홈의 책상 감성은 [다이어리 홈 책상 감성](../../다이어리%20홈%20책상%20감성/색인.md)이 이미 다뤘으므로 여기서는 '화면 층위'만 본다.
> 표기: **[관찰]** 스크린샷에서 직접 본 것 · **[S숫자]** 5절 출처표 · **[추정]** 근거 없이 짐작한 것 · **확인하지 못함** 찾아봤지만 못 찾은 것. DIO 쪽 시사점은 모두 조사자의 **제안**이며, 색·그림자·세기 같은 미감 수치는 정하지 않았다(미감 판단은 코덱스 몫).
> 주의: 스크린샷은 Apple 앱스토어의 마케팅 이미지다. 개발사가 가장 잘 나온 장면을 골라 만든 것이라 실제 화면과 다를 수 있고, 모션 · 사운드 · 햅틱은 정지 이미지로 알 수 없다. 사내 디자인 레퍼런스 용도로만 보관한다.

## 0. 한 장 요약

**감성 앱은 모든 화면을 일러스트로 채우지 않는다.** 156장을 보면 감성은 ① 홈의 '장면' ② 꾸미기 보관함 ③ 첫 시작·축하·빈 순간 ④ 프로필 모아 보기 네 곳에 몰려 있고, 기록하는 화면과 목록은 한 톤 물든 바탕 위의 흰 카드와 작은 아이콘으로 절제한다(Finch · 하루콩 · Daylio · Day One · Tiimo). 그리고 로그인 폼을 꾸민 앱은 하나도 없다 — 수집한 156장에 이메일 · 소셜 로그인 화면은 0장이고, 감성은 가입 직전의 '첫 장면'과 '안전감을 주는 사물'에 들어간다.

### 핵심 패턴 10개

| # | 패턴 | 근거 앱 | DIO에 닿는 곳 |
|---|---|---|---|
| 1 | **감성은 4곳에 몰고 나머지는 절제한다** — 기록·목록 화면은 흰 카드 + 작은 아이콘, 캐릭터·일러스트는 장면이 바뀌는 순간에만 | Finch · 하루콩 · Daylio · Day One · Tiimo | 전 화면 (진단의 "나머지 네 화면이 같은 틀" 처방은 '전부 채우기'가 아니라 '순간 고르기') |
| 2 | **흰색이 아니라 한 톤 물든 바탕** — #F3F2ED(하루콩) · #F0F0E8(MOODA) · #FFF9F3(다욜) · #FAF6F7(디데이 위젯) · #F8F7FF(Tiimo) 같은 오프화이트 [관찰: 스크린샷 배경 샘플] | 위 5개 | 전 화면 바탕 (흰 카드는 그대로 두고 바탕만) |
| 3 | **홈은 '물건이 놓인 방/책장'** — 소품이 곧 기능의 입구 | MOODA(방) · 다욜(표지 carousel) · Widgetable(펫 방) | 다이어리 홈 |
| 4 | **기록 한 건이 캐릭터/아이콘 한 칸** — 달력이 감정 모자이크가 된다 | 하루콩(콩) · MOODA(무드볼) · Daylio(얼굴) | 홈 한눈에 보기 · 내 공간 통계 |
| 5 | **상점·보관함은 한 문법** — 큰 결과 미리보기 + 작은 정사각 타일 격자 + 탭·해시태그 칩 | ZEPETO · Goodnotes 마켓 · Color Widgets · 포토이즘 · SNOW | 꾸미기 공방 |
| 6 | **친구 공유는 규모와 지표를 구조로 줄인다** — 20명 제한 · 반응 미집계 · 친구만 · 친한 친구 별 하나 | Locket · BeReal · Lapse · Instagram | 공유 방 · 초대 (H·I 영역) |
| 7 | **기다림을 물성으로 보여 준다** — 현상 중인 잠긴 사진 격자, 흔드는 폴라로이드, 하루 한 번 도착하는 쪽지 | Lapse · MOODA · 하루콩 · BeReal | 휴지통 복원 · 내보내기 진행 · 빈 상태 |
| 8 | **프로필은 숫자 대신 '모아 보기' 시각물** — 사진 달력, 월간 요약, 병 속 구슬, 배경 사진 + 스티커 | BeReal · Locket · Widgetable · 카카오톡 · Finch | 내 공간 |
| 9 | **감성 서체·색 블록은 마케팅 이미지에서 크게, 앱 안에서는 작게** — 손글씨·형광펜 제목은 스토어 이미지 속, 앱 UI는 흰 면 + 선 아이콘 | MOODA · 다욜 · Daylio · SNOW | 서체 규칙 충돌을 피하는 길 (감성 서체는 콘텐츠 영역으로) |
| 10 | **로그인은 폼이 아니라 '첫 장면'과 '안전감 사물'에 투자한다** — 알 고르기·부화 온보딩, 책+자물쇠, 로그인 없이 시작, Face ID | Finch · 하루콩 · 다욜 · Day One | 로그인·가입 |

### 한 줄 처방 (조사자 제안)

DIO는 이미 홈(책상)과 표지에 감성을 갖고 있으므로, 나머지 화면은 패턴 1·2·8·10 순서로 — **바탕을 한 톤 물들이고, 프로필에 '모아 보기' 시각물을 하나 두고, 로그인 앞에 모아 한 컷, 휴지통에 '남은 시간'의 물성(패턴 7)** — 만 더하는 것이 가장 안전하다. 안내 멘트 금지·시스템 서체·BI/CI와 부딪히는 것(5.4 표)은 아래 앱별 분석에 앱마다 적었다.

## 1. 앱 표

평점·평가수는 2026-10-30~31 한국 앱스토어(Lapse만 미국) iTunes Search API와 스토어 페이지 기준이다. "1020 소비 근거"에는 **확인한 것만** 적었고, 못 찾은 것은 "확인하지 못함"으로 뒀다.

| # | 앱 | 카테고리 | 스토어 · 평점(평가수) | 1020 소비 근거 | 스크린샷 폴더 |
|---|---|---|---|---|---|
| 1 | Finch: Self-Care Pet | 기록·일기(셀프케어) | [App Store](https://apps.apple.com/kr/app/id1528595748) · 4.89(316, KR) | App Store 에디터스 초이스 선정(2025-10, FoxData) [S11]. 사용자의 75.79%가 여성, 주로 25~35세(FoxData 추정) — 1020 비중은 확인하지 못함. KR 스토어는 영어만 지원 [S1] | `Finch` |
| 2 | 하루콩 | 기록·일기(한국) | [App Store](https://apps.apple.com/kr/app/id1553223828) · 4.83(33,065) | 누적 다운로드 950만+, 2024년 감정 일기 2,960만 건(유니콘팩토리 2025-01-08) [S12]. 리뷰 "테마도 너무 귀엽고…" [S2]. 연령·성별 비중은 확인하지 못함 | `하루콩` |
| 3 | MOODA | 기록·일기(한국) | [App Store](https://apps.apple.com/kr/app/id6449689589) · 4.59(9,209) | 일본 iOS 유료 앱 1위 기록(디지털인사이트 2020-10-30) [S13] — 오래된 자료. 연령·성별 확인하지 못함 | `MOODA` |
| 4 | 다욜(Dayol) | 다꾸·다이어리(한국) | [App Store](https://apps.apple.com/kr/app/id1571925624) · 4.62(6,171) | 리뷰 "다욜이랑 토닥 캐릭터가 너무 귀여워요" [S3]. 연령 확인하지 못함 | `다욜` |
| 5 | Daylio | 기록·일기(기분) | [App Store](https://apps.apple.com/kr/app/id1194023242) · 4.72(1,657) | 스크린샷에 Apple "오늘의 앱" 표식과 Forbes · Guardian · Mashable · lifehacker 로고 [관찰, 마케팅 이미지 · 미검증]. 1020 확인하지 못함 | `Daylio` |
| 6 | Day One | 기록·일기(프리미엄) | [App Store](https://apps.apple.com/kr/app/id1044867788) · 4.68(4,063) | 스토어 설명 "1,500만 회 이상 다운로드" [S4]. 1020 근거는 확인하지 못함 → '조용한 프리미엄' 대조군으로 포함 | `Day One` |
| 7 | Locket Widget | 친구 공유 | [App Store](https://apps.apple.com/kr/app/id1600525061) · 4.72(8,977) · 소셜 #126 | 누적 설치 9,100만+(Appfigures 추정), Rollcall 초기 활성 사용자의 약 80%가 Gen Alpha, 구독자 10만+(TechCrunch 2025-11-03) [S14]. 여성 비중 확인하지 못함 | `Locket` |
| 8 | BeReal | 친구 공유 | [App Store](https://apps.apple.com/kr/app/id1459645446) · 4.71(11,532) · 소셜 #28 | 스토어 설명 "매일 다른 시간에 모든 사람이 2분 이내에 사진을 캡처". Gen Z 비율 수치는 확인하지 못함(검색에 나온 85%는 마케팅 가이드 인용이라 원문 미확인) | `BeReal` |
| 9 | Lapse – Disposable Camera | 친구 공유(필름 카메라) | [App Store US](https://apps.apple.com/us/app/id1636699256) · 4.75(118,304) · KR 스토어 검색에서 확인되지 않음 | 2023-09 미국 앱스토어 118위→1위, 설치 약 120만·92% 미국(TechCrunch) [S15]. 2024-02 시리즈A 3천만 달러 기사가 "Gen-Z Focused"로 소개, 미국·영국 최다 다운로드(Pulse 2) [S16]. "24세 미만 79%·주로 여성"은 검색 요약에만 있고 원문에서 확인하지 못함 | `Lapse` |
| 10 | Instagram | 친구 공유(노트·친한 친구) | [App Store](https://apps.apple.com/kr/app/id389801252) · 4.65(1,892,363) | 2022년 신규 설치 1위: 10대 이하 153만 · 20대 311만(모바일인덱스, 이투데이 2023-01-31) [S17]. 여성만의 수치는 확인하지 못함 | `Instagram` |
| 11 | 카카오톡 | 친구 공유(프로필·이모티콘) | [App Store](https://apps.apple.com/kr/app/id362057947) · 3.55(933,140) · 소셜 #14 | 카카오 보도자료 2023-03-29: 공감 스티커·MBTI 스티커가 "젊은 이용자층 중심으로 긍정적 반응"(수치 없음) [S18]. 평점은 낮고 사용은 보편 — 감성 선호의 근거는 아님 | `카카오톡` |
| 12 | ZEPETO | 꾸미기(아바타) | [App Store](https://apps.apple.com/kr/app/id1350301428) · 4.35(97,693) · 소셜 #48 · 15+ | "이용자의 80% 이상이 10대"는 2022-06-09 기사 문장(인사이트) [S19] — 현재 수치로 쓰지 말 것. 최신 통계 확인하지 못함 | `ZEPETO` |
| 13 | Goodnotes | 꾸미기(스티커 마켓) | [App Store](https://apps.apple.com/kr/app/id1444383602) · 4.62(468,728) · 에디터의 선택 | 마켓에 한국어 스크랩북 스티커 세트가 올라와 있음(검색 결과) [S20]. 1020 수치 확인하지 못함 | `Goodnotes` |
| 14 | Color Widgets | 꾸미기(폰꾸·위젯) | [App Store](https://apps.apple.com/kr/app/id1531594277) · 4.66(10,148) | 스크린샷에 "60,000,000 Users · Featured by Apple" [관찰, 마케팅 이미지 · 미검증]. 스토어 설명: 테마·배경 15,000개 이상 [S5]. 연령 확인하지 못함 | `Color Widgets` |
| 15 | Widgetable | 꾸미기(폰꾸·친구 위젯) | [App Store](https://apps.apple.com/kr/app/id1641107226) · 4.89(2,959) · 소셜 #194 · 12+ | 스크린샷에 "6000만 사용자의 선택 · 200+ 국가·지역"과 "에디터 선정" 배지 [관찰, 미검증]. 사용자 통계는 확인하지 못함 | `Widgetable` |
| 16 | 디데이 위젯 TheDayBefore | 꾸미기(기념일 위젯·한국) | [App Store](https://apps.apple.com/kr/app/id991283955) · 4.73(42,241) · 라이프스타일 #46 | 스크린샷에 "디데이 분야 1위 앱 · 누적 다운로드 +5000만" [관찰, 마케팅 이미지 · 미검증]. 연령 확인하지 못함 | `디데이 위젯 TheDayBefore` |
| 17 | 포토이즘 | 카메라·인생네컷 | [App Store](https://apps.apple.com/kr/app/id6747059622) · 4.81(2,662) · 사진 #8 | 캐릭 1020 자문단 인터뷰(2023-09-14): "예쁜 프레임에 사진을 찍고 싶어서 일부러 포토 부스를 찾아간다", 프레임 디테일 하나에도 SNS 반응이 바로 온다 [S21] | `포토이즘` |
| 18 | Dazz | 카메라(레트로 디카) | [App Store](https://apps.apple.com/kr/app/id1422471180) · 4.86(15,873) · 사진 #25 | 아시아경제 2023-04-22: NCT 해찬 등 연예인이 쓰는 것이 알려지며 인기 [S22]. 앱 사용자 수는 확인하지 못함 | `Dazz` |
| 19 | SNOW | 카메라(필터·스티커) | [App Store](https://apps.apple.com/kr/app/id1022267439) · 4.44(191,421) · 사진 #21 · 15+ | 스토어 문구 "전세계 2억명이 사용하는 카메라 앱" [S6]. 연령 확인하지 못함 | `SNOW` |
| 20 | Tiimo | 라이프스타일(조용한 감성) | [App Store](https://apps.apple.com/kr/app/id1480220328) · 4.61(562) | Apple 2025 앱스토어 어워즈 올해의 iPhone 앱(Apple Newsroom) [S23]. 리뷰 "tiimo만의 색감 톤이 좋아요" [S7]. 1020 확인하지 못함 | `Tiimo` |

검토했으나 표에서 뺀 후보: Journey(일기, KR 4.62/440 — Day One과 겹침) · Pinterest(보라 글씨 + 파스텔 그라데이션 + 꽃·나비 콜라주 마케팅, 화면 5개와 직접 대응이 약함) · Canva(보라-파랑 그라데이션 마케팅, 스티커 검색 패널은 Goodnotes 마켓으로 대신) · Widgetsmith · B612(SNOW와 같은 회사) · Huji Cam(Dazz와 겹침) · Opal(어두운 유리 질감의 집중 앱, 아래 3.5에 한 줄 인용) · 크레페(이미 캐릭터 조사에서 다룸) · Notion Calendar(스토어 검색 응답을 받지 못해 수집 실패).

## 2. 앱별 분석

> 틀: 쓰이는 화면(a 첫 화면·로그인·온보딩 / b 홈·목록 / c 꾸미기·상점·보관함 / d 프로필·설정 / e 삭제·빈 상태·오류·로딩) · 감성 장치 · DIO로 옮길 수 있는 것 · 옮기면 안 되는 것. 사진 파일 번호는 저장 순서이며 괄호에 앱스토어 몇 번째 장인지 적었다. 'DIO 기준'은 BI/CI(페리윙클 #818AC3 · 네이비 #0B1766 · 흰 카드 · 시스템 서체 · 선 아이콘) · 안내 멘트 금지 · 모아·디오를 말한다.

### 2.1 기록·일기

#### ① Finch — 하늘색 장면 + 흰 카드 목록

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Finch/01.jpg" alt="Finch 01"><figcaption>01 (1번째) a 인트로 — 새 두 마리가 안고 있는 장면, "Self-care is better together"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Finch/02.jpg" alt="Finch 02"><figcaption>02 (2번째) b 홈 — 숲 장면 위에 Goal Buddies 목록, 친구 체크 칸이 내 칸 옆에 나란히</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Finch/03.jpg" alt="Finch 03"><figcaption>03 (3번째) c 카드 보내기 — Valentine 카드 선택 6칸 격자 + 흰 CTA</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Finch/04.jpg" alt="Finch 04"><figcaption>04 (5번째) e 모달 — "You & Sam are now Goal Buddies!", 색종이와 응원 술(폼폼)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Finch/05.jpg" alt="Finch 05"><figcaption>05 (6번째) d 진행 요약 — 영역별 아이콘 + 막대 카드 4장</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Finch/06.jpg" alt="Finch 06"><figcaption>06 (7번째) e 30일 스트릭 — 햇살 위 새 + 요일 체크 칩</figcaption></figure>
</div>

- **쓰이는 화면**: a 온보딩(알 고르기 · 대명사 · 방사형 햇살 축하 · 이름 짓기 · 성격 선택 · 펫이 사용자 이름을 묻는 대화) [S9], b 홈, c 친구에게 카드 보내기, d 진행 요약, e 축하 모달.
- **감성 장치**: 색 — 스크린샷 배경이 하늘색 단색(#9CDCFF → 아래 #C1EAFE, 샘플) + 짙은 파랑 큰 헤드라인 + 초록 잔디 [관찰]. 모서리 — 흰 카드와 알약 버튼이 크게 둥글다 [관찰]. 일러스트 — 새 캐릭터가 하늘·숲·도시 장면에 서 있고, 말풍선 안에 트로피·하트 같은 작은 스티커가 떠 있다 [관찰]. 문구 톤 — 영어 의성어와 느낌표("Nourish what matters to you, cheep!", "You kept going for a whole month! Every day! WOW!") [관찰]. 모션 — 온보딩 축하 화면에 방사형 햇살 [S9], 나머지는 정지 이미지로 확인 불가.
- **절제의 증거**: 목록·진행 화면(02 · 05)은 흰 카드 + 작은 컬러 원 아이콘뿐이고, 캐릭터는 장면이 바뀌는 순간(부화 · 팀 결성 · 30일)에만 크게 나온다 [관찰]. Pratt 비평은 설정과 Quests 탭이 "선택지가 너무 많아 인지 과부하"라고 짚었다 [S10] — 감성 앱도 정리는 따로 해야 한다.
- **DIO로 옮길 수 있는 것**: 04의 구조 — 캐릭터 둘 + 이름 둘 + 한 줄 버튼 — 은 '친구가 공동 다이어리에 합류했어요' 같은 한 순간에 모아·디오를 한 컷 쓰는 틀로 옮길 수 있다. 목록은 흰 카드를 유지하고 캐릭터는 순간에만 쓰는 배분(패턴 1).
- **옮기면 안 되는 것**: 스트릭·보상 압박(기록 게임이 아닌 DIO와 결이 다름 [추정]) · 영어 의성어와 말풍선 안내 대사(안내 멘트 금지) · 하늘색 전면 배경(CI 페리윙클과 충돌, 참고만).
- **1020 근거**: 1번 항목 참조 — 에디터스 초이스, 사용자 76%가 여성이나 주 연령은 25~35세라 1020 근거는 약하다.

#### ② 하루콩 — 크림 바탕 위의 콩 달력

<div class="grid">
<figure><img src="레퍼런스 스크린샷/하루콩/01.jpg" alt="하루콩 01"><figcaption>01 (1번째) a/b 소개 — 연두 바탕에 기분 콩 달력, "10M+ 누적 다운로드 · 오늘의 앱 선정"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/하루콩/02.jpg" alt="하루콩 02"><figcaption>02 (2번째) b 기록 — 기분 콩 5개 선택 + 날씨·감정 아이콘 격자 + 한줄일기</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/하루콩/03.jpg" alt="하루콩 03"><figcaption>03 (3번째) c 내 블럭 — 루틴 아이콘 추가 시트(율무 산책 · 화분 물주기 · 카페투어)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/하루콩/04.jpg" alt="하루콩 04"><figcaption>04 (4번째) c 테마 달력 3종 — 해변 · 핑크 구름 하트 · 크리스마스 톤, 칸의 얼굴 모양·색이 테마마다 다름</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/하루콩/05.jpg" alt="하루콩 05"><figcaption>05 (7번째) a 계정 — 책 + 자물쇠 일러스트, "해린의 일기장 #1234"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/하루콩/06.jpg" alt="하루콩 06"><figcaption>06 (8번째) e 쪽지 — 포춘쿠키 일러스트 + 연두 쪽지 카드(매일 아침 도착)</figcaption></figure>
</div>

- **쓰이는 화면**: b 월 달력 · 기록 시트, c 블럭 · 테마, a 계정, e 하루 한 번 도착하는 쪽지. (통계 보고서 · 건강 연동은 스토어 설명 [S2], 폴더에는 넣지 않음)
- **감성 장치**: 바탕 #F3F2ED(샘플)의 따뜻한 오프화이트 + 연두(#A9D57C) 포인트 [관찰]. 소개 이미지의 문구는 위에 작은 회색 소제목, 아래에 굵은 검정 제목의 2단 [관찰]. 기록 한 건이 콩 얼굴 한 칸이 되어 달력이 모자이크가 되고(01), 테마를 바꾸면 칸의 얼굴 모양과 색이 통째로 바뀐다(04) [관찰]. 문구 톤 — "오늘은 어떤 하루였나요?", "작은 행운을 선물해드려요" 같은 해요체 질문 [관찰]. 4.16.0 업데이트로 사진에 아날로그 느낌의 프레임이 추가됐다 [S2].
- **DIO로 옮길 수 있는 것**: ① 기록 한 건 = 한 칸 모자이크(패턴 4) — 홈 한눈에 보기나 내 공간에서 다이어리 표지 색·사진 칩을 달력/격자로. ② 테마가 '칸의 모양'을 바꾸는 방식 — 표지 테마가 속지 · 스티커 틀까지 이어지는 구조. ③ 05의 책 + 자물쇠 한 컷 — 로그인 위의 모아 한 컷 후보. ④ 06의 사물 일러스트 한 점으로 빈 상태를 채우는 방식(문구는 제목 수준).
- **옮기면 안 되는 것**: 클로버·이용권 과금(클로버 100~300개 ₩1,800~4,800 [S2]) · 마케팅 헤드라인("쉽고 간단하게 남기는 하루")을 앱 안 문구로 가져오기(안내 멘트) · 연두 중심 색.
- **1020 근거**: 1번 항목 참조. 연령·성별 비중은 확인하지 못함.

#### ③ MOODA — 책이 바닥에 놓인 방

<div class="grid">
<figure><img src="레퍼런스 스크린샷/MOODA/01.jpg" alt="MOODA 01"><figcaption>01 (1번째) b 홈 — 노란 벽 · 하늘색 바닥 · 창 · 핀업 사진과 메모 · 가챠 "MOOD BALLS" · 램프 · 바닥의 "MY DIARY"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/MOODA/02.jpg" alt="MOODA 02"><figcaption>02 (2번째) b 무드볼 — 3월의 감정을 얼굴 덩어리 격자로 모아 봄</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/MOODA/03.jpg" alt="MOODA 03"><figcaption>03 (3번째) c 꾸민 일기 — 스티커 · 사진 · 손글씨 · 격자 속지</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/MOODA/04.jpg" alt="MOODA 04"><figcaption>04 (4번째) b 월 달력 + 상단 선 아이콘 줄(메뉴 · 검색 · 알림 · 책 …)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/MOODA/05.jpg" alt="MOODA 05"><figcaption>05 (5번째) c 벽에 테이프로 붙은 사진 · 메모</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/MOODA/06.jpg" alt="MOODA 06"><figcaption>06 (7번째) c 손글씨 폰트 견본 — 색지 카드 12장</figcaption></figure>
</div>

- **쓰이는 화면**: b 홈(방) · 월 달력(무드볼), c 일기 꾸미기 · 폰트 · 속지 · 스티커, 친구 공유(스토어 설명 [S8]).
- **감성 장치**: 바탕 #F0F0E8 크림 + 스토어 제목은 굵은 손글씨 서체 [관찰]. 방은 2D 평면 일러스트 — 벽은 연한 노랑 · 바닥은 연한 하늘색 · 소품은 정면에서 본 모양이고 폴라로이드에 테이프, 메모 색지가 붙는다 [관찰]. 감정은 9가지 표정 덩어리(무드볼)이고 한 달치를 가챠 기계로 돌아본다 [S8][관찰]. 사진을 폴라로이드처럼 담고 스티커 팩을 직접 개봉하는 화면, 손글씨 폰트로 앱 분위기를 바꾼다는 점이 기사에 소개됐다 [S13]. 문구 — "나만의 아늑한 기록 공간".
- **DIO로 옮길 수 있는 것**: ① 소품이 곧 입구(패턴 3) — 가챠=월간 모아 보기, 벽 사진=최근 기록, 바닥의 책=다이어리. DIO 책상 위 소품 각각에 진입점 하나씩 두는 발상. ② 홈(01) 상단은 뒤로 · + · 책 아이콘 3개뿐이고 도구가 소품 위에 얹히지 않는다 — 현재 진단의 "표지 위에 도구가 상시 얹힘"과 대비. ③ 폰트 견본을 색지 카드 한 장씩 보여 주는 방식은 공방의 '내 폰트' 목록에 그대로 맞는다.
- **옮기면 안 되는 것**: 앱 UI 서체까지 손글씨로 가는 것(시스템 서체 규칙 — 손글씨 느낌은 콘텐츠·표지 영역에서만) · 정면 시점 방(DIO 책상은 위에서 본 시점이라는 기존 규칙과 다름) · 캔디 재화·멤버십(월 ₩990 · 연 ₩9,900 · 캔디 30~50개 ₩1,500~2,500 [S8]).
- **1020 근거**: 3번 항목 참조. 2020년 기사라 오래되었다.

#### ④ 다욜 — 표지 carousel이 홈

<div class="grid five">
<figure><img src="레퍼런스 스크린샷/다욜/01.jpg" alt="다욜 01"><figcaption>01 (1번째) b 홈 — 가운데 보라 표지 + 양옆 색 표지가 걸침, 아래 "My Journal ⋯ / 7Page", 하단 탭 4개(다이어리 · 즐겨찾기 · 스토어 · 설정)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/다욜/02.jpg" alt="다욜 02"><figcaption>02 (2번째) b 먼슬리 · 위클리 속지 미리보기</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/다욜/03.jpg" alt="다욜 03"><figcaption>03 (3번째) c 일기 꾸미기 — 하단 도구 막대(펜 · 텍스트 · 스티커 · 사진 · 레이어)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/다욜/04.jpg" alt="다욜 04"><figcaption>04 (5번째) c 속지 10종 모음</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/다욜/05.jpg" alt="다욜 05"><figcaption>05 (7번째) e PDF로 만들 속지 선택 — 하단 "(20/20) PDF 내보내기"</figcaption></figure>
</div>

- **쓰이는 화면**: b 홈 carousel, c 꾸미기 편집 · 속지 · 스토어 탭, e PDF 내보내기. 스토어 설명: "로그인 없이 바로 시작", 다이어리 데이터는 기기에 저장 [S3].
- **감성 장치**: 바탕 #FFF9F3 크림 + 스토어 제목은 굵은 고딕에 노란 형광펜 밑줄 [관찰]. 표지가 곧 캐릭터 스티커 판 — 다람쥐 · 토끼 · 체리 · 하트 · 음표가 붙어 있고 별 · 음표가 화면 밖으로 튀어나온 장식이 스토어 이미지에만 있다 [관찰]. 앱 상단 좌측에 캐릭터 얼굴 + 로고 글자, 우측 작은 아이콘 2개 [관찰].
- **DIO로 옮길 수 있는 것**: ① 홈 구조가 DIO와 같은 계열(carousel · 제목 · 쪽수)이라 비교가 쉽다 — 다욜은 쪽수 줄이 "7Page" 한 줄, 옆 표지는 색 띠로만 걸치고 도구는 표지 밖(하단 + 버튼)에 있다. ② 형광펜 밑줄은 시스템 서체 그대로 쓸 수 있는 강조 장치다(UI 제목 아래 한 줄 면). ③ 스토어를 하단 탭에 독립 항목으로 두고 홈과 분리하는 구조.
- **옮기면 안 되는 것**: 도토리 재화 · VIP 표지 판매(과금) · 상단 로고 자리에 캐릭터 얼굴을 넣는 것(로고 독립성 규칙) · 스토어 이미지의 떠다니는 장식(별 · 음표)을 앱 안에 상시 배치하는 것 [추정: 정돈된 위계와 충돌].
- **1020 근거**: 4번 항목 참조. 스티커 약 2,500개 무료 · 속지 10종 [S3].

#### ⑤ Daylio — 색 블록 하나와 얼굴 하나

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Daylio/01.jpg" alt="Daylio 01"><figcaption>01 (1번째) a 소개 — 초록 바탕, 매체 로고 · "App of the Day", 스마일 달력</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Daylio/02.jpg" alt="Daylio 02"><figcaption>02 (2번째) b 기분 선택 — 파랑 바탕, 얼굴 5단계</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Daylio/03.jpg" alt="Daylio 03"><figcaption>03 (3번째) b 활동 선택 — 산호색 바탕, 원형 아이콘 격자</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Daylio/04.jpg" alt="Daylio 04"><figcaption>04 (4번째) b 일상 기록 목록 — 시간 · 얼굴 · 활동 아이콘 · 사진 3장</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Daylio/05.jpg" alt="Daylio 05"><figcaption>05 (5번째) d 기분 차트 — 꺾은선 + 반원 게이지</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Daylio/06.jpg" alt="Daylio 06"><figcaption>06 (7번째) a 잠금 — 흰 바탕에 PIN 번호판 하나</figcaption></figure>
</div>

- **쓰이는 화면**: b 기록 입력 · 목록, d 통계 차트, a 잠금.
- **감성 장치**: 스크린샷마다 한 가지 단색 풀 배경(#00B98D 초록 · #019BE3 파랑 · #FF6E71 코랄 · #01D066 연두 · #415965 청회, 샘플) + 흰 UI [관찰]. 감성은 사실상 **둥근 얼굴 아이콘 5단계(초록→파랑→주황→빨강)** 하나로 해결하고 나머지는 평평한 흰 카드 [관찰]. 서체는 굵은 산세리프.
- **DIO로 옮길 수 있는 것**: '감성의 최소 단위'로 아이콘 하나 + 색 하나로도 충분하다는 증거. 잠금 화면(06)처럼 흰 바탕 + 번호판만 남기는 절제 — 게스트 시작이나 잠긴 상태 같은 조용한 화면에 맞다.
- **옮기면 안 되는 것**: 5색 감정 색 체계(DIO는 감정 기록 앱이 아니며 색은 CI) · 마케팅의 색 블록 배경.
- **1020 근거**: 5번 항목 참조 — 확인하지 못함.

#### ⑥ Day One — 저널마다 한 색, 목록 아래의 휴지통

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Day One/01.jpg" alt="Day One 01"><figcaption>01 (1번째) b 저널 목록 — 파란 헤더 위로 흰 시트, 리스트/캘린더/미디어/지도 탭</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Day One/02.jpg" alt="Day One 02"><figcaption>02 (2번째) a 잠금 — 파랑 바탕에 Face ID 아이콘 하나, "100% 비공개"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Day One/03.jpg" alt="Day One 03"><figcaption>03 (5번째) b 공유 저널 — "Family Memories", 멤버 원형 · STREAK / ENTRIES / MEDIA 통계</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Day One/04.jpg" alt="Day One 04"><figcaption>04 (7번째) b 지난 순간 — This Year / Two Years Ago, 지도 + 글</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Day One/05.jpg" alt="Day One 05"><figcaption>05 (9번째) e 저널 목록 — 맨 아래 "Trash 54 entries" 한 줄 + "+ New Journal" 알약</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Day One/06.jpg" alt="Day One 06"><figcaption>06 (10번째) b 다크 모드 — On This Day 사진 카드 · Daily Prompt 파랑 카드</figcaption></figure>
</div>

- **쓰이는 화면**: b 목록 · 공유 저널, a 잠금, e 휴지통(목록 맨 아래 한 줄).
- **감성 장치**: 바탕 #EBF3F6 연한 회청(샘플) + 저널마다 헤더 색이 다름(파랑 · 보라 · 청록 · 코랄) [관찰]. 큰 라운드의 흰 시트가 색 헤더 위로 올라타는 구조 [관찰]. 문구는 "우아한 심플함" 수준으로 절제 [관찰, 마케팅].
- **휴지통 사실**: 공식 안내에 따르면 Trash는 삭제된 항목이 있을 때만 서랍 맨 아래에 나타나고, **자동 만료가 없으며** 복원은 원래 저널로 돌아간다. 영구 삭제는 되돌릴 수 없다 [S24]. 즉 30일 보관을 가진 DIO와 구조가 다르다.
- **DIO로 옮길 수 있는 것**: ① 저널마다 한 가지 색(표지색)을 목록 좌측 칩이나 시트 헤더로 쓰는 방식. ② 휴지통을 홈 목록의 조용한 맨 아래 한 줄 + 개수로 두고, 비어 있으면 숨기는 방식(진입 위치는 현재 구조와 비교 필요).
- **옮기면 안 되는 것**: 영문 중심의 통계·템플릿 UI 용어 · 구독 중심 구조(₩12,000~99,000 [S4]).
- **1020 근거**: 6번 항목 참조 — 1020 근거 없음. 감성 소비의 근거가 아니라 '조용한 프리미엄' 대조군이다.

### 2.2 친구 공유 · 소규모 방

#### ⑦ Locket — 사진이 곧 위젯, 친구는 20명까지

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Locket/01.jpg" alt="Locket 01"><figcaption>01 (1번째) a 소개 — 앰버 하트 아이콘, 홈 화면에 친구 사진이 얹힘</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Locket/02.jpg" alt="Locket 02"><figcaption>02 (2번째) b 홈 화면 위젯 — 앱 아이콘 사이의 사진 위젯</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Locket/03.jpg" alt="Locket 03"><figcaption>03 (3번째) b 채팅 — 사진 위 말풍선 · 이모지 반응 칩</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Locket/04.jpg" alt="Locket 04"><figcaption>04 (5번째) c 캡처 — "12 Friends" 칩 · 흰 원형 셔터 · History</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Locket/05.jpg" alt="Locket 05"><figcaption>05 (6번째) d 친구 20명 — "Add your best friends only", 원형 아바타 목록</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Locket/06.jpg" alt="Locket 06"><figcaption>06 (7번째) b 히스토리 — "Everyone" 드롭다운, 사진 한 장 + 메시지 입력</figcaption></figure>
</div>

- **쓰이는 화면**: a 소개(위젯 추가), b 위젯 · 채팅 · 히스토리, c 캡처, d 친구 목록.
- **감성 장치**: 어두운 갈색~검정 바탕(#322F2A → #231B06, 샘플) + 앰버 노랑 하트 로고 하나 [관찰]. 일러스트가 거의 없고 **사진이 장식 전부**다 [관찰]. 스토어 설명: 친구는 최대 20명, "반응은 카운트되거나 추적되지 않습니다", 월말에 요약 동영상 [S5].
- **DIO로 옮길 수 있는 것**: 지표를 구조로 줄이는 방식(패턴 6) — 공유 방 참여자를 숫자·좋아요가 아니라 원형 아바타와 이름으로만 보여 주는 것. '베스트 프렌드만'이라는 소규모 방의 감각은 DIO의 같은 방 친구와 같은 결이다.
- **옮기면 안 되는 것**: 어두운 갈색 바탕(DIO는 밝은 페리윙클 계열) · 폰 홈 화면 위젯과 실시간 사진 푸시(RN 범위 밖) · Gold 구독 · 사진 팩 판매.
- **1020 근거**: 7번 항목 참조. TechCrunch는 2025-11 기준 성장의 중심이 Gen Alpha로 옮겨 갔다고 적었다 [S14].

#### ⑧ BeReal — 순흑 바탕, 반응도 사진

<div class="grid">
<figure><img src="레퍼런스 스크린샷/BeReal/01.jpg" alt="BeReal 01"><figcaption>01 (1번째) a 알림 — "BeReal 사용할 시간 · 2분 남았습니다", 잠금 화면 알림</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/BeReal/02.jpg" alt="BeReal 02"><figcaption>02 (2번째) b 카메라 — 01:42 카운트다운, 전면 사진 작은 창</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/BeReal/03.jpg" alt="BeReal 03"><figcaption>03 (4번째) b 친구 피드 — 사진 격자 + 찍은 시각(9:41:45 …)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/BeReal/04.jpg" alt="BeReal 04"><figcaption>04 (5번째) b 비공개 그룹 "The Real Family" — 사진 줄 + 채팅</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/BeReal/05.jpg" alt="BeReal 05"><figcaption>05 (6번째) b RealMoji — 반응이 친구 얼굴 사진 원형으로 날아옴</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/BeReal/06.jpg" alt="BeReal 06"><figcaption>06 (7번째) d Memories — 월간 사진 썸네일 달력 + 연말 영상 카드</figcaption></figure>
</div>

- **쓰이는 화면**: a 알림, b 카메라 · 피드 · 그룹, d Memories.
- **감성 장치**: 순흑 #000000 전면(샘플) + 흰 글자 두 단 위계(흰 / 회색) [관찰]. 반응이 이모지가 아니라 **내 얼굴 사진 원형 스티커**다 [관찰]. 시각이 사진 위에 찍힌다 [관찰].
- **DIO로 옮길 수 있는 것**: ① 반응·흔적을 친구의 얼굴·이름으로 남기는 방식 — 공동 꾸미기에서 '누가 붙였는지'를 친구 프로필 원형으로 표시하는 발상. ② Memories처럼 숫자 대신 월별 사진 썸네일 달력으로 보여 주는 내 공간 통계(패턴 8).
- **옮기면 안 되는 것**: 2분 타이머 · 알림 압박(DIO 홈에는 시간 압박이 없다 [추정]) · 순흑 배경.
- **1020 근거**: 8번 항목 참조. 연령 비중 수치는 확인하지 못함.

#### ⑨ Lapse — 현상 중인 잠긴 사진 격자

<div class="grid four">
<figure><img src="레퍼런스 스크린샷/Lapse/01.jpg" alt="Lapse 01"><figcaption>01 (1번째) b 카메라 — 빨간 뷰파인더 프레임 · 필름 롤 썸네일 "6"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Lapse/02.jpg" alt="Lapse 02"><figcaption>02 (2번째) b 결과 — 코발트 블루 바탕, "snap in the moment"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Lapse/03.jpg" alt="Lapse 03"><figcaption>03 (3번째) e 대기 — "SNAPS DEVELOPED / 5 snaps ready to view" 알림 + 자물쇠 잠긴 사진 격자</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Lapse/04.jpg" alt="Lapse 04"><figcaption>04 (4번째) b 필름 질감 사진 — 아래 썸네일 줄</figcaption></figure>
</div>

- **쓰이는 화면**: b 카메라 · 앨범, e 현상 대기. 미국 스토어 이미지(영어)다.
- **감성 장치**: 헤드라인이 **이탤릭 세리프 + 굵은 산세리프 대문자**의 혼합이고(disposable *CAMERA* for FRIENDS), 코발트 단색 · 순흑 바탕에 사진 그레인이 질감 전부다 [관찰]. 3번 장면은 아직 보여 주지 않은 사진을 색 번진 그라데이션 + 자물쇠로 표시한다 [관찰]. 문구 — "Shoot first, develop later", "Capture life, free from the pressure of over-curation" [S25]. 현상 시점은 하루 중 무작위라고 TechCrunch가 적었다 [S15].
- **DIO로 옮길 수 있는 것**: '아직 도착하지 않은 것'을 잠긴 사진 칸으로 표시하는 방식 — 휴지통 복원 중 · 내보내기 진행 · 가져오기 대기 같은 상태를 문구 없이 칸 모양으로 보여 줄 수 있다(패턴 7).
- **옮기면 안 되는 것**: 이탤릭 세리프 헤드라인(시스템 서체 규칙) · 코발트 배경(CI) · 무작위 지연(기록 서비스에서는 불안 요소 [추정]).
- **1020 근거**: 9번 항목 참조. KR 스토어에서는 확인되지 않아 국내 소비 근거는 없다.

#### ⑩ Instagram — 앱은 흰색, 감성은 스토리와 노트에만

<div class="grid five">
<figure><img src="레퍼런스 스크린샷/Instagram/01.jpg" alt="Instagram 01"><figcaption>01 (1번째) c 스토리 편집 — 텍스트 · 위치 · 스티커, 네온 핑크 마케팅 배경</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Instagram/02.jpg" alt="Instagram 02"><figcaption>02 (2번째) b DM — 보라 말풍선 + 하트 스티커</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Instagram/03.jpg" alt="Instagram 03"><figcaption>03 (3번째) b 피드 — 스토리 링 + 게시물, 흰 UI</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Instagram/04.jpg" alt="Instagram 04"><figcaption>04 (4번째) d/공개 범위 — "친한 친구만", 초록 별 아이콘 팝업</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Instagram/05.jpg" alt="Instagram 05"><figcaption>05 (5번째) d 노트 — 아바타 위 말풍선, "메모…" 입력</figcaption></figure>
</div>

- **쓰이는 화면**: b 피드 · DM, c 스토리 스티커, d 노트 · 친한 친구.
- **감성 장치**: 마케팅 이미지는 네온 핑크 · 보라 · 주황 단색 + 두꺼운 팝 일러스트(왕관 · 불꽃 · 하트) — 하지만 **앱 화면 자체는 흰 UI + 얇은 선 아이콘**이다 [관찰]. 공개 범위는 초록 별 하나로 표시한다 [관찰]. 노트는 60자 이내 텍스트와 이모지로 24시간 친구 받은 편지함 위에 뜬다(2022-12 출시) [S26 · 검색 요약 기준].
- **DIO로 옮길 수 있는 것**: ① 공개 범위를 문장이 아니라 **색 + 아이콘 하나**로 구분(설명 문구 없이) — 공유 방/초대 화면(H·I 영역)에서 '같은 방 친구'를 표시하는 법. ② 노트처럼 아바타 위에 뜨는 한 줄 말풍선 — 내 공간 프로필의 한 줄 상태.
- **옮기면 안 되는 것**: 네온 팝 마케팅 컬러 · 광고 중심 피드 · 알고리즘 릴스.
- **1020 근거**: 10번 항목 참조 — 여성만의 수치는 확인하지 못함.

#### ⑪ 카카오톡 — 프로필은 배경 + 스티커

<div class="grid four">
<figure><img src="레퍼런스 스크린샷/카카오톡/01.jpg" alt="카카오톡 01"><figcaption>01 (1번째) b 채팅 — 사진 공유, 노랑 #FFE500 마케팅 배경</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/카카오톡/02.jpg" alt="카카오톡 02"><figcaption>02 (3번째) b 숏폼 "지금" — 전체 화면 영상 + 우측 반응 열</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/카카오톡/03.jpg" alt="카카오톡 03"><figcaption>03 (5번째) d 프로필 — 구름 배경 사진 + 스티커 + 이름 + "AI 프로필 꾸미기 · 나와의 채팅 · 새 게시물"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/카카오톡/04.jpg" alt="카카오톡 04"><figcaption>04 (6번째) b 친구 탭 — 업데이트 프로필 원형 줄 · 생일 친구</figcaption></figure>
</div>

- **쓰이는 화면**: b 채팅 · 친구 탭, d 프로필.
- **감성 장치**: 프로필 전체가 풀블리드 사진 배경이고 그 위에 스티커(봉제 인형 같은 이모티콘) · 이름 · 상태 문구를 얹는다 [관찰]. 2023-03-29 카카오톡 v10.1.5는 구매·이벤트로 얻은 이모티콘을 프로필 배경과 사진 영역에 붙이는 기능을 도입했다 [S18]. 친구 탭 상단은 업데이트된 프로필 원형 가로 줄 [관찰].
- **DIO로 옮길 수 있는 것**: ① 내 공간 상단 배너(현재 진한 네이비)를 **사진/표지 배경 + 스티커 한두 개 + 이름** 구조로 바꾸는 방식 — 사용자가 만든 스티커가 프로필을 꾸미는 폐쇄 고리(공방 → 내 공간)를 만들 수 있다. ② 공유 방 멤버를 가로 원형 줄로.
- **옮기면 안 되는 것**: 카카오 노랑 면적(브랜드 충돌 — 가이드상 소셜 진입 버튼에만 제공자 색 허용) · AI 프로필 꾸미기 · 숏폼 · 오픈채팅.
- **1020 근거**: 11번 항목 참조 — 평점은 3.55로 낮다. 보편성의 사례이지 감성 선호의 근거는 아니다.

### 2.3 꾸미기 · 상점 · 폰꾸

#### ⑫ ZEPETO — 큰 미리보기 위에 타일 격자

<div class="grid five">
<figure><img src="레퍼런스 스크린샷/ZEPETO/01.jpg" alt="ZEPETO 01"><figcaption>01 (1번째) a 소개 — 보라 #9848FF 바탕, 아바타 모음</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/ZEPETO/02.jpg" alt="ZEPETO 02"><figcaption>02 (2번째) c 옷장 — 위 큰 아바타 미리보기, 아래 카테고리 탭 + 아이템 정사각 격자, "Buy 1" 알약</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/ZEPETO/03.jpg" alt="ZEPETO 03"><figcaption>03 (3번째) c Create — MY · HOT · Template · Couple · Photo 칩 탭 + 2열 카드</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/ZEPETO/04.jpg" alt="ZEPETO 04"><figcaption>04 (4번째) b 라이브 — 분홍 배경, 하트 · 선물 채팅 오버레이</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/ZEPETO/05.jpg" alt="ZEPETO 05"><figcaption>05 (5번째) b 월드 — 보라 3D 공간</figcaption></figure>
</div>

- **쓰이는 화면**: c 옷장 · 만들기, b 라이브 · 월드.
- **감성 장치**: 소개 이미지는 연한 라벤더 단색(#E5E7FE, 샘플) 바탕 + 중앙 제목 [관찰]. 옷장 화면의 구조는 **위 큰 결과물(아바타), 아래 탭 + 정사각 타일 격자, 선택 타일은 보라 테두리, 가격은 알약** [관찰]. 재화는 젬(ZEM, 14~196개 ₩1,500~18,000) [S27].
- **DIO로 옮길 수 있는 것**: 큰 결과물 미리보기 + 타일 격자 문법(패턴 5)은 DIO 기존 선택 타일 규칙(선택 시 `primarySoft` + 테두리 2)과 이미 같은 결이라 부담이 적다 — 공방의 '내 스티커'·'내 폰트' 보관함 상단에 내가 만든 결과물을 크게 먼저 보이고 아래에 격자를 둔다.
- **옮기면 안 되는 것**: 3D 사실 아바타 · 라이브 선물 과금 · 젬 재화 구조 · 랜덤 박스(스토어 연령 등급 표기에 포함).
- **1020 근거**: 12번 항목 참조 — 80% 10대 수치는 2022년 기사라 현재 근거로 못 쓴다.

#### ⑬ Goodnotes — 마켓은 검색창 + 탭 + 카드

<div class="grid four">
<figure><img src="레퍼런스 스크린샷/Goodnotes/01.jpg" alt="Goodnotes 01"><figcaption>01 (5번째) b 문서 — 폴더 목록 위로 "신규 항목 생성" 시트(폴더 · QuickNote · 문서 스캔 · 스터디 세트 · 이미지 · 사진 찍기)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Goodnotes/02.jpg" alt="Goodnotes 02"><figcaption>02 (6번째) b 발표 — 전체 스크린 미러링 시트 3택</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Goodnotes/03.jpg" alt="Goodnotes 03"><figcaption>03 (8번째) c 무한 캔버스 — 순서도 + 포스트잇 + 친구 이름표 "Alex" "Mika"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Goodnotes/04.jpg" alt="Goodnotes 04"><figcaption>04 (9번째) c 마켓 — 검색창 · 탭(크리에이터/브랜드/캐릭터/계획표) · 추천 아이템 3 · 신상 스티커 세트(제작자 이름 · ₩3,060)</figcaption></figure>
</div>

- **쓰이는 화면**: b 문서 · 신규 시트, c 캔버스 · 마켓.
- **감성 장치**: 스토어 이미지가 화면마다 파스텔 단색(#F5E9B5 노랑 · #C8E0FA 하늘 · #DFF088 연두, 샘플) + 짙은 색 제목 [관찰]. 마켓은 흰 카드 + 썸네일 + **제작자 이름 + 가격** 구조 [관찰]. 구입한 스티커는 앱의 Elements 도구에 바로 들어간다는 설명이 있다 [S20].
- **DIO로 옮길 수 있는 것**: ① 마켓 카드의 '썸네일 + 제작자 이름'은 공방 보관함의 '내 스티커 폴더'에서 만든 사람·이름만 남기는 카드로(가격 대신 만든 날 정도). ② 03의 **이름표(Alex · Mika)가 달린 포스트잇** — 함께 편집 중인 친구를 표시하는 법. DIO 공유 방과 직결된다.
- **옮기면 안 되는 것**: 유료 마켓 · 가격 칩 · 파란 툴바.
- **참고 — 휴지통**: 공식 문서상 Goodnotes Trash는 복구·이동·영구 삭제 전까지 남고 30일 자동 삭제 언급은 없다 [S28].
- **1020 근거**: 13번 항목 참조.

#### ⑭ Color Widgets — 해시태그로 고르는 폰꾸

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Color Widgets/01.jpg" alt="Color Widgets 01"><figcaption>01 (1번째) b "Customize your iPhone" — 'I am worthy.' 위젯 · 카운트다운 · 리마인더, "60,000,000 Users · Featured by Apple"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Color Widgets/02.jpg" alt="Color Widgets 02"><figcaption>02 (2번째) c "15,000+ themes" — 라벤더 그라데이션 홈</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Color Widgets/03.jpg" alt="Color Widgets 03"><figcaption>03 (3번째) c "Aesthetic widgets & icons" — 연초록 줄무늬 월 달력</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Color Widgets/04.jpg" alt="Color Widgets 04"><figcaption>04 (5번째) c 위젯 편집 — Background · Theme · Font · Font Size 4행 + "Set Widget"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Color Widgets/05.jpg" alt="Color Widgets 05"><figcaption>05 (7번째) c "Nostalgic themes & icons" — 아이팟 같은 레트로 위젯</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Color Widgets/06.jpg" alt="Color Widgets 06"><figcaption>06 (8번째) c 탐색 갤러리 — Discover · Liked · #minimal · #aesth 칩 + 2열 카드</figcaption></figure>
</div>

- **쓰이는 화면**: c 전부 — 테마 탐색 · 위젯 편집 · 보관(Liked).
- **감성 장치**: 모든 마케팅 이미지가 흐릿한 파스텔 배경 위에 **색 알약 라벨 제목**("Customize", "Aesthetic")을 올린다 [관찰]. 위젯 안에는 필기체 · 세리프 · 모노 시계가 섞여 서체 자체가 상품이다 [관찰]. 스토어 설명: 테마·배경 15,000개 이상, 사용자와 아티스트가 매일 새 테마를 올린다 [S5].
- **DIO로 옮길 수 있는 것**: ① 해시태그 칩(#minimal · #aesthetic)으로 탐색하는 2열 카드 갤러리. ② 편집기를 **4행(배경 · 테마 · 서체 · 크기)** 으로만 줄인 단순함 — 표지·스티커 꾸미기 설정을 얇게 유지하는 근거. ③ 'Liked' 탭 — 즐겨 쓰는 것만 모으는 보관함 분류.
- **옮기면 안 되는 것**: 15,000개 규모 · 앱 아이콘 교체 · Pro 구독(₩5,000~77,000 [S5]).
- **1020 근거**: 14번 항목 참조 — 미검증 마케팅 수치뿐.

#### ⑮ Widgetable — 병 속 구슬과 포스트잇

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Widgetable/01.jpg" alt="Widgetable 01"><figcaption>01 (1번째) b 홈 위젯 — 고양이 방 위젯 · 수면 위젯 VS · 보고 싶다 하트 위젯</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Widgetable/02.jpg" alt="Widgetable 02"><figcaption>02 (3번째) b 펫 집 — 동물들이 사는 방(침대 · 욕조 · 거울)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Widgetable/03.jpg" alt="Widgetable 03"><figcaption>03 (4번째) e 잠금 화면 펫 위젯 — "Wait! I forgot to kiss you!" 말풍선</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Widgetable/04.jpg" alt="Widgetable 04"><figcaption>04 (6번째) c 기분 공유 — 기분 구슬 병 + 포스트잇 쪽지 "자기야, 무슨 일 있어요?"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Widgetable/05.jpg" alt="Widgetable 05"><figcaption>05 (8번째) b 매일 상태 공유 — 라벤더 바탕, 상태 아이콘 + 하트 보내기</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Widgetable/06.jpg" alt="Widgetable 06"><figcaption>06 (10번째) b 모멘트 — 친구 원형 줄 + 카드 피드</figcaption></figure>
</div>

- **쓰이는 화면**: b 홈 위젯 · 펫 방 · 모멘트 피드, c 기분 구슬 · 쪽지 보내기, e 잠금 화면 말풍선.
- **감성 장치**: 스토어 이미지가 파스텔 단색/그라데이션을 돌려 쓴다(#EEFFEC 민트 · #FFEAC3 크림 오렌지 · #C7ECFF 하늘 · #CDCEFC 라벤더 · #C0F5C9 연두, 샘플) [관찰]. 질감은 **젤리처럼 반짝이는 구슬 + 종이 포스트잇**의 혼합이고, 캐릭터는 점 눈의 둥근 동물(고양이 · 시바 · 곰 · 펭귄) [관찰]. 앱 설명: 친구와 펫 공동 육성, 사진·낙서·글을 친구 화면에 남기는 "Pin It!", 기분 버블·수면 위젯, 실시간 거리 [S29].
- **DIO로 옮길 수 있는 것**: ① 기분 구슬 병 — 쌓인 기록 수를 숫자 대신 병·서랍에 쌓이는 스티커로 보여 주는 내 공간 통계(패턴 8). ② 포스트잇 쪽지 한 장 = 짧은 메시지 한 건.
- **옮기면 안 되는 것**: 펫 육성과 다이아 과금(₩1,100~7,700, 랜덤 박스 포함 12+ [S29]) · 실시간 거리·위치 공유(개인정보, I 영역) · 광고.
- **1020 근거**: 15번 항목 참조.

#### ⑯ 디데이 위젯 TheDayBefore — 키워드로 고르면 아이콘·배경이 따라온다

<div class="grid">
<figure><img src="레퍼런스 스크린샷/디데이 위젯 TheDayBefore/01.jpg" alt="디데이 01"><figcaption>01 (1번째) a 소개 — 코랄 #FF4D4D 바탕, "설레는 그날까지 함께 세요", 100일 카드</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/디데이 위젯 TheDayBefore/02.jpg" alt="디데이 02"><figcaption>02 (2번째) c 키워드 고르기 — 3×3 아이콘 + 이름 한 줄(커플 · 생일 · 입덕한 지 · 시험 · 아기개월수 · 반려동물 · 여행 · 다이어트 · 직접 등록)</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/디데이 위젯 TheDayBefore/03.jpg" alt="디데이 03"><figcaption>03 (3번째) b 홈 위젯 — 리스트형 · 사진 배경형 D-120</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/디데이 위젯 TheDayBefore/04.jpg" alt="디데이 04"><figcaption>04 (4번째) e 알림 — 말풍선 카드 "오늘은 우리 만난 날 100일 · 함께한 날들이 빛나요"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/디데이 위젯 TheDayBefore/05.jpg" alt="디데이 05"><figcaption>05 (6번째) c 꾸미기 — 스타일 4종 · 아이콘 표시 토글 · 배경 사진 · 아이콘 · 효과</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/디데이 위젯 TheDayBefore/06.jpg" alt="디데이 06"><figcaption>06 (8번째) c 추천 디데이 — 카테고리 탭 + 카드 격자</figcaption></figure>
</div>

- **쓰이는 화면**: a 소개, c 키워드 시트 · 꾸미기 · 추천, b 위젯, e 알림 문구.
- **감성 장치**: 앱 UI 바탕 #FAF6F7 핑크 틴트 화이트(샘플) + 코랄 포인트, 흰 알약 카드 위에 작은 빨간 아이콘 [관찰]. 제목은 굵은 둥근 고딕 [관찰]. 스토어 설명: 키워드를 고르면 아이콘 · 배경 · 알림이 자동으로 설정된다 [S30].
- **DIO로 옮길 수 있는 것**: ① 새 다이어리 만들기의 **키워드 3×3 아이콘 시트** — 고른 키워드가 표지 · 속지 · 스티커 세트를 한 번에 정해 주는 구조(현재 구역 카드 작업대와 비교 필요). ② 알림을 '숫자 + 짧은 한 줄'로 쓰는 톤.
- **옮기면 안 되는 것**: 코랄 면적(CI) · 알림 속 이모지 사용은 별도 판단 필요(가이드는 UI 아이콘에 이모지를 섞지 말라고 정함) · 광고제거 ₩15,000 구조.
- **1020 근거**: 16번 항목 참조.

### 2.4 카메라 · 인생네컷

#### ⑰ 포토이즘 — 프레임이 상품이다

<div class="grid">
<figure><img src="레퍼런스 스크린샷/포토이즘/01.jpg" alt="포토이즘 01"><figcaption>01 (1번째) a 소개 — 회보라 바탕, 모델 + 네컷 스트립 + 반짝이</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/포토이즘/02.jpg" alt="포토이즘 02"><figcaption>02 (2번째) a 첫 이용 혜택 — 반투명 카드 2장</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/포토이즘/03.jpg" alt="포토이즘 03"><figcaption>03 (4번째) d 마이 — 모먼트 · 리뷰 · 쿠폰 아이콘 줄 + 날짜별 앨범, 라임 코치마크 "모먼트 등록하기"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/포토이즘/04.jpg" alt="포토이즘 04"><figcaption>04 (5번째) e 추천 팝업 — 선물 아이콘 + 추천 프레임 미리보기 + 검정 "프레임 상세보기" 버튼</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/포토이즘/05.jpg" alt="포토이즘 05"><figcaption>05 (7번째) c 프레임 둘러보기 — 탭(Pick · Original · Artist · Character) + 해시태그 + 금붕어 프레임 카드, 라임 코치마크 "모먼트 카테고리로 찾아보기"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/포토이즘/06.jpg" alt="포토이즘 06"><figcaption>06 (8번째) c 장바구니 — 프레임 4CUT 4,000원 + "키오스크에서 불러오기"</figcaption></figure>
</div>

- **쓰이는 화면**: a 소개 · 혜택, c 프레임 둘러보기 · 장바구니, d 마이 · 모먼트, e 추천 팝업.
- **감성 장치**: 소개 이미지는 차콜(#2F2E36, 샘플) 바탕 + 라임 그린 말풍선 코치마크 [관찰]. 앱 UI는 흰 면 + 검정 버튼이라 **감성은 프레임 카드 안의 일러스트**(금붕어 · 수박 · 청색 수채)에만 있다 [관찰]. 기념일을 등록하면 그날에 어울리는 프레임을 추천하고, 앱 설명은 장바구니에 담아 키오스크에서 불러와 촬영한다고 적었다 [S31].
- **DIO로 옮길 수 있는 것**: ① 프레임 카드 = 완성된 결과 전체를 보여 주는 미리보기 + 탭 + 해시태그 칩(패턴 5) — 표지·속지 고르기 화면. ② '담아 두기' — 즐겨 쓰는 표지·스티커를 모으는 보관함 분류. ③ 모먼트(기념일 등록 → 어울리는 프레임) — 날짜에 맞춘 표지 제안(카드만 두고 설명 문장은 쓰지 않는다는 조건).
- **옮기면 안 되는 것**: 키오스크 · 결제 · 스탬프 · **라임 말풍선 코치마크**(사용법 안내라 안내 멘트 금지 위반) · 차콜 배경.
- **1020 근거**: 17번 항목 참조.

#### ⑱ Dazz — 카메라를 사물로 고른다

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Dazz/01.jpg" alt="Dazz 01"><figcaption>01 (1번째) a 소개 — 3D 아이콘형 카메라 컬렉션, 검정→빨강 바탕</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Dazz/02.jpg" alt="Dazz 02"><figcaption>02 (2번째) c 조합 선택 — 하단에 카메라 아이콘 + 렌즈 효과 아이콘 + 이름 두 개 ("DFunS + Star")</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Dazz/03.jpg" alt="Dazz 03"><figcaption>03 (3번째) c 폴라로이드 프레임 — "Inst Color"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Dazz/04.jpg" alt="Dazz 04"><figcaption>04 (5번째) c 필름 스트립 프레임 — "8mm"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Dazz/05.jpg" alt="Dazz 05"><figcaption>05 (7번째) c 날짜 스탬프 "AM 11:17 NOV.10 2016" — "VHS"</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Dazz/06.jpg" alt="Dazz 06"><figcaption>06 (8번째) c 이중 노출 — 흰 바탕, "CT2F + 이중 노출"</figcaption></figure>
</div>

- **쓰이는 화면**: a 소개, c 카메라·프레임·효과 조합 선택.
- **감성 장치**: 바탕은 순흑(#000000, 샘플)이고 사진이 주인공 [관찰]. 도구 선택 UI가 **질감 있는 3D 카메라 아이콘 + 이름 한 줄**의 사물 선택이고, 프레임은 폴라로이드 · 필름 스트립 · 날짜 스탬프 질감이다 [관찰]. 스토어 설명: 135 · 120 · 즉석 · 일회용 필름 포맷, 8mm · VHS 영상 [S32].
- **DIO로 옮길 수 있는 것**: ① 도구를 캐릭터가 아니라 **사물 아이콘 하나 + 이름 한 줄**로 고르는 선택 UI — 공방 진입 카드 3장이 모두 같은 모양인 문제(현재 진단)를 재료별 사물 모양으로 풀 수 있는 힌트. ② 날짜 스탬프 · 폴라로이드 · 필름 스트립 틀은 DIO의 사진 특수 모양 · 사진 틀 기능과 바로 이어진다.
- **옮기면 안 되는 것**: 3D 카메라 아이콘 셋(UI 아이콘은 선만 쓰는 규칙 — 콘텐츠·보관함 썸네일 안에서만 가능) · 카메라 개별 판매(₩1,100~4,400)와 Pro(₩9,900 · ₩29,000) 구조.
- **1020 근거**: 18번 항목 참조.

#### ⑲ SNOW — 마케팅은 파스텔 단색, 도구는 검정

<div class="grid five">
<figure><img src="레퍼런스 스크린샷/SNOW/01.jpg" alt="SNOW 01"><figcaption>01 (1번째) c 체형 보정 — 초록 #81C47F 바탕, 하단 도구 줄</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/SNOW/02.jpg" alt="SNOW 02"><figcaption>02 (2번째) c 아이폰 모드 — 파랑 #7392D5 바탕, 기종 선택 시트</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/SNOW/03.jpg" alt="SNOW 03"><figcaption>03 (4번째) c AI 헤어 — 코랄 #F4A6A6 바탕, 헤어스타일 썸네일 줄</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/SNOW/04.jpg" alt="SNOW 04"><figcaption>04 (5번째) b 고화질 촬영 — 분홍보라 #D69BD3 바탕, 검정 하단 바 · 흰 셔터</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/SNOW/05.jpg" alt="SNOW 05"><figcaption>05 (6번째) c 필름 필터 — 민트 #87C8B2 바탕, FILM · RETRO · SELFIE · MOOD 칩 + 썸네일 줄</figcaption></figure>
</div>

- **쓰이는 화면**: b 카메라, c 필터 · 보정.
- **감성 장치**: 스토어 이미지는 화면마다 파스텔 단색 풀 배경 + 중앙 정렬 흰 문구 [관찰]. **앱 UI는 검정 하단 도구 바 + 흰 셔터 + 얇은 선 아이콘**이라 감성은 필터 이름과 썸네일에 있다 [관찰].
- **DIO로 옮길 수 있는 것**: 분류 칩 4개 + 가로 썸네일 줄 구조 — 공방 보관함의 분류 칩과 비슷하다. 도구 화면(검정)과 감성 화면(색)을 나누는 배분.
- **옮기면 안 되는 것**: 얼굴·체형 보정 이미지 톤 · VIP(월 ₩11,900)와 코인 과금 [S6].
- **1020 근거**: 19번 항목 참조.

### 2.5 조용하지만 감성적인 라이프스타일

#### ⑳ Tiimo — 라벤더 오프화이트와 둥근 사물 아이콘

<div class="grid">
<figure><img src="레퍼런스 스크린샷/Tiimo/01.jpg" alt="Tiimo 01"><figcaption>01 (1번째) a 소개 — 연보라 바탕, 얇고 큰 제목 "나만의 할 일 목록 플래너", Apple 수상 라우렐 4개</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Tiimo/02.jpg" alt="Tiimo 02"><figcaption>02 (2번째) b AI 코치 — 어두운 알약 카드 목록 + "이 앱은 정말 제 삶을 바꿔 놓았어요" 후기</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Tiimo/03.jpg" alt="Tiimo 03"><figcaption>03 (3번째) b 일일 목록 — 요일 선택 + 시간대별 카드, 원형 색 아이콘 배지</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Tiimo/04.jpg" alt="Tiimo 04"><figcaption>04 (4번째) e 잠금 화면 — 집중 시간 카운트(14:56) 라이브 액티비티</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Tiimo/05.jpg" alt="Tiimo 05"><figcaption>05 (6번째) b 포커스 타이머 — 가운데 사물 하나(빨래 바구니) + 둘레 진행 호</figcaption></figure>
<figure><img src="레퍼런스 스크린샷/Tiimo/06.jpg" alt="Tiimo 06"><figcaption>06 (7번째) b 모든 기기 — 타임라인 캘린더 + 시계</figcaption></figure>
</div>

- **쓰이는 화면**: a 소개, b 목록 · 타이머, e 잠금 화면 상태.
- **감성 장치**: 바탕 #F8F7FF 라벤더 틴트 화이트 + #D7C9FF 라벤더 면(샘플), 진행 호는 보라 [관찰]. 큰 제목은 얇은 산세리프, 카드는 알약형, 작업마다 **둥근 색 원 + 사물 아이콘(바구니 · 자전거)** 배지 [관찰]. 스토어 설명: 광고 없음, 색상 코드 시각 일정, 집중 타이머 [S7]. 수상 — 2025 올해의 iPhone 앱, 2024 Apple Design Awards 최종 후보 [S7][S23].
- **DIO로 옮길 수 있는 것**: ① 페리윙클과 같은 계열의 라벤더 오프화이트가 '조용한 감성'을 만든다는 직접적 선례 — 바탕 한 톤(패턴 2)의 가장 가까운 사례. ② 목록 항목 하나당 '원형 색 + 사물' 배지 — 다이어리 카드 옆 작은 표지 배지. ③ 가운데 사물 + 둘레 진행 호 — 내보내기 진행 알약, 휴지통 남은 일수 표시에 쓸 수 있는 모양.
- **옮기면 안 되는 것**: AI 코치 대화 UI · 라이브 액티비티 · Pro 구독(₩6,900~249,000).
- **1020 근거**: 20번 항목 참조 — 1020 근거는 확인하지 못함.

## 3. 화면별 종합

> 각 칸은 **감성을 만드는 공통 패턴 [근거] → DIO에 줄 시사점(조사자 제안)** 순서다. DIO의 현재 상태는 [01 현재 화면 진단](../01%20현재%20화면%20진단.md)과 [디자인 가이드](../../디자인%20가이드.md)를 기준으로 했다.

### 3.1 로그인 · 가입

- **패턴 A: 폼은 그대로 두고 '첫 장면'에 감성을 넣는다.** 수집한 156장에 이메일·소셜 로그인 화면은 0장이다 [관찰]. Finch는 온보딩에 알 고르기 · 대명사 · 부화 축하(방사형 햇살) · 이름 짓기 · 성격 선택 · 펫과의 대화로 이루어진 첫 장면 묶음을 둔다 [S9] (화면 순서와 계정 생성 시점은 출처 글이 밝히지 않는다).
  - → **시사점**: 로그인 카드 위 한 곳에 모아 한 컷(책 일러스트)을 둔다. 로그인 화면의 90%가 흰 면이라는 진단과 맞붙는 가장 적은 변경이다.
- **패턴 B: 안전감을 문장이 아니라 사물로.** 하루콩은 책 + 자물쇠 일러스트와 "해린의 일기장 #1234" 식별자(05), Day One은 Face ID 아이콘 하나와 "100% 비공개"(02), Daylio는 PIN 번호판(06)이다 [관찰].
  - → **시사점**: 설명 문구 없이 자물쇠 달린 모아 책 한 컷을 상단에 둘 수 있다(안내 멘트 금지와 충돌 없음 — 문장이 아니라 그림). 개인정보 안전감은 I 영역과 이어진다.
- **패턴 C: 로그인 없이 시작이 가장 감성적인 선택지가 된다.** 다욜은 "로그인 없이 바로 시작", 데이터는 기기에 저장한다고 적었다 [S3].
  - → **시사점**: DIO에는 이미 게스트 시작이 있다. 지금 구분선 없는 작은 링크인데, 위치·모양(흰 칩 등)으로 격을 올리는 것은 가능하다(가이드는 구분선만 금지).
- **패턴 D: 혜택 카드는 첫 장면의 보조.** 포토이즘은 첫 이용 혜택 카드 2장을 소개 직후에 둔다(02) [관찰]. DIO는 가입 혜택이 없어 해당 없음.
- **소셜 로그인 버튼 스타일은 이번 수집에서 확인하지 못함.** 마케팅 스크린샷에 나오지 않는다.
- **충돌 주의**: 소개 문구를 앱 안으로 가져오지 않는다(안내 멘트 금지). 카카오 노랑은 소셜 진입 버튼에만(가이드).

### 3.2 다이어리 홈

- **패턴 A: 홈은 물건이 놓인 방/책장이다.** MOODA는 벽 사진 · 창 · 가챠 · 램프 · 바닥의 책으로, 다욜은 표지 carousel로, Widgetable은 펫 방으로 홈을 만든다 [관찰].
  - → **시사점**: DIO 홈은 이미 책상이다. MOODA의 방식을 따르면 책상 위 소품이 **각각 입구 하나**(월간 모아 보기 · 최근 기록 · 휴지통 등)가 될 수 있는지가 다음 질문이다. 단 MOODA는 정면 시점이라 '위에서 본 시점' 규칙과 다르다.
- **패턴 B: 도구는 작고 장면 바깥에 둔다.** MOODA 홈의 도구는 상단 선 아이콘 3개뿐이고, 다욜은 + 버튼 하나와 하단 탭이다. 표지나 소품 위에 도구가 얹히지 않는다 [관찰].
  - → **시사점**: 현재 진단의 "선택 카드의 별 · 편집 · 삭제가 표지 위에 상시 얹힘"과 직접 대비된다. 도구를 표지 밖(카드 아래 · 길게 누르기)으로 빼는 쪽이 감성 앱의 공통 문법이다.
- **패턴 C: 표지 아래 2단 정보(제목 + 쪽수), 옆 표지는 색 띠로 걸친다.** 다욜 "My Journal ⋯ / 7Page" [관찰] — DIO의 캐러셀(가운데 선명, 양옆 흐림)과 같은 계열이라 구조는 맞다.
- **패턴 D: 달력/격자가 모자이크가 된다.** 하루콩 · MOODA · Daylio는 한 달을 칸마다 얼굴/콩으로 채운다 [관찰].
  - → **시사점**: '한눈에 보기'는 표지 색 칩 모자이크로 감성 장치가 된다.
- **충돌 주의**: 손글씨 제목(MOODA)은 UI 서체 규칙 위반. 캐릭터 얼굴을 로고 자리에 두는 것(다욜)은 로고 독립성 규칙 위반.

### 3.3 꾸미기 · 공방 · 보관함

- **패턴 A: 결과물을 크게 먼저, 재료는 아래 격자.** ZEPETO 옷장은 위 큰 미리보기 + 아래 탭·정사각 타일(선택 시 테두리) [관찰].
  - → **시사점**: DIO 공방의 '내 폰트 · 내 스티커'는 상단에 내가 만든 결과물(글꼴로 쓴 글씨, 스티커 모음)을 크게 보이고 아래에 격자를 둔다. 현재 진단의 "결과물이 안 보이고 기능 이름만 있다"에 답한다. 선택 타일 규칙(`primarySoft` + 테두리 2)은 이미 같은 결이다.
- **패턴 B: 탐색은 칩 + 해시태그 + 2열 카드.** Color Widgets(#minimal · #aesthetic), 포토이즘(Pick · Original · Artist · Character), SNOW(FILM · RETRO · SELFIE · MOOD) [관찰].
  - → **시사점**: 보관함 분류를 칩으로. 스티커가 쌓일수록 필요해진다.
- **패턴 C: 편집기는 4행으로 얇게.** Color Widgets 편집은 배경 · 테마 · 서체 · 크기 4행 + 적용 버튼 [관찰].
  - → **시사점**: 설정이 길어지지 않게 하는 근거. Pratt 비평도 Finch 설정의 선택지 과다를 짚었다 [S10].
- **패턴 D: 재료를 사물로 고른다.** Dazz는 카메라 아이콘 + 이름으로, 포토이즘은 프레임 카드로 고른다 [관찰].
  - → **시사점**: 공방 제작 카드 3장이 같은 모양인 문제(진단)를 폰트=잉크병/펜, 스티커 시트=가위/시트, 오리기=가위처럼 재료별 사물 모양으로 풀 수 있다. 어떤 사물 그림으로 할지는 코덱스 판단.
- **패턴 E: 제작자 이름 + 결과물 썸네일.** Goodnotes 마켓 카드 [관찰] → 내가 만든 것의 폴더 카드에 '이름 · 만든 날'만.
- **충돌 주의**: 가격 · 재화 · 랜덤 박스 · 구독은 가져오지 않는다. 3D 아이콘은 보관함 썸네일 안(콘텐츠)에서만.

### 3.4 내 공간 (프로필 · 통계 · 설정)

- **패턴 A: 프로필 배경에 사진·스티커.** 카카오톡 프로필은 풀블리드 사진 + 스티커 + 이름 [관찰][S18].
  - → **시사점**: 진한 네이비 배너를 **표지/사진 배경 + 스티커 한두 개 + 이름**으로 — 공방에서 만든 스티커가 내 공간을 꾸미는 고리가 생긴다. "로그인 유도 광고"처럼 읽히는 문제와 맞붙는다.
- **패턴 B: 숫자 대신 모아 보기 시각물.** BeReal Memories(월 사진 달력 + 연말 영상), Locket(월말 요약 영상), 하루콩(월간 콩 달력), Widgetable(병 속 구슬), Finch(영역별 막대 · 30일 칩) [관찰][S5].
  - → **시사점**: 지금 통계는 숫자 두 개(6 · 0)뿐이다. 월별 표지 사진 달력, 병 속에 쌓이는 스티커 같은 **쌓이는 모양** 하나가 감성을 만든다. 영상 요약은 범위 밖(내보내기 이슈).
- **패턴 C: 상태 한 줄 말풍선.** Instagram 노트(아바타 위 한 줄) [관찰][S26].
- **패턴 D: 식별자 + 색 원 아바타.** 하루콩 "해린의 일기장 #1234" [관찰] — 로그인 전(게스트)도 이름 있는 일기장으로 보이게 하는 법.
- **설정은 분리**: Day One · Goodnotes는 설정을 흰 목록으로 절제한다 — 설정 앱처럼 읽히는 것은 정상이고, 문제는 프로필 영역에 감성이 없다는 점이다.

### 3.5 휴지통 · 빈 상태

- **패턴 A: 휴지통은 목록의 조용한 맨 아래 한 줄.** Day One은 Trash 한 줄 + 개수(54 entries)이고 삭제 항목이 있을 때만 나타난다 [관찰][S24]. Apple 사진 앱의 '최근 삭제된 항목'은 30일 보관, Face ID로 잠금 해제 후 복구/삭제 [S33].
  - → **시사점**: 보관 기간은 앱마다 다르다(Apple 사진은 30일 [S33], Day One · Goodnotes는 자동 만료 없음 [S24][S28]). 30일 시한이 있는 DIO는 '남은 시간'을 눈에 보이게 하는 장치가 필요한 쪽이다.
- **패턴 B: 시간·상태를 물성으로.** Lapse는 현상 대기를 잠긴 사진 격자로 [관찰], Tiimo는 사물 + 둘레 진행 호로 시간을 보여 준다 [관찰].
  - → **시사점**: 현재 `n일 후 영구 삭제` 글자 하나뿐인 신호를 카드 모서리의 작은 호(남은 비율) 같은 물성으로 보강할 수 있다. 3일 이하 `danger` 색 규칙과 병행 가능하다. 문구는 늘리지 않는다.
- **패턴 C: 빈 상태는 사물 한 점 + 제목만.** 하루콩 포춘쿠키 쪽지(06)는 사물 일러스트 한 점으로 기다림을 채운다 [관찰].
  - → **시사점**: 빈 휴지통에 모아 · 디오 또는 빈 상자 한 컷 + 제목 한 줄. 가이드의 빈 화면 문구("… 없어요")는 유지.
- **패턴 D: 축하·확정 순간만 캐릭터.** Finch 모달(캐릭터 둘 + 이름 + 한 줄 버튼) [관찰].
  - → **시사점**: '복원' 완료 같은 확정 순간은 토스트가 가이드에 이미 있으므로 모달은 과하다 [추정]. 동작 시트(`복원` · `영구 삭제` · `닫기`)에 캐릭터를 넣기보다 위에서 표지 미리보기만 크게 보이는 쪽이 가볍다.
- **참고 인용(표 외)**: Opal의 차단 화면은 "Instagram is Blocked by Opal / You set this rule yesterday. Past you was right."라고 적어 막힘 상태를 한 줄의 인격 있는 문구로 처리한다 [관찰]. 오류·막힘 문구가 건조해야 하는 DIO 규칙(가이드 §8)과 대비되는 사례로만 남긴다.
- **충돌 주의**: 영구 삭제는 되돌릴 수 없으므로 귀여운 문구로 흐리지 않는다(I 영역의 가설 "감성 톤이면 위험 안내도 부드럽게 흐려도 된다"를 반증하는 쪽).

### 3.6 H · I 영역 연결 메모 (공유 · 안전감)

- 친구 흔적: Locket 20명 · 반응 미집계 [S5], BeReal 얼굴 반응(RealMoji), Goodnotes 이름표 포스트잇 [관찰] — **얼굴·이름으로 남기고 숫자는 줄인다.**
- 공개 범위: Instagram 초록 별 하나, Day One "100% 비공개", 다욜 기기 저장 [관찰][S3] — **문장 대신 색 + 아이콘 하나.**
- 삭제·복구: 30일 보관 + 잠금 해제 후 복구(Apple 사진) [S33] — 복구 가능성을 눈에 보이게 하는 것이 안전감이다.

## 4. 한계

1. **마케팅 이미지다.** Apple 앱스토어 스크린샷은 개발사가 고른 장면이라 실제 앱과 다를 수 있다. 앱을 직접 설치해 확인하지 않았다.
2. **로그인·가입·삭제 화면은 거의 없다.** 156장에 이메일·소셜 로그인 폼은 0장, 휴지통은 Day One 1장이다. 소셜 로그인 버튼 스타일, 가입 단계 수, 빈 상태 일러스트는 이번 조사로 확인하지 못했다.
3. **모션 · 사운드 · 햅틱은 못 봤다.** 정지 이미지로 알 수 없어 Finch의 방사형 햇살(출처 글), BeReal 타이머(스토어 문구) 외에는 쓰지 않았다.
4. **1020 여성 소비 근거가 약하다.** 연령·성별 통계는 대부분 확인하지 못했다. 확인된 것은 평점, 순위, 기사 속 정성 증언(포토이즘 · Dazz), 신규 설치 순위(Instagram) 정도다. 제페토의 "10대 80%"는 2022년 기사이고, Lapse "79% 24세 미만"은 원문 확인 실패, Color Widgets · Widgetable · 디데이 위젯의 "6000만 · 5000만"은 마케팅 이미지 문구라 모두 미검증이다. Finch는 사용자 76%가 여성이지만 주 연령이 25~35세다.
5. **스크린샷 언어 차이.** Finch · Lapse는 영어 이미지(Finch는 KR 앱이 영어만 지원), Lapse는 미국 스토어다.
6. **샘플 색은 마케팅 배경값이다.** 앱 UI의 실제 토큰이 아니다. 어떤 색이 DIO에 어울리는지는 미감 판단이라 정하지 않았다.
7. **수집 실패.** Notion Calendar는 스토어 검색 응답을 받지 못했다. Apple Newsroom(Tiimo 수상) · Instagram 노트 출시 · Goodnotes 마켓 · BeReal 비율 일부는 검색 결과 요약으로만 확인했고 원문을 열지 못했다(출처표에 표시).
8. **DIO 시사점은 제안이다.** 안내 멘트 금지 · 시스템 서체 · BI/CI에 닿는 사항은 앱마다 적었지만, 구현 가능성(RN 범위)과 최종 미감은 따로 검토해야 한다.

## 5. 출처표

### 앱스토어 페이지 (한국, 2026-10-30~31 열람 · 평점은 iTunes Search API와 페이지 값)

| ID | 내용 | URL |
|---|---|---|
| S1 | Finch KR 페이지 — 평점 4.9(316), 영어만 지원, 인앱 구입 | https://apps.apple.com/kr/app/finch-self-care-pet/id1528595748 |
| S2 | 하루콩 — 인앱 구입 · 버전 기록 · 리뷰 | https://apps.apple.com/kr/app/%ED%95%98%EB%A3%A8%EC%BD%A9/id1553223828 |
| S3 | 다욜 — 로그인 없이 시작 · 스티커 · 속지 · 리뷰 | https://apps.apple.com/kr/app/%EB%8B%A4%EC%9A%9C-%EB%8B%A4%EC%9D%B4%EC%96%B4%EB%A6%AC-%EC%BA%98%EB%A6%B0%EB%8D%94-%EC%9D%BC%EA%B8%B0/id1571925624 |
| S4 | Day One — 1,500만+ 다운로드 · 잠금 · 인앱 구입 | https://apps.apple.com/kr/app/id1044867788 |
| S5 | Color Widgets — 테마 15,000개 · 인앱 구입 / Locket — 20명 · 반응 미집계 / 하루콩 등은 각 앱 페이지 | https://apps.apple.com/kr/app/color-widgets/id1531594277 · https://apps.apple.com/kr/app/locket-widget/id1600525061 |
| S6 | SNOW — "2억명" · 스티커 · VIP · 코인 | https://apps.apple.com/kr/app/id1022267439 |
| S7 | Tiimo — 광고 없음 · 수상 · 리뷰 | https://apps.apple.com/kr/app/id1480220328 |
| S8 | MOODA — 방 꾸미기 · 무드볼 · 인앱 구입 | https://apps.apple.com/kr/app/mooda/id6449689589 |
| 기타 | BeReal / Daylio / Instagram / 카카오톡 / ZEPETO / Goodnotes / Widgetable / 디데이 위젯 / 포토이즘 / Dazz / Lapse(US) | https://apps.apple.com/kr/app/id1459645446 · id1194023242 · id389801252 · id362057947 · id1350301428 · id1444383602 · id1641107226 · id991283955 · id6747059622 · id1422471180 · https://apps.apple.com/us/app/id1636699256 |

### 기사 · 블로그 · 공식 문서

| ID | 내용 | URL |
|---|---|---|
| S9 | ScreensDesign — Finch 온보딩 화면 소개 | https://screensdesign.com/articles/finch-app-onboarding-design/ |
| S10 | Pratt IxD — Finch 디자인 비평 (2026-02) | https://ixd.prattsi.org/2026/02/design-critique-finch-self-care-pet-ios-app/ |
| S11 | FoxData — Finch 에디터스 초이스 · 사용자 76% 여성 · 25~35세 (2025-10) | https://foxdata.com/jp/blogs/finch-as-app-store-editors-choice-a-self-care-companion/ |
| S12 | 유니콘팩토리 — 하루콩 950만+ 다운로드 · 감정 일기 2,960만 건 (2025-01-08) | https://www.unicornfactory.co.kr/article/2025010716384717743 |
| S13 | 디지털인사이트 — MOODA 소개 (2020-10-30) | https://ditoday.com/?p=43881 |
| S14 | TechCrunch — Locket Gen Alpha (2025-11-03) | https://techcrunch.com/2025/11/03/lockets-social-app-is-picking-up-steam-with-gen-alpha |
| S15 | TechCrunch — Lapse 앱 순위 · 설치 수 (2023-09-26) | https://techcrunch.com/?p=2605741 |
| S16 | Pulse 2 — Lapse 시리즈A (2024-02-28) | https://pulse2.com/lapse-gen-z-focused-photo-sharing-app-company-secures-30-million/ |
| S17 | 이투데이 — 모바일인덱스 2022 앱 총결산, 1020 신규 설치 (2023-01-31) | https://www.etoday.co.kr/news/view/2217084 |
| S18 | 카카오 보도자료 — 프로필 이모티콘 스티커 (2023-03-29) | https://www.kakaocorp.com/page/detail/9921 |
| S19 | 인사이트 — 제페토 입점 기사, "10대 80% 이상" (2022-06-09) | https://www.insight.co.kr/news/398866 |
| S20 | Goodnotes 스티커 / 마켓 (검색 결과 요약 기준) | https://www.goodnotes.com/shop/stickers · https://marketplace.goodnotes.com/ |
| S21 | 캐릿 — 네컷 사진 프레임 트렌드, 1020 자문단 (2023-09-14) | https://www.careet.net/1176 |
| S22 | 아시아경제 — Dazz 인기 (2023-04-22) | https://view.asiae.co.kr/article/2023042016331034303 |
| S23 | Apple Newsroom — 2025 App Store Awards (검색 결과 요약 기준, 원문 미열람) | https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards |
| S24 | Day One 지원 — 휴지통에서 항목 복구 | https://dayoneapp.com/guides/troubleshooting/recover-deleted-entries-from-trash/ |
| S25 | Lapse 미국 스토어 페이지 — "Shoot first, develop later" | https://apps.apple.com/us/app/id1636699256 |
| S26 | TechCrunch — Instagram 노트 출시 (2022-12-13, 검색 결과 요약 기준) | https://techcrunch.com/2022/12/13/instagram-now-supports-text-updates-with-launch-of-notes-adds-other-new-sharing-features |
| S27 | ZEPETO 스토어 — 젬 인앱 구입 | https://apps.apple.com/kr/app/id1350301428 |
| S28 | Goodnotes 지원 — 휴지통 복구 | https://support.goodnotes.com/hc/en-us/articles/7353712039055-Recover-deleted-documents-folders-and-pages-from-the-Trash-Bin |
| S29 | Widgetable 스토어 — 펫 · Pin It · 인앱 구입 | https://apps.apple.com/kr/app/id1641107226 |
| S30 | 디데이 위젯 스토어 — 키워드 · 꾸미기 · 인앱 구입 | https://apps.apple.com/kr/app/id991283955 |
| S31 | 포토이즘 스토어 — 모먼트 · 장바구니 | https://apps.apple.com/kr/app/id6747059622 |
| S32 | Dazz 스토어 — 필름 포맷 · 인앱 구입 | https://apps.apple.com/kr/app/id1422471180 |
| S33 | Apple 지원 — 사진 '최근 삭제된 항목' 30일, 잠금 해제 후 복구 (검색 결과 요약 기준) | https://support.apple.com/en-us/104967 |

### 내부 문서

- [docs/디자인 가이드.md](../../디자인%20가이드.md) — §3.1 서체, §5.5 다이어리 홈, §5.6 휴지통, §8 글쓰기(안내 멘트 금지), 부록 로그인·가입 · 꾸미기 공방
- [01 현재 화면 진단](../01%20현재%20화면%20진단.md) · [00 조사 계획](../00%20조사%20계획.md)
- [캐릭터 디자인 / 01 레퍼런스 조사](../../캐릭터%20디자인/01%20레퍼런스%20조사.md)
