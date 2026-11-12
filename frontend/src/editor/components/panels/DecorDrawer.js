import { ToolPanelHeader, toolPanelStyles } from '../ToolPanel'
import { createContext, useContext, useRef, useState } from 'react'
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radius, shadow, DISABLED_OPACITY } from '../../../shared/theme'
import { PHOTO_FRAME_ASSETS, PHOTO_FRAME_GROUPS, TAPE_DEFAULT, TAPE_PATTERN_NAMES, TAPE_SIZES } from '../../constants'
import { FOLDER_NAME_LIMIT, RECENT_LIMIT, stickerKey, tapeKey, useCustomDecor, widgetKey } from '../../hooks/useCustomDecor'
import { useTapePreferences } from '../../hooks/useTapePreferences'
import { useStickerPacks } from '../../hooks/useStickerPacks'
import { stickerLibrary } from '../../stickerLibrary'
import { tapeLibrary } from '../../tapeLibrary'
import EditablePalette from '../controls/EditablePalette'
import Svg, { Path } from 'react-native-svg'
import FavoriteStar from '../../../shared/FavoriteStar'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { mediaFailureMessage } from '../../utils/mediaRecovery.js'
import { pickImages } from '../../services/image'
import { discardGeneratedMedia } from '../../services/mediaStore'
import ChipScroller, { justDragged } from '../controls/ChipScroller'
import ConfirmDialog from '../controls/ConfirmDialog'
import Icon from '../controls/Icon'
import StickerThumbImage from '../controls/StickerThumbImage'
import PenSafeTextInput from '../controls/PenSafeTextInput'
import TapeCropper from './TapeCropper'
import TapeView, { tapePreviewBox } from '../canvas/TapeView'
import { FramePreview, frameLabel } from './PhotoFramePicker'
import { WIDGET_ITEMS } from '../../widgets/dday'
import { MEMO_ITEMS } from '../../widgets/memo'
import StickerSplitModal from './StickerSplitModal'
import StickerCutoutModal from './StickerCutoutModal'
import DecorSaveNotice from './DecorSaveNotice'
import DiaryActionBubble from '../../../diary/components/DiaryActionBubble'
import { stickerSplit } from '../../services/stickerSplit'
import { useLoginGate } from '../../../auth/loginGate'
import SelectionBar from '../../../diary/components/SelectionBar'
import SelectionButton from '../../../diary/components/SelectionButton'
import { CUTOUT_ENTRANCE } from '../../../shared/featureFlags'

export const DRAWER_TABS = [
  { id: 'sticker', name: '스티커', icon: 'sticker' },
  { id: 'widget', name: '위젯', icon: 'widget' },
  { id: 'tape', name: '마스킹테이프', icon: 'tape' },
]

// 테이프 칸(코덱스 2026-11-02): 스티커처럼 이름 없는 정사각 칸, 최소 56 · 칸 사이 8, 창 폭에 따라 4~9열.
// 미리보기는 칸 가운데 가로 띠(최대 44×24). 기본 무늬는 표준 규격 비율보다 조금 두껍게(14) 그려 무늬가 보이게 한다
const TAPE_TILE_MIN = 64 // 스티커 칸과 같은 정사각 64(사용자 2026-11-02): 띠 44×14 는 위 16 · 이름 12/600 은 아래 8
const TAPE_THUMB_W = 44
const TAPE_STANDARD = TAPE_SIZES[1]
const sizeRatio = (sizeId) => {
  const size = TAPE_SIZES.find((s) => s.id === sizeId) ?? TAPE_STANDARD
  return size.w / size.h
}
const PATTERN_THUMB_H = 14


// 위젯 칸의 칩: 즐겨찾기 · 최근(스티커 · 테이프와 같다) + 기능 하나에 칩 하나, 모양 차이는 칩 안의 칸으로 고른다
const WIDGET_CHIPS = [
  { id: 'favorites', name: '즐겨찾기' },
  { id: 'recent', name: '최근' },
  { id: 'memo', name: '메모지', items: MEMO_ITEMS },
  { id: 'dday', name: '디데이', items: WIDGET_ITEMS.map((item) => ({ kind: 'sticker', ...item })) },
  // 사진을 담는 빈 틀(폴라로이드 · 티켓 · 네컷). 누르면 빈 틀이 붙고 캔버스의 + 로 사진을 채운다.
  { id: 'frame', name: '사진 틀', groups: PHOTO_FRAME_GROUPS },
]
let rememberedWidgetChip = 'memo'

// 보관함 크기: 왼쪽 아래 손잡이로 넓히고 늘린다. 닫았다 열어도 유지되도록 모듈에 기억해 둔다.
const SIZE_LIMITS = { minWidth: 280, maxWidth: 640, minHeight: 260 }
const TILE_MIN_PX = 72 // 스티커 칸 64 + 칸 간격 8 (코덱스 17번)
let rememberedSize = { width: 320, height: null }
// 넓이에 맞춘 스티커 칸 수 (Tile 이 읽는다)
const ColumnsContext = createContext(4)

/**
 * 스티커·위젯·테이프 보관함. 항목을 누르면 페이지 가운데에 붙는다. (사진 버튼은 보관함 없이 바로 앨범을 연다)
 * 검색·분류(스티커) 같은 고르기는 위쪽에 고정해 두고 목록만 스크롤한다.
 * 사진: 불러오면 틀 없이 붙고, 사진 틀을 누르면 빈 틀이 붙는다(캔버스의 + 로 채운다). 붙인 뒤 틀은 옵션 창의 같은 목록에서 바꾼다.
 */
