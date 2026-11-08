import { Platform, StyleSheet } from 'react-native';
import { colors as c, radius, DISABLED_OPACITY } from '../shared/theme';
export const profileStyles = StyleSheet.create({
  // 큰 페이지 바탕(surfaceSoft, 바탕은 하나) 위에 카드 없는 열린 폼. 본문은 가운데 최대 640, 아래에 저장 바가 고정된다(코덱스 3차)
  root: { flex: 1, backgroundColor: c.surfaceSoft },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 40, paddingBottom: 48 },
  // 폰은 좁은 폭이라 보관함 · 내 공간과 같은 좌우 14, 제목 24(코덱스 2026-11-01)
  phoneScroll: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 40 },
  rail: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: c.text, flex: 1 },
  titleCompact: { fontSize: 24, letterSpacing: -0.5 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  sectionTitle: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  sectionGap: { marginTop: 40 },
  // 사진 트레이: 공방 도구함과 같은 옅은 면 + cardBorder 1px + 모서리 16
  // 높이 176(폰 152) · 아바타와 `사진 변경` 사이 16, 묶음은 세로 가운데(오른쪽 여백은 의도된 빈칸, 코덱스 2026-11-02)
  tray: { minHeight: 176, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: c.cardBorder, backgroundColor: c.surfaceMuted },
  // 폰 사진 트레이: 좁은 폭에서 `사진 변경`이 두 줄로 꺾이지 않게 안쪽 여백 · 간격을 줄인다
  trayCompact: { minHeight: 152, gap: 14, padding: 16 },
  avatarActions: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  photo: { width: 112, height: 112, borderRadius: 56 },
  photoCompact: { width: 96, height: 96, borderRadius: 48 }, // 폰 사진 판(높이 152)의 아바타 96(디자인 가이드)
  row: { paddingTop: 32 }, // 사진 판 → 닉네임 32, 규칙 줄 → 한 줄 소개 약 36(규칙 줄 높이 포함, 코덱스 2026-11-02)
  label: { color: c.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  value: { width: '100%' },
  grow: { flex: 1, minWidth: 0 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: c.primary, // 입력칸 경계는 흰색 위 3:1 이상(c.border 1.39:1은 장식용)
    borderRadius: radius.lg,
    backgroundColor: c.surface,
  },
  focused: { borderColor: c.primaryStrong, borderWidth: 2 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: c.text,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }), // 웹의 기본 검은 윤곽 대신 칸 테두리(포커스 2px)만 보인다
  },
  text: { color: c.text, fontSize: 14 },
  muted: { color: c.textMuted, fontSize: 13, lineHeight: 20 },
  hint: { minHeight: 22, marginTop: 8, fontSize: 13, fontWeight: '600', lineHeight: 18, color: c.primaryStrong },
  counter: { textAlign: 'right' },
  socialHint: { marginTop: 10 },
  formError: { marginTop: 24 },
  infoRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.cardBorder },
  infoLabel: { color: c.text, fontSize: 16, fontWeight: '600' },
  infoValue: { flexShrink: 1, color: c.primaryText, fontSize: 15, fontWeight: '700' },
  error: { color: c.dangerStrong, fontSize: 13, lineHeight: 19 },
  button: {
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: c.primaryStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { color: c.surface, fontSize: 14, fontWeight: '700' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.primary }, // ghost outline(취소)
  secondaryText: { color: c.primaryText },
  dangerGhostText: { color: c.dangerStrong },
  // 글자만 위험색(테두리 · 면 없음). 확인 창의 '저장하지 않고 나가기'처럼 되돌릴 수 없는 쪽을 덜 튀게 둔다
  dangerTextButton: { backgroundColor: 'transparent' },
  danger: { backgroundColor: c.dangerStrong }, // 흰 글자 대비 6.0:1
  disabled: { opacity: DISABLED_OPACITY },
  // 하단 고정 바: 위 선 하나, 안쪽은 폼 폭(640)과 같다
  bar: { paddingHorizontal: 32, paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.cardBorder, backgroundColor: c.surface }, // 높이 84(버튼 52 + 위아래 16), 폰 76
  phoneBar: { paddingHorizontal: 20, paddingVertical: 12 },
  barInner: { width: '100%', maxWidth: 640, alignSelf: 'center', flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  phoneBarInner: { justifyContent: 'flex-start' },
  barButton: { minHeight: 52 },
  // 폰: 취소 96 + 저장은 남은 폭 전체. 폭 320 안팎에서는 저장 글자가 꺾이지 않게 저장은 글자 폭 아래로 줄지 않고 취소가 줄어든다(최소 64)
  phoneCancel: { width: 96, minWidth: 64, flexShrink: 1 },
  phoneSave: { flexGrow: 1, flexShrink: 0 },
  // 회원 탈퇴: 계정 정보 아래 조용한 글자 행
  toastPosition: { position: 'absolute', bottom: 88, left: 16, right: 16, alignItems: 'center' },
  toast: {
    backgroundColor: c.text,
    color: c.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
  },
  backdrop: { flex: 1, backgroundColor: c.scrim, justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flexGrow: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  dialog: {
    width: '100%',
    maxWidth: 460,
    borderRadius: radius.xl,
    backgroundColor: c.surface,
    padding: 24,
    gap: 20,
  },
  dialogHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dialogTitle: { color: c.text, fontWeight: '800', fontSize: 18, flex: 1 },
  dialogActions: { flexDirection: 'row', gap: 12 },
  // 저장 안 한 변경 확인: 태블릿은 가운데 창(폭 400, 버튼은 오른쪽 정렬), 폰은 아래 시트(아래에서 올라오고 버튼은 위아래로 쌓는다)
  discardDialog: { maxWidth: 400 },
  discardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  discardActionsSheet: { flexDirection: 'column', gap: 8 },
  sheetScroll: { flexGrow: 1, padding: 0, justifyContent: 'flex-end' },
  sheetDialog: { maxWidth: undefined, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  // 사진 변경: 사진 옆의 글자 링크 하나 + 누르면 메뉴(태블릿은 링크 아래 말풍선, 폰은 아래 시트)
  photoLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  photoLinkText: { color: c.primaryText, fontSize: 14, fontWeight: '700' },
  photoBackdrop: { flex: 1, backgroundColor: c.scrim },
  photoBackdropPopover: { flex: 1, backgroundColor: 'transparent' },
  photoPopover: { position: 'absolute', width: 236, padding: 8, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.cardBorder },
  photoSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: c.surface },
  photoRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: radius.md },
  photoRowSheet: { minHeight: 52, paddingHorizontal: 0 },
  photoRowText: { color: c.text, fontSize: 14, fontWeight: '700' },
  photoRowTextSheet: { fontSize: 16 },
  photoRowDisabled: { color: c.textMuted },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
    marginTop: -10,
  },
  dialogBody: { gap: 14 },
  eye: { minHeight: 48, width: 44, alignItems: 'center', justifyContent: 'center' },
});
