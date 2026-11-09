import { Platform, StyleSheet } from 'react-native';
import { colors as c, radius } from '../shared/theme';
// 신고 · 차단 화면(2026-11-09 지라 537 A안): 카드 없이 마이페이지 설정 문법(구역 제목 14/700 · 줄 + 아래 구분선 cardBorder),
// 머리줄은 앱 원래 바탕 연보라(surfaceSoft), 본문은 흰 바탕(surface). 입력 칸은 프로필 수정 칸과 같다(흰 면 · primary 테두리 · 모서리 12(radius.lg) · 글자 16)
export const safetyStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // 폰: 위 안전 영역이 머리줄과 같은 연보라가 되게 바탕을 surfaceSoft 로 둔다(아래 안전 영역은 흰 패널의 paddingBottom)
  phoneBackdrop: { padding: 0, backgroundColor: c.surfaceSoft },
  panel: { width: '100%', maxWidth: 580, maxHeight: '92%', backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden', flexShrink: 1 },
  panelFixed: { height: 720 },
  phonePanel: { flex: 1, maxWidth: '100%', maxHeight: '100%', borderRadius: 0 },
  keyboard: { flexShrink: 1 }, phoneKeyboard: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: c.cardBorder, backgroundColor: c.surfaceSoft },
  // 폰은 화면 전체를 덮어 상단 안전 영역이 바탕색(surfaceSoft)이다. 머리줄도 같은 색이어야 위쪽이 두 색으로 갈리지 않는다(지라 598)
  phoneHeader: { backgroundColor: c.surfaceSoft },
  // 머리줄 오른쪽 X: 터치 48, 그림 오른쪽 끝을 머리줄 안쪽 여백(16)에 맞춘다(왼쪽 ‹ 의 marginLeft -12 와 대칭)
  closeButton: { width: 48, height: 48, marginRight: -12, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  title: { fontSize: 19, fontWeight: '700', color: c.text, flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
  bodyCentered: { justifyContent: 'center' },
  text: { fontSize: 14, lineHeight: 22, color: c.text },
  muted: { fontSize: 13, lineHeight: 20, color: c.textMuted },
  // 구역 제목: 설정 SettingTitle 과 같은 14/700 · 위 16 · 아래 4
  sectionTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  // 카드 대신 줄 + 아래 구분선(얼굴 40 줄 64)
  listRow: { minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.cardBorder },
  targetHead: { minHeight: 56 },
  settingRow: { minHeight: 48 },
  name: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: c.text },
  strong: { fontWeight: '700' },
  value: { fontSize: 15, fontWeight: '700', color: c.primaryText },
  badge: { color: c.primaryText, fontSize: 12, fontWeight: '700' },
  // 신고 사유: 설문처럼 왼쪽 동그라미(20), 줄 48 · 아래 구분선. 고른 줄은 동그라미 · 글자만 보라(면 · 테두리 없음)
  option: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.cardBorder },
  // 동그라미는 직접 그린다(공용 radioOn 아이콘은 안쪽 점이 반지름 1이라 너무 작았다, 2026-11-09 사용자): 바깥 20 · 안쪽 점 10
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderWidth: 2, borderColor: c.primaryStrong },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primaryStrong },
  optionText: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '500', color: c.text },
  optionTextOn: { color: c.primaryStrong, fontWeight: '600' },
  fieldHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 16, marginBottom: 8 },
  fieldLabel: { fontSize: 15, fontWeight: '800', color: c.text },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.primary, borderRadius: radius.lg, minHeight: 140, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, lineHeight: 24, color: c.text, textAlignVertical: 'top', ...Platform.select({ web: { outlineStyle: 'none' } }) },
  // 칸은 사진(72) + 위 · 오른쪽 12 를 함께 잡아 X 가 칸 안에 든다 — 안드로이드는 부모 밖으로 나간 부분의 터치를 자식에 주지 않는다(리뷰 !489).
  // 사진 사이 · 줄 사이 12 는 이 여백이 맡는다(예전 gap 12 와 같은 간격)
  photos: { flexDirection: 'row', flexWrap: 'wrap' },
  photoCell: { width: 84, height: 84, paddingTop: 12, paddingRight: 12 },
  photo: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.surfaceMuted },
  // 칸 오른쪽 위 X: 그림 24, 누르는 칸 40(+hitSlop 8)
  photoDelete: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  photoDeleteDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' },
  photoAdd: { width: 72, height: 72, marginTop: 12, marginRight: 12, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.secondary, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: 16, gap: 10, borderTopWidth: 1, borderColor: c.cardBorder, backgroundColor: c.surface },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, backgroundColor: c.primaryStrong, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  buttonText: { color: c.surface, fontSize: 15, fontWeight: '700' },
  secondaryText: { color: c.text }, disabled: { opacity: 0.4 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  menu: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  // 차단 목록 '차단 해제': 문의 이메일 '복사'와 같은 옅은 버튼(누르는 칸 48)
  tonal: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  tonalText: { fontSize: 14, fontWeight: '700', color: c.primaryText },
  error: { fontSize: 13, lineHeight: 20, color: c.dangerStrong, marginTop: 8 },
  center: { textAlign: 'center' },
  notice: { marginTop: 12, padding: 12, gap: 10, borderWidth: 1, borderColor: c.primary, borderRadius: radius.md, backgroundColor: c.surface },
  preview: { width: '100%', height: 360 },
  toast: { position: 'absolute', alignSelf: 'center', minHeight: 38, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: c.text, justifyContent: 'center' },
  toastText: { color: c.surface, fontSize: 13, fontWeight: '700' },
  // 접수 완료: 가운데 아이콘 + 제목, 다음 행동은 '○○님 차단하기' 하나(차단은 신고와 섞지 않는다)
  complete: { alignItems: 'center', gap: 14, paddingBottom: 80 },
  completeTitle: { fontSize: 20, fontWeight: '800', color: c.text, textAlign: 'center' },
  blockOffer: { minHeight: 48, marginTop: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  blockOfferText: { fontSize: 15, fontWeight: '700', color: c.dangerStrong },
  // 차단한 사용자 참여 안내 모달(폭 400): 아이콘 56 · 제목 18/800 · 이름 칩 32 · 버튼 한 줄(간격 8) · 맨 아래 작은 체크(글자 13, 누르는 칸 48)
  dialogBackdrop: { flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400, paddingTop: 26, paddingHorizontal: 22, paddingBottom: 12, borderRadius: radius.xl, backgroundColor: c.surface },
  dialogIcon: { width: 56, height: 56, borderRadius: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
  dialogTitle: { marginTop: 12, fontSize: 18, lineHeight: 26, fontWeight: '800', color: c.text, textAlign: 'center' },
  chips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { height: 32, paddingLeft: 6, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: c.cardBorder, backgroundColor: c.surface },
  chipText: { fontSize: 14, fontWeight: '600', color: c.text },
  dialogActions: { marginTop: 22, flexDirection: 'row', gap: 8 },
  dismiss: { minHeight: 48, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  dismissText: { fontSize: 13, color: c.textMuted },
  // 개발용 미리보기(SafetyPreview) 전용
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.cardBorder, borderRadius: radius.lg, padding: 16, gap: 8 },
  heading: { fontSize: 15, fontWeight: '700', color: c.text },
});