export default function DecorDrawer({ tab, onAdd, onTapeInserted, onToast, onClose, onPanelWidth, sheet = null, photoLimit }) {
  const current = DRAWER_TABS.find((item) => item.id === tab) ?? DRAWER_TABS[0]
  const custom = useCustomDecor()
  const loginGate = useLoginGate()
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  // 보관함을 닫거나 앱을 다시 열어도 마지막 스티커 칩을 복원한다.
  const category = custom.lastStickerCategory
  const setCategory = custom.setStickerCategory
  const [editingList, setEditingList] = useState(false) // 분류 목록 편집 (순서·숨기기)
  const [listDragging, setListDragging] = useState(false) // 목록 편집에서 끄는 중이면 목록 스크롤을 멈춘다
  const [folderDraft, setFolderDraft] = useState(null) // 새 폴더·이름 바꾸기 입력 { id?, name }
  // 폴더 편집: 칸을 눌러 여러 개 고른 뒤 한 번에 지운다. 이름은 편집 중 제목 자리에서 고친다. { folderId, keys }
  const [folderEdit, setFolderEdit] = useState(null)
  const [splitTarget, setSplitTarget] = useState(null)
  const [cutoutFolder, setCutoutFolder] = useState(null)
  const [widgetChip, setWidgetChip] = useState(rememberedWidgetChip)
  const widgetGroup = WIDGET_CHIPS.find((chip) => chip.id === widgetChip) ?? WIDGET_CHIPS[2]
  // 위젯 즐겨찾기 · 최근: 누르면 붙이고 최근에 남긴다, 길게 누르기로 즐겨찾기
  const widgetFavorites = custom.items.widgetFavorites ?? []
  const widgetRecents = (custom.items.recentWidgets ?? []).slice(0, RECENT_LIMIT)
  const widgetFavoriteKeys = new Set(widgetFavorites.map(widgetKey))
  const toggleWidget = (item) => {
    const has = widgetFavoriteKeys.has(widgetKey(item))
    custom.toggleWidgetFavorite(item)
    onToast(has ? '즐겨찾기에서 뺐어요.' : '즐겨찾기에 넣었어요.')
  }
  const widgetTileProps = (item) => ({
    label: item.kind === 'frame' ? frameLabel(PHOTO_FRAME_ASSETS.find((frame) => frame.id === item.frame) ?? { id: item.frame }) : item.name,
    onPress: () => {
      custom.markRecentWidget(item)
      onAdd(item.kind === 'frame' ? { kind: 'frame', frame: item.frame } : item)
    },
    onLongPress: () => toggleWidget(item),
    onFavorite: () => toggleWidget(item),
    favorite: widgetFavoriteKeys.has(widgetKey(item)),
  })
  const widgetThumb = (item) => {
    if (item.kind !== 'frame') return <StickerThumb item={item} />
    const frame = PHOTO_FRAME_ASSETS.find((asset) => asset.id === item.frame)
    return frame ? <FramePreview frame={frame} size={FRAME_TILE_PREVIEW} /> : null
  }
  // 새 테이프의 색·무늬만 기기별로 기억한다. 기존 캔버스 요소는 수정하지 않는다.
  // 테이프는 늘 기본 폭으로 붙고, 붙인 뒤 위아래 손잡이로 폭을 바꾼다.
  const [tapePreferences, updateTapePreferences, tapePreferencesReady] = useTapePreferences()
  const tapeSize = TAPE_SIZES[1]
  const tapeDraft = { ...tapePreferences, x: 0, y: 0, w: tapeSize.w, h: tapeSize.h, edge: 'straight' }
  // 직접 넣은 것(내 테이프·폴더 스티커·폴더)을 지우기 전에 한 번 묻는다. { title, message, action }
  const [confirm, setConfirm] = useState(null)
  const ask = (title, message, action) => setConfirm({ title, message, action })

  // 테이프 넣기: 보관함에는 넣을 때 정하는 것(색상·무늬)만 둔다. 색을 골라 두고 무늬를 고르면 붙인다.
  // 붙이면 보관함이 닫힌다(onTapeInserted). 붙인 뒤에 바꾸는 옵션(불투명도·끝선 등)은 선택 바의 옵션 창에서 고친다.
  function updateTape(patch) {
    const next = { ...tapeDraft, ...patch }
    const settings = Object.fromEntries(['palette', 'pattern'].filter(key => Object.hasOwn(patch, key)).map(key => [key, patch[key]]))
    // 색을 고르지 않고 무늬로 삽입하면 실제 사용한 기본색도 기억한다.
    if (patch.pattern && !next.palette) settings.palette = TAPE_DEFAULT.palette
    updateTapePreferences(settings).then(saved => {
      if (!saved) onToast?.('테이프 설정을 저장하지 못했어요. 다시 선택하면 재시도해요.')
    })
    if (!patch.pattern) {
      return
    }
    onAdd({
      kind: 'tape',
      pattern: next.pattern,
      palette: next.palette ?? TAPE_DEFAULT.palette,
      edge: next.edge,
      name: TAPE_PATTERN_NAMES[next.pattern],
    })
    // 같은 무늬를 다시 눌러도 새 테이프를 붙일 수 있다. 복원 자체는 삽입하지 않는다.
    onTapeInserted?.()
  }
  const [size, setSize] = useState(rememberedSize)
  // sheet: 폰 세로 하단 시트면 { width, dragHandlers } — 폭 · 높이를 시트가 정하고 크기 조절은 쓰지 않는다
  const panelWidth = sheet ? sheet.width : size.width
  const [pendingTape, setPendingTape] = useState(null) // 자르기 화면에서 고르는 중인 테이프 사진 { image, folderId }
  const measured = useRef(0)
  const resizeStart = useRef(null)
  const columns = clamp(Math.floor((panelWidth - BODY_X * 2) / TILE_MIN_PX), 4, 9)
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

  // ── 테이프 칸: 스티커 칸과 같은 칩(즐겨찾기 · 최근 · 무늬 · 레이스 · 내 폴더) · 목록 편집 · 폴더 편집. 칩 아래 고정 색 줄로 기본 무늬의 색을 고른다
  const keyword = query.trim()
  const tapePaletteId = tapePreferences.palette ?? TAPE_DEFAULT.palette
  const tapeLib = tapeLibrary(custom.items, custom.items.lastTapeCategory, keyword, tapePaletteId)
  const tapeUserFolder = tapeLib.folder?.folderId ? tapeLib.folder : null
  const tapeColumns = clamp(Math.floor((panelWidth - BODY_X * 2) / (TAPE_TILE_MIN + TILE_GAP * 2)), 4, 9)
  function insertTape(item) {
    // 기본 무늬는 저장한 색을 읽은 뒤에만 붙인다(읽기 전 기본색으로 붙어 기억한 색을 덮지 않게)
    if (!item.src && !item.mediaFileId && !tapePreferencesReady) return
    custom.markRecentTape(item)
    // 사진 테이프는 사진 그대로 붙인다(색을 입히지 않는다, 코덱스 2026-11-02)
    if (item.src || item.mediaFileId) onAdd({ kind: 'tape', ...item })
    // 즐겨찾기 · 최근의 무늬는 담을 때의 색으로 붙인다
    else updateTape({ pattern: item.pattern, palette: item.palette ?? tapePaletteId })
  }
  const toggleTapeFavorite = (item) => {
    const has = tapeLib.favoriteKeys.has(tapeKey(item))
    custom.toggleTapeFavorite(item)
    onToast(has ? '즐겨찾기에서 뺐어요.' : '즐겨찾기에 넣었어요.')
  }
  const tapeTileProps = (item) => ({
    onPress: () => insertTape(item),
    onLongPress: () => toggleTapeFavorite(item),
    onFavorite: () => toggleTapeFavorite(item),
    favorite: tapeLib.favoriteKeys.has(tapeKey(item)),
    label: item.name,
    caption: item.name,
  })
  const tapeThumb = (item) => <TapeThumb item={item} palette={item.palette ?? tapePaletteId} />
  const tapeEditorItems = [...tapeLib.sorted.filter((c) => !tapeLib.hidden.has(c.id)), ...tapeLib.sorted.filter((c) => tapeLib.hidden.has(c.id))]
  function moveTapeCategory(from, to) {
    const ids = tapeEditorItems.map((c) => c.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    custom.setTapeCategoryOrder(ids)
  }
  function toggleTapeCategoryHidden(id) {
    const hiding = !tapeLib.hidden.has(id)
    const visible = tapeEditorItems.filter((c) => !tapeLib.hidden.has(c.id) && c.id !== id).map((c) => c.id)
    const rest = tapeEditorItems.filter((c) => tapeLib.hidden.has(c.id) && c.id !== id).map((c) => c.id)
    custom.setTapeCategoryOrder(hiding ? [...visible, ...rest, id] : [...visible, id, ...rest])
    custom.toggleTapeHidden(id)
  }

  const addSticker = (item) => {
    custom.markRecent(item)
    onAdd({ kind: 'sticker', ...item })
  }
  // 분류 칩: 즐겨찾기·최근(있을 때) + 기본 분류(디오&모아 · 원격 팩)와 내 폴더(사용자가 정한 순서, 숨긴 기본 분류는 빼고)
  useStickerPacks() // 원격 스티커 팩이 들어오면 칩과 목록을 다시 그린다
  const { favorites, recents, favoriteKeys, orderable, sorted, hidden, chips, active, folder, pack, packMatches, folderMatches } = stickerLibrary(custom.items, category, keyword)
  // 다른 분류로 옮기거나 검색하면 편집은 저절로 끝난 것으로 본다
  // 테이프 폴더 편집(여러 개 골라 지우기)
  const editingTape = tab === 'tape' && !keyword && tapeUserFolder && folderEdit?.folderId === tapeUserFolder.folderId ? folderEdit : null
  const tapeEditKeys = editingTape ? editingTape.keys.filter((key) => tapeUserFolder.items.some((item) => tapeKey(item) === key)) : []
  const editingFolder = tab === 'sticker' && !keyword && folder && folderEdit?.folderId === folder.id ? folderEdit : null
  const editKeys = editingFolder ? editingFolder.keys.filter((key) => folder.items.some((item) => stickerKey(item) === key)) : []
  function toggleEditKey(item, keyOf = stickerKey) {
    const key = keyOf(item)
    setFolderEdit((prev) => ({ ...prev, keys: prev.keys.includes(key) ? prev.keys.filter((k) => k !== key) : [...prev.keys, key] }))
  }
  function finishFolderEdit() {
    commitFolder()
    setFolderEdit(null)
  }
  // 길게 누르면 즐겨찾기에 넣고 뺀다
  const toggleFavorite = (item) => {
    const has = favoriteKeys.has(stickerKey(item))
    custom.toggleFavorite(item)
    onToast(has ? '즐겨찾기에서 뺐어요.' : '즐겨찾기에 넣었어요.')
  }
  const tileProps = (item) => ({
    onPress: () => addSticker(item),
    onLongPress: () => toggleFavorite(item),
    onFavorite: () => toggleFavorite(item),
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
  // 폴더는 ID로 구분한다. 이름 중복은 허용하며 공백만 있는 이름은 저장하지 않는다.
  const draftName = folderDraft?.name.trim() ?? ''
  const canCommitFolder = draftName.length > 0

  async function addCustom(kind, folderId) {
    if (busy) return
    setBusy(true)
    try {
      // 테이프는 한 장씩 골라 테이프 틀에 들어갈 부분을 먼저 정한 뒤 추가한다.
      if (kind === 'tapes') {
        const [image] = await pickImages({ ...photoLimit, multiple: false, usage: 'tape' })
        if (image) setPendingTape({ image, folderId })
        return
      }
      const images = await pickImages({ ...photoLimit, usage: 'sticker' })
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

  // 이름 바꾸기를 빈 이름으로 끝내면 원래 이름으로 돌아간다
  function commitFolder() {
    const name = folderDraft?.name.trim()
    if (!name || !canCommitFolder) {
      if (folderDraft?.id) setFolderDraft(null)
      return
    }
    if (folderDraft.kind === 'tape') {
      if (folderDraft.id) custom.renameTapeFolder(folderDraft.id, name)
      else custom.setTapeCategory(`folder:${custom.addTapeFolder(name)}`)
    }
    else if (folderDraft.id) custom.renameFolder(folderDraft.id, name)
    else setCategory(`folder:${custom.addFolder(name)}`)
    setFolderDraft(null)
  }

  // 지금 편집 중인 폴더(스티커 또는 테이프): 아래 편집 도구줄이 쓴다
  const edit = editingFolder
    ? { folder, folderId: folder.id, keys: editKeys, keyOf: stickerKey, noun: '스티커', remove: (item) => custom.removeFromFolder(folder.id, item) }
    : editingTape
      ? { folder: tapeUserFolder, folderId: tapeUserFolder.folderId, keys: tapeEditKeys, keyOf: tapeKey, noun: '테이프', remove: (item) => custom.removeTape(tapeUserFolder.folderId, item.id) }
      : null

  // 새 폴더 이름 입력 줄(스티커 · 테이프 칩 줄 아래)
  const newFolderInput = folderDraft && !folderDraft.id ? (
            <View style={styles.folderInputRow}>
              <TextInput
                value={folderDraft.name}
                onChangeText={(name) => setFolderDraft({ ...folderDraft, name })}
                autoFocus
                maxLength={FOLDER_NAME_LIMIT}
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
  ) : null

  return (
    <View
      style={sheet ? [styles.drawer, toolPanelStyles.card, toolPanelStyles.sheetCard, { height: '100%' }] : [styles.drawer, toolPanelStyles.card, { width: size.width }, size.height != null && { height: size.height, maxHeight: '100%' }]}
      onLayout={(event) => {
        measured.current = event.nativeEvent.layout.height
        onPanelWidth?.(event.nativeEvent.layout.width)
      }}
    >
      {/* 툴바에서 고른 보관함만 보여 준다 (서랍 안에서 스티커·테이프·사진을 오가지 않는다) */}
      <ToolPanelHeader icon={current.icon} title={current.name} onClose={onClose} closeLabel="보관함 닫기" dragHandlers={sheet?.dragHandlers}>
        {/* 스티커 · 테이프: 분류·폴더 목록 편집은 제목 줄 오른쪽(닫기 왼쪽)에 */}
        {(tab === 'sticker' || tab === 'tape') && (
          <Pressable
            onPress={() => setEditingList(!editingList)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={editingList ? '편집 완료' : '목록 편집'}
            accessibilityState={{ selected: editingList }}
            style={({ pressed }) => [styles.headerButton, editingList && styles.headerButtonActive, pressed && styles.pressed]}
          >
            <Icon name={editingList ? 'check' : 'grip'} size={14} forText={12} color={editingList ? colors.text : colors.textMuted} />
            <Text style={[styles.headerButtonText, editingList && styles.headerButtonTextActive]}>{editingList ? '편집 완료' : '목록 편집'}</Text>
          </Pressable>
        )}
      </ToolPanelHeader>

      <DecorSaveNotice error={custom.saveError} pending={custom.savePending} onRetry={custom.retrySave} />

      {tab === 'sticker' && (
        <View style={styles.fixed}>
          <View style={styles.search}>
            <Icon name="search" size={16} color={colors.textMuted} />
            <PenSafeTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="스티커 검색"
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
              <Pill icon="plus" label="새 폴더" dashed onPress={() => setFolderDraft({ name: '', kind: 'sticker' })} />
            </ChipScroller>
          )}
          {newFolderInput}
        </View>
      )}
      {tab === 'tape' && (
        <View style={styles.fixed}>
          <View style={styles.search}>
            <Icon name="search" size={16} color={colors.textMuted} />
            <PenSafeTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="테이프 검색"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel="테이프 검색"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="검색어 지우기">
                <Icon name="close" size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {!keyword && (
            <ChipScroller style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
              {tapeLib.chips.map((item) => (
                <Pill
                  key={item.id}
                  label={item.name}
                  active={!editingList && tapeLib.active === item.id}
                  onPress={() => {
                    setEditingList(false)
                    custom.setTapeCategory(item.id)
                  }}
                />
              ))}
              <Pill icon="plus" label="새 폴더" dashed onPress={() => setFolderDraft({ name: '', kind: 'tape' })} />
            </ChipScroller>
          )}
          {newFolderInput}
          {/* 색 줄: 기본 팔레트와 팔레트 편집. 레이스는 한 색(바탕색)만 보인다. 사진 테이프만 있는 내 폴더에서는 숨긴다 */}
          {/* 색 줄은 기본 폴더(무늬 · 레이스)에서만: 즐겨찾기 · 최근 · 내 폴더 · 검색 결과는 담긴 색 그대로 붙는다 */}
          {!editingList && !keyword && tapeLib.folder && !tapeUserFolder && tapePreferencesReady && (
            <View>
              <EditablePalette scope="tape" label="테이프" value={tapePaletteId} onPick={entry => updateTape({palette:entry})} />
            </View>
          )}
        </View>
      )}
      {tab === 'widget' && (
        <View style={styles.fixed}>
          <ChipScroller style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {WIDGET_CHIPS.map((chip) => (
              <Pill
                key={chip.id}
                label={chip.name}
                active={widgetGroup.id === chip.id}
                onPress={() => {
                  rememberedWidgetChip = chip.id
                  setWidgetChip(chip.id)
                }}
              />
            ))}
          </ChipScroller>
        </View>
      )}

      <ColumnsContext.Provider value={columns}>
        {tab === 'sticker' && !editingList && (pack || keyword) ? (
          <StickerResults
            key={pack?.id ?? 'search'}
            columns={columns}
            sections={pack ? [{ id: pack.id, title: pack.name, items: pack.items }] : [
              { id: 'packs', title: '디오&모아', items: packMatches },
              { id: 'folders', title: '내 폴더', items: folderMatches },
            ]}
            keyword={keyword}
            tileProps={tileProps}
          />
        ) : (
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
              {/* 저장된 목록을 읽기 전에는 비워 둔다 (빈 즐겨찾기 안내가 잠깐 비치지 않게) */}
              {!editingList && !keyword && active === 'favorites' && custom.loaded && (
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
                  key={folder.id}
                  folder={folder}
                  busy={busy || !custom.loaded}
                  onSplit={() => loginGate('스티커 시트 분리', () => setSplitTarget({ folder, name: '' }))}
                  onCutout={() => loginGate('사진 속 대상 오리기', () => setCutoutFolder(folder))}
                  splitAvailable={stickerSplit.available}
                  splitReason={stickerSplit.reason}
                  tileProps={tileProps}
                  editing={Boolean(editingFolder)}
                  editKeys={editKeys}
                  onEdit={() => setFolderEdit({ folderId: folder.id, keys: [] })}
                  onToggleEdit={toggleEditKey}
                  onAdd={() => addCustom('stickers', folder.id)}
                  renaming={folderDraft?.id === folder.id ? folderDraft.name : null}
                  onRenameChange={(name) => setFolderDraft({ id: folder.id, name })}
                  onRenameCommit={commitFolder}
                  onDelete={() =>
                    ask(`'${folder.name}' 폴더를 지울까요?`, '폴더 안의 스티커도 함께 지워져요.', () => {
                      custom.removeFolder(folder.id)
                      setCategory(null)
                    })
                  }
                />
              )}
            </>
          )}

          {/* 사진 틀도 메모 · 디데이와 같은 칸(창 폭에 맞춘 열 · 정사각 · 이름은 화면 읽기에만)으로 묶음마다 보인다 */}
          {tab === 'widget' && (widgetGroup.id === 'favorites' || widgetGroup.id === 'recent') && custom.loaded && (
            <Section title={widgetGroup.id === 'favorites' ? '즐겨찾기' : '최근 사용'}>
              <View style={styles.grid}>
                {(widgetGroup.id === 'favorites' ? widgetFavorites : widgetRecents).map((item) => (
                  <Tile key={widgetKey(item)} {...widgetTileProps(item)}>{widgetThumb(item)}</Tile>
                ))}
              </View>
            </Section>
          )}
          {tab === 'widget' && widgetGroup.groups?.map((group) => (
            <Section key={group.id} title={group.name}>
              <View style={styles.grid}>
                {PHOTO_FRAME_ASSETS.filter((frame) => frame.group === group.id).map((frame) => {
                  const item = { kind: 'frame', frame: frame.id, name: frame.name }
                  return <Tile key={frame.id} {...widgetTileProps(item)}>{widgetThumb(item)}</Tile>
                })}
              </View>
            </Section>
          ))}
          {tab === 'widget' && widgetGroup.items && (
            <View style={styles.grid}>
              {widgetGroup.items.map((item) => (
                <Tile key={item.memo ?? item.style} {...widgetTileProps(item)}>{widgetThumb(item)}</Tile>
              ))}
            </View>
          )}

          {tab === 'tape' && (
            <ColumnsContext.Provider value={tapeColumns}>
              {editingList && !keyword && (
                <ListEditor
                  items={tapeEditorItems}
                  hidden={tapeLib.hidden}
                  onMove={moveTapeCategory}
                  onDragging={setListDragging}
                  onToggleHidden={toggleTapeCategoryHidden}
                  onDelete={(item) => {
                    const id = item.id.slice('folder:'.length)
                    ask(`'${item.name}' 폴더를 지울까요?`, '폴더 안의 테이프도 함께 지워져요.', () => custom.removeTapeFolder(id))
                  }}
                />
              )}
              {!editingList && !keyword && tapeLib.active === 'favorites' && custom.loaded && (
                <Section title="즐겨찾기">
                  <View style={styles.grid}>
                    {tapeLib.favorites.map((item) => <Tile key={tapeKey(item)} {...tapeTileProps(item)}>{tapeThumb(item)}</Tile>)}
                  </View>
                </Section>
              )}
              {!editingList && !keyword && tapeLib.active === 'recent' && (
                <Section title="최근 사용">
                  <View style={styles.grid}>
                    {tapeLib.recents.map((item) => <Tile key={tapeKey(item)} {...tapeTileProps(item)}>{tapeThumb(item)}</Tile>)}
                  </View>
                </Section>
              )}
              {/* 기본 폴더(무늬 · 레이스)는 고치지 않고 붙이기만 한다 */}
              {!editingList && tapeLib.folder && !tapeUserFolder && (
                <Section title={tapeLib.folder.name}>
                  <View style={styles.grid}>
                    {tapeLib.folder.items.map((item) => <Tile key={tapeKey(item)} {...tapeTileProps(item)}>{tapeThumb(item)}</Tile>)}
                  </View>
                </Section>
              )}
              {!editingList && tapeUserFolder && (
                <FolderView
                  key={tapeUserFolder.id}
                  folder={tapeUserFolder}
                  busy={busy || !custom.loaded}
                  keyOf={tapeKey}
                  renderItem={tapeThumb}
                  tileProps={tapeTileProps}
                  noun="테이프"
                  editing={Boolean(editingTape)}
                  editKeys={tapeEditKeys}
                  onEdit={() => setFolderEdit({ folderId: tapeUserFolder.folderId, keys: [] })}
                  onToggleEdit={(item) => toggleEditKey(item, tapeKey)}
                  onAddDirect={() => addCustom('tapes', tapeUserFolder.folderId)}
                  renaming={folderDraft?.id === tapeUserFolder.folderId ? folderDraft.name : null}
                  onRenameChange={(name) => setFolderDraft({ id: tapeUserFolder.folderId, name, kind: 'tape' })}
                  onRenameCommit={commitFolder}
                  onDelete={() =>
                    ask(`'${tapeUserFolder.name}' 폴더를 지울까요?`, '폴더 안의 테이프도 함께 지워져요.', () => {
                      custom.removeTapeFolder(tapeUserFolder.folderId)
                      custom.setTapeCategory(null)
                    })
                  }
                />
              )}
              {keyword && tapeLib.matches.length > 0 && (
                <Section title="검색 결과">
                  <View style={styles.grid}>
                    {tapeLib.matches.map((item) => <Tile key={`${item.folderId ?? 'base'}-${tapeKey(item)}`} {...tapeTileProps(item)}>{tapeThumb(item)}</Tile>)}
                  </View>
                </Section>
              )}
              {keyword && !tapeLib.matches.length && <Text style={styles.empty}>'{keyword}'에 맞는 테이프가 없어요.</Text>}
            </ColumnsContext.Provider>
          )}

        </ScrollView>
        )}
      </ColumnsContext.Provider>
      {/* 폴더 편집 도구줄: 보관함 · 휴지통 선택 모드와 같은 부품(전체 선택 · 지우기 · 완료는 맨 오른쪽) */}
      {edit && (
        <View style={styles.editBar}>
          <SelectionBar count={edit.keys.length} style={styles.editBarInner}>
            <SelectionButton
              label={edit.keys.length > 0 && edit.keys.length === edit.folder.items.length ? '전체 해제' : '전체 선택'}
              disabled={!edit.folder.items.length}
              onPress={() => setFolderEdit({ folderId: edit.folderId, keys: edit.keys.length === edit.folder.items.length ? [] : edit.folder.items.map(edit.keyOf) })}
            />
            <SelectionButton
              label={`선택한 ${edit.noun} ${edit.keys.length}개 지우기`}
              text="지우기"
              icon="trash"
              tone="danger"
              disabled={!edit.keys.length}
              onPress={() => {
                const doomed = edit.folder.items.filter((item) => edit.keys.includes(edit.keyOf(item)))
                ask(`${edit.noun} ${doomed.length}개를 지울까요?`, `'${edit.folder.name}' 폴더에서 지워져요.`, () => {
                  doomed.forEach(edit.remove)
                  setFolderEdit({ folderId: edit.folderId, keys: [] })
                })
              }}
            />
            <SelectionButton label="편집 완료" text="완료" onPress={finishFolderEdit} />
          </SelectionBar>
        </View>
      )}
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
          image={pendingTape.image}
          onCancel={() => { discardGeneratedMedia([pendingTape.image]).catch(() => {}); setPendingTape(null) }}
          onConfirm={({ crop, size, ratio }) => {
            const { src, mediaFileId, poster, name, width, height } = pendingTape.image
            custom.setTapeCategory(`folder:${custom.addTape(pendingTape.folderId, { src, mediaFileId, poster, name, imageWidth: width, imageHeight: height, crop, size, pieceRatio: ratio })}`)
            setPendingTape(null)
          }}
        />
      )}
      {splitTarget && <StickerSplitModal folder={splitTarget.folder} initialName={splitTarget.name}
        onClose={() => setSplitTarget(null)} onSave={async (folderId, name, stickers) => {
          const id = await custom.saveGenerated(folderId, name, stickers)
          setCategory(`folder:${id}`); setFolderDraft(null)
          onToast(`${stickers.length}개 스티커를 폴더에 저장했어요.`)
        }} />}
      {cutoutFolder && <StickerCutoutModal folder={cutoutFolder} onClose={() => setCutoutFolder(null)} onSave={async (folderId, name, stickers) => {
        const id = await custom.saveGenerated(folderId, name, stickers)
        setCategory(`folder:${id}`); setFolderDraft(null)
        onToast('스티커를 폴더에 저장했어요.')
      }} />}
      {!sheet && <View
        {...resizeHandlers}
        style={styles.resize}
        accessibilityLabel="보관함 크기 조절"
        accessibilityHint="끌어서 넓이와 높이를 바꿔요"
      >
        {/* iPadOS 창 손잡이처럼 보관함 모서리 곡선과 같은 중심의 호 */}
        <Svg width={GRIP} height={GRIP} pointerEvents="none">
          <Path d={GRIP_ARC} stroke="rgba(28,28,28,0.32)" strokeWidth={4} strokeLinecap="round" fill="none" />
        </Svg>
      </View>}
    </View>
  )
}

