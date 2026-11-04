# UI 디자인·글자 잘림·깨짐 점검 (P0 0, P1 5, P2 9, P3 8) — 소스 정적 점검

### [P1] 시스템 글자 확대 상한이 전혀 없다
- 위치: App.js, src/shared/dioText/DioText.js:39-50. `allowFontScaling`은 DrawingPad.js:57 한 곳, `maxFontSizeMultiplier` 0건. 고정 높이: 하단 탭 styles.js:22(height 64, 라벨 11/14), TopBar.js:206(barCompact 60), ConfirmDialog.js:42(height 42, numberOfLines 없음), 선택 바 40, 좌측 바 라벨 styles.js:79.
- 영향: Android 200%·iOS 큰 글씨에서 하단 탭 5개(360dp 폰 칸당 약 65dp) 라벨 말줄임, 고정 높이 버튼 두 줄 시 잘림(추정).
- 해결안: DioText 기본 `maxFontSizeMultiplier={1.3}`, 툴바·탭·칩·버튼 1.15. 고정 height→`minHeight`+`paddingVertical`.

### [P1] 좌측 바 닉네임이 말줄임 없이 잘린다
- 위치: src/diary/components/SideRail.js:168, src/diary/styles.js:79(`railLabel: { flexShrink: 0 }`), :30(rail width 218, padding 20, overflow hidden)
- 현상: 닉네임 최대 12자(ProfileEditScreen.js:339). `flexShrink: 0`이라 `numberOfLines={1}`이 말줄임을 못 만듦. 가용 폭 약 110dp, 한글 12자 약 156dp(추정).
- 해결안: 프로필 라벨 `flexShrink: 1, minWidth: 0`, `ellipsizeMode="tail"`.

### [P1] 알림 설정 화면에 눌림 효과가 남아 있고 모양이 다른 화면과 다르다
- 위치: src/diary/screens/NotificationSettingsScreen.js:141(`pressed: { opacity: 0.7 }`, :61·:92), :140 disabled 0.42(공용 0.4), :127 headerBackCompact 38×38(hitSlop 없음), :130 section 16/800.
- 해결안: `pressed: {}`, `DISABLED_OPACITY`, 뒤로가기 44×44 또는 hitSlop, section 15/700.

### [P1] 안내 멘트(사용법·결과 예고) 금지 위반 문구(가이드 §8)
- PenSettings.js:77 "끝점을 길게 눌러 직선 만들기", :74 "필기에 사용한 색이 여기에 저장돼요." / PageSettingsDialog.js:53 "크기를 바꿔도 … 유지돼요.", :56 "격자는 편집 화면에만 표시돼요." / NotificationSettingsScreen.js:71-90 "…알려드려요." 두 줄, "현재 설정은 이 기기에만 저장돼요." / SharingHub.js:728, :736 사본·원본 설명 / EditorScreen.js:1390 "링크를 걸었어요. 읽기 모드에서 누르면 열려요." / ProfileEditScreen.js:496, PasswordResetScreen.js:198 "다시 로그인해 주세요"
- 해결안: 삭제, 토스트는 "링크를 걸었어요."

### [P1] 키보드가 입력칸을 가릴 수 있는 모달에 키보드 회피 처리가 없다 (추정)
- 위치: DiaryCreateModal.js:348-352(입력칸 :309), LibrarySearchScreen.js, DecorationStudioScreen.js. app.json `softwareKeyboardLayoutMode` 없음. KAV는 auth·sharing·TextLinkDialog·PageSettingsDialog만.
- 영향: 폰에서 이름 입력 시 키보드가 시트 하단 입력칸·완료 버튼을 덮을 수 있음(실기기 확인 필요).
- 해결안: 시트를 KAV로 감싸거나 AuthScreen.js:137 keyboardPad 방식 재사용.

