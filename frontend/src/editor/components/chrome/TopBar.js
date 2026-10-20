import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import Icon from '../controls/Icon'


export default function TopBar({
  doc,
  layersOpen,
  pagesOpen,
  focusMode,
  onCloseTab,
  onHome,
  onToggleLayers,
  onTogglePages,
  onToggleFocus,
  onShare,
  onRename,
  readOnly,
  shareLabel = '공유',
  shareIcon = 'share',
}) {
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
        <Pressable onPress={onShare} style={styles.share} accessibilityLabel={shareLabel}>
          <Icon name={shareIcon} size={19} color={colors.surface} />
        </Pressable>
        <IconToggle icon="focus" label="집중 편집" active={focusMode} onPress={onToggleFocus} />
      </View>
    </View>
  )
}

/** 다이어리 이름. 연필(레이어 이름 바꾸기와 같은 모양)을 누르면 그 자리에서 고친다. */
function TitleField({ title, renamable, onCommit }) {
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
        style={styles.titleInput}
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
      <Text style={styles.tabTitle} numberOfLines={1}>
        {title}
      </Text>
      {renamable && <Icon name="edit" size={13} strokeWidth={2} color={colors.textMuted} />}
    </Pressable>
  )
}

function IconToggle({ icon, label, text, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={Boolean(active)}
      style={({ pressed }) => [styles.toggle, active && styles.toggleActive, pressed && styles.togglePressed]}
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
    ...shadow.card,
  },
  logo: { fontSize: 25, fontWeight: '900', letterSpacing: -1.2, color: colors.text },
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
  toggleActive: { backgroundColor: colors.surfaceSoft },
  togglePressed: { backgroundColor: colors.primarySoft },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  share: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
})