// 칸 그림은 썸네일 · 캐시 · 다시 시도를 하는 공용 부품으로 그린다
function StickerThumb({ item, loadImage = true }) {
  return loadImage
    ? <StickerThumbImage item={item} style={styles.tileImage} />
    : <View style={[styles.tileImage, styles.stickerPlaceholder]} />
}

const STICKER_VIEWABILITY = { itemVisiblePercentThreshold: 1 }

function StickerResults({ sections, columns, tileProps, keyword }) {
  const [visibleRows, setVisibleRows] = useState([])
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    setVisibleRows(viewableItems.map(({ index }) => index).filter(Number.isInteger))
  }).current
  const rows = sections.flatMap(({ id, title, items }) => {
    if (keyword && !items.length) return []
    const result = [{ key: `${id}:title`, title }]
    for (let offset = 0; offset < items.length; offset += columns) {
      result.push({ key: `${id}:${offset}`, items: items.slice(offset, offset + columns) })
    }
    return result
  })
  const lastVisible = visibleRows.length ? Math.max(...visibleRows) : -1
  const nextRow = lastVisible < 0 ? -1 : rows.findIndex((row, index) => index > lastVisible && row.items)
  const loadingRows = new Set([...visibleRows, nextRow])
  return (
    <FlatList
      style={styles.scroll}
      contentContainerStyle={styles.body}
      data={rows}
      initialNumToRender={5}
      maxToRenderPerBatch={4}
      windowSize={3}
      viewabilityConfig={STICKER_VIEWABILITY}
      onViewableItemsChanged={onViewableItemsChanged}
      keyExtractor={row => row.key}
      ListEmptyComponent={keyword ? <Text style={styles.empty}>'{keyword}'에 맞는 스티커가 없어요.</Text> : null}
      renderItem={({ item: row, index }) => row.items ? (
        <View style={styles.grid}>
          {row.items.map(item => (
            <Tile key={`${item.folderId ?? ''}:${stickerKey(item)}`} {...tileProps(item)}>
              <StickerThumb item={item} loadImage={loadingRows.has(index)} />
            </Tile>
          ))}
        </View>
      ) : <Section title={row.title} />}
    />
  )
}

