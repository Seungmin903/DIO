import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from './AppIcon';
import DioButton from './DioButton';
import { colors, radius } from './theme';

// 제작 화면(내 폰트 만들기 · 사진 속 대상 오리기 · 스티커 시트 분리)이 함께 쓰는 부품. 디자인 가이드 "제작 화면 문법".
// 바탕은 흰색, 작업 영역(사진 · 원고지 · 미리보기)만 옅은 회색 판(surfaceMuted, 모서리 16) 위에 둔다. 버튼은 DioButton 만 쓴다.
// 누름 · 떠오름 효과와 사용법 안내 문구는 두지 않는다. `준비 중` · `미리보기` 같은 개발 상태 칩도 두지 않는다(준비 중인 기능은 출시 때 화면에서 뺀다).

/** 상단 바(높이 64): 왼쪽 뒤로 아이콘 · 제목 22/800 · 오른쪽 동작(children) · 닫기. 뒤로 · 닫기는 넘긴 것만 보인다.
 * 제작 화면의 왼쪽 `<` 는 늘 '이 제작 흐름에서 나가기'다. 단계 사이 이동은 단계 표시(지난 단계 누르기)와 하단 `이전`이 맡는다(코덱스 2026-11-01). */
export function MakerHeader({ title, onBack, backLabel = '뒤로', onClose, closeLabel = '닫기', children = null, busy = false, compact = false }) {
  return (
    <View style={[local.header, compact && local.headerCompact]}>
      {onBack ? <DioButton variant="icon" icon="chevron-left" label={backLabel} disabled={busy} onPress={onBack} /> : null}
      <Text accessibilityRole="header" numberOfLines={1} style={[local.title, !onBack && local.titleFirst]}>{title}</Text>
      {children}
      {onClose ? <DioButton variant="icon" icon="close" label={closeLabel} disabled={busy} onPress={onClose} /> : null}
    </View>
  );
}

/** 1 → 2 단계 표시: 숫자 원 20 + 이름 13/700 + 화살표. 지금 단계는 primaryStrong 원 + 흰 숫자, 지난 단계는 흰 원 + primary 테두리 + 체크, 남은 단계는 primarySoft 원.
 * onStep 을 넘기면 지난 단계만 눌러 그 단계로 간다(이름에 primary 1px 밑줄, 터치 높이 44). 지금 · 다음 단계는 누를 수 없고, disabled(처리 중)면 모두 막는다 */
export function MakerSteps({ steps, current, label, onStep = null, disabled = false }) {
  const at = steps.findIndex(step => step.id === current);
  return (
    <View accessibilityLabel={label} style={local.steps}>
      {steps.map((step, index) => {
        const on = index === at, done = index < at;
        return (
          <View key={step.id} style={local.step}>
            {index > 0 ? <AppIcon name="chevron-right" size={14} color={colors.textMuted} /> : null}
            {done && onStep ? <Pressable accessibilityRole="button" accessibilityLabel={`${step.label} 단계로 이동`} accessibilityState={{ disabled: !!disabled }} disabled={!!disabled}
              onPress={() => onStep(step.id)} hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }} style={[local.stepLink, disabled && local.segmentDisabled]}>
              <View style={[local.badge, local.badgeDone]}><AppIcon name="check" size={12} color={colors.primaryText} strokeWidth={2.6} /></View>
              <Text style={[local.stepText, local.stepTextLink]}>{step.label}</Text>
            </Pressable> : <>
              <View style={[local.badge, on && local.badgeOn, done && local.badgeDone]}>{done ? <AppIcon name="check" size={12} color={colors.primaryText} strokeWidth={2.6} /> : <Text style={[local.badgeText, on && local.badgeTextOn]}>{index + 1}</Text>}</View>
              <Text style={[local.stepText, on && local.stepTextOn]}>{step.label}</Text>
            </>}
          </View>
        );
      })}
    </View>
  );
}

