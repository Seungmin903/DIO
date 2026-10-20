import { createContext, useContext, useRef, useState } from 'react'
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radius, shadow } from '../../../shared/theme'
import { TAPE_DEFAULT, TAPE_PATTERN_NAMES, TAPE_SIZES } from '../../constants'
import { RECENT_LIMIT, stickerKey, useCustomDecor } from '../../hooks/useCustomDecor'
import { STICKER_GROUPS, stickerSource } from '../../stickerAssets'
import Svg, { Path } from 'react-native-svg'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { mediaFailureMessage } from '../../utils/mediaRecovery.js'
import { pickImages } from '../../services/image'
import { useMediaUri } from '../../hooks/useMediaUri'
import { MEDIA_FORMATS } from '../../utils/mediaPolicy'
import ChipScroller, { justDragged } from '../controls/ChipScroller'
import ConfirmDialog from '../controls/ConfirmDialog'
import HelpButton, { useHelp } from '../controls/HelpButton'
import Icon from '../controls/Icon'
import TapeCropper from './TapeCropper'
import TapeOptions from './TapeOptions'
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

// 기본 분류: 스티커 묶음별. 움직이는 스티커 묶음(GIF)은 세부로 나누지 않고 하나로 합친다.
const BASE_GROUPS = [
  {
    id: 'motion',
    title: '움직이는',
    name: '움직이는',
    badge: 'GIF',
    items: STICKER_GROUPS.filter((g) => g.id.startsWith('motion')).flatMap((g) => g.items),
  },
  ...STICKER_GROUPS.filter((g) => !g.id.startsWith('motion')).map((g) => ({ ...g, name: g.title.split(' · ')[0] })),
]

// 보관함 크기: 왼쪽 아래 손잡이로 넓히고 늘린다. 닫았다 열어도 유지되도록 모듈에 기억해 둔다.
const SIZE_LIMITS = { minWidth: 280, maxWidth: 640, minHeight: 260 }
const TILE_MIN_PX = 68
let rememberedSize = { width: 300, height: null }
// 넓이에 맞춘 스티커 칸 수 (Tile 이 읽는다)
const ColumnsContext = createContext(4)

/**
 * 스티커·테이프·사진 보관함. 항목을 누르면 페이지 가운데에 붙는다.
 * 검색·분류(스티커) 같은 고르기는 위쪽에 고정해 두고 목록만 스크롤한다. 사진은 붙인 뒤 자르기에서 틀·모양을 고른다.
 */