function Section({ title, badge, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.titleGroup}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {badge && <Text style={styles.badge}>{badge}</Text>}
      </View>
      {children}
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
      hitSlop={PILL_SLOP}
      style={({ pressed }) => [styles.pill, icon && styles.pillWithIcon, dashed && styles.pillDashed, active && styles.pillActive, pressed && !active && styles.pressed]}
    >
      {icon && <Icon name={icon} size={13} forText={12} strokeWidth={2} color={active ? colors.text : colors.textMuted} />}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  )
}

/**
 * 내 폴더 한 개: 스티커 목록 + 맨 끝 '추가' 칸(스티커 한 칸 크기).
 * 머리줄: 이름 · 오른쪽에 '편집'과 빨간 휴지통(폴더 지우기).
 * 편집 중: 이름이 그 자리 입력칸이 되고, 칸을 누르면 붙이지 않고 고른다. 휴지통 · 추가 칸은 숨긴다(고른 스티커 지우기와 헷갈리지 않게).
 */
function FolderView({
  folder,
  busy,
  keyOf = stickerKey,
  renderItem = (item) => <StickerThumb item={item} />,
  noun = '스티커',
  onAddDirect, // 있으면 + 가 말풍선 없이 바로 추가한다(테이프: 사진 고르기 → 자르기)
  onSplit,
  onCutout,
  splitAvailable,
  splitReason,
  tileProps,
  editing,
  editKeys,
  onEdit,
  onToggleEdit,
  renaming,
  onAdd,
  onRenameChange,
  onRenameCommit,
  onDelete,
}) {
  const [adding, setAdding] = useState(null) // { anchor }: + 의 창 안 자리(말풍선을 그 아래에 띄운다)
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {editing ? (
          // 제목과 같은 자리·글씨 크기로 입력. 들어오자마자 키보드를 올리지 않고, 이름을 눌렀을 때만 고친다
          <TextInput
            value={renaming ?? folder.name}
            onChangeText={onRenameChange}
            selectTextOnFocus
            maxLength={FOLDER_NAME_LIMIT}
            onSubmitEditing={onRenameCommit}
            onBlur={onRenameCommit}
            style={styles.renameInput}
            accessibilityLabel="폴더 이름"
          />
        ) : (
          <>
            <Text style={styles.sectionTitle} numberOfLines={1}>
              {folder.name}
            </Text>
            <View style={styles.headSpacer} />
            <Pressable onPress={onEdit} hitSlop={8} style={styles.folderEdit} accessibilityRole="button" accessibilityLabel={`${folder.name} 폴더 편집`}>
              <Text style={styles.folderEditText}>편집</Text>
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={8} style={styles.folderAction} accessibilityLabel="폴더 지우기">
              <Icon name="trash" size={16} strokeWidth={2} color={colors.danger} />
            </Pressable>
          </>
        )}
      </View>
      <View style={styles.grid}>
        {folder.items.map((item) => (
          <Tile
            key={keyOf(item)}
            {...tileProps(item)}
            {...(editing && {
              onPress: () => onToggleEdit(item),
              // 고르는 중에도 길게 누르기를 넘겨야 손을 뗄 때 눌림으로 한 번 더 토글되지 않는다
              onLongPress: () => {},
              selected: editKeys.includes(keyOf(item)),
            })}
            selecting={editing}
          >
            {renderItem(item)}
          </Tile>
        ))}
        {!editing && <AddTile busy={busy} label={`${folder.name}에 ${noun} 추가`} onPress={(anchor) => (onAddDirect ? onAddDirect() : setAdding({ anchor }))} />}
      </View>
      {/* + 를 누르면 다이어리 카드 ⋯ · 꾸미기 공방 '스티커 추가'와 같은 동작 말풍선(이름 · 아이콘 · 순서 같음) */}
      {adding && !editing && <DiaryActionBubble anchor={adding.anchor} title={`${folder.name}에 스티커 추가`} onClose={() => setAdding(null)} actions={[
        { id: 'image', label: '이미지 그대로 추가', text: '이미지 그대로 추가', icon: 'image', disabled: busy, onPress: () => { setAdding(null); onAdd() } },
        { id: 'split', label: splitAvailable ? '스티커 시트 분리' : `스티커 시트 분리, ${splitReason || '이 기기에서는 쓸 수 없어요'}`, text: '스티커 시트 분리', icon: 'grid',
          disabled: busy || !splitAvailable, onPress: () => { setAdding(null); onSplit() } },
        // 사진 속 대상 오리기: 저장이 아직 미리보기 단계라 모든 빌드에서 입구를 감춘다
        ...(CUTOUT_ENTRANCE ? [{ id: 'cutout', label: '사진 속 대상 오리기', text: '사진 속 대상 오리기', icon: 'scissors', disabled: busy, onPress: () => { setAdding(null); onCutout() } }] : []),
      ]} />}
    </View>
  )
}
// 타일은 너비를 % 로 나눠 줄 양 끝이 목록 좌우 여백에 딱 맞게 한다. (고정 너비면 오른쪽에 남는 칸이 생긴다)
// 즐겨찾기 별은 칸마다 표시만 한다. 넣고 빼기는 길게 누르기.
// selecting: 폴더 편집 중. 오른쪽 위 체크 원과 고른 칸의 버터 바탕으로 고른 것을 보인다(윤곽은 두르지 않는다).
// caption: 칸 아래쪽에 보이는 이름(테이프). 같은 정사각 칸에 위는 그림, 아래는 이름
function Tile({ onPress, onLongPress, onFavorite, favorite, selecting, selected, label, caption, children }) {
  const columns = useContext(ColumnsContext)
  return (
    <View style={[styles.tileCell, { width: `${100 / columns}%` }]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        accessibilityLabel={label}
        accessibilityHint={onLongPress && !selecting ? '길게 누르면 즐겨찾기' : undefined}
        accessibilityState={selecting ? { selected: Boolean(selected) } : onFavorite ? { selected: Boolean(favorite) } : undefined}
        // 스크린리더 · 키보드: 길게 누르기 대신 동작 목록의 '즐겨찾기'로 넣고 뺀다
        accessibilityActions={onFavorite && !selecting ? [{ name: 'favorite', label: favorite ? '즐겨찾기 해제' : '즐겨찾기' }] : undefined}
        onAccessibilityAction={onFavorite && !selecting ? (event) => { if (event.nativeEvent.actionName === 'favorite') onFavorite() } : undefined}
        style={({ pressed }) => [styles.tile, caption != null && styles.tileCaption, selected && styles.tileSelected, pressed && styles.pressed]}
      >
        {children}
        {caption != null && <Text numberOfLines={1} style={styles.caption}>{caption}</Text>}
      </Pressable>
      {/* 즐겨찾기 별: 모양은 칸마다 왼쪽 위에 두되 누르는 곳이 아니다. 넣고 빼기는 칸을 길게 누른다(사용자 결정 2026-11-05, 별을 눌러 넣으면 터치 칸이 칸 가운데까지 온다) */}
      {onFavorite && !selecting && (
        <View pointerEvents="none" style={styles.favorite} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <FavoriteStar filled={Boolean(favorite)} outline={TILE_STAR_OUTLINE} size={16} />
        </View>
      )}
      {selecting && (
        <View style={[styles.check, selected && styles.checkOn]} pointerEvents="none">
          {selected && <Icon name="check" size={12} strokeWidth={2.8} color={colors.surface} />}
        </View>
      )}
    </View>
  )
}

/** 스티커 한 칸 크기의 '추가' 칸 (점선 네모에 +) */
function AddTile({ busy, label, onPress }) {
  const columns = useContext(ColumnsContext)
  const ref = useRef(null)
  return (
    <View ref={ref} collapsable={false} style={[styles.tileCell, { width: `${100 / columns}%` }]}>
      <Pressable
        onPress={() => {
          const node = ref.current
          if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }))
          else onPress(null)
        }}
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
/** 테이프 칸 그림: 기본 무늬는 고른 색으로, 사진 테이프는 사진 그대로 */
function TapeThumb({ item, palette }) {
  if (item.src || item.mediaFileId) {
    // 등록할 때 정한 조각 비율대로(조각이 칸보다 짧으면 반복)
    const box = tapePreviewBox(item, TAPE_THUMB_W, 10, 24, sizeRatio(item.size))
    return <TapeView src={item.src} mediaFileId={item.mediaFileId} crop={item.crop} imageWidth={item.imageWidth} imageHeight={item.imageHeight}
      edge="straight" width={box.width} height={box.height} segmentShare={box.segmentShare} pieceRatio={box.pieceRatio} crisp />
  }
  return <TapeView pattern={item.pattern} palette={palette} edge="straight" width={TAPE_THUMB_W} height={PATTERN_THUMB_H} scale={PATTERN_THUMB_H / TAPE_STANDARD.h} crisp />
}

