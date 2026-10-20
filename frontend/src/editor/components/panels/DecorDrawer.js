import { createContext, useContext, useRef, useState } from 'react'
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radius, shadow } from '../../../shared/theme'
import { PHOTO_STYLES, TAPE_SIZES, TAPES } from '../../constants'
import { stickerKey, useCustomDecor } from '../../hooks/useCustomDecor'
import { STICKER_GROUPS, stickerSource } from '../../stickerAssets'
import Svg, { Path } from 'react-native-svg'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { mediaFailureMessage } from '../../utils/mediaRecovery.js'
import { pickImages } from '../../services/image'
import { useMediaUri } from '../../hooks/useMediaUri'
import { MEDIA_FORMATS } from '../../utils/mediaPolicy'
import ChipScroller, { justDragged } from '../controls/ChipScroller'
import HelpButton, { useHelp } from '../controls/HelpButton'
import Icon from '../controls/Icon'
import TapeCropper from './TapeCropper'
import TapeView from '../canvas/TapeView'

export const DRAWER_TABS = [
  { id: 'sticker', name: '스티커', icon: 'sticker' },
  { id: 'tape', name: '마스킹테이프', icon: 'tape' },
  { id: 'photo', name: '사진', icon: 'image' },
]

// 보관함 미리보기 테이프 크기 (실제 테이프 기본 크기 180×34 와 같은 비율)
// 규격 비율대로 그린 미리보기 높이
const tapePreviewHeight = (sizeId) => {
  const size = TAPE_SIZES.find((s) => s.id === sizeId) ?? TAPE_SIZES[1]
  return (TAPE_PREVIEW.width * size.h) / size.w
}
const TAPE_PREVIEW = { width: 236, height: 44 }

// 분류 칩: 전체 + 스티커 묶음별. 움직이는 스티커 묶음은 하나로 모은다.
const CATEGORIES = [
  { id: 'all', name: '전체' },
  { id: 'motion', name: '움직이는' },
  ...STICKER_GROUPS.filter((g) => !g.id.startsWith('motion')).map((g) => ({
    id: g.id,
    name: g.title.split(' · ')[0],
  })),
]
const inCategory = (group, category) =>
  category === 'all' || group.id === category || (category === 'motion' && group.id.startsWith('motion'))

// 보관함 크기: 왼쪽 아래 손잡이로 넓히고 늘린다. 닫았다 열어도 유지되도록 모듈에 기억해 둔다.
const SIZE_LIMITS = { minWidth: 280, maxWidth: 640, minHeight: 260 }
const TILE_MIN_PX = 68
let rememberedSize = { width: 300, height: null }
// 넓이에 맞춘 스티커 칸 수 (Tile 이 읽는다)
const ColumnsContext = createContext(4)

/**
 * 스티커·테이프·사진 보관함. 항목을 누르면 페이지 가운데에 붙는다.
 * 검색·분류(스티커), 끝 모양(테이프), 붙일 모양(사진) 같은 고르기는 위쪽에 고정해 두고 목록만 스크롤한다.
 */
