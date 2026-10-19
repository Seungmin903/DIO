import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../theme'
import Icon from './Icon'

export default function TopBar({ doc, pageNumber, layersOpen, pagesOpen, focusMode, onHome, onToggleLayers, onTogglePages, onToggleFocus, onShare }) {
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
      </View>

      <View style={styles.right}>
        <IconToggle icon="layers" label="레이어" text="레이어" active={layersOpen} onPress={onToggleLayers} />
        <Pressable onPress={onShare} style={styles.share} accessibilityLabel="공유">
          <Icon name="share" size={19} color={colors.surface} />
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
      accessibilityState={{ selected: active }}
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
  right: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: 12 },
  toggleActive: { backgroundColor: colors.surfaceSoft },
  togglePressed: { backgroundColor: colors.primarySoft },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  share: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
})