const BODY_X = 16
// 목록 편집 한 줄 높이 + 줄 간격 (끌어서 옮길 때 몇 칸 움직였는지 계산)
const EDIT_ROW = 46
const EDIT_STEP = EDIT_ROW + 6
const DRAWER_RADIUS = 12 // 다른 옵션 창과 같은 둥글기 (ToolPanel 의 PANEL_RADIUS)
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
// 위젯 칸의 사진 틀 미리보기: 스티커 그림(칸의 74%, 4열 기본 폭에서 약 47)과 비슷한 크기
const FRAME_TILE_PREVIEW = 46
// 칸 위 즐겨찾기 별의 윤곽색(칠한 별 · 안 칠한 별 같다): 칸 면(#F5F7FB)에서 흰색은 묻혀 secondary(코덱스 2026-11-02)
const TILE_STAR_OUTLINE = colors.secondary
const TILE_GAP = 4 // 칸 사이 8 (코덱스 17번: 셀 64, 간격 8, 안쪽 여백 16)

// 분류 칩: 보이는 높이 34 + 위아래 7 = 터치 48
const PILL_SLOP = { top: 7, bottom: 7 }

const styles = StyleSheet.create({
  // 앵커 패널: 흰 면 + 1px 테두리, 그림자 없음, 최대 높이 480 (공용 카드 toolPanelStyles.card 가 정한다)
  drawer: {
    borderRadius: DRAWER_RADIUS,
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
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  close: { padding: 8 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, borderRadius: 9 },
  headerButtonActive: { backgroundColor: colors.primarySoft },
  headerButtonText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  headerButtonTextActive: { color: colors.text },
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
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 13,
    color: colors.text,
    outlineStyle: 'none',
  },
  // 칩 줄은 본문 폭 안에 둔다 (양끝 여백 없이 본문 가장자리에 맞춤)
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 6 },
  // 테이프 색 줄(코덱스 2026-11-02): 터치 44 · 원 28, 고정 기본 팔레트와 편집 모드
  colorCell: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  colorSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder },
  colorSwatchOn: { borderWidth: 3, borderColor: colors.primaryStrong },
  colorDot: { position: 'absolute', right: 2, bottom: 2, width: 8, height: 8, borderRadius: 4 },
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
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  // 선택: 흰 바탕 + primaryStrong 2px 테두리. 테두리가 1 두꺼워지는 만큼 좌우 여백을 1 줄여 칩 폭이 그대로다
  pillActive: { backgroundColor: colors.surface, borderColor: colors.primaryStrong, borderWidth: 2, paddingHorizontal: 12 },
  pillWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillDashed: { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
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
  folderOk: { backgroundColor: colors.primaryStrong },
  folderOkDisabled: { opacity: DISABLED_OPACITY },
  folderCancelText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  folderOkText: { fontSize: 12.5, fontWeight: '700', color: colors.surface },
  folderAction: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  // 폴더 편집: 아이콘 없이 글자만(코덱스 2026-11-02), 휴지통 터치 영역과 8 띄운다
  folderEdit: { minWidth: 40, height: 28, marginRight: 2, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  folderEditText: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  // 보관함 바닥 도구줄: 카드 안에 상자를 또 두지 않고, 목록과는 보관함 폭 전체의 가는 선 하나로 나눈다
  editBar: { paddingHorizontal: BODY_X, paddingBottom: 4, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  editBarInner: { marginTop: 0, paddingHorizontal: 0, borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent' },
  // 스티커 추가 칸: 예전 추가 영역의 점선·색을 스티커 한 칸에
  addTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(129,125,185,0.6)',
    backgroundColor: 'rgba(129,125,185,0.06)',
  },
  addTileBusy: { opacity: 0.5 },
  // 칸 테두리(TILE_GAP 안쪽)에서 위·왼쪽 모두 4 만큼 들어온 자리
  favorite: { position: 'absolute', top: TILE_GAP + 4, left: TILE_GAP + 4 },
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
  pillTextActive: { color: colors.text, fontWeight: '800' },
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
    backgroundColor: colors.primaryStrong,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
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
    borderRadius: 12,
    backgroundColor: '#F5F7FB',
  },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  tileImage: { width: '74%', height: '74%' },
  stickerPlaceholder: { borderRadius: 8, backgroundColor: colors.surfaceMuted },
  // 이름 있는 칸(테이프): 스티커 칸과 같은 정사각(사용자 2026-11-02). 띠는 위 22(왼쪽 위 즐겨찾기 별 아래), 이름 12/600/16 은 아래 8 에 붙인다
  tileCaption: { justifyContent: 'space-between', paddingTop: 22, paddingBottom: 8, paddingHorizontal: 4 }, // 띠는 왼쪽 위 즐겨찾기 별(16) 아래에서 시작
  caption: { maxWidth: '100%', fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.text },
  tileSelected: { backgroundColor: colors.butter },
  // 편집 중 체크 원: 칸 테두리(TILE_GAP 안쪽)에서 위·오른쪽 4 (즐겨찾기 별과 마주 보는 자리)
  check: {
    position: 'absolute',
    top: TILE_GAP + 4,
    right: TILE_GAP + 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
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
    backgroundColor: colors.surfaceMuted,
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
    borderRadius: 12,
    backgroundColor: '#F5F7FB',
  },
  tapeName: {
    alignSelf: 'flex-start',
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
})