## P2
1. 전체 화면 모달 3곳만 `animationType="slide"` — ContentLicenses.js:59, StickerSplitModal.js:289, HandwritingStudio.js:49. none 통일 또는 가이드에 예외 명시.
2. 보관함 보기 전환 컴팩트 칸 가로 터치 36dp — styles.js:109(28×28), LibraryScreen.js:467(hitSlop 가로 4). 칸 32+hitSlop 6~8.
3. 확인창이 둘로 갈린다 — src/shared/dialogs.js:35,48·StickerSplitModal.js:169 `Alert.alert` vs ConfirmDialog. DialogHost로 통일.
4. 가이드 문서와 토큰 불일치 — 가이드 surfaceSoft `#F3F3F7` vs theme.js:4 `#F7F8FD`; 그림자 0.14/0.22 vs 0.06/0.1; §3.1 "시스템 서체"인데 Pretendard; 헤더 제목 29/30 vs 28/24(styles.js:164-166). 가이드를 코드 기준으로 수정.
5. 가이드 팔레트 밖 UI 면 색 — DecorDrawer.js:1201,1254,1280,1337(#F4F6FA·#F3F6FB·#F5F7FB), PageOverview.js:130(#EEF2FA), FrameOptions.js:224, LayerPanel.js:706(#F5F6FC), EffectOptions.js:222(#DCE4F1), diary/styles.js:313,319,327,366,387,424; PenSettings.js:86(#FAFAF7), PageBackground.js:110(#FFF2F0). `surfaceMuted`·`surfaceSoft`·`dangerSoft`로 통일.
6. diary/styles.js 미사용 레거시 스타일 — coverKicker/Title/Year(:285-293, 굵기 900), bookLabel*(:353-355), profileHero(:432), railSection(:62), formTip/helper/calendar*/tipKicker(10~10.5px); `C.green/coral/violet/yellow/navy`(constants.js:30-34) 미사용. 삭제.
7. 11px 미만 글자 — TopBar.js:234(10.5), sharing/styles.js:265(10), PaperColorSettings.js:105(9), DecorDrawer.js:1247(9.5), FrameOptions.js:236(10), FormControls.js:213(10.5/800). 10.5/600 이상.
8. 연한 글자색 대비(추정) — ContextBar.js:371(rgba 0.3, 약 2.2:1), TextLinkDialog.js:31(placeholder primary 약 3.2:1), TextEditor.js:249("닫기" primary 글자색, 크기·굵기 미지정). textMuted / primaryStrong 13/700 / 비활성 0.4.
9. 아이콘 크기 혼용 — 20×11, 18×10, 22×8, 24×7, 16×6, 12×6, 14×4, 21×1(IconButton.js:18). 20/24 두 단계.

## P3
1. 모서리 반경 혼재(styles.js 4~23), 로그인 카드 12 vs 가이드 xl 16(auth/styles.js:9).
2. SharingHub.js:71,756,804,993,1031·NotificationPanel.js:77,94 제목·닉네임·이메일 numberOfLines 없음(줄바꿈 흡수). 이메일 `ellipsizeMode="middle"`.
3. ShapeSettings.js:21 메모 선 색(핑크·민트) 콘텐츠 팔레트, §2.4 미등재.
4. 하단 탭 라벨 11px 5탭(styles.js:22-27, bottomTabModel.js:8-11).
5. 토스트 위치 하드코딩 — auth/styles.js:8(bottom 64), profileStyles.js:90(88), sharing/styles.js:300(32). iPhone 홈 인디케이터 인셋 미반영.
6. 비활성 투명도 0.42 vs 0.4.
7. 보관함 FAB 컴팩트 44 / 태블릿 56(styles.js:55-56), 마지막 카드 가림 가능(추정).
8. 직접 `fontFamily`(FrameTextEditor.js:116, PhotoFrame.js:176,195, PlannerPopup.js:15)는 KeepFont 콘텐츠용이라 위반 아님.

## 색상 전수 조사 (UI 판단에 의미 있는 값)
| hex | 파일 수 | 가이드 |
|---|---|---|
| #FFFFFF | 41 | 포함 |
| #0B1766 | 10 | 포함(text) |
| #818AC3 | 7 | 포함(primary) |
| #F7F8FD | 6 | 포함(theme 기준, 가이드 표는 #F3F3F7 → 문서 불일치) |
| #000000 / #666666 / #292929 | 6/6/5 | 콘텐츠(마스크·스포이트, 속지 글자색) |
| #FEF0BF | 5 | 포함(butter) |
| #BFC1C4, #D7D9DC | 5, 5 | 콘텐츠(속지 선) |
| #ABB1D8 | 4 | 포함(secondary) |
| #F0F1F9, #606BB2 | 3, 3 | 포함 |
| #DCE5F1, #D9DCEF, #D4D7ED | 3씩 | 포함(격자선, cardBorder, 표지 기본) |
| #D8A93E | 3 | 밖(메모·테이프 노랑, 콘텐츠) |
| #C96B7B, #65A889, #5F9BBC, #666D7A | 3씩 | 밖(메모 선·테이프, 콘텐츠) |
| #3B3F4A, #9A9DA6 | 2 | 밖(표지 인쇄색, 죽은 bookLabel) |
| #F5F7FB #F4F6FA #F3F6FB #EEF2FA #F5F6FC #F9FAFD #FCFDFF #E9EBF6 #E5E7F4 #DCE4F1 | 1~3 | 밖(UI 연한 파랑 회색 면, P2-5) |
| #FAFAF7, #FFF2F0 | 1 | 밖(따뜻한 색조 UI 면) |
| #E8AF45 | 2 | 포함(별) |
| #F0D5D4, #F0D4DB | 1 | 포함(영구 삭제 윤곽, 가이드 안 두 값 혼재) |
| #FEE500 #EA4335 #4285F4 #FBBC05 #34A853 #191919 | 1 | 허용(외부 로그인) |
| #A33C4B #917019 #397A5B #34769F #7653A6 #626878 | 2 | 허용(기본 프로필 6색) |
| #71B99D #E9938B #A894D0 #EDCF70 #182473 | 1 | 밖(C.green… 사용처 없음) |
| #E2475B | 1 | 밖(TapeView.js:212 빨강 점, 콘텐츠) |
고유 hex 150개 이상. UI 계층에서 가이드 밖은 "연한 파랑 회색 10여 종·따뜻한 회백 2종·죽은 상수"뿐. 핑크·민트·적색은 UI 면에 없음(notifyPink 예외 준수).

## 위반 없음 확인
- 누름 효과: NotificationSettingsScreen 외 `activeOpacity`·`android_ripple`·scale 없음, pressed 전부 빈 객체.
- 모달: 말풍선·팝오버·확인창·크롭 전부 `animationType="none"`.
- 아이콘: 외부 라이브러리·이모지 아이콘 0건.
- 마스코트 명칭 일관(모아=노란 책, 디오=파란 친구).
- 그림자: `theme.shadow`/`boxShadow`로 iOS·Android 함께 지정.

## 잘 되어 있는 점
1. 눌림 효과 금지·모달 none·Lucide 통일 거의 완벽. 2. 색 토큰 가이드와 거의 일치. 3. Pretendard를 DioText 래퍼로 일괄, KeepFont로 콘텐츠 보호. 4. 확인창·시트 `maxWidth:'100%'`, auth/sharing KAV+ScrollView, hitSlop으로 대부분 44 확보. 5. `formFactorFor`(600) 폰·태블릿 분기, 편집기 상단 바 폭별 단계 축소.