export default function DecorDrawer({ tab, onAdd, onAddPhotos, recentPhotos, onToast, onClose }) {
  const current = DRAWER_TABS.find((item) => item.id === tab) ?? DRAWER_TABS[0]
  const custom = useCustomDecor()
  const [busy, setBusy] = useState(false)
  const [photoStyle, setPhotoStyle] = useState('rect')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [size, setSize] = useState(rememberedSize)
  const [pendingTape, setPendingTape] = useState(null) // 자르기 화면에서 고르는 중인 테이프 사진
  const measured = useRef(0)
  const resizeStart = useRef(null)
  const columns = clamp(Math.floor((size.width - BODY_X * 2) / TILE_MIN_PX), 4, 9)
  const resizeHandlers = usePan({
    onStart: () => {
      resizeStart.current = { width: size.width, height: size.height ?? measured.current }
    },
    onMove: (dx, dy) => {
      const start = resizeStart.current
      // 오른쪽에 붙어 있으므로 왼쪽으로 끌면 넓어진다.
      const next = {
        width: clamp(start.width - dx, SIZE_LIMITS.minWidth, SIZE_LIMITS.maxWidth),
        height: Math.max(SIZE_LIMITS.minHeight, start.height + dy),
      }
      rememberedSize = next
      setSize(next)
    },
  })

  const addSticker = (item) => {
    custom.markRecent(item)
    onAdd({ kind: 'sticker', ...item })
  }
  const keyword = query.trim()
  const matches = (sticker) => !keyword || sticker.name?.includes(keyword) || sticker.emoji === keyword
  // 그룹 이름으로도 찾는다. (예: '동물' → 동물 전체)
  const groups = STICKER_GROUPS.filter((group) => keyword || inCategory(group, category))
    .map((group) => ({
      ...group,
      items: keyword && group.title.includes(keyword) ? group.items : group.items.filter(matches),
    }))
    .filter((g) => g.items.length)
  const customStickers = custom.items.stickers.filter(matches)
  const showExtras = !keyword && category === 'all'

  async function addCustom(kind) {
    if (busy) return
    setBusy(true)
    try {
      // 테이프는 한 장씩 골라 테이프 틀에 들어갈 부분을 먼저 정한 뒤 추가한다.
      if (kind === 'tapes') {
        const [image] = await pickImages({ multiple: false, usage: 'tape' })
        if (image) setPendingTape(image)
        return
      }
      const images = await pickImages({ usage: 'sticker' })
      images.forEach((image) =>
        custom.add(kind, {
          src: image.src,
          mediaFileId: image.mediaFileId,
          poster: image.poster,
          name: image.name,
          aspect: image.width / image.height,
        }),
      )
      if (images.length) onToast('내 스티커에 추가했어요.')
    } catch (error) {
      onToast(mediaFailureMessage(error), () => addCustom(kind))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View
      style={[styles.drawer, { width: size.width }, size.height != null && { height: size.height }]}
      onLayout={(event) => {
        measured.current = event.nativeEvent.layout.height
      }}
    >
      {/* 툴바에서 고른 보관함만 보여 준다 (서랍 안에서 스티커·테이프·사진을 오가지 않는다) */}
      <View style={styles.tabs}>
        <View style={styles.titleRow} accessibilityRole="header">
          <Icon name={current.icon} size={18} color={colors.text} />
          <Text style={styles.title}>{current.name}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.close} hitSlop={8} accessibilityLabel="보관함 닫기">
          <Icon name="close" size={18} />
        </Pressable>
      </View>

      {tab === 'sticker' && (
        <View style={styles.fixed}>
          <View style={styles.search}>
            <Icon name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="스티커 검색 (예: 하트, 고양이)"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel="스티커 검색"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="검색어 지우기">
                <Icon name="close" size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {!keyword && (
            <ChipScroller style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
              {CATEGORIES.map((item) => (
                <Pill key={item.id} label={item.name} active={category === item.id} onPress={() => setCategory(item.id)} />
              ))}
            </ChipScroller>
          )}
        </View>
      )}
      {tab === 'photo' && (
        <View style={styles.fixed}>
          <Text style={styles.optionLabel}>붙일 모양</Text>
          <ChipScroller style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {PHOTO_STYLES.map((item) => (
              <Pill key={item.id} label={item.name} active={photoStyle === item.id} onPress={() => setPhotoStyle(item.id)} />
            ))}
          </ChipScroller>
        </View>
      )}

      <ColumnsContext.Provider value={columns}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          {tab === 'sticker' && (
            <>
              {showExtras && custom.items.recentStickers.length > 0 && (
                <Section title="최근 사용">
                  <View style={styles.grid}>
                    {custom.items.recentStickers.map((item) => (
                      <Tile key={stickerKey(item)} onPress={() => addSticker(item)} label={item.name}>
                        <StickerThumb item={item} />
                      </Tile>
                    ))}
                  </View>
                </Section>
              )}
              {(showExtras || (keyword && customStickers.length > 0)) && (
                <CustomSection
                  title="내 스티커"
                  hint="투명 PNG·GIF를 추가해 나만의 스티커로 꾸며 보세요."
                  onAdd={() => addCustom('stickers')}
                  busy={busy}
                >
                  {customStickers.length > 0 && (
                    <View style={styles.grid}>
                      {customStickers.map((item) => (
                        <Tile key={item.id} onPress={() => addSticker(item)} onRemove={() => custom.remove('stickers', item.id)}>
                          <StickerThumb item={item} />
                        </Tile>
                      ))}
                    </View>
                  )}
                </CustomSection>
              )}
              {keyword && !groups.length && !customStickers.length && (
                <Text style={styles.empty}>'{keyword}'에 맞는 스티커가 없어요.</Text>
              )}
              {groups.map((group) => (
                <Section key={group.id} title={group.title} badge={group.badge}>
                  <View style={styles.grid}>
                    {group.items.map((sticker) => (
                      <Tile key={sticker.asset} onPress={() => addSticker(sticker)} label={sticker.name}>
                        <StickerThumb item={sticker} />
                      </Tile>
                    ))}
                  </View>
                </Section>
              ))}
            </>
          )}

          {tab === 'tape' && (
            <>
              <CustomSection
                title="내 테이프"
                hint="사진이나 무늬 이미지를 고른 뒤, 테이프 틀에 들어갈 부분을 직접 정해요."
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
                        <TapeView
                          src={item.src}
                          mediaFileId={item.mediaFileId}
                          crop={item.crop}
                          imageWidth={item.imageWidth}
                          imageHeight={item.imageHeight}
                          edge="straight"
                          width={TAPE_PREVIEW.width}
                          height={tapePreviewHeight(item.size)}
                        />
                      </TapeRow>
                    ))}
                  </View>
                )}
              </CustomSection>
              {/* 폭 규격별(슬림·기본·와이드) 6종. 미리보기 높이도 실제 폭 비율대로 */}
              {TAPE_SIZES.map((size) => (
                <Section key={size.id} title={`${size.name} · ${size.hint}`}>
                  <View style={styles.tapeList}>
                    {TAPES.filter((tape) => tape.size === size.id).map((tape) => (
                      <TapeRow key={tape.id} name={tape.name} onPress={() => onAdd({ kind: 'tape', ...tape })}>
                        <TapeView
                          pattern={tape.pattern}
                          palette={tape.palette}
                          edge="straight"
                          width={TAPE_PREVIEW.width}
                          height={tapePreviewHeight(size.id)}
                          scale={TAPE_PREVIEW.width / size.w}
                        />
                      </TapeRow>
                    ))}
                  </View>
                </Section>
              ))}
            </>
          )}

          {tab === 'photo' && (
            <>
              <Pressable
                onPress={async () => {
                  if (busy) return
                  setBusy(true)
                  try { await onAddPhotos(photoStyle) } finally { setBusy(false) }
                }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
                style={({ pressed }) => [styles.upload, pressed && styles.pressed]}
              >
                <View style={styles.uploadIcon}>
                  <Icon name="image" size={24} color={colors.primary} />
                </View>
                <Text style={styles.uploadTitle}>{busy ? '원본을 저장하고 있어요…' : '사진 · GIF 불러오기'}</Text>
                <Text style={styles.uploadHint}>
                  {MEDIA_FORMATS}{'\n'}사진 50MiB · 6,400만 화소 / GIF 10MiB · 4,096px
                </Text>
              </Pressable>
              {recentPhotos.length > 0 && (
                <Section title="최근 불러온 사진">
                  <View style={styles.grid}>
                    {recentPhotos.map((photo) => (
                      <View key={photo.id} style={[styles.photoCell, { width: `${100 / Math.ceil(columns / 2)}%` }]}>
                        <Pressable
                          onPress={() => onAdd({ kind: 'photo', style: photoStyle, ...photo })}
                          style={({ pressed }) => [styles.photoTile, pressed && styles.photoPressed]}
                          accessibilityLabel={`${photo.name ?? '사진'} 붙이기`}
                        >
                          <RecentPhotoThumb photo={photo} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </Section>
              )}
            </>
          )}
        </ScrollView>
      </ColumnsContext.Provider>
      {pendingTape && (
        <TapeCropper
          image={pendingTape}
          onCancel={() => setPendingTape(null)}
          onConfirm={({ crop, size }) => {
            const { src, mediaFileId, poster, name, width, height } = pendingTape
            custom.add('tapes', { src, mediaFileId, poster, name, imageWidth: width, imageHeight: height, crop, size })
            setPendingTape(null)
            onToast('내 테이프에 추가했어요. 붙인 뒤에도 자르기로 다시 고를 수 있어요.')
          }}
        />
      )}
      <View
        {...resizeHandlers}
        style={styles.resize}
        accessibilityLabel="보관함 크기 조절"
        accessibilityHint="끌어서 넓이와 높이를 바꿔요"
      >
        {/* iPadOS 창 손잡이처럼 보관함 모서리 곡선과 같은 중심의 호 */}
        <Svg width={GRIP} height={GRIP} pointerEvents="none">
          <Path d={GRIP_ARC} stroke="rgba(11,25,87,0.32)" strokeWidth={4} strokeLinecap="round" fill="none" />
        </Svg>
      </View>
    </View>
  )
}

function StickerThumb({ item }) {
  const uri = useMediaUri(item, { still: true })
  const source = stickerSource(item, true, uri)
  return source ? (
    <Image source={source} style={styles.tileImage} resizeMode="contain" />
  ) : (
    <Text style={styles.tileEmoji}>{item.emoji}</Text>
  )
}

function RecentPhotoThumb({ photo }) {
  const uri = useMediaUri(photo, { still: true })
  return <Image source={uri ? { uri } : null} style={styles.photoImage} resizeMode="cover" />
}

function Section({ title, badge, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {badge && <Text style={styles.badge}>{badge}</Text>}
      </View>
      {children}
    </View>
  )
}

function CustomSection({ title, hint, onAdd, busy, children }) {
  const help = useHelp()
  return (
    <View style={styles.custom}>
      <View style={styles.sectionHead}>
        <View style={styles.titleGroup}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <HelpButton {...help} label={`${title} 도움말`} />
        </View>
        <Pressable onPress={onAdd} disabled={busy} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Icon name="plus" size={13} />
          <Text style={styles.addText}>{busy ? '불러오는 중' : '추가'}</Text>
        </Pressable>
      </View>
      {help.open && <Text style={styles.customHint}>{hint}</Text>}
      {children}
    </View>
  )
}

function Pill({ label, active, onPress }) {
  return (
    <Pressable
      onPress={() => !justDragged() && onPress()}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && !active && styles.pressed]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  )
}

// 타일은 너비를 % 로 나눠 줄 양 끝이 목록 좌우 여백에 딱 맞게 한다. (고정 너비면 오른쪽에 남는 칸이 생긴다)
function Tile({ onPress, onRemove, label, children }) {
  const columns = useContext(ColumnsContext)
  return (
    <View style={[styles.tileCell, { width: `${100 / columns}%` }]}>
      <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
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
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.tapeRow, pressed && styles.pressed]}
        accessibilityLabel={`${name} 붙이기`}
      >
        {children}
        <Text style={styles.tapeName}>{name}</Text>
      </Pressable>
      {onRemove && (
        <Pressable onPress={onRemove} style={[styles.remove, styles.removeTape]} hitSlop={6} accessibilityLabel="보관함에서 삭제">
          <Icon name="close" size={11} strokeWidth={2.6} color={colors.surface} />
        </Pressable>
      )}
    </View>
  )
}

