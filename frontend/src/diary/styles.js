import { Platform, StyleSheet } from 'react-native';
import { C } from './constants';
import { DISABLED_OPACITY, bubble, colors } from '../shared/theme';
import { LIBRARY_SIDE_PADDING } from './utils/gridLayout';

// 영구 삭제 버튼 테두리 (디자인 가이드 2.2). 휴지통 카드 · 동작 시트가 함께 쓴다.
const DANGER_BORDER = '#F0D5D4';

export const styles = StyleSheet.create({
  provider: { flex: 1, backgroundColor: C.white },
  safe: { flex: 1, backgroundColor: C.canvas },
  safeRow: { flex: 1, flexDirection: 'row' },
  viewport: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.canvas },
  app: { overflow: 'hidden', backgroundColor: C.canvas },
  shell: { flex: 1, flexDirection: 'row' },
  workspace: { flex: 1, minWidth: 0, position: 'relative', backgroundColor: C.canvas },
  appFill: { flex: 1, alignSelf: 'stretch' },
  // 폰은 본문 아래에 하단 네비게이션 바를 고정 레이아웃으로 쌓는다.
  phoneShell: { flex: 1 },
  tabBarWrap: { flexShrink: 0, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  tabBar: { height: 64, flexDirection: 'row', overflow: 'visible', backgroundColor: C.white },
  tabItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabIconPill: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  tabIconPillSelected: { backgroundColor: colors.primarySoft },
  tabLabel: { color: C.muted, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  tabLabelSelected: { color: C.ink, fontWeight: '800' },

  // 좌측 바는 폰 하단 탭처럼 흰 면, 본문은 surfaceSoft. 경계는 cardBorder 1px
  rail: { width: 218, padding: 20, overflow: 'hidden', backgroundColor: C.white, borderRightWidth: 1, borderRightColor: colors.cardBorder },
  railSlot: { width: 78 },
  // 메뉴 오른쪽(접힌 폭 이후)부터 화면 끝까지 덮는 반투명 막. 불투명도는 메뉴 펼침 정도(0~1)를 따른다.
  railScrim: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 19, elevation: 19 }, // elevation 은 배경 있는 뷰에 주면 안드로이드가 가장자리에 그림자 띠를 그려, 배경 없는 래퍼에만 둔다
  railScrimTint: { flex: 1, backgroundColor: colors.scrim },
  railScrimPress: { flex: 1 },
  railOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 20, elevation: 20 }, // 배경 없는 래퍼(그림자 띠 방지). 흰 배경은 안쪽 rail
  railInner: { flex: 1, width: '100%' },
  // 로고 · 종 · 삼선을 같은 높이(48) 안에서 세로 가운데 맞춤 (로고 칸이 더 높아 로고만 아래로 처지던 것을 맞춤)
  brandRow: { height: 48, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  brand: { flex: 1, minWidth: 0, height: 48, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 }, // 위쪽 점 때문에 D 본체가 아래로 쏠려 보여 로고를 3 올림
  railHome: { flex: 0, width: 48, paddingBottom: 0, justifyContent: 'center' }, // 홈도 종·메뉴와 같은 48px 슬롯 중앙을 쓴다.
  railHomeIcon: {}, // 홈 아이콘 박스 중심을 종·메뉴의 48px 버튼 중심선에 그대로 맞춘다.
  brandSlot: { flex: 1, minWidth: 0, height: 48, justifyContent: 'center', overflow: 'hidden' },
  railToggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  railTogglePressed: {}, // 눌림 효과 없음(사용자 지시)
  railDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.white, backgroundColor: C.notifyPink }, // 알림 점은 쿨톤 핑크(사용자 지시, 색 규칙의 유일한 예외). 흰 테두리가 뒤의 아이콘(삼선 · 종)을 살짝 지우듯 가린다
  railMenuDot: { top: 7, right: 7 },
  railToggleText: { color: C.ink, fontSize: 19, lineHeight: 22, fontWeight: '700' },
  // 새 다이어리: 편집 화면의 주 버튼(내보내기)과 같은 색
  libraryRoot: { flex: 1 },
  // 보관함 오른쪽 아래에 떠 있는 새 다이어리 버튼 (예전 사이드 메뉴 + 버튼과 같은 색 · 모서리)
  // + 아이콘만(글자 없음, 사용자 결정). 태블릿은 이 화면의 유일한 주 동작이라 56×56 · 오른쪽 · 아래 24 · 그림자 0 4 10 / 10%(코덱스 2026-11-01: 보조 버튼 36~40보다 분명히 크고 표지 폭 172와는 다투지 않는 크기)
  // 폰은 44×44 · 오른쪽 · 아래 16. 모서리는 둘 다 12. 좌측 바 아래 프로필 원과 다른 축(본문 오른쪽)에 둔다
  createFab: { position: 'absolute', right: 24, bottom: 24, width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.blueStrong, boxShadow: '0px 4px 10px rgba(28, 28, 28, 0.10)' },
  createFabCompact: { right: 16, bottom: 16, width: 56, height: 56 }, // Material FAB 기본 56 · 끝 여백 16(2026-11-05 조사 §16-3)
  railCreate: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 12, backgroundColor: C.blueStrong },
  railPlus: { color: C.white, fontSize: 23, lineHeight: 25, fontWeight: '300' },
  railCreateText: { color: C.white, fontSize: 13, fontWeight: '700' },
  railGroup: { marginTop: 12 }, // 태블릿 삼선 줄과 첫 항목 사이 = 12 + 12 = 24(항목 피치 48의 절반, 코덱스 안)
  railSectionSlot: { overflow: 'hidden' },
  railSection: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 9, paddingHorizontal: 12 },
  // 접힌 사이드바의 항목 폭은 47(78 - 좌우 15 - 오른쪽 테두리 1)이라 아이콘(20)이 가운데에 오려면 왼쪽 여백이 13.5여야 한다 (12면 1.5px 왼쪽으로 쏠린다)
  // zIndex 0: 고른 면(railIconTile, zIndex -1)이 항목 안에서만 아이콘 · 글자 뒤로 깔리게 한다. 아이콘 ↔ 글자 12(코덱스 2026-11-01)
  railItem: { minHeight: 48, paddingHorizontal: 12.5, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, zIndex: 0 },
  railItemSelected: {},
  railIconSlot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  // 고른 메뉴의 라벤더 면(모서리 10, 높이 36): 접힘은 아이콘 뒤 36×36 타일, 펼침은 줄 끝까지 알약. 왼쪽 · 폭은 SideRail 이 메뉴 펼침 값으로 정한다
  railIconTile: { position: 'absolute', top: 6, height: 36, borderRadius: 10, backgroundColor: C.lavender100, zIndex: -1 },
  // 내 공간 칸: 구분선 아래가 접힌 메뉴 폭(78)과 같은 정사각형이고 프로필 그림이 그 한가운데에 온다.
  // 구분선 아래 여백 16 + 칸 48 + 메뉴 아래 여백 24 - 10 = 78, 그림 가운데는 바닥에서 39(= 78 / 2)
  railSpacer: { flex: 1 }, // 휴지통·설정을 메뉴 아래쪽(마이페이지 위)으로 미는 빈 칸
  railTrash: {}, // 휴지통 다음 설정은 위 탐색 항목과 같은 48dp 피치로 바로 잇는다.
  railProfileLine: { marginBottom: 16, height: 1, backgroundColor: C.cardBorder }, // 마이페이지 위 구분선
  railProfile: { paddingHorizontal: 8.5, marginBottom: -10 }, // 마이페이지: 메뉴 맨 아래(프로필 그림 30이 아이콘 20 자리와 가운데가 맞게 안쪽 여백을 줄인다)
  railAvatarSlot: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  railIcon: { width: 19, textAlign: 'center', color: C.muted, fontSize: 17, fontWeight: '700' },
  railIconSelected: { color: C.ink },
  railLabel: { flexShrink: 0, color: C.inkSoft, fontSize: 13, fontWeight: '600' },
  railLabelSelected: { color: C.ink, fontWeight: '800' },

  // 태블릿 내 공간·휴지통도 보관함과 같은 여백으로 두어 탭을 바꿔도 제목 자리가 같다.
  screen: { flexGrow: 1, paddingHorizontal: 30, paddingTop: 38, paddingBottom: 44 },
  // 폰은 좌측 바(폭 60)를 빼고 남는 폭이 좁아 좌우 여백 14(코덱스 2026-11-01)
  screenCompact: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 48 },
  libraryScreen: { flexGrow: 1, paddingHorizontal: LIBRARY_SIDE_PADDING, paddingTop: 38, paddingBottom: 34 },
  // 폰의 모든 탭은 위 여백·제목 줄 높이를 같게 둬서 탭을 바꿔도 제목이 움직이지 않는다.
  libraryScreenCompact: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 20 },
  // 한눈에 보기: 위쪽(제목 · 필터 · 도구)은 고정하고 카드 목록만 스크롤한다. 정렬 메뉴가 목록 위로 펼쳐지도록 zIndex 를 높인다.
  libraryFixedTop: { flexGrow: 0, flexShrink: 0, paddingBottom: 0, zIndex: 3, elevation: 3 },
  libraryGridScroll: { flexGrow: 1, paddingHorizontal: LIBRARY_SIDE_PADDING, paddingBottom: 34 },
  libraryGridScrollCompact: { paddingHorizontal: 14, paddingBottom: 20 },
  // 새 다이어리 버튼이 떠 있을 때는 마지막 줄이 버튼 밑에 깔리지 않게 버튼 높이 + 위아래 여백만큼 비운다
  libraryGridScrollFab: { paddingBottom: 24 + 56 + 16 },
  libraryGridScrollFabCompact: { paddingBottom: 16 + 56 + 16 },
  libraryScreenCarouselCompact: { flexGrow: 1, paddingBottom: 8 },
  libraryHeader: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 폰: 제목 줄은 제목 + 검색 · ⋮ · 알림. 제목이 길면 줄바꿈 대신 한 줄에서 줄어든다(최소 0.75배)
  libraryHeaderCompact: { minHeight: 44, columnGap: 8 },
  headerTitleRowCompact: { flexShrink: 1, minWidth: 0 },
  libraryTitleCompact: { fontSize: 24, letterSpacing: -0.5, flexShrink: 1 },
  libraryTitle: { color: C.ink, fontSize: 28, letterSpacing: -0.6, fontWeight: '800' },
  // 보기 전환: 아이콘 셋을 132×36 흰 판 하나(모서리 10)에 묶는다. 고른 칸만 라벤더 면 + primaryText 아이콘, 나머지는 면 · 테두리 없음(원 페이저 03)
  // 칸은 보이는 28×28 + hitSlop 으로 터치 48(칸 사이 20). 폰 · 태블릿 같은 모양이라 390폭에서도 `공유된 다이어리` 제목과 한 줄에 선다
  // 태블릿: 136×40 판 · 칸 32 · 아이콘 18(칸 크기는 코덱스 2026-11-01, 칸 사이 16은 터치 48 때문). 폰: 132×36 · 칸 28 · 아이콘 16
  libraryViewSwitch: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, borderRadius: 10, backgroundColor: C.white },
  libraryViewOption: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 8 },
  libraryViewOptionText: { color: C.blue, fontSize: 13, fontWeight: '600' },
  libraryViewOptionTextSelected: { color: C.blueText, fontWeight: '700' },
  libraryViewOptionSelected: { backgroundColor: C.lavender100 },
  libraryViewIcon: { color: C.inkSoft, fontSize: 16, lineHeight: 18, fontWeight: '800' },
  libraryViewText: { color: C.inkSoft, fontSize: 12, fontWeight: '700' },
  libraryViewTextSelected: { color: C.ink, fontWeight: '800' },
  libraryToolbarWrap: { flexWrap: 'wrap', gap: 8, zIndex: 10 },
  librarySortIcon: { transform: [{ rotate: '90deg' }] },
  libraryActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  librarySortMenu: { ...bubble, position: 'absolute', top: '100%', right: 0, width: 230, padding: 8, zIndex: 20 },
  libraryOptionsDivider: { height: 1, backgroundColor: C.line, marginVertical: 8 },
  // 고른 항목의 파란 테두리(1.5)와 같은 두께를 모든 항목이 갖고(안 고른 건 투명), 체크 자리를 따로 두므로 왼쪽 여백은 줄인다. 그래야 글자가 항목마다 같은 자리에 선다.
  librarySortOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: 10 },
  librarySortText: { flex: 1, color: C.ink, fontSize: 14, fontWeight: '600' }, // 메뉴 항목 14 (가이드 표, 2026-11-08)
  librarySortHeader: { height: 28, paddingHorizontal: 14, color: C.blueStrong, fontSize: 12, lineHeight: 28, fontWeight: '700' },
  librarySortDivider: { height: 1, marginVertical: 6, backgroundColor: colors.cardBorder }, // 정렬(이 목록을 어떻게 볼지)과 휴지통(다른 곳으로 이동)을 나눈다
  librarySearchHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 10 },
  librarySearchPageInput: { height: 48, marginTop: 32, borderWidth: 1, borderColor: C.blueStrong },
  librarySearchClearSlot: { width: 44, height: 44, flexShrink: 0 },
  librarySearchClear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  librarySearchHistory: { marginTop: 24 },
  librarySearchHistoryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  librarySearchHistoryClear: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  librarySearchHistoryMuted: { color: C.muted, fontSize: 13, fontWeight: '600' },
  librarySearchHistoryRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line },
  librarySearchHistoryTerm: { flex: 1, minHeight: 56, justifyContent: 'center', paddingHorizontal: 12 },
  librarySearchHistoryText: { color: C.ink, fontSize: 16, fontWeight: '600' },
  librarySearchResults: { marginTop: 24, gap: 16 },
  librarySearchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 12 },
  librarySearchInput: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 8, color: C.ink, fontSize: 15, ...Platform.select({ web: { outlineStyle: 'none' } }) }, // 웹이 입력칸 안에 검은 포커스 윤곽(outline: auto)을 그리지 않게(경계는 바깥 검색 바의 1px 선)
  libraryToolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  // 폰: 필터 칩(가로 스크롤) + 검색 · 더보기가 한 줄 44. 제목 줄(48) 아래 8
  libraryToolbarCompact: { marginTop: 8, flexWrap: 'nowrap', gap: 0 },
  // flexBasis 0: 웹에서 가로 ScrollView 가 칩 전체 폭으로 늘어나 검색 · 더보기 밑으로 깔리지 않게 남은 폭만 쓴다
  libraryFilterScroll: { flex: 1, flexBasis: 0, minWidth: 0, flexGrow: 1 },
  libraryFilterScrollContent: { alignItems: 'center', paddingRight: 8 },
  libraryActionsCompact: { flexShrink: 0, gap: 4, flexDirection: 'row', alignItems: 'center' },
  // 선택 모드 도구줄(보관함 · 휴지통 공용, SelectionBar): 선택 개수 + 동작 버튼. 좁은 폰에서는 버튼이 다음 줄로 내려간다.
  // 규격은 같은 화면의 칩과 맞춘다: 버튼 · 칩은 높이 40 · 모서리 10 · cardBorder 1px · 글자 12/700 (터치 44는 hitSlop), 판은 모서리 16(코덱스 2026-10-31)
  selectBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: C.white },
  // 폰 꽉 찬 띠(안쪽 14 + 화면 가장자리까지 -14): 옅은 남보라 면 · 위아래 1px 선 · 모서리 없음
  selectBarBand: { marginHorizontal: -14, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 0, borderWidth: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted },
  selectBandHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectBandActions: { flexDirection: 'row', gap: 8 },
  selectButtonGhost: { minHeight: 32, paddingHorizontal: 8, marginRight: -8, borderWidth: 0, backgroundColor: 'transparent' },
  selectButtonFill: { flex: 1, paddingHorizontal: 8 },
  selectCountBand: { fontSize: 16, fontWeight: '600' },
  selectButtonBand: { minHeight: 44, paddingHorizontal: 14 },
  selectButtonTextBand: { fontSize: 14, fontWeight: '700' },
  selectCount: { color: C.ink, fontSize: 13, fontWeight: '700' },
  selectActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  selectButton: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: C.white },
  selectButtonPrimary: { borderColor: C.blueStrong, backgroundColor: C.blueStrong }, // 그 화면의 주 동작(휴지통으로 · 복원). 네이비 채움은 쓰지 않는다
  selectButtonDanger: { borderColor: DANGER_BORDER }, // 영구 삭제(되돌릴 수 없음): 위험색은 윤곽 · 글자에만, 채우지 않는다(휴지통 동작 시트의 영구 삭제와 같은 모양)
  selectButtonDisabled: { opacity: DISABLED_OPACITY },
  selectButtonText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  selectButtonTextPrimary: { color: C.white },
  selectButtonTextDanger: { color: C.dangerStrong },
  header: { minHeight: 45, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  headerTitle: { color: C.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  headerCompact: { minHeight: 44, alignItems: 'center', marginBottom: 16 },
  headerTitleCompact: { fontSize: 24, letterSpacing: -0.5, flexShrink: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { alignItems: 'flex-end' },
  headerRightCompact: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  libraryHeadToolsCompact: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: colors.cardBorder }, // 칩 규칙: 흰 면 + #D9D8EA 테두리
  iconButtonPhone: { width: 40, height: 40, borderRadius: 10 }, // 폰 도구줄의 검색 · 더보기(보이는 40 + hitSlop 으로 터치 44)
  iconButtonCompact: { width: 44, height: 44, borderRadius: 12, borderWidth: 0, backgroundColor: 'transparent' },
  // 보관함 도구줄의 검색 · 더보기: 테두리 · 면 없는 40 아이콘(터치는 hitSlop 으로 44, 원 페이저 03)
  iconButtonBare: { width: 40, height: 40, borderRadius: 20, borderWidth: 0, backgroundColor: 'transparent' },
  iconButtonSelected: { backgroundColor: C.blueStrong, borderColor: C.blue },
  icon: { color: C.ink, fontSize: 23, lineHeight: 26 },
  iconSelected: { color: C.white },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  headerCreate: { minHeight: 48, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.blueStrong },
headerCreateText: { color: C.white, fontSize: 13, fontWeight: '700' },

  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 태블릿은 칩 네 개가 한 줄에 다 들어가므로 줄바꿈 없이 검색 · ⋯ 와 같은 줄에 둔다.
  filtersWide: { flexWrap: 'nowrap', flexShrink: 0 },
  // 보관함 필터 · 스와이프/한눈에 보기 전환(B안 테두리 칩): 감싸는 판 없이 칩마다 흰 면 + cardBorder 테두리, 고른 칩만 primaryStrong 테두리 · text 굵은 글자
  filterSwitch: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterOption: { minHeight: 36, paddingHorizontal: 14, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: C.white },
  filterOptionSelected: { borderColor: colors.primaryStrong },
  filterTextSelected: { color: C.ink, fontWeight: '800' },
  filterOptionCompact: { paddingHorizontal: 10 },
  filterTextCompact: { fontSize: 12.5 },
  chip: { minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.58)' },
  // 고른 칩: 편집 옵션 창의 고른 칩처럼 흰 바탕 + 파란 테두리
  chipSelected: { backgroundColor: C.white, borderColor: C.blueStrong, borderWidth: 1.5 },
  chipText: { color: C.inkSoft, fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: C.ink, fontWeight: '800' },

  // 빈 화면은 폰·태블릿 모두 테두리 상자 없이 아이콘과 문구만 둔다.
  empty: { flex: 1, minHeight: 380, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyCompact: { minHeight: 280 },
  emptySmall: { minHeight: 0 },
  emptyTitleSmall: { fontSize: 16, letterSpacing: -0.3 },
  emptyRaised: { paddingBottom: 160 }, // 빈 보관함 · 공방: 캐릭터 · 문구를 화면 가운데보다 약간 위로(아래 여백만큼 가운데가 올라간다, 사용자가 맞춘 값)
  emptyRaisedTrash: { paddingBottom: 112 }, // 빈 휴지통: 가운데보다 56 위(코덱스 12번)
  emptyRaisedCompact: { paddingBottom: 100 },
  emptyIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginBottom: 17 },
  emptyIconText: { color: C.blueStrong, fontSize: 31, lineHeight: 35, fontWeight: '300' },
  emptyTitle: { color: C.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  emptyCopy: { maxWidth: 390, color: C.muted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  secondary: { minHeight: 48, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12, marginTop: 22, borderWidth: 1, borderColor: C.ink, backgroundColor: C.white },
  secondaryText: { color: C.ink, fontSize: 13, fontWeight: '700' },
  // 회원 목록 · 휴지통 · 생성 요청 알림 칸의 안내 글(예전엔 이 이름이 비어 있어 기본 글꼴로 보였다)
  cardMeta: { color: C.muted, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  noticeAction: { alignSelf: 'flex-start' },

  carouselShell: { minHeight: 510, flex: 1, paddingTop: 47, paddingBottom: 3, overflow: 'hidden' },
  // 폰: 태블릿 세로처럼 남는 높이의 가운데보다 살짝 위(아래 여백 60 → 30만큼 올라감)에 카드를 둔다(지라 612, 위에 붙어 너무 높아 보였다)
  carouselShellCompact: { minHeight: 0, paddingTop: 12, paddingBottom: 60, marginHorizontal: -14 },
  carouselRow: { height: 412, position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  carouselRowCompact: { flex: 1, height: 'auto', minHeight: 0, alignItems: 'center' },
  carouselCardTop: { zIndex: 2 },
  carouselViewport: { flex: 1, minWidth: 0, overflow: 'visible' },
  // 잰 폭으로 고정한 목록. 늘거나 줄지 않게 막는다(ScrollView 기본 flexGrow: 1). flex: 1과 겹쳐 쓰면 웹에서 flex-basis가 폭을 덮어써서 따로 둔다.
  carouselViewportFixed: { flexGrow: 0, flexShrink: 0, overflow: 'visible' },
  // 가운데 카드가 커지고(1.06) 위로 올라가는(-12) 만큼 위아래 여백을 둬야 카드 윗부분이 잘리지 않는다.
  // 카드는 윗변을 맞춘다. 가운데 정렬이면 짧은 '새 다이어리' 카드만 아래로 처져 계단처럼 보인다.
  carouselCards: { alignItems: 'flex-start', gap: 42, paddingVertical: 28 },
  // 가운데 카드가 커지고(1.06) 위로 올라가는(-12) 만큼 위아래 여백을 둬야 카드 윗부분이 잘리지 않는다.
  carouselCardsCompact: { paddingVertical: 28 },
  carouselShellPortrait: { minHeight: 0, paddingTop: 0, paddingBottom: 120, justifyContent: 'center' }, // 태블릿 세로: 남는 높이의 가운데보다 살짝 위(아래 여백 120 → 60만큼 올라감)에 카드를 둔다. 펼쳐서 보기의 가운데 축과 같은 높이
  carouselRowPortrait: { flex: 0, height: 680 },
  carouselArrowCompact: { marginTop: -62 }, // 폰: 카드 아래 이름 · 페이지 수 줄만큼 올려 표지 가운데에 맞춘다
  carouselArrowPortrait: { marginTop: -64 }, // 칸 가운데에 놓인 표지의 가운데에 맞춘다 (웹 834x1194 에서 재서 맞춤)
  carouselArrow: { position: 'absolute', zIndex: 4, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  carouselArrowLeft: { left: 4 },
  carouselArrowRight: { right: 4 },
  carouselArrowText: { color: C.ink, fontSize: 32, lineHeight: 35, fontWeight: '300' },
  swipeHint: { color: C.inkSoft, fontSize: 11.5, fontWeight: '700' },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  cardCarousel: { width: 318, borderWidth: 0, borderRadius: 0, overflow: 'visible', backgroundColor: 'transparent' },
  // 스와이프 카드를 한 장으로 합쳐 그릴 때 경계에서 잘리는 효과(표지 프레임 · 그림자)가 들어갈 여백. 자리는 그대로(DiaryCard CAROUSEL_EFFECT_PAD 와 같은 값)
  carouselEffectSpace: { marginHorizontal: -48, paddingHorizontal: 48, marginTop: -28, paddingTop: 28, marginBottom: -36, paddingBottom: 36 },
  cardCarouselCompact: { width: 268 },
  cardCarouselLarge: { width: 440 }, // 태블릿 세로: 옆 카드 없이 한 권만 크게
  cardGrid: { width: '23.5%', minWidth: 0, borderWidth: 0, borderRadius: 0, overflow: 'visible', backgroundColor: 'transparent' },
  cardGridCompact: { width: '47.5%', minWidth: 0 },
  cardList: { minHeight: 120, flexDirection: 'row', alignItems: 'stretch' },
  cardInfo: { minHeight: 91, padding: 13, justifyContent: 'space-between' },
  cardInfoCarousel: { minHeight: 63, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 3 },
  cardInfoCarouselCompact: { minHeight: 54, paddingTop: 7, paddingBottom: 0 },
  cardInfoGrid: { minHeight: 58, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4 },
  cardInfoList: { flex: 1, paddingHorizontal: 18, paddingVertical: 16 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitleInRow: { flexShrink: 1 },
  sharedDiaryIcon: { flexShrink: 0, justifyContent: 'center' },
  cardCoverWrap: { position: 'relative' },
  // 관리 모드: 고른 카드는 파란 테두리, 표지 위 오른쪽에 체크 원을 띄운다. 테두리 두께는 그대로 둬 카드가 밀리지 않게 한다.
  cardSelected: { borderColor: C.blueStrong },
  cardCheck: { position: 'absolute', top: 12, right: 12, zIndex: 3, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 2, borderColor: C.white, backgroundColor: 'rgba(28,28,28,.28)' },
  cardCheckCompact: { top: 6, right: 6, width: 24, height: 24, borderRadius: 12 }, // 폰: 즐겨찾기 별(24칸 · 모서리 6)과 같은 크기 · 자리
  cardCheckOn: { backgroundColor: C.blueStrong },
  sortOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortOptionCheck: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }, // 화살표가 없는 항목도 자리를 비워 둬 글자가 맞는다
  cardCheckMark: { color: C.white, fontSize: 16, fontWeight: '800', lineHeight: 18 },
  cardFavorite: { position: 'absolute', top: 12, right: 12, zIndex: 3, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }, // 배경 없는 별: 표지 오른쪽 위 모서리(폰 · 태블릿 같음, 지라 620)
  cardFavoriteCompact: { top: 6, right: 6 }, // 폰: 표지 오른쪽 위 모서리(제목표와 겹치지 않게, 2026-11-03 사용자 결정). 태블릿도 2026-11-08부터 오른쪽(지라 620: 왼쪽도 제목표를 가렸다)
  // 태블릿 스와이프 표지는 한눈에 칸(약 250)보다 커서(318, 가운데 1.06배 · 세로 440) 같은 12 면 별이 모서리에 붙어 보였다. 표지 크기에 비례해 안쪽으로(2026-11-08 지라 683, 폰도 같다)
  cardFavoriteCarousel: { top: 18, right: 18 },
  cardFavoriteCarouselLarge: { top: 24, right: 24 },
  cardFavoriteCarouselCompact: { top: 14, right: 14 }, // 폰 스와이프 표지(268)도 한눈에 칸(약 160 · 6)보다 커서 같은 비율로 안쪽에
  // 정보 줄 오른쪽 위 더보기 버튼(동작 말풍선을 연다). 배경 없는 28×28 + hitSlop 10 = 터치 48(원 페이저 06). 자리(slot)는 버튼이 숨는 스와이프 옆 카드에도 남겨 제목 줄 높이가 같게 한다
  cardMoreSlot: { width: 28, height: 28, flexShrink: 0, marginTop: -4, marginRight: -3 },
  cardMore: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: { color: C.ink, fontSize: 14, fontWeight: '700', letterSpacing: -0.35 },
  cardPageCount: { color: C.inkSoft, fontSize: 12, lineHeight: 18, fontWeight: '500', marginTop: 3 },
  cardType: { color: C.muted, fontSize: 10.5, fontWeight: '600', marginTop: 5 },

  cover: { height: 219, padding: 19, overflow: 'hidden', justifyContent: 'center' },
  // 책상 위 표지: 오후 빛과 같은 방향(오른쪽 아래)의 옅은 그림자
  coverCarousel: { height: 318, borderTopLeftRadius: 9, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 9, boxShadow: '0px 6px 16px rgba(28, 28, 28, 0.06)' }, // 카드 그림자는 옅은 한 겹(코덱스 1번). elevation 은 안드로이드에서 표지 둘레에 옅은 테두리를 만들어 방향 있는 boxShadow 를 쓴다
  coverCarouselCompact: { height: 268, padding: 16 },
  coverCarouselLarge: { height: 440, padding: 22 }, // 태블릿 세로 (cardCarouselLarge 폭과 같은 높이)
  // 한눈에 칸은 정사각형. 세로 · 가로 다이어리 모두 긴 변이 칸 크기와 같다 (선반 배치)
  // 스와이프 표지 프레임: 표지 칸 바깥으로 두께만큼 나와 표지를 감싼다. 자리와 모서리 둥글기는 표지 크기에서 Cover 가 계산한다(크기가 커지면 표지 모서리도 같이 커진다)
  coverFrame: { position: 'absolute' },
  coverFrameIdle: { borderWidth: 2, borderColor: 'rgba(217,216,234,0.7)' },
  coverFrameActive: { borderWidth: 3, borderColor: C.white, boxShadow: '0px 8px 16px rgba(28, 28, 28, 0.06)' },
  coverGrid: { aspectRatio: 1, borderRadius: 12, shadowColor: C.ink, shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  coverGridCompact: { padding: 15 },
  coverSmall: { width: 143, height: '100%', minHeight: 118, padding: 13 },
  coverPreview: { width: 250, height: 330, borderRadius: 12, padding: 27, shadowColor: C.ink, shadowOpacity: 0.1, shadowRadius: 19, shadowOffset: { width: 0, height: 13 }, elevation: 6 },
  coverLine: { position: 'absolute', top: 17, left: 0, width: '54%', height: 4, borderTopRightRadius: 5, borderBottomRightRadius: 5, backgroundColor: 'rgba(255,255,255,.52)' },
  coverRing: { position: 'absolute', top: -28, right: -21, width: 116, height: 116, borderRadius: 58, borderWidth: 16, borderColor: 'rgba(255,255,255,.20)' },
  coverKicker: { color: 'rgba(28,28,28,.65)', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 12 },
  coverKickerSmall: { fontSize: 7, marginBottom: 8 },
  coverTitle: { color: C.ink, fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.85 },
  coverTitleSmall: { fontSize: 14, lineHeight: 17 },
  coverTitleGridCompact: { fontSize: 18, lineHeight: 23, letterSpacing: -0.6 },
  coverFooter: { position: 'absolute', left: 19, right: 19, bottom: 17, flexDirection: 'row', alignItems: 'center', gap: 8 },
  coverRule: { flex: 1, height: 1, backgroundColor: 'rgba(28,28,28,.34)' },
  coverYear: { color: 'rgba(28,28,28,.72)', fontSize: 10, fontWeight: '900' },
  coverYearSmall: { fontSize: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2%', paddingTop: 16 }, // 태블릿은 useDiaryGrid 가 폭 · 칸 · 줄 간격을 정한다(utils/gridLayout). 폰은 gridCompact. 첫 줄은 필터 · 칩 바로 아래(16)에서 시작한다
  gridCompact: { columnGap: 0, rowGap: 20, justifyContent: 'space-between', paddingTop: 20 },

  createCard: { alignItems: 'stretch' },
  createCardCarousel: { width: 238 },
  createCardCarouselCompact: { width: 202 },
  createCardGrid: { width: '18.25%', minWidth: 160 },
  createCardGridCompact: { width: '47.5%', minWidth: 0 },
  createCardPanelCompact: { height: 212 },
  createCardPanel: { height: 276, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 2, borderColor: C.line, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,.52)' },
  createCardPanelCarousel: { height: 318, borderTopLeftRadius: 9, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 9 },
  createCardPanelCarouselCompact: { height: 268 },
  createCardPlus: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,.75)', borderWidth: 1, borderColor: C.line },
  createCardTitle: { color: C.inkSoft, fontSize: 14, fontWeight: '800', marginTop: 13 },
  createCardCopy: { color: C.muted, fontSize: 10.5, fontWeight: '700', marginTop: 5 },

  formScreen: { flexGrow: 1, paddingHorizontal: 48, paddingTop: 43, paddingBottom: 38 },
  formContent: { flex: 1, flexDirection: 'row', gap: 48, alignItems: 'center', justifyContent: 'center', paddingBottom: 12 },
  previewArea: { width: 330, minHeight: 460, alignItems: 'center', justifyContent: 'center' },
  previewGlow: { position: 'absolute', width: 315, height: 315, borderRadius: 158, backgroundColor: '#E5E7F4' },
  previewNote: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 21 },
  formPanel: { width: 430, padding: 29, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  formEyebrow: { color: C.blueStrong, fontSize: 10, fontWeight: '800', letterSpacing: 1.05 },
  formHeading: { color: C.ink, fontSize: 23, fontWeight: '800', letterSpacing: -0.7, marginTop: 7, marginBottom: 29 },
  formLabel: { color: C.ink, fontSize: 13, fontWeight: '700', marginBottom: 9 },
  field: { height: 52, paddingHorizontal: 14, color: C.ink, fontSize: 14, fontWeight: '600', borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#FCFDFF' },
  fieldError: { borderColor: C.danger },
  helperRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  helper: { color: C.muted, fontSize: 10.5, fontWeight: '600' },
  error: { color: C.dangerStrong, fontSize: 12, fontWeight: '700' },
  colorLabel: { marginTop: 24 },
  colors: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  colorChoice: { width: 66, minHeight: 67, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  colorSelected: { borderColor: C.ink, backgroundColor: '#F8F7FD' },
  colorDot: { width: 29, height: 29, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(28,28,28,.10)' },
  colorName: { color: C.inkSoft, fontSize: 10, fontWeight: '700' },
  formDivider: { height: 1, marginTop: 25, backgroundColor: C.line },
  formTip: { color: C.muted, fontSize: 10.5, lineHeight: 16, marginTop: 14, marginBottom: 18 },
  primary: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: C.blueStrong },
  primaryText: { color: C.white, fontSize: 14, fontWeight: '700' },
  primaryArrow: { color: C.white, fontSize: 21 },

  createOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, alignItems: 'center', justifyContent: 'center', padding: 16 },
  createBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  // 폰: 아래에서 올라오는 시트. 미리보기 칸 없이 입력만 한 줄로 쌓는다.
  createOverlaySheet: { justifyContent: 'flex-end', padding: 0 },
  createSheet: { maxWidth: '100%', height: '90%', maxHeight: '100%', flexDirection: 'column', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: C.line },
  createFormPaneSheet: { paddingTop: 14, paddingHorizontal: 20 },
  // 폰 시트: 8가지 색을 한 줄에 둔다(360pt 폭 기준 칸당 40).
  createColorChoiceSheet: { width: 40, height: 40, borderRadius: 20 },
  createColorsSheet: { justifyContent: 'space-between', gap: 0 },
  createDialog: { width: '100%', maxWidth: 980, height: '100%', maxHeight: 768, flexDirection: 'row', overflow: 'hidden', borderRadius: 16, backgroundColor: C.white, shadowColor: C.ink, shadowOpacity: 0.1, shadowRadius: 27, shadowOffset: { width: 0, height: 15 }, elevation: 12 },
  createPreviewPane: { width: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: C.canvas },
  createPreviewMeta: { color: C.inkSoft, fontSize: 11.5, fontWeight: '700', marginTop: 26 },
  createPreviewCopy: { color: C.inkSoft, fontSize: 11.5, fontWeight: '600', marginTop: 5, textAlign: 'center' },
  bookPreview: { width: 185, height: 246, overflow: 'hidden', borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 14, shadowColor: C.ink, shadowOpacity: 0.11, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  bookSpine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 9, backgroundColor: 'rgba(28,28,28,.16)' },
  bookBand: { position: 'absolute', top: 0, bottom: 0, right: 30, width: 7, backgroundColor: 'rgba(28,28,28,.20)' },
  bookLabel: { position: 'absolute', top: 50, left: 25, right: 26, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 3, backgroundColor: 'rgba(255,253,248,.96)', shadowColor: C.ink, shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  bookLabelTitle: { color: '#3B3F4A', fontSize: 15, fontWeight: '700' },
  bookLabelMeta: { color: '#9A9DA6', fontSize: 8.5, fontWeight: '800', letterSpacing: 1.4, marginTop: 6 },
  createFormPane: { flex: 1, minWidth: 0, paddingTop: 28, paddingHorizontal: 30 },
  createFormScroll: { flex: 1 },
  createFormBody: { paddingBottom: 16 },
  createDialogHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  createDialogTitle: { color: C.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  createClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  createLabel: { color: C.inkSoft, fontSize: 12, fontWeight: '700', marginBottom: 9 },
  createLabelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 9 },
  createLabelInline: { marginBottom: 0 },
  createLabelNote: { color: C.muted, fontSize: 10.5, fontWeight: '600' },
  createField: { height: 46, paddingHorizontal: 14, color: C.ink, fontSize: 14, fontWeight: '700', borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#F8F7FD' },
  createHelperRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 16 },
  // 오류 문구가 없어도 글자 수는 늘 오른쪽 끝에 둔다.
  createCount: { marginLeft: 'auto' },
  createColors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 },
  createColorChoice: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, borderWidth: 2, borderColor: 'transparent' },
  createColorSelected: { borderColor: C.ink },
  createColorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(28,28,28,.10)' },
  createChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 },
  formChip: { minHeight: 36, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  formChipSelected: { borderColor: C.blueStrong, backgroundColor: C.white },
  formChipDisabled: { opacity: DISABLED_OPACITY },
  formChipText: { color: C.inkSoft, fontSize: 12.5, fontWeight: '700' },
  formChipTextSelected: { color: C.ink, fontWeight: '800' },
  pageSizeIcon: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 2 },
  pageSizeIconLandscape: { width: 20, height: 13 },
  pageSizeIconPortrait: { width: 13, height: 20 },
  firstPages: { flexDirection: 'row', gap: 6 },
  firstPage: { flex: 1, alignItems: 'center', gap: 7, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  firstPageSelected: { borderColor: C.blueStrong, backgroundColor: C.white },
  firstPageText: { color: C.ink, fontSize: 11, fontWeight: '700' },
  calendar: { marginTop: 12, marginBottom: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#F9FAFD' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.white },
  calendarArrowDisabled: { opacity: DISABLED_OPACITY },
  calendarTitle: { color: C.ink, fontSize: 13, fontWeight: '700' },
  calendarCopy: { color: C.muted, fontSize: 10.5, textAlign: 'center', marginTop: 4, marginBottom: 10 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: { width: '14.2857%', color: C.muted, fontSize: 10, fontWeight: '700', textAlign: 'center', paddingVertical: 5 },
  calendarDay: { width: '14.2857%', height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  calendarDaySelected: { backgroundColor: C.blueStrong },
  calendarDayText: { color: C.inkSoft, fontSize: 11.5, fontWeight: '600' },
  calendarDayTextSelected: { color: C.white, fontWeight: '800' },
  createFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.line },
  createBack: { minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  createBackText: { color: C.inkSoft, fontSize: 13, fontWeight: '700' },
  createSubmit: { flex: 1, minHeight: 50, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: C.blueStrong },
  createSubmitText: { color: C.white, fontSize: 14, fontWeight: '700' },

  detailScreen: { flexGrow: 1, paddingHorizontal: 48, paddingTop: 33, paddingBottom: 44 },
  detailTop: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { minHeight: 48, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  backArrow: { color: C.ink, fontSize: 31, lineHeight: 33, fontWeight: '300' },
  backText: { color: C.ink, fontSize: 13, fontWeight: '700' },
  detailActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ghost: { minHeight: 48, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  ghostText: { color: C.ink, fontSize: 13, fontWeight: '700' },
  detailHero: { flexDirection: 'row', alignItems: 'center', gap: 48, paddingHorizontal: 54, paddingVertical: 43, marginTop: 19, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  detailCover: { width: 250, alignItems: 'center' },
  detailInfo: { flex: 1, minWidth: 0 },
  detailEyebrow: { color: C.blueStrong, fontSize: 10, letterSpacing: 1.15, fontWeight: '800' },
  detailTitle: { color: C.ink, fontSize: 32, fontWeight: '800', letterSpacing: -1.25, marginTop: 10 },
  detailCopy: { color: C.inkSoft, fontSize: 14, lineHeight: 22, marginTop: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  meta: { color: C.muted, fontSize: 11, fontWeight: '600' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.muted },
  detailPrimary: { width: 235, marginTop: 27 },
  detailBottom: { flexDirection: 'row', alignItems: 'stretch', gap: 22, marginTop: 24 },
  detailMessage: { flex: 1, padding: 25, borderRadius: 16, backgroundColor: '#E9EBF6' },
  detailMessageKicker: { color: C.blueStrong, fontSize: 10, fontWeight: '800', letterSpacing: 1.05 },
  detailMessageTitle: { color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 8, letterSpacing: -0.4 },
  detailMessageCopy: { color: C.inkSoft, fontSize: 12, lineHeight: 18, marginTop: 7 },
  blankPage: { width: 210, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', backgroundColor: C.white },
  blankPlus: { color: C.blueStrong, fontSize: 27, lineHeight: 29, fontWeight: '300' },
  blankText: { color: C.ink, fontSize: 12, fontWeight: '700' },

  profileHero: { flexDirection: 'row', alignItems: 'center', gap: 17, padding: 30, borderRadius: 23, backgroundColor: C.navy },
  profileHeroText: { flex: 1, minWidth: 0 },
  profileBadge: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: C.blueStrong },
  profileBadgeText: { color: C.white, fontSize: 26, fontWeight: '800' },
  profileTitle: { color: C.white, fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
  profileCopy: { color: '#C8CDE9', fontSize: 12, marginTop: 6 },
  stats: { flexDirection: 'row', alignItems: 'stretch', padding: 25, marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  stat: { flex: 1, alignItems: 'center' },
  statNumber: { color: C.ink, fontSize: 25, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: '700', marginTop: 6 },
  statLine: { width: 1, backgroundColor: C.line },
  tip: { padding: 25, marginTop: 20, borderRadius: 16, backgroundColor: C.pale },
  tipKicker: { color: C.blueStrong, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  tipTitle: { color: C.ink, fontSize: 16, fontWeight: '800', marginTop: 8 },
  tipTitleCompact: { fontSize: 15, marginTop: 0 },
  tipCopy: { color: C.inkSoft, fontSize: 12, marginTop: 8 },
  trashGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2%' }, // 태블릿 줄 간격은 useDiaryGrid(compact, 14)가 정한다
  trashGridCompact: { columnGap: 0, rowGap: 22, justifyContent: 'space-between' },
  // 선택 바가 떠 있을 때 첫 줄은 바 아래에서 보관함 한눈에 보기(grid · gridCompact)와 같은 간격(16 · 폰 28)으로 시작한다
  trashGridSelecting: { paddingTop: 16 },
  trashGridSelectingCompact: { paddingTop: 20 },
  trashPolicy: { color: C.muted, fontSize: 13, lineHeight: 21, marginBottom: 16 },
  trashNotice: { padding: 16, borderRadius: 12, backgroundColor: C.pale, marginBottom: 16 },
  trashCard: { width: '23.5%' }, // 폰 전용 퍼센트 폭의 바탕값. 태블릿은 홈 한눈에 보기와 같은 칸 크기 · 한 줄 개수를 useDiaryGrid 에서 받는다
  trashCardCompact: { width: '47.5%' },
  trashCover: { position: 'relative', alignItems: 'center' }, // 칸(최대 격자 칸)이 카드보다 좁을 때 왼쪽으로 쏠리지 않게 가운데 // 홈 격자 카드의 표지 칸(cardCoverWrap)과 같게: 자르거나 흐리게 하지 않는다
  trashCoverCompact: {},
  trashInfo: { paddingHorizontal: 4, paddingTop: 10, minHeight: 58 }, // 홈 한눈에 보기 cardInfoGrid 와 같은 안쪽 여백
  trashTitle: { color: C.ink, fontSize: 14, fontWeight: '700', letterSpacing: -0.35 }, // cardTitle 과 같은 글자
  // 남은 기간 줄: 글자만(진행 고리는 뺐다, 사용자 결정). 3일 이하는 버터 칩 + 네이비 글자(13.9:1)로 적색 없이 긴급을 보인다
  trashDateRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: 5, minHeight: 24, paddingHorizontal: 0, borderRadius: 12 },
  trashDateRowUrgent: { paddingHorizontal: 9, backgroundColor: C.butter },
  trashDate: { color: C.blueText, fontSize: 12, fontWeight: '600' }, // 남은 날: primaryText(흰 면 위 5.3:1, 원 페이저 11)
  trashDateUrgent: { color: C.ink, fontWeight: '800' },
  // 카드를 누르면 뜨는 동작 시트 (ConfirmDialog 와 같은 틀: 폭 320, 안쪽 20, 모서리 24, scrim 바탕)
  trashSheetBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  trashSheet: { width: 320, maxWidth: '100%', padding: 20, borderRadius: 16, backgroundColor: C.white, shadowColor: C.ink, shadowOpacity: 0.11, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  trashSheetTitle: { color: C.ink, fontSize: 16, fontWeight: '700' },
  trashSheetStatus: { color: C.muted, fontSize: 13, fontWeight: '600', marginTop: 6 },
  trashSheetActions: { gap: 8, marginTop: 18 },
  trashSheetPrimary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, backgroundColor: C.blueStrong },
  trashSheetPrimaryText: { color: C.white, fontSize: 14, fontWeight: '700' },
  trashSheetDanger: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: DANGER_BORDER },
  trashSheetDangerText: { color: C.dangerStrong, fontSize: 14, fontWeight: '700' },
  trashSheetClose: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: 12 },
  trashSheetCloseText: { color: C.muted, fontSize: 14, fontWeight: '700' },
  trashRestore: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: C.line },
  trashRestoreText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  // 이전 폰 휴지통 스와이프 목록 스타일. 저장된 화면과의 호환을 위해 당분간 유지한다.
  trashHint: { color: C.muted, fontSize: 13, lineHeight: 21, marginTop: -8, marginBottom: 14 },
  trashList: { gap: 11 },
  trashRow: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  trashRowActions: { position: 'absolute', top: 0, right: 0, bottom: 0, flexDirection: 'row' },
  trashRowAction: { width: 74, alignItems: 'center', justifyContent: 'center' },
  trashRowRestore: { backgroundColor: C.blueStrong },
  trashRowDelete: { backgroundColor: C.dangerStrong },
  trashRowActionText: { color: C.white, fontSize: 15, fontWeight: '700' },
  trashRowFront: { backgroundColor: C.white },
  trashRowMain: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  trashSwatch: { width: 40, height: 52, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  trashRowInfo: { flex: 1, minWidth: 0 },
  trashRowTitle: { color: C.ink, fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  trashRowDate: { color: C.muted, fontSize: 12, fontWeight: '600', marginTop: 5 },
  profileHeroCompact: { padding: 20 },
});
