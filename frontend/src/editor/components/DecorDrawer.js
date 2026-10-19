import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, shadow } from '../../theme'
import { STICKER_GROUPS, TAPES } from '../constants'
import { useCustomDecor } from '../hooks/useCustomDecor'
import { pickImages } from '../utils/image'
import Icon from './Icon'
import TapeView from './TapeView'

export const DRAWER_TABS = [
  { id: 'sticker', name: '스티커' },
  { id: 'tape', name: '테이프' },
  { id: 'photo', name: '사진' },
]

const CUSTOM_STICKER_PX = 360
const CUSTOM_TAPE_PX = 600

/** 스티커·테이프·사진 보관함. 항목을 누르면 페이지 가운데에 붙는다. */
export default function DecorDrawer({ tab, onTabChange, onAdd, onAddPhotos, recentPhotos, onToast, onClose }) {
  const custom = useCustomDecor()
  const [busy, setBusy] = useState(false)

  async function addCustom(kind) {
    if (busy) return
    setBusy(true)
    try {
      const images = await pickImages({
        maxSize: kind === 'stickers' ? CUSTOM_STICKER_PX : CUSTOM_TAPE_PX,
        keepAlpha: true,
      })
      images.forEach((image) => custom.add(kind, { src: image.src, name: image.name, aspect: image.width / image.height }))
      if (images.length) onToast(kind === 'stickers' ? '내 스티커에 추가했어요.' : '내 테이프에 추가했어요.')
    } catch (error) {
      onToast(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.drawer}>
      <View style={styles.tabs}>
        {DRAWER_TABS.map((item) => (
          <Pressable key={item.id} onPress={() => onTabChange(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}>
            <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.name}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onClose} style={styles.close} hitSlop={8} accessibilityLabel="보관함 닫기">
          <Icon name="close" size={18} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {tab === 'sticker' && (
          <>
            <CustomSection
              title="내 스티커"
              hint="투명 PNG를 추가하고 나만의 스티커로 꾸며 보세요."
              onAdd={() => addCustom('stickers')}
              busy={busy}
            >
              {custom.items.stickers.length > 0 && (
                <View style={styles.grid}>
                  {custom.items.stickers.map((item) => (
                    <Tile
                      key={item.id}
                      onPress={() => onAdd({ kind: 'sticker', ...item })}
                      onRemove={() => custom.remove('stickers', item.id)}
                    >
                      <Image source={{ uri: item.src }} style={styles.tileImage} resizeMode="contain" />
                    </Tile>
                  ))}
                </View>
              )}
            </CustomSection>
            <Text style={styles.tip}>누르면 페이지에 붙어요.</Text>
            {STICKER_GROUPS.map((group) => (
              <View key={group.id} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{group.title}</Text>
                  {group.badge && <Text style={styles.badge}>{group.badge}</Text>}
                </View>
                <View style={styles.grid}>
                  {group.items.map((sticker) => (
                    <Tile key={sticker.emoji} onPress={() => onAdd({ kind: 'sticker', ...sticker })} label={sticker.name}>
                      <Text style={styles.tileEmoji}>{sticker.emoji}</Text>
                    </Tile>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'tape' && (
          <>
            <CustomSection
              title="내 테이프"
              hint="찢어진 모양의 투명 이미지를 내 테이프로 추가할 수 있어요."
              onAdd={() => addCustom('tapes')}
              busy={busy}
            >
              {custom.items.tapes.length > 0 && (
                <View style={styles.tapeList}>
                  {custom.items.tapes.map((item) => (
                    <TapeRow
                      key={item.id}
                      name={item.name}
                      onPress={() => onAdd({ kind: 'tape', ...item })}
                      onRemove={() => custom.remove('tapes', item.id)}
                    >
                      <TapeView src={item.src} width={236} height={26} />
                    </TapeRow>
                  ))}
                </View>
              )}
            </CustomSection>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>마스킹테이프</Text>
              <View style={styles.tapeList}>
                {TAPES.map((tape) => (
                  <TapeRow key={tape.pattern} name={tape.name} onPress={() => onAdd({ kind: 'tape', ...tape })}>
                    <TapeView pattern={tape.pattern} width={236} height={26} />
                  </TapeRow>
                ))}
              </View>
            </View>
          </>
        )}

        {tab === 'photo' && (
          <>
            <Pressable onPress={onAddPhotos} style={({ pressed }) => [styles.upload, pressed && styles.uploadPressed]}>
              <Icon name="image" size={26} color={colors.primary} />
              <Text style={styles.uploadTitle}>사진 · GIF 불러오기</Text>
              <Text style={styles.uploadHint}>추가한 뒤 선택하면 자르기·크기·회전을 편집할 수 있어요.</Text>
            </Pressable>
            {recentPhotos.length > 0 && <PhotoGrid title="최근 불러온 사진" photos={recentPhotos} onAdd={onAdd} />}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function CustomSection({ title, hint, onAdd, busy, children }) {
  return (
    <View style={styles.custom}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={onAdd} disabled={busy} style={styles.addButton}>
          <Icon name="plus" size={13} />
          <Text style={styles.addText}>{busy ? '불러오는 중' : '추가'}</Text>
        </Pressable>
      </View>
      {children || <Text style={styles.customHint}>{hint}</Text>}
    </View>
  )
}

function Tile({ onPress, onRemove, label, children }) {
  return (
    <View style={styles.tileWrap}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      >
        {children}
      </Pressable>
      {onRemove && (
        <Pressable onPress={onRemove} style={styles.remove} hitSlop={6} accessibilityLabel="보관함에서 삭제">
          <Icon name="close" size={11} strokeWidth={2.6} color={colors.surface} />
        </Pressable>
      )}
    </View>
  )
}

function TapeRow({ name, onPress, onRemove, children }) {
  return (
    <View>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.tapeRow, pressed && styles.tilePressed]}>
        {children}
        <Text style={styles.tapeName}>{name}</Text>
      </Pressable>
      {onRemove && (
        <Pressable onPress={onRemove} style={styles.remove} hitSlop={6} accessibilityLabel="보관함에서 삭제">
          <Icon name="close" size={11} strokeWidth={2.6} color={colors.surface} />
        </Pressable>
      )}
    </View>
  )
}

function PhotoGrid({ title, photos, onAdd }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.photoGrid}>
        {photos.map((photo) => (
          <Pressable
            key={photo.id}
            onPress={() => onAdd({ kind: 'photo', ...photo })}
            style={({ pressed }) => [styles.photoTile, pressed && styles.tilePressed]}
          >
            <Image source={{ uri: photo.src }} style={styles.photoImage} resizeMode="cover" />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  drawer: { width: 300, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.97)', overflow: 'hidden', ...shadow.float },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  tab: { height: 34, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 11 },
  tabActive: { backgroundColor: colors.surfaceSoft },
  tabText: { fontSize: 13.5, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: '800' },
  close: { marginLeft: 'auto', padding: 6 },
  body: { paddingHorizontal: 14, paddingBottom: 24 },
  tip: {
    marginTop: 10,
    padding: 9,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    fontSize: 12,
    color: colors.textMuted,
  },
  section: { marginTop: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  badge: {
    marginRight: 'auto',
    marginBottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontSize: 9.5,
    fontWeight: '800',
  },
  custom: { padding: 12, borderRadius: radius.md, backgroundColor: '#F3F6FB' },
  customHint: { fontSize: 11.5, lineHeight: 18, color: colors.textMuted },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addText: { fontSize: 11.5, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tileWrap: { width: 62, height: 62 },
  tile: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  tilePressed: { backgroundColor: colors.primarySoft },
  tileEmoji: { fontSize: 34, textShadowColor: 'rgba(11,25,87,0.18)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  tileImage: { width: 48, height: 48 },
  remove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  tapeList: { gap: 8 },
  tapeRow: { gap: 6, padding: 9, borderRadius: 12, backgroundColor: '#F7F9FC' },
  tapeName: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  upload: {
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.secondary,
  },
  uploadPressed: { backgroundColor: colors.primarySoft },
  uploadTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  uploadHint: { fontSize: 11.5, textAlign: 'center', color: colors.textMuted },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoTile: { width: 132, height: 165, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E7EEF7' },
  photoImage: { width: '100%', height: '100%' },
})
