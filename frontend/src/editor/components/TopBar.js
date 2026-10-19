import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../theme'
import Icon from './Icon'

// 공유 상태 표시는 다른 담당 범위. 명세의 아바타 불투명도(활성 100%, 비활성 45%)만 반영한 정적 표시다.
const MEMBERS = [
  { initial: '나', color: '#6E92C6', active: true },
  { initial: '지', color: '#F07A5A', active: true },
  { initial: '서', color: '#3BAF7E', active: false },
]

export default function TopBar({
  doc,
  pageNumber,
  layersOpen,
  pagesOpen,
  focusMode,
  onCloseTab,
  onHome,
  onToggleLayers,
  onTogglePages,
  onToggleFocus,
  onShare,
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
        <View style={[styles.cover, { backgroundColor: doc.coverColor }]} />
        <View>
          <Text style={styles.tabTitle} numberOfLines={1}>
            {doc.title}
          </Text>
          <Text style={styles.tabPage}>PAGE {pageNumber}</Text>
        </View>
        <Pressable onPress={onCloseTab} hitSlop={8} style={styles.tabClose} accessibilityLabel="다이어리 탭 닫기">
          <Icon name="close" size={15} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.right}>
        {!readOnly && <IconToggle icon="layers" label="레이어" text="레이어" active={layersOpen} onPress={onToggleLayers} />}
        <View style={styles.avatars}>
          {MEMBERS.map((member, index) => (
            <View
              key={member.initial}
              style={[
                styles.avatar,
                { backgroundColor: member.color, opacity: member.active ? 1 : 0.45, marginLeft: index ? -8 : 0 },
              ]}
            >
              <Text style={styles.avatarText}>{member.initial}</Text>
            </View>
          ))}
        </View>
        <Pressable onPress={onShare} style={styles.share} accessibilityLabel={shareLabel}>
          <Icon name={shareIcon} size={19} color={colors.surface} />
        </Pressable>
        <IconToggle icon="focus" label="집중 편집" active={focusMode} onPress={onToggleFocus} />
      </View>
    </View>
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: { width: 11, height: 15, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  tabTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  tabPage: { fontSize: 9.5, fontWeight: '800', color: colors.primary, marginTop: 1 },
  tabClose: { marginLeft: 6, padding: 4, borderRadius: 8 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: 12 },
  toggleActive: { backgroundColor: colors.surfaceSoft },
  togglePressed: { backgroundColor: colors.primarySoft },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 11.5, fontWeight: '800', color: colors.surface },
  share: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
})
