import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { colors } from '../../../shared/theme'
import Icon from '../controls/Icon'
import ChipScroller from '../controls/ChipScroller'
import BrandLogo from '../../../shared/BrandLogo'
import SharingEntry from '../../../sharing/SharingEntry'


// compact: 폰 세로 배치. 이름 한 줄을 오른쪽 아이콘과 같은 중심선에 두고 내보내기는 상단 맨 오른쪽에 둔다.
// 폰 세로는 방향 전환 버튼 없이 기기를 돌리는 대로 따른다. 그 자리에 공유 버튼을 둔다. 페이지 목록 · 레이어 버튼은 도구 줄 아래 좌우 끝(PhoneCornerButtons)에 있다.
export default function TopBar({
  sharingMembers = [],
  onOpenSharing,
  invitationCount = 0,
  compact = false,
  onToggleOrientation,
  doc,
  layersOpen,
  pagesOpen,
  pagesWidth,
  onCloseTab,
  tabs,
  activeTabId,
  onSelectTab,
  onHome,
  onToggleLayers,
  onTogglePages,
  onShare,
  onShareAnchor,
  onRename,
  readOnly,
  exportEnabled = true,
  shareLabel = '공유',
  shareIcon = 'share',
  onRightWidth,
}) {
  const shareRef = useRef(null)
  // 오른쪽 묶음은 창 폭에 따라 줄인다: 사진 2장 → 1장 → 사진만, 레이어 · 공유 글자 숨김. 내보내기는 끝까지 아이콘 + 글자. 640 아래에서는 탭 줄을 접는다
  const { width: windowWidth } = useWindowDimensions()
  const wide = windowWidth >= 1024, mid = windowWidth >= 834, semi = windowWidth >= 720
  const [labeledPageWidth, setLabeledPageWidth] = useState(null)
  const [activeTabBox, setActiveTabBox] = useState(null) // 지금 보는 탭 자리 (탭이 많아 넘칠 때 그 탭이 보이게 넘긴다)
  if (compact) {
    return (
      <View style={[styles.bar, styles.barCompact]}>
        <Pressable onPress={onHome} accessibilityRole="button" accessibilityLabel="다이어리 홈" hitSlop={6} style={styles.homeCompact}>
          <Icon name="chevronLeft" size={20} />
        </Pressable>
        <View style={styles.docTitle}>
          <TitleField compact title={doc.title} renamable={!readOnly && Boolean(onRename)} onCommit={onRename} />
        </View>
        <View style={[styles.right, styles.rightCompact]}>
          {onOpenSharing && <SharingEntry variant="bar" members={sharingMembers} count={invitationCount} onPress={onOpenSharing} showLabel={false} memberLimit={1} hideCounter plain />}
          {exportEnabled && <Pressable ref={shareRef} onPress={() => { shareRef.current?.measureInWindow?.((x, y, width, height) => onShareAnchor?.({ x, y, width, height })); onShare() }} hitSlop={2} style={({ pressed }) => [styles.toggle, styles.toggleCompact, pressed && styles.togglePressed]} accessibilityRole="button" accessibilityLabel={shareLabel}>
            <Icon name={shareIcon} size={20} />
          </Pressable>}
        </View>
      </View>
    )
  }
  return (
    <View style={styles.bar}>
      {/*
        아래 페이지 목록과 양 끝을 맞춘다: ‹ + 로고(보관함으로 돌아가기)는 목록 왼쪽 끝, 페이지 버튼은 목록 오른쪽 끝.
        ‹ 는 아이패드 문서 앱(노트·Pages·굿노트)처럼 왼쪽 위에서 돌아가기를 알려 준다.
      */}
      <View style={[styles.lead, pagesWidth && { width: LIST_LEFT + pagesWidth - (!mid && labeledPageWidth != null ? labeledPageWidth - 44 : 0), gap: 0, paddingLeft: LIST_LEFT - CHEVRON_INSET + HOME_SHIFT }]}>
        {/* 글자가 있는 버튼의 실제 폭과 아이콘 버튼 폭 차이만큼 묶음을 줄인다. */}
        <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          onLayout={(event) => setLabeledPageWidth(event.nativeEvent.layout.width)} style={styles.measureLabel}>
          <View style={styles.chipToggle}><Icon name="panel" size={19} forText={13} /><Text style={styles.toggleText}>페이지</Text></View>
        </View>
        <Pressable onPress={onHome} accessibilityRole="button" accessibilityLabel="다이어리 홈" hitSlop={6} style={({ pressed }) => [styles.home, pressed && styles.homePressed]}>
          <Icon name="chevronLeft" size={CHEVRON_SIZE} />
          <BrandLogo size={LOGO_SIZE} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <IconToggle chip icon="panel" label="페이지 목록" text={mid ? '페이지' : undefined} active={pagesOpen} onPress={onTogglePages} />
      </View>

      {/*
        열린 다이어리 탭들. 이름은 탭 하나에 알맞은 길이에서 … 로 줄인다.
        탭이 많아 넘치면 양옆 ‹ › 로 넘긴다 (ChipScroller). 맨 끝 + 는 보관함에서 다른 다이어리를 연다.
      */}
      {windowWidth >= 640 && <ChipScroller style={styles.tabStrip} contentContainerStyle={styles.tabStripContent} reveal={activeTabBox} arrowLabels={['앞 탭 보기', '다음 탭 보기']}>
        {(tabs?.length ? tabs : [{ id: activeTabId, title: doc.title, coverColor: doc.coverColor }]).map((tab) => {
          const active = tab.id === activeTabId
          // 표지 색을 따라간다: 그라데이션은 위 → 아래 색 그대로, 그 밖은 단색
          const paint = tab.paint ?? { color: (active ? doc.coverColor : tab.coverColor) ?? colors.primary }
          return (
            <View
              key={tab.id ?? 'current'}
              style={[styles.tab, !active && styles.tabInactive]}
              onLayout={active ? (event) => { const { x, width } = event.nativeEvent.layout; setActiveTabBox((prev) => (prev?.x === x && prev?.width === width ? prev : { x, width })) } : undefined}
            >
              {/* 인덱스 스티커 모양: 표지 색의 둥근 머리 + 이름을 적는 흰 몸통 */}
              <View style={[styles.spine, { backgroundColor: paint.color, ...(paint.stops && { backgroundImage: `linear-gradient(to bottom, ${paint.stops.join(', ')})` }) }, !active && styles.spineInactive]} />
              {active ? (
                <TitleField title={doc.title} renamable={!readOnly && Boolean(onRename)} onCommit={onRename} />
              ) : (
                <Pressable onPress={() => onSelectTab?.(tab.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${tab.title} 탭으로`} style={styles.titleRow}>
                  <Text style={[styles.tabTitle, styles.tabTitleInactive]} numberOfLines={1}>{tab.title}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => onCloseTab?.(tab.id)} hitSlop={13} style={styles.tabClose} accessibilityLabel={`${active ? doc.title : tab.title} 탭 닫기`}>
                <Icon name="close" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          )
        })}
      </ChipScroller>}
      {windowWidth < 640 && <View style={styles.narrowTitle}><TitleField title={doc.title} renamable={!readOnly && Boolean(onRename)} onCommit={onRename} /></View>}

      {/* 오른쪽 묶음의 왼쪽 끝(공유 버튼)부터 화면 오른쪽 끝까지의 폭을 알린다: 레이어 창이 이 폭으로 열려 왼쪽 끝이 공유 버튼과 맞는다(페이지 버튼 · 페이지 목록과 같은 짝) */}
      <View style={styles.right} onLayout={onRightWidth ? (event) => onRightWidth(windowWidth - event.nativeEvent.layout.x) : undefined}>
        {onOpenSharing && <SharingEntry variant="bar" members={sharingMembers} count={invitationCount} onPress={onOpenSharing} showLabel={semi} memberLimit={wide ? 2 : 1} hideCounter={!semi}/>}
        {!readOnly && <IconToggle chip icon="layers" label="레이어" text={mid ? '레이어' : undefined} active={layersOpen} onPress={onToggleLayers} />}
        {exportEnabled && <Pressable ref={shareRef} onPress={() => { shareRef.current?.measureInWindow?.((x, y, width, height) => onShareAnchor?.({ x, y, width, height })); onShare() }} hitSlop={2} style={styles.share} accessibilityLabel={shareLabel}>
          <Icon name={shareIcon} size={20} forText={13} color={colors.surface} />
          <Text style={styles.shareText}>내보내기</Text>
        </Pressable>}
      </View>
    </View>
  )
}

/** 다이어리 이름. 연필(레이어 이름 바꾸기와 같은 모양)을 누르면 그 자리에서 고친다. */
function TitleField({ title, renamable, onCommit, compact }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== title) onCommit(next)
  }
  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        maxLength={30}
        selectTextOnFocus
        onSubmitEditing={commit}
        onBlur={commit}
        style={[styles.titleInput, compact && styles.titleInputCompact]}
        accessibilityLabel="다이어리 이름"
      />
    )
  }
  return (
    <Pressable
      disabled={!renamable}
      onPress={() => {
        setDraft(title)
        setEditing(true)
      }}
      hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
      accessibilityRole={renamable ? 'button' : undefined}
      accessibilityLabel={renamable ? '다이어리 이름 바꾸기' : undefined}
      style={styles.titleRow}
    >
      <Text style={[styles.tabTitle, compact && styles.docTitleText]} numberOfLines={1}>
        {title}
      </Text>
      {renamable && <Icon name="edit" size={13} forText={compact ? 15 : 13} color={colors.textMuted} />}
    </Pressable>
  )
}

// chip: 상단 바 오른쪽 묶음의 테두리 칩(높이 44 · 흰 면 + cardBorder, 켜지면 primaryStrong 테두리). 글자가 없으면 44 정사각 아이콘 칩
function IconToggle({ icon, label, text, active, onPress, compact, chip }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={Boolean(active)}
      style={({ pressed }) => chip
        ? [styles.chipToggle, !text && styles.chipToggleIcon, active && styles.chipToggleActive]
        : [styles.toggle, compact && styles.toggleCompact, active && styles.toggleActive, pressed && styles.togglePressed]}
    >
      <Icon name={icon} size={19} forText={text ? 13 : undefined} color={chip && active ? colors.primaryText : undefined} />
      {text && <Text style={[styles.toggleText, chip && active && { color: colors.primaryText }]}>{text}</Text>}
    </Pressable>
  )
}

const LOGO_SIZE = 30, LIST_LEFT = 16 // 페이지 목록의 왼쪽 여백
// ‹ 아이콘(24칸 중 9부터 그려짐)의 왼쪽 빈 곳. 이만큼 당겨서 ‹ 의 선이 목록 왼쪽 끝에 오게 한다
const CHEVRON_SIZE = 20, CHEVRON_INSET = Math.round(CHEVRON_SIZE * 8 / 24)
// 목록 왼쪽 끝보다 살짝 안쪽에서 시작하게 (끝에 딱 붙으면 답답해 보였다)
const HOME_SHIFT = 4
const styles = StyleSheet.create({
  narrowTitle: { flex: 1, minWidth: 0, alignItems: 'center', flexDirection: 'row' },
  bar: {
    height: 52, // 태블릿: 아래 도구 줄(50)과 함께 쓰는 높이를 줄여 작업창을 넓힌다
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 0,
    paddingRight: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    zIndex: 10,
    // 그림자는 뺀다: Android 는 반투명 바탕에 elevation 그림자를 주면 편집 영역 위에 회색 줄로 보였다
  },
  // 모바일은 상태 표시줄의 Safe Area와 같은 단색을 사용해 경계가 생기지 않게 한다.
  barCompact: { height: 60, gap: 4, paddingLeft: 14, paddingRight: 8, backgroundColor: colors.surface }, // 왼쪽은 본문 여백 14에 맞춰 ‹ 가 화면 가장자리에 붙지 않게 한다(코덱스 2026-11-03)
  homeCompact: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 2 },
  home: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40 },
  homePressed: {}, // 눌림 효과 없음(사용자 지시)
  lead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16 },
  // 탭 줄: 왼쪽 버튼들과 오른쪽 버튼들 사이를 채우고, 넘치면 ‹ › 로 넘긴다
  tabStrip: { flex: 1, minWidth: 0, marginLeft: 6 },
  tabStripContent: { alignItems: 'center', gap: 6, paddingVertical: 4, paddingRight: 4 },
  tabInactive: { backgroundColor: 'rgba(255,255,255,0.55)', boxShadow: 'none' },
  spineInactive: { opacity: 0.45 },
  tabTitleInactive: { color: colors.textMuted, fontWeight: '600' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    // 이름이 길면 이 폭에서 … 로 줄인다 (한글 8~9자 정도)
    maxWidth: 190,
    height: 38,
    paddingLeft: 30,
    paddingRight: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(28,28,28,0.1)',
    boxShadow: '0px 1px 2px rgba(28, 28, 28, 0.06)',
    overflow: 'hidden',
  },
  docTitle: { flex: 1, minWidth: 0, marginLeft: 4, justifyContent: 'center' },
  docTitleText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  pageLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: colors.textMuted },
  titleInputCompact: { minWidth: 0, alignSelf: 'stretch' },
  // 오른쪽 구분선: 흰 표지면 색 띠가 흰 탭과 이어져 보이지 않으므로 늘 한 줄 긋는다
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 20, opacity: 0.92, borderRightWidth: 1, borderRightColor: colors.cardBorder },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  tabTitle: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  titleInput: {
    minWidth: 140,
    height: 30,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  tabClose: { marginLeft: 2, padding: 4, borderRadius: 8 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0, zIndex: 2 },
  rightCompact: { gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: 12 },
  toggleCompact: { width: 44, height: 44, justifyContent: 'center', paddingHorizontal: 0 },
  toggleActive: { backgroundColor: colors.primarySoft },
  togglePressed: {}, // 눌림 효과 없음(사용자 지시)
  chipToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  chipToggleIcon: { width: 44, paddingHorizontal: 0 },
  chipToggleActive: { borderColor: colors.primaryStrong },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  measureLabel: { position: 'absolute', opacity: 0 },
  // 내보내기: 크기·둥글기는 레이어 버튼과 같게 (색은 강조색 그대로)
  share: {
    flexDirection: 'row',
    gap: 6,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryStrong,
  },
  shareText: { fontSize: 13, fontWeight: '700', color: colors.surface },
})