export default function DecorDrawer({ tab, onAdd, onAddPhotos, onTapeInserted, recentPhotos, onToast, onClose }) {
  const current = DRAWER_TABS.find((item) => item.id === tab) ?? DRAWER_TABS[0]
  const custom = useCustomDecor()
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(null) // 없으면 첫 칩
  const [editingList, setEditingList] = useState(false) // 분류 목록 편집 (순서·숨기기)
  const [listDragging, setListDragging] = useState(false) // 목록 편집에서 끄는 중이면 목록 스크롤을 멈춘다
  const [folderDraft, setFolderDraft] = useState(null) // 새 폴더·이름 바꾸기 입력 { id?, name }
  // 붙이기 전 '새 테이프' 설정 (보관함을 닫았다 열면 처음 값으로)
  const [tapeDraft, setTapeDraft] = useState(() => {
    const size = TAPE_SIZES.find((s) => s.id === TAPE_DEFAULT.size)
    // 무늬·색은 비워 둔다 (기본으로 골라 둔 것 없이 사용자가 색 → 무늬 순서로 고른다)
    return { x: 0, y: 0, w: size.w, h: size.h, size: size.id, edge: 'straight', pattern: null, palette: null }
  })
  // 직접 넣은 것(내 테이프·폴더 스티커·폴더)을 지우기 전에 한 번 묻는다. { title, message, action }
  const [confirm, setConfirm] = useState(null)
  const ask = (title, message, action) => setConfirm({ title, message, action })

  // 테이프 넣기: 보관함에는 넣을 때 정하는 것(규격·색상·무늬)만 둔다. 규격·색을 골라 두고 무늬를 고르면 붙인다.
  // 붙인 뒤에 바꾸는 옵션(불투명도·끝선 등)은 테이프 옆에 뜨는 옵션 패널에서 고친다. (onTapeInserted)
  function updateTape(patch) {
    const next = { ...tapeDraft, ...patch }
    if (!patch.pattern) {
      setTapeDraft(next)
      return
    }
    onAdd({
      kind: 'tape',
      size: next.size,
      pattern: next.pattern,
      palette: next.palette ?? TAPE_DEFAULT.palette,
      edge: next.edge,
      name: TAPE_PATTERN_NAMES[next.pattern],
    })
    // 다음 테이프를 위해 무늬는 다시 비우고, 고른 색·규격은 남겨 둔다.
    setTapeDraft({ ...next, pattern: null })
    onTapeInserted?.()
  }
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
  // 분류 칩: 즐겨찾기·최근(있을 때) + 기본 분류와 내 폴더(사용자가 정한 순서, 숨긴 기본 분류는 빼고)
  const folders = custom.items.folders
  const favorites = custom.items.favorites
  // 예전에 12개까지 저장된 기록도 8개만 보여 준다
  const recents = custom.items.recentStickers.slice(0, RECENT_LIMIT)
  const favoriteKeys = new Set(favorites.map(stickerKey))
  const orderable = [
    ...BASE_GROUPS.map((g) => ({ id: g.id, name: g.name, base: true })),
    ...folders.map((f) => ({ id: `folder:${f.id}`, name: f.name })),
  ]
  const order = custom.items.categoryOrder
  const rank = (item, index) => {
    const at = order.indexOf(item.id)
    return at >= 0 ? at : order.length + index
  }
  const sorted = orderable.map((item, index) => ({ item, r: rank(item, index) })).sort((a, b) => a.r - b.r).map((x) => x.item)
  const hidden = new Set(custom.items.hiddenCategories)
  const chips = [
    ...(favorites.length ? [{ id: 'favorites', name: '즐겨찾기' }] : []),
    ...(recents.length ? [{ id: 'recent', name: '최근' }] : []),
    ...sorted.filter((c) => !hidden.has(c.id)),
  ]
  const active = chips.some((c) => c.id === category) ? category : chips[0]?.id
  const folder = !keyword && active?.startsWith('folder:') ? folders.find((f) => `folder:${f.id}` === active) : null
  // 검색: 기본 분류 전체 + 폴더. 그룹 이름으로도 찾는다. (예: '동물' → 동물 전체)
  const groups = keyword
    ? BASE_GROUPS.map((group) => ({
        ...group,
        items: group.title.includes(keyword) ? group.items : group.items.filter(matches),
      })).filter((g) => g.items.length)
    : BASE_GROUPS.filter((g) => g.id === active)
  const folderMatches = keyword
    ? folders.flatMap((f) => f.items.filter(matches).map((item) => ({ ...item, folderId: f.id })))
    : []
  // 길게 누르면 즐겨찾기에 넣고 뺀다
  const toggleFavorite = (item) => {
    const has = favoriteKeys.has(stickerKey(item))
    custom.toggleFavorite(item)
    onToast(has ? '즐겨찾기에서 뺐어요.' : '즐겨찾기에 넣었어요.')
  }
  const tileProps = (item) => ({
    onPress: () => addSticker(item),
    onLongPress: () => toggleFavorite(item),
    favorite: favoriteKeys.has(stickerKey(item)),
    label: item.name,
  })
  // 목록 편집: 보이는 분류·폴더 먼저, 숨긴 기본 분류는 맨 아래
  const editorItems = [...sorted.filter((c) => !hidden.has(c.id)), ...sorted.filter((c) => hidden.has(c.id))]
  function moveCategory(from, to) {
    const ids = editorItems.map((c) => c.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    custom.setCategoryOrder(ids)
  }
  // 숨기면 맨 아래로, 다시 보이면 보이는 목록의 끝으로
  function toggleCategoryHidden(id) {
    const hiding = !hidden.has(id)
    const visible = editorItems.filter((c) => !hidden.has(c.id) && c.id !== id).map((c) => c.id)
    const rest = editorItems.filter((c) => hidden.has(c.id) && c.id !== id).map((c) => c.id)
    custom.setCategoryOrder(hiding ? [...visible, ...rest, id] : [...visible, id, ...rest])
    custom.toggleHidden(id)
  }
  // 폴더 이름: 1글자 이상, 다른 폴더·분류와 겹치지 않아야 확정할 수 있다.
  const draftName = folderDraft?.name.trim() ?? ''
  const nameTaken = orderable.some((c) => c.name === draftName && c.id !== `folder:${folderDraft?.id}`)
  const canCommitFolder = draftName.length > 0 && !nameTaken

  async function addCustom(kind, folderId) {
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
      const stickers = images.map((image) => ({
        src: image.src,
        mediaFileId: image.mediaFileId,
        poster: image.poster,
        name: image.name,
        aspect: image.width / image.height,
      }))
      if (folderId) custom.addToFolder(folderId, stickers)
      else stickers.forEach((sticker) => custom.add(kind, sticker))
    } catch (error) {
      onToast(mediaFailureMessage(error), () => addCustom(kind, folderId))
    } finally {
      setBusy(false)
    }
  }

  function commitFolder() {
    const name = folderDraft?.name.trim()
    if (!name || !canCommitFolder) return
    if (folderDraft.id) custom.renameFolder(folderDraft.id, name)
    else setCategory(`folder:${custom.addFolder(name)}`)
    setFolderDraft(null)
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
        {/* 스티커: 분류·폴더 목록 편집은 제목 줄 오른쪽(닫기 왼쪽)에 */}
        {tab === 'sticker' && (
          <Pressable
            onPress={() => setEditingList(!editingList)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={editingList ? '편집 완료' : '목록 편집'}
            accessibilityState={{ selected: editingList }}
            style={({ pressed }) => [styles.headerButton, editingList && styles.headerButtonActive, pressed && styles.pressed]}
          >
            <Icon name={editingList ? 'check' : 'grip'} size={14} color={editingList ? colors.surface : colors.textMuted} />
            <Text style={[styles.headerButtonText, editingList && styles.headerButtonTextActive]}>{editingList ? '편집 완료' : '목록 편집'}</Text>
          </Pressable>
        )}
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
              {chips.map((item) => (
                <Pill
                  key={item.id}
                  label={item.name}
                  active={!editingList && active === item.id}
                  onPress={() => {
                    setEditingList(false)
                    setCategory(item.id)
                  }}
                />
              ))}
              <Pill icon="plus" label="새 폴더" dashed onPress={() => setFolderDraft({ name: '' })} />
            </ChipScroller>
          )}
          {folderDraft && !folderDraft.id && (
            <View style={styles.folderInputRow}>
              <TextInput
                value={folderDraft.name}
                onChangeText={(name) => setFolderDraft({ ...folderDraft, name })}
                autoFocus
                maxLength={12}
                placeholder="폴더 이름"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={() => canCommitFolder && commitFolder()}
                style={styles.folderInput}
                accessibilityLabel="폴더 이름"
              />
              <Pressable onPress={() => setFolderDraft(null)} style={styles.folderInputButton} accessibilityLabel="폴더 이름 입력 취소">
                <Text style={styles.folderCancelText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={() => commitFolder()}
                disabled={!canCommitFolder}
                accessibilityState={{ disabled: !canCommitFolder }}
                style={[styles.folderInputButton, styles.folderOk, !canCommitFolder && styles.folderOkDisabled]}
                accessibilityLabel="폴더 이름 확인"
              >
                <Text style={styles.folderOkText}>만들기</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <ColumnsContext.Provider value={columns}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} scrollEnabled={!listDragging}>
          {tab === 'sticker' && (
            <>
              {editingList && !keyword && (
                <ListEditor
                  items={editorItems}
                  hidden={hidden}
                  onMove={moveCategory}
                  onDragging={setListDragging}
                  onToggleHidden={toggleCategoryHidden}
                  onDelete={(item) => {
                    const id = item.id.slice('folder:'.length)
                    ask(`'${item.name}' 폴더를 지울까요?`, '폴더 안의 스티커도 함께 지워져요.', () => custom.removeFolder(id))
                  }}
                />
              )}
              {!editingList && !keyword && active === 'favorites' && (
                <Section title="즐겨찾기">
                  <View style={styles.grid}>
                    {favorites.map((item) => (
                      <Tile key={stickerKey(item)} {...tileProps(item)}>
                        <StickerThumb item={item} />
                      </Tile>
                    ))}
                  </View>
                </Section>
              )}
              {!editingList && !keyword && active === 'recent' && (
                <Section title="최근 사용">
                  <View style={styles.grid}>
                    {recents.map((item) => (
                      <Tile key={stickerKey(item)} {...tileProps(item)}>
                        <StickerThumb item={item} />
                      </Tile>
                    ))}
                  </View>
                </Section>
              )}
              {!editingList && folder && (
                <FolderView
                  folder={folder}
                  busy={busy}
                  tileProps={tileProps}
                  onRemove={(item) => ask('이 스티커를 지울까요?', `'${folder.name}' 폴더에서 지워져요.`, () => custom.removeFromFolder(folder.id, item))}
                  onAdd={() => addCustom('stickers', folder.id)}
                  renaming={folderDraft?.id === folder.id ? folderDraft.name : null}
                  canCommitRename={canCommitFolder}
                  onRename={() => setFolderDraft({ id: folder.id, name: folder.name })}
                  onRenameChange={(name) => setFolderDraft({ id: folder.id, name })}
                  onRenameCommit={commitFolder}
                  onRenameCancel={() => setFolderDraft(null)}
                  onDelete={() =>
                    ask(`'${folder.name}' 폴더를 지울까요?`, '폴더 안의 스티커도 함께 지워져요.', () => {
                      custom.removeFolder(folder.id)
                      setCategory(null)
                    })
                  }
                />
              )}
              {folderMatches.length > 0 && (
                <Section title="내 폴더">
                  <View style={styles.grid}>
                    {folderMatches.map((item) => (
                      <Tile key={`${item.folderId}-${stickerKey(item)}`} {...tileProps(item)}>
                        <StickerThumb item={item} />
                      </Tile>
                    ))}
                  </View>
                </Section>
              )}
              {keyword && !groups.length && !folderMatches.length && (
                <Text style={styles.empty}>'{keyword}'에 맞는 스티커가 없어요.</Text>
              )}
              {!editingList && groups.map((group) => (
                <Section key={group.id} title={group.title} badge={group.badge}>
                  <View style={styles.grid}>
                    {group.items.map((sticker) => (
                      <Tile key={sticker.asset} {...tileProps(sticker)}>
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
                        onRemove={() => ask('이 테이프를 지울까요?', '내 테이프에서 지워져요.', () => custom.remove('tapes', item.id))}
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
              {/* 테이프 넣기: 규격 · 색상 · 무늬 (무늬를 고르면 붙는다) */}
              <TapeOptions tape={tapeDraft} onUpdate={updateTape} draft />
            </>
          )}

          {tab === 'photo' && (
            <>
              <Pressable
                onPress={async () => {
                  if (busy) return
                  setBusy(true)
                  try { await onAddPhotos() } finally { setBusy(false) }
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
                          onPress={() => onAdd({ kind: 'photo', ...photo })}
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
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action()
          setConfirm(null)
        }}
      />
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
      {/* 비어 있을 때 '추가' 버튼 위아래 회색 여백이 같도록 머리줄 아래 여백은 내용이 있을 때만 */}
      <View style={[styles.sectionHead, styles.customHead]}>
        <View style={styles.titleGroup}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <HelpButton {...help} label={`${title} 도움말`} />
        </View>
        <Pressable onPress={onAdd} disabled={busy} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Icon name="plus" size={13} />
          <Text style={styles.addText}>{busy ? '불러오는 중' : '추가'}</Text>
        </Pressable>
      </View>
      {(help.open || children) && (
        <View style={styles.customBody}>
          {help.open && <Text style={styles.customHint}>{hint}</Text>}
          {children}
        </View>
      )}
    </View>
  )
}

function Pill({ label, icon, dashed, active, onPress }) {
  return (
    <Pressable
      onPress={() => !justDragged() && onPress()}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.pill, icon && styles.pillWithIcon, dashed && styles.pillDashed, active && styles.pillActive, pressed && !active && styles.pressed]}
    >
      {icon && <Icon name={icon} size={13} strokeWidth={2} color={active ? colors.surface : colors.textMuted} />}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  )
}

/**
 * 내 폴더 한 개: 스티커 목록 + 맨 끝 '추가' 칸(스티커 한 칸 크기).
 * 머리줄: 이름(연필을 누르면 그 자리에서 고친다) · 맨 오른쪽 빨간 휴지통.
 */
function FolderView({
  folder,
  busy,
  tileProps,
  renaming,
  canCommitRename,
  onRemove,
  onAdd,
  onRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onDelete,
}) {
  const editing = renaming != null
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {editing ? (
          <>
            {/* 제목과 같은 자리·글씨 크기로 입력 */}
            <TextInput
              value={renaming}
              onChangeText={onRenameChange}
              autoFocus
              selectTextOnFocus
              maxLength={12}
              onSubmitEditing={() => canCommitRename && onRenameCommit()}
              style={styles.renameInput}
              accessibilityLabel="폴더 이름"
            />
            <Pressable onPress={onRenameCancel} hitSlop={8} style={styles.folderAction} accessibilityLabel="이름 바꾸기 취소">
              <Icon name="close" size={15} strokeWidth={2} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={onRenameCommit}
              disabled={!canCommitRename}
              hitSlop={8}
              style={[styles.folderAction, !canCommitRename && styles.folderOkDisabled]}
              accessibilityLabel="이름 바꾸기 확인"
            >
              <Icon name="check" size={16} strokeWidth={2.2} color={colors.primary} />
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle} numberOfLines={1}>
              {folder.name}
            </Text>
            <Pressable onPress={onRename} hitSlop={8} style={styles.folderAction} accessibilityLabel="폴더 이름 바꾸기">
              <Icon name="edit" size={14} strokeWidth={2} color={colors.textMuted} />
            </Pressable>
            <View style={styles.headSpacer} />
            <Pressable onPress={onDelete} hitSlop={8} style={styles.folderAction} accessibilityLabel="폴더 지우기">
              <Icon name="trash" size={15} strokeWidth={2} color={colors.danger} />
            </Pressable>
          </>
        )}
      </View>
      <View style={styles.grid}>
        {folder.items.map((item) => (
          <Tile key={stickerKey(item)} {...tileProps(item)} onRemove={() => onRemove(item)}>
            <StickerThumb item={item} />
          </Tile>
        ))}
        <AddTile busy={busy} label={`${folder.name}에 스티커 추가`} onPress={onAdd} />
      </View>
    </View>
  )
}
// 타일은 너비를 % 로 나눠 줄 양 끝이 목록 좌우 여백에 딱 맞게 한다. (고정 너비면 오른쪽에 남는 칸이 생긴다)
function Tile({ onPress, onLongPress, onRemove, favorite, label, children }) {
  const columns = useContext(ColumnsContext)
  return (
    <View style={[styles.tileCell, { width: `${100 / columns}%` }]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        accessibilityLabel={label}
        accessibilityHint={onLongPress ? '길게 누르면 즐겨찾기' : undefined}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
      {favorite && (
        <View style={styles.favorite} pointerEvents="none">
          <Text style={styles.favoriteStar}>★</Text>
        </View>
      )}
      {onRemove && (
        <Pressable onPress={onRemove} style={styles.remove} hitSlop={6} accessibilityLabel="보관함에서 삭제">
          <Icon name="close" size={11} strokeWidth={2.6} color={colors.surface} />
        </Pressable>
      )}
    </View>
  )
}

/** 스티커 한 칸 크기의 '추가' 칸 (점선 네모에 +) */
function AddTile({ busy, label, onPress }) {
  const columns = useContext(ColumnsContext)
  return (
    <View style={[styles.tileCell, { width: `${100 / columns}%` }]}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy, busy }}
        style={({ pressed }) => [styles.addTile, pressed && styles.pressed, busy && styles.addTileBusy]}
      >
        <Icon name="plus" size={22} color={colors.primary} />
      </Pressable>
    </View>
  )
}

/**
 * 분류 목록 편집. 오른쪽 점 6개 손잡이를 끌어 옮긴다. 끄는 동안 사이 행들이 비켜 준다.
 * 기본 분류는 숨기기·보이기만 (지우지 않는다), 내 폴더는 같은 자리에 휴지통으로 지운다.
 * 숨긴 분류는 맨 아래 묶음이라, 끌어도 보이는 묶음·숨긴 묶음 안에서만 움직인다.
 */
function ListEditor({ items, hidden, onMove, onDragging, onToggleHidden, onDelete }) {
  const [drag, setDrag] = useState(null) // { from, dy }
  const visibleCount = items.filter((item) => !hidden.has(item.id)).length
  const rangeOf = (index) => (index < visibleCount ? [0, visibleCount - 1] : [visibleCount, items.length - 1])
  const targetOf = (from, dy) => {
    const [lo, hi] = rangeOf(from)
    return clamp(from + Math.round(dy / EDIT_STEP), lo, hi)
  }
  const to = drag ? targetOf(drag.from, drag.dy) : null
  // 끄는 행이 지나간 자리의 행들은 한 칸씩 비켜 준다.
  const shiftOf = (index) => {
    if (!drag || index === drag.from) return 0
    if (drag.from < to && index > drag.from && index <= to) return -EDIT_STEP
    if (drag.from > to && index < drag.from && index >= to) return EDIT_STEP
    return 0
  }
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>목록 순서</Text>
      </View>
      {items.map((item, index) => (
        <EditRow
          key={item.id}
          item={item}
          hidden={hidden.has(item.id)}
          dragging={drag?.from === index}
          offset={drag?.from === index ? drag.dy : shiftOf(index)}
          onToggleHidden={onToggleHidden}
          onDelete={onDelete}
          onDragStart={() => {
            setDrag({ from: index, dy: 0 })
            onDragging(true)
          }}
          onDragMove={(dy) => setDrag({ from: index, dy })}
          onDragEnd={(dy) => {
            setDrag(null)
            onDragging(false)
            const target = targetOf(index, dy)
            if (target !== index) onMove(index, target)
          }}
        />
      ))}
    </View>
  )
}

function EditRow({ item, hidden, dragging, offset, onToggleHidden, onDelete, onDragStart, onDragMove, onDragEnd }) {
  const dyRef = useRef(0)
  const gripHandlers = usePan({
    onStart: () => {
      dyRef.current = 0
      onDragStart()
    },
    onMove: (dx, dy) => {
      dyRef.current = dy
      onDragMove(dy)
    },
    onEnd: () => onDragEnd(dyRef.current),
  })
  return (
    <View
      style={[
        styles.editRow,
        hidden && styles.editRowHidden,
        dragging && styles.editRowDragging,
        offset ? { transform: [{ translateY: offset }] } : null,
      ]}
    >
      <Text style={styles.editName} numberOfLines={1}>
        {item.name}
      </Text>
      {item.base ? (
        <Pressable
          onPress={() => onToggleHidden(item.id)}
          hitSlop={6}
          style={styles.editButton}
          accessibilityLabel={`${item.name} ${hidden ? '보이기' : '숨기기'}`}
        >
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} color={hidden ? colors.textMuted : colors.text} />
        </Pressable>
      ) : (
        <Pressable onPress={() => onDelete(item)} hitSlop={6} style={styles.editButton} accessibilityLabel={`${item.name} 폴더 지우기`}>
          <Icon name="trash" size={17} color={colors.danger} />
        </Pressable>
      )}
      <View {...gripHandlers} style={styles.editGrip} accessibilityLabel={`${item.name} 끌어서 순서 바꾸기`}>
        <Icon name="grip" size={18} color={colors.primary} />
      </View>
    </View>
  )
}

/** 내 테이프 한 줄. 이름은 화면에 쓰지 않고 읽어 주기에만 쓴다 */
function TapeRow({ name, onPress, onRemove, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tapeRow, pressed && styles.pressed]}
      accessibilityLabel={`${name} 붙이기`}
    >
      {/* ✕ 는 테이프 그림의 오른쪽 위 모서리에 걸쳐 위·오른쪽으로 같은 만큼 나오게 */}
      <View style={styles.tapePreview}>
        {children}
        {onRemove && (
          <Pressable onPress={onRemove} style={[styles.remove, styles.removeTape]} hitSlop={6} accessibilityLabel="보관함에서 삭제">
            <Icon name="close" size={11} strokeWidth={2.6} color={colors.surface} />
          </Pressable>
        )}
      </View>
    </Pressable>
  )
}