const BODY_X = 14
const DRAWER_RADIUS = 24
// 크기 조절 손잡이: 왼쪽 아래 모서리 곡선(반경 24)과 중심이 같은 호를 안쪽으로 7px 들여 그린다.
const GRIP = 44
const GRIP_ARC = (() => {
  const r = DRAWER_RADIUS - 7
  const cx = DRAWER_RADIUS
  const cy = GRIP - DRAWER_RADIUS
  const point = (deg) => [cx - r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)]
  const [x1, y1] = point(12)
  const [x2, y2] = point(78)
  return `M${x1} ${y1} A${r} ${r} 0 0 0 ${x2} ${y2}`
})()
const TILE_GAP = 3

const styles = StyleSheet.create({
  drawer: {
    width: 300,
    maxWidth: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    borderRadius: DRAWER_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.97)',
    // 웹에서는 뒤 캔버스가 살짝 비치는 유리 질감 (네이티브는 불투명 흰 배경)
    ...Platform.select({ web: { backgroundColor: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)' }, default: {} }),
    overflow: 'hidden',
    ...shadow.float,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: BODY_X,
    paddingTop: 12,
    paddingBottom: 10,
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 38 },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  close: { padding: 8 },
  fixed: { paddingHorizontal: BODY_X, paddingBottom: 8, gap: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: BODY_X, paddingTop: 4, paddingBottom: GRIP },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2F9',
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 13,
    color: colors.text,
    outlineStyle: 'none',
  },
  chipScroll: { marginHorizontal: -BODY_X, flexGrow: 0 },
  chipRow: { gap: 6, paddingHorizontal: BODY_X },
  resize: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: GRIP,
    height: GRIP,
    ...Platform.select({ web: { cursor: 'nesw-resize', touchAction: 'none' }, default: {} }),
  },
  pill: {
    height: 34,
    paddingHorizontal: 13,
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.text, borderColor: colors.text },
  pillText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  pillTextActive: { color: colors.surface, fontWeight: '800' },
  empty: {
    paddingVertical: 20,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
  section: { marginTop: 14 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontSize: 9.5,
    fontWeight: '800',
  },
  custom: {
    marginTop: 6,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: '#F3F6FB',
  },
  customHint: { fontSize: 11.5, lineHeight: 18, color: colors.textMuted },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addText: { fontSize: 11.5, fontWeight: '700', color: colors.text },
  // 칸 안쪽 여백(TILE_GAP)만큼 그리드를 바깥으로 당겨, 첫·끝 타일의 바깥 선이 목록 여백과 맞게 한다.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -TILE_GAP },
  tileCell: { width: '25%', aspectRatio: 1, padding: TILE_GAP },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F5F7FB',
  },
  pressed: { backgroundColor: colors.primarySoft },
  tileEmoji: { fontSize: 34 },
  tileImage: { width: '74%', height: '74%' },
  remove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  removeTape: { top: -6, right: -6 },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    backgroundColor: '#EEF2F9',
  },
  segmentItem: {
    height: 36,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentActive: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  tapeList: { gap: 8 },
  tapeRow: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#F5F7FB',
  },
  tapeName: {
    alignSelf: 'flex-start',
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
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
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  uploadTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  uploadHint: {
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    color: colors.textMuted,
  },
  photoCell: { width: '50%', aspectRatio: 4 / 5, padding: TILE_GAP },
  photoTile: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E7EEF7',
  },
  photoPressed: { opacity: 0.7 },
  photoImage: { width: '100%', height: '100%' },
})