/** 단계 이동 줄: 왼쪽 작은 `이전`(글자 고스트, 80×48) + 주 버튼(children, 남은 폭). onPrev 가 없으면(첫 단계) `이전`은 숨기고 주 버튼이 폭을 다 쓴다 */
export function MakerNav({ onPrev = null, prevDisabled = false, children }) {
  return (
    <View style={local.nav}>
      {onPrev ? <DioButton variant="ghost" label="이전" disabled={!!prevDisabled} onPress={onPrev} style={local.prev} /> : null}
      <View style={local.next}>{children}</View>
    </View>
  );
}

/** 작업 판: 사진 · 캔버스 · 미리보기를 받치는 회색 면(surfaceMuted, 모서리 16) */
export function MakerStage({ children, style, ...rest }) {
  return <View style={[local.stage, style]} {...rest}>{children}</View>;
}

/** 고르기 전의 빈 작업 판: 아이콘 32 + 제목 한 줄 16/800 + 주 버튼 하나(children, 채움 DioButton) */
export function MakerEmpty({ icon = 'image', title, children }) {
  return (
    <View style={local.empty}>
      <AppIcon name={icon} size={32} color={colors.primaryText} />
      <Text style={local.emptyTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** 하단 고정 줄: 흰 면 + 위 1px 선. 왼쪽(left)에 이름 · 상태, 오른쪽에 주 버튼. stacked 면 위아래로 접는다. note: 줄 위에 한 줄(오류 · 진행) */
export function MakerBar({ left = null, children, stacked = false, note = null }) {
  return (
    <View style={local.bar}>
      {note}
      <View style={[local.barRow, stacked && local.barStacked]}>
        {left ? <View style={[local.barLeft, stacked && local.barLeftStacked]}>{left}</View> : null}
        <View style={[local.barAction, stacked && local.barActionStacked]}>{children}</View>
      </View>
    </View>
  );
}

/** 세그먼트 판: 회색 판 안에 같은 폭 항목(MakerSegmentItem)을 놓는다 */
export function MakerSegment({ children, label }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={local.segment}>{children}</View>;
}

/** 세그먼트 항목: 고른 항목은 흰 면 + 1px primary 테두리 + primaryText 글자 */
export function MakerSegmentItem({ label, icon, on = false, disabled = false, onPress }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: on, selected: on, disabled }}
      disabled={disabled} onPress={onPress} style={[local.segmentItem, on && local.segmentOn, disabled && local.segmentDisabled]}>
      {icon ? <AppIcon name={icon} size={18} forText={14} color={on ? colors.primaryText : colors.textMuted} /> : null}
      <Text numberOfLines={1} style={[local.segmentText, on && local.segmentTextOn]}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerCompact: { paddingHorizontal: 8 },
  title: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  titleFirst: { paddingLeft: 8 },
  steps: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  badgeOn: { backgroundColor: colors.primaryStrong },
  badgeDone: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.primaryText },
  badgeTextOn: { color: colors.surface },
  stepText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  stepTextOn: { color: colors.text },
  stepLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  stepTextLink: { color: colors.text, textDecorationLine: 'underline', textDecorationColor: colors.primary },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prev: { minWidth: 80 }, next: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
  stage: { backgroundColor: colors.surfaceMuted, borderRadius: radius.xl, overflow: 'hidden' },
  empty: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  bar: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  barStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  barLeft: { flex: 1, minWidth: 0, justifyContent: 'center' },
  barLeftStacked: { flex: 0 },
  // 왼쪽(left)이 없어도 주 버튼은 오른쪽 끝에 둔다
  barAction: { flexShrink: 0, minWidth: 160, marginLeft: 'auto' },
  barActionStacked: { minWidth: 0, marginLeft: 0 },
  segment: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  segmentItem: { flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  segmentOn: { backgroundColor: colors.surface, borderColor: colors.primary },
  segmentDisabled: { opacity: 0.4 },
  segmentText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  segmentTextOn: { color: colors.primaryText, fontWeight: '800' },
});