const BODY_X = 14
// 목록 편집 한 줄 높이 + 줄 간격 (끌어서 옮길 때 몇 칸 움직였는지 계산)
const EDIT_ROW = 46
const EDIT_STEP = EDIT_ROW + 6
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
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, borderRadius: 9 },
  headerButtonActive: { backgroundColor: colors.text },
  headerButtonText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  headerButtonTextActive: { color: colors.surface },
  fixed: { paddingHorizontal: BODY_X, paddingBottom: 8, gap: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
  // 칩 줄은 본문 폭 안에 둔다 (양끝 여백 없이 본문 가장자리에 맞춤)
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 6 },
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
  pillWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillDashed: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  folderInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderInput: {
    flex: 1,
    width: 0,
    height: 38,
    paddingHorizontal: 12,
    // Android 글꼴 여백 때문에 글자가 위아래 가운데에서 어긋나지 않게
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  folderInputButton: { height: 38, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  folderOk: { backgroundColor: colors.primary },
  folderOkDisabled: { opacity: 0.35 },
  folderCancelText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  folderOkText: { fontSize: 12.5, fontWeight: '800', color: colors.surface },
  folderAction: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  // 스티커 추가 칸: 예전 추가 영역의 점선·색을 스티커 한 칸에
  addTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(110,146,198,0.6)',
    backgroundColor: 'rgba(110,146,198,0.06)',
  },
  addTileBusy: { opacity: 0.5 },
  favorite: { position: 'absolute', top: 2, left: 4 },
  favoriteStar: { fontSize: 13, color: '#F2B705', textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 2 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: EDIT_ROW,
    paddingLeft: 12,
    paddingRight: 4,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editRowHidden: { backgroundColor: '#F4F6FA' },
  editRowDragging: { zIndex: 2, borderColor: colors.primary, ...shadow.card },
  editGrip: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  editName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  editButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  pillText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  pillTextActive: { color: colors.surface, fontWeight: '800' },
  empty: {
    paddingVertical: 20,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
  section: { marginTop: 14 },
  // 기본 분류·내 폴더 모두 같은 높이 (폴더 머리줄의 버튼 때문에 제목 위치가 달라 보이지 않게)
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    marginBottom: 6,
  },
  headSpacer: { flex: 1 },
  renameInput: {
    flex: 1,
    height: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
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
  customHead: { marginBottom: 0, justifyContent: 'space-between' },
  customBody: { marginTop: 8, gap: 8 },
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
  removeTape: { top: -7, right: -7 },
  tapePreview: { position: 'relative' },
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
