import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../../../shared/theme'
import Icon from '../controls/Icon'


// compact: 폰 세로 배치. 인덱스 탭 대신 이름과 쪽수를 두 줄로 보이고, 닫기·내보내기는 뺀다. (내보내기는 도구 막대의 더보기에 있다)
// onToggleOrientation이 있으면 가로 정밀 편집으로 바꾸는 버튼을 둔다.
export default function TopBar({
  compact = false,
  pageLabel,
  onToggleOrientation,
  doc,
  layersOpen,
  pagesOpen,
  onCloseTab,
  onHome,
  onToggleLayers,
  onTogglePages,
  onShare,
  onShareAnchor,
  onRename,
  readOnly,
  shareLabel = '공유',
  shareIcon = 'share',
}) {
  const shareRef = useRef(null)
  if (compact) {
    return (
      <View style={[styles.bar, styles.barCompact]}>
        <Pressable onPress={onHome} accessibilityRole="button" accessibilityLabel="다이어리 홈" hitSlop={6} style={styles.homeCompact}>
          <Icon name="chevronLeft" size={20} />
          <Text style={[styles.logo, styles.logoCompact]}>DIO</Text>
        </Pressable>
        <IconToggle compact icon="panel" label="페이지 목록" active={pagesOpen} onPress={onTogglePages} />
        <View style={styles.docTitle}>
          <TitleField compact title={doc.title} renamable={!readOnly && Boolean(onRename)} onCommit={onRename} />
          {pageLabel ? <Text style={styles.pageLabel} numberOfLines={1}>{pageLabel}</Text> : null}
        </View>
        <View style={styles.right}>
          {onToggleOrientation && <IconToggle compact icon="rotate" label="가로 정밀 편집으로 전환" onPress={onToggleOrientation} />}
          {!readOnly && <IconToggle compact icon="layers" label="레이어" active={layersOpen} onPress={onToggleLayers} />}
        </View>
      </View>
    )
  }
  return (
    <View style={styles.bar}>
      <Pressable onPress={onHome} accessibilityLabel="다이어리 홈" hitSlop={6}>
        <Text style={styles.logo}>DIO</Text>
      </Pressable>
      <IconToggle icon="panel" label="페이지 목록" active={pagesOpen} onPress={onTogglePages} />

      <View style={styles.tab}>
        {/* 인덱스 스티커 모양: 표지 색의 둥근 머리 + 이름을 적는 흰 몸통 */}
        <View style={[styles.spine, { backgroundColor: doc.coverColor }]} />
        <TitleField title={doc.title} renamable={!readOnly && Boolean(onRename)} onCommit={onRename} />
        <Pressable onPress={onCloseTab} hitSlop={8} style={styles.tabClose} accessibilityLabel="다이어리 탭 닫기">
          <Icon name="close" size={15} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.right}>
        {!readOnly && <IconToggle icon="layers" label="레이어" text="레이어" active={layersOpen} onPress={onToggleLayers} />}
        {/* 내보내기: 아이콘 옆에 글자도 쓴다 (전체 화면 보기 버튼은 뺐다) */}
        <Pressable ref={shareRef} onPress={() => { shareRef.current?.measureInWindow?.((x, y, width, height) => onShareAnchor?.({ x, y, width, height })); onShare() }} style={styles.share} accessibilityLabel={shareLabel}>
          <Icon name={shareIcon} size={18} color={colors.surface} />
          <Text style={styles.shareText}>내보내기</Text>
        </Pressable>
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
      hitSlop={6}
      accessibilityRole={renamable ? 'button' : undefined}
      accessibilityLabel={renamable ? '다이어리 이름 바꾸기' : undefined}
      style={styles.titleRow}
    >
      <Text style={[styles.tabTitle, compact && styles.docTitleText]} numberOfLines={1}>
        {title}
      </Text>
      {renamable && <Icon name="edit" size={13} strokeWidth={2} color={colors.textMuted} />}
    </Pressable>
  )
}

function IconToggle({ icon, label, text, active, onPress, compact }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={Boolean(active)}
      style={({ pressed }) => [styles.toggle, compact && styles.toggleCompact, active && styles.toggleActive, pressed && styles.togglePressed]}
    >
      <Icon name={icon} size={19} />
      {text && <Text style={styles.toggleText}>{text}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    zIndex: 10,
    // 그림자는 뺀다: Android 는 반투명 바탕에 elevation 그림자를 주면 편집 영역 위에 회색 줄로 보였다
  },
  barCompact: { height: 60, gap: 4, paddingHorizontal: 8 },
  logo: { fontSize: 25, fontWeight: '900', letterSpacing: -1.2, color: colors.text },
  homeCompact: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingRight: 2 },
  logoCompact: { fontSize: 21 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: 280,
    marginLeft: 6,
    height: 38,
    paddingLeft: 30,
    paddingRight: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(11,25,87,0.1)',
    boxShadow: '0px 1px 2px rgba(11, 25, 87, 0.12)',
    overflow: 'hidden',
  },
  docTitle: { flex: 1, minWidth: 0, marginLeft: 4, justifyContent: 'center' },
  docTitleText: { fontSize: 15, fontWeight: '850', letterSpacing: -0.3 },
  pageLabel: { marginTop: 2, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted },
  titleInputCompact: { minWidth: 0, alignSelf: 'stretch' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 20, opacity: 0.92 },
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
  right: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto', zIndex: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: 12 },
  toggleCompact: { width: 44, height: 44, justifyContent: 'center', paddingHorizontal: 0 },
  toggleActive: { backgroundColor: colors.surfaceSoft },
  togglePressed: { backgroundColor: colors.primarySoft },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  share: {
    flexDirection: 'row',
    gap: 6,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  shareText: { fontSize: 13, fontWeight: '800', color: colors.surface },
})
