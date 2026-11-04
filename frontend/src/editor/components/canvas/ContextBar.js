import { useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow, DISABLED_OPACITY } from '../../../shared/theme'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../constants'
import { clamp, unionBounds } from '../../utils/common'
import { keepOutBox, placeHorizontal, placeVertical, POPOVER_EDGE } from '../../utils/popoverPlacement'
import Icon from '../controls/Icon'
import FadeScroll from '../controls/FadeScroll'
import { EDITOR_COLORS } from '../../utils/penSettings'
import { usePalette } from '../../hooks/usePalettes'
import { normalizeTextLink } from '../../utils/textFormats'
import { isStripFrame } from '../../utils/photoStrip'
import { emptyPhotoSlots, hasPhotoMedia } from '../../utils/objects'

/** 사진 틀에 채울 빈 자리가 있는지 (빈 한 장 틀 · 여러 칸 틀의 빈 칸) */
const hasEmptyCell = (object) => emptyPhotoSlots(object).length > 0
/** 자를 사진이 있는 한 장 사진 */
const cropablePhoto = (object) => object?.type === 'photo' && !isStripFrame(object.frame) && hasPhotoMedia(object)


const BAR_HEIGHT = 52
const CHIP_HEIGHT = 40 // 링크 카드 높이
const EDGE = POPOVER_EDGE // 페이지 가장자리와 바 사이 여백
const MENU_WIDTH = 148
const COMPACT_MENU_HEIGHT = 4.5 * 44 + 10 // 더보기 메뉴: 항목 네 개 반이 보이고 나머지는 스크롤
/** 요소에 걸린 링크 (스티커·테이프·사진은 href, 텍스트는 글자 서식의 첫 링크) */
const linkOf = (object) => object?.href ?? object?.styleRanges?.find((range) => range.href)?.href ?? null
// 요소 전체에 하이퍼링크를 거는 요소 (텍스트는 글자 서식 링크로 따로 건다)
export const LINKABLE_TYPES = ['sticker', 'tape', 'photo']
/** 선택한 요소 근처에 뜨는 빠른 편집 바. 자르기·그룹·순서·잠금·복제·삭제만 두고, 꾸미기는 '옵션'(MorePanel) 에서 */
export default function ContextBar({
  compactMenu = null, // 더보기 메뉴 상태 (EditorScreen 이 stage 위에 그린다. 페이지 밖까지 터치를 받게)
  onCompactMenu, // 더보기 메뉴 열기(명세 전달)·닫기(null)
  objects,
  allObjects,
  lassoActions = null,
  pageWidth = PAGE_WIDTH,
  pageHeight = PAGE_HEIGHT,
  zoom,
  dispatch,
  moreOpen,
  onToggleMore,
  onCrop,
  onFillCells,
  onToast,
  insideHandlers, // 이 바를 누른 것은 패널 '바깥 누르기'로 치지 않는다 (옵션 버튼으로 패널을 다시 닫을 수 있게)
  onEditText,
  onTextSettings,
  onCopy,
  onCut,
  onPaste, // 복사해 둔 요소 붙여넣기 (다른 페이지·다이어리 탭에서 복사한 것도)
  canPaste = false,
  onTextLink,
  onCopyLink, // 링크 카드의 복사
  onObjectLink, // 스티커·테이프·사진에 링크 걸기
  textSettingsOpen = false, // 텍스트 서식 창이 열려 있음 ('서식' 버튼 표시)
  frame = null, // 작업창 위에 그릴 때 { x, y: 페이지 왼쪽 위의 작업창 좌표, area: 바를 둘 보이는 영역 { left, top, right, bottom } }. 없으면 페이지 안
}) {
  const penColors = usePalette?.('pen')?.colors ?? EDITOR_COLORS // 꾸미기 공방 '내 프리셋'의 펜 색
  const [barWidth, setBarWidth] = useState(0)
  const [chipWidth, setChipWidth] = useState(0)
  // 링크가 걸린 요소를 고르면 바에 '링크 열기' 를 바로 보여 준다
  const href = objects.length === 1 ? linkOf(objects[0]) : null
  const openLink = () => Linking.openURL(normalizeTextLink(href)).catch(() => onToast?.('링크를 열지 못했어요.'))
  const [orderOpen, setOrderOpen] = useState(false)
  // 더보기 메뉴는 연 선택에서만 열린 것으로 본다. 다른 요소를 고르면 저절로 닫힌다.
  const selectionKey = objects.map((o) => o.id).join(',')
  const compactMenuOpen = compactMenu?.key === selectionKey
  const ids = objects.map((o) => o.id)
  const editable = objects.filter((o) => !o.locked)
  const single = objects.length === 1 ? objects[0] : null
  const bounds = unionBounds(objects)
  // 바를 둘 영역과 좌표: 작업창 위에 그리면(frame) 화면에 보이는 작업 영역(툴바·페이지 목록·레이어 제외), 아니면 페이지.
  // 화면을 옮기거나 확대해 요소가 가장자리로 가도 바는 이 영역 안으로 들어온다.
  const origin = frame ?? { x: 0, y: 0 }
  const area = frame?.area ?? { left: 0, top: 0, right: pageWidth * zoom, bottom: pageHeight * zoom }
  const areaW = area.right - area.left
  // 자리 규칙은 utils/popoverPlacement: 선택 상자 + 회전 손잡이(돌린 방향 그대로)를 피해 위 먼저, 안 되면 아래,
  // 둘 다 안 되면 손잡이 반대쪽에 붙인다. 회전 손잡이는 잠기지 않은 요소 하나를 골랐을 때만 보인다.
  const box = keepOutBox(bounds, zoom, single && !single.locked ? single : null)
  const keepOut = { ...box, left: box.left + origin.x, right: box.right + origin.x, cx: box.cx + origin.x, top: box.top + origin.y, bottom: box.bottom + origin.y, handleY: box.handleY == null ? null : box.handleY + origin.y }
  const centerX = bounds.cx * zoom + origin.x
  const { top, side } = placeVertical(keepOut, BAR_HEIGHT, area)
  // 순서 메뉴는 바 위·아래 중 영역 안에 더 넉넉한 쪽으로 편다.
  const menuBelow = area.bottom - (top + BAR_HEIGHT) >= top - area.top
  const left = placeHorizontal(centerX, barWidth, area)
  // 링크 카드: Google 슬라이드처럼 편집 바와 따로, 요소의 반대쪽(바가 위면 아래)에 띄운다. 주소를 누르면 열린다.
  const chipTop = placeVertical(keepOut, CHIP_HEIGHT, area, { prefer: side === 'above' ? 'below' : 'above' }).top
  const chipLeft = placeHorizontal(centerX, chipWidth, area)
  const linkCard = href && single && !single.locked && (
    <View style={[styles.chip, { top: chipTop, left: chipLeft, opacity: chipWidth ? 1 : 0 }]} onLayout={(event) => setChipWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} {...insideHandlers}>
      <Pressable onPress={openLink} accessibilityRole="link" accessibilityLabel="링크 열기" style={({ pressed }) => [styles.chipLink, pressed && styles.pressed]}>
        <Icon name="external" size={15} forText={12.5} color={colors.primary} />
        <Text style={styles.chipText} numberOfLines={1}>{href.replace(/^https?:\/\//, '')}</Text>
      </Pressable>
      <View style={styles.chipDivider} />
      <IconButton icon="copy" label="링크 복사" onPress={() => onCopyLink?.(href)} />
      <IconButton icon="edit" label="링크 편집" onPress={() => (single.type === 'text' ? onTextLink?.(single) : onObjectLink?.(single))} />
    </View>
  )

  // 테두리·그림자를 켜면 세부 옵션(두께·색·위치)이 바로 보이도록 옵션 패널도 연다.
  const allLocked = objects.every((o) => o.locked)
  const grouped = objects.length > 1 && objects.every((o) => o.groupId && o.groupId === objects[0].groupId)
  // 바에는 모드·묶기만 둔다 (자르기, 그룹). 테두리·그림자·프레임·사진 바꾸기 등은 옵션 패널 안에.
  const linkable = single && !single.locked && LINKABLE_TYPES.includes(single.type)
  // 올가미로 잡았을 때 추가 선택 · 선택에서 제외도 같은 바에 둔다(바 옆에 따로 띄우면 두 줄이 됐다)
  const lassoModes = lassoActions ? [
    { icon: 'plus', label: '추가 선택', active: lassoActions.mode === 'add', onPress: () => lassoActions.onModeChange('add') },
    { icon: 'minus', label: '선택에서 제외', active: lassoActions.mode === 'subtract', onPress: () => lassoActions.onModeChange('subtract') },
  ] : []
  const lassoButtons = lassoModes.length > 0 && <>
    {lassoModes.map((action) => <BarButton key={action.label} {...action} />)}
    <View style={styles.divider} />
  </>

  // 요소 바 (폰 · 태블릿 같다): 바에 들어가는 만큼 앞에서부터 보이고, 넘치는 뒤쪽은 더보기 메뉴로 옮긴다.
  // 페이지가 좁거나 작게 보여도 버튼이 바 밖으로 삐져나가지 않는다. 고칠 수 있는 텍스트 · 필기는 아래 전용 바.
  const editingText = single?.type === 'text' && !single.locked
  const editingStroke = single?.type === 'stroke' && !single.locked
  if (!editingText && !editingStroke) {
    const cropable = !single?.locked && (cropablePhoto(single) || (single?.type === 'tape' && single.src && single.imageWidth))
    const fillable = !single?.locked && hasEmptyCell(single)
    const leading = [
      ...lassoModes,
      single?.type === 'shape' && !single.locked && {icon:'text',label:'서식',active:textSettingsOpen,onPress:()=>onTextSettings?.()},
      cropable && { icon: 'crop', label: '자르기', onPress: () => onCrop(single.id) },
      fillable && { icon: 'image', label: '사진 채우기', onPress: () => onFillCells(single.id) },
      linkable && { icon: 'link', label: '링크', active: Boolean(single.href), onPress: () => onObjectLink?.(single) },
      objects.length > 1 && { icon: 'group', label: grouped ? '그룹 해제' : '그룹', onPress: () => {
        dispatch({ type: grouped ? 'ungroup' : 'group', ids })
        onToast(grouped ? '그룹을 풀었어요.' : '그룹으로 묶었어요. 레이어에서 폴더로 보여요.')
      } },
    ].filter(Boolean)
    const actions = [
      { icon: 'layers', label: '순서', active: orderOpen, onPress: () => setOrderOpen(!orderOpen) },
      { icon: 'more', label: '옵션', active: moreOpen, onPress: () => onToggleMore?.() },
      { icon: allLocked ? 'unlock' : 'lock', label: allLocked ? '잠금 해제' : '잠금', onPress: () => dispatch({ type: 'updateMany', record: true, patches: Object.fromEntries(ids.map((id) => [id, { locked: !allLocked }])) }) },
      { icon: 'copy', label: '복사', onPress: () => onCopy?.(objects) },
      { icon: 'clipboard', label: '붙여넣기', disabled: !canPaste, onPress: () => onPaste?.() },
      { icon: 'duplicate', label: '복제', onPress: () => dispatch({ type: 'duplicateObjects', ids }) },
      { icon: 'trash', label: '삭제', danger: true, onPress: () => {
        if (allLocked) return onToast('잠긴 요소예요. 잠금을 풀고 지워 주세요.')
        dispatch({ type: 'removeObjects', ids: editable.map((o) => o.id) })
      } },
    ]
    const barMax = Math.max(120, areaW - EDGE * 2)
    // 앞쪽 버튼조차 다 못 넣을 만큼 좁으면(폰에서 레이어를 연 옆자리 등) 앞쪽 버튼도 동작들과 이어 붙여 넘치는 만큼 더보기로 옮긴다.
    const squeezed = !leadingFits(leading, barMax)
    const shownLeading = squeezed ? [] : leading
    const rest = squeezed ? [...leading, ...actions] : actions
    const inlineCount = fitInline(shownLeading, rest, barMax)
    const overflow = rest.slice(inlineCount).map((action) => ({ ...action, onPress: () => {
      onCompactMenu?.(null)
      if (action.label === '순서') return setOrderOpen(true)
      action.onPress()
    } }))
    // 메뉴는 페이지(캔버스) 밖, stage 위에 그린다. Android 는 부모 경계 밖에 그려진 자식에 터치를 주지 않아서 페이지 안에 두면 아래로 삐져나간 항목을 누를 수 없다.
    const openCompactMenu = () => onCompactMenu?.(compactMenuOpen ? null : { key: selectionKey, anchor: { left, top, width: barWidth, height: BAR_HEIGHT }, actions: overflow })
    return <>
      <View accessibilityLabel="객체 빠른 편집" style={[styles.bar, { top, left, maxWidth: Math.max(120, areaW - EDGE * 2), opacity: barWidth ? 1 : 0 }]}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} {...insideHandlers}>
        {shownLeading.map((action) => <BarButton key={action.label} {...action} />)}
        {shownLeading.length > 0 && <View style={styles.divider} />}
        {rest.slice(0, inlineCount).map((action) => <BarButton key={action.label} {...action} onPress={() => { onCompactMenu?.(null); action.onPress() }} />)}
        {overflow.length > 0 && <BarButton icon="more" label="더보기" active={compactMenuOpen} onPress={() => { openCompactMenu(); setOrderOpen(false) }} />}
        {orderOpen && <OrderMenu placement={menuBelow ? 'below' : 'above'} right={Math.max(MENU_WIDTH, barWidth - 5)} objects={objects} allObjects={allObjects} onPick={(mode) => dispatch({ type: 'reorder', ids, mode })} />}
      </View>
      {linkCard}
    </>
  }

  // 텍스트 요소 선택: 문자열 복사는 편집 모드에서, 여기서는 상자 전체를 복제한다.
  if (editingText) return <>
    <View accessibilityLabel="텍스트 빠른 편집" style={[styles.bar, { top, left, maxWidth: Math.max(120, areaW - EDGE * 2), opacity: barWidth ? 1 : 0 }]} onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} {...insideHandlers}>
      <FadeScroll horizontal style={styles.barScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.barContent}>
        {lassoButtons}
        <BarButton icon="edit" label="수정" onPress={() => onEditText?.(single)} />
        <BarButton icon="text" label="서식" active={textSettingsOpen} onPress={() => onTextSettings?.()} />
        <BarButton icon="link" label="링크" active={single.styleRanges?.some((r) => r.href)} onPress={() => onTextLink?.(single)} />
        <View style={styles.divider} />
        <BarButton icon="duplicate" label="복제" onPress={() => dispatch({ type: 'duplicateObjects', ids })} />
        <BarButton icon="trash" label="삭제" danger onPress={() => dispatch({ type: 'removeObjects', ids })} />
      </FadeScroll>
    </View>
    {linkCard}
  </>

  // 남은 경우는 필기 편집뿐이다
  return <>
    <View accessibilityLabel="필기 빠른 편집" style={[styles.bar, { top, left, maxWidth: Math.max(120, areaW - EDGE * 2), opacity: barWidth ? 1 : 0 }]} onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} {...insideHandlers}>
      <FadeScroll horizontal style={styles.barScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.barContent}>
        {lassoButtons}
        {penColors.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`선택 요소 색상 ${color}`} accessibilityState={{ selected: single.color?.toUpperCase() === color.toUpperCase() }}
          onPress={() => dispatch({ type: 'updateObject', id: single.id, record: true, patch: { color } })}
          style={[styles.swatch, { backgroundColor: color }, single.color?.toUpperCase() === color.toUpperCase() && styles.swatchChosen]} />)}
        <View style={styles.divider} />
        <BarButton icon="copy" label="복사" onPress={() => onCopy?.(objects)} />
        <BarButton icon="clipboard" label="붙여넣기" disabled={!canPaste} onPress={onPaste} />
        <BarButton icon="duplicate" label="복제" onPress={() => dispatch({ type: 'duplicateObjects', ids })} />
        <BarButton icon="trash" label="삭제" danger onPress={() => dispatch({ type: 'removeObjects', ids })} />
        <View style={styles.divider} />
        <BarButton icon="crop" label="잘라내기" onPress={() => onCut?.(objects)} />
        <BarButton icon="more" label="정렬·보정" active={moreOpen} onPress={onToggleMore} />
      </FadeScroll>
    </View>
  </>
}

// 바 버튼 너비 어림값: 좌우 여백 20 + 아이콘 17 + 간격 5 + 글자(12.5px 굵은 한글 ≈ 13px) + 버튼 사이 2
const barButtonWidth = (label) => 44 + label.length * 13
const BAR_DIVIDER = 11 // 구분선 1 + 좌우 4 + 버튼 사이 2
/** 앞쪽 버튼 전부와 구분선 · 더보기 버튼이 바(좌우 안쪽 여백 10)에 들어가는지 */
const leadingFits = (leading, barMax) => !leading.length
  || leading.reduce((sum, action) => sum + barButtonWidth(action.label), 0) + BAR_DIVIDER + barButtonWidth('더보기') <= barMax - 10
/** 바(좌우 안쪽 여백 10)에 앞쪽 버튼과 함께 넣을 수 있는 동작 수. 다 못 넣으면 더보기 버튼 자리를 남긴다. */
export function fitInline(leading, actions, barMax) {
  const space = barMax - 10 - leading.reduce((sum, action) => sum + barButtonWidth(action.label), 0) - (leading.length ? BAR_DIVIDER : 0)
  const widths = actions.map((action) => barButtonWidth(action.label))
  if (widths.reduce((sum, w) => sum + w, 0) <= space) return actions.length
  let used = barButtonWidth('더보기'), count = 0
  while (count < actions.length && used + widths[count] <= space) used += widths[count++]
  return count
}

/**
 * 폰 더보기 메뉴. ContextBar 가 넘긴 명세(anchor: 바의 좌표·크기, actions)로 EditorScreen 이 stage 위에 그린다.
 * stage 좌표의 바 위치와 위·아래 한계(floor/ceil), 좌우 한계(left/right)를 받아, 바 오른쪽 끝에 맞춰 아래로 펴고 자리가 모자라면 바 바로 위로 편다.
 */
export function placeCompactMenu({ bar, floor, ceil, left = 0, right }) {
  const spaceBelow = floor - (bar.top + bar.height + 6)
  const spaceAbove = bar.top - 6 - ceil
  // 아래 자리가 두 항목(88)도 안 될 때만 위로 올린다.
  const below = spaceBelow >= 88 || spaceBelow >= spaceAbove
  const maxHeight = clamp(below ? spaceBelow : spaceAbove, 88, COMPACT_MENU_HEIGHT)
  return { maxHeight, position: { left: clamp(bar.left + bar.width - 166, left + EDGE, Math.max(left + EDGE, right - 166 - EDGE)), top: below ? bar.top + bar.height + 6 : bar.top - 6 - maxHeight } }
}

export function CompactMenu({ position, maxHeight, insideHandlers, actions }) {
  // 기기에서 ScrollView 는 캔버스(Viewport) 터치 처리에 밀려 끌기를 받지 못했다. 그래서 메뉴가 직접 끌기를 받아 항목을 위아래로 옮긴다.
  // 누르기는 항목(Pressable)이 먼저 받고, 손가락이 세로로 움직이면 메뉴가 responder 를 넘겨받아 스크롤한다.
  const [scroll, setScroll] = useState({ offset: 0, contentHeight: 0, startY: null, startOffset: 0 })
  const maxOffset = Math.max(0, scroll.contentHeight - maxHeight)
  // pageY 가 없는 이벤트(손가락을 뗄 때 등)로는 움직이지 않는다. NaN 이 transform 에 들어가면 Android 가 죽는다.
  const pageY = (event) => { const y = event.nativeEvent.pageY ?? event.nativeEvent.touches?.[0]?.pageY; return Number.isFinite(y) ? y : null }
  const moved = (event) => { const y = pageY(event); return scroll.startY != null && y != null && Math.abs(y - scroll.startY) > 6 }
  const drag = (event) => { const y = pageY(event); if (y != null) setScroll((prev) => (prev.startY == null ? prev : { ...prev, offset: clamp(prev.startOffset + (prev.startY - y), 0, maxOffset) })) }
  return <View accessibilityLabel="객체 편집 더보기" style={[styles.compactMenu, position, { height: Math.min(maxHeight, scroll.contentHeight || maxHeight) }]}
    // 누른 자리를 기억만 하고(캡처 단계는 모든 터치·마우스에 불린다) responder 는 항목에 양보한다
    onStartShouldSetResponderCapture={(event) => { const y = pageY(event); setScroll((prev) => ({ ...prev, startY: y, startOffset: prev.offset })); return false }}
    onStartShouldSetResponder={() => true} // 항목 사이 여백을 눌러도 캔버스로 새지 않게
    onMoveShouldSetResponder={moved} onMoveShouldSetResponderCapture={moved}
    onResponderTerminationRequest={() => false}
    onResponderMove={drag} onResponderRelease={drag}
    {...insideHandlers}>
    <View style={[styles.compactMenuContent, { transform: [{ translateY: -scroll.offset }] }]} onLayout={(event) => setScroll((prev) => ({ ...prev, contentHeight: event.nativeEvent.layout.height }))}>
      {actions.map((action) => <MenuAction key={action.label} {...action} style={styles.compactMenuItem} />)}
    </View>
    {maxOffset > 0 && <View pointerEvents="none" style={[styles.compactMenuThumb, { height: Math.max(18, maxHeight * maxHeight / scroll.contentHeight), top: 4 + (maxHeight - 8 - Math.max(18, maxHeight * maxHeight / scroll.contentHeight)) * (scroll.offset / maxOffset) }]} />}
  </View>
}

function MenuAction({ icon, label, danger, disabled, onPress, style }) {
  const color = danger ? colors.danger : disabled ? colors.border : colors.text
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} style={({ pressed }) => [styles.menuItem, style, pressed && styles.pressed]}>
    <Icon name={icon} size={18} forText={13} color={color} /><Text style={[styles.menuText, { color }]}>{label}</Text>
  </Pressable>
}

const ORDER_ACTIONS = [
  { mode: 'front', label: '맨 앞으로', icon: 'toFront', toward: 'front' },
  { mode: 'forward', label: '앞으로', icon: 'forward', toward: 'front' },
  { mode: 'backward', label: '뒤로', icon: 'backward', toward: 'back' },
  { mode: 'back', label: '맨 뒤로', icon: 'toBack', toward: 'back' },
]

/**
 * 순서 메뉴. 선택한 요소 반대쪽(바 너머)으로 펼쳐 요소를 가리지 않는다.
 * 이미 맨 앞/맨 뒤면 그쪽 항목은 흐리게 막아 둔다. 메뉴는 열어 둔 채 여러 번 누를 수 있다.
 */
function OrderMenu({ placement, right, objects, allObjects, onPick }) {
  const selected = new Set(objects.map((o) => o.id))
  const indexes = allObjects.map((o, i) => (selected.has(o.id) ? i : -1)).filter((i) => i >= 0)
  const atFront = indexes.every((index, k) => index === allObjects.length - indexes.length + k)
  const atBack = indexes.every((index, k) => index === k)
  return (
    <View style={[styles.menu, { left: right - MENU_WIDTH }, placement === 'below' ? { top: BAR_HEIGHT + 6 } : { bottom: BAR_HEIGHT + 6 }]}>
      {ORDER_ACTIONS.map((action) => {
        const disabled = action.toward === 'front' ? atFront : atBack
        return (
          <Pressable
            key={action.mode}
            onPress={() => onPick(action.mode)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
          >
            <Icon name={action.icon} size={18} forText={13} color={disabled ? colors.border : colors.text} />
            <Text style={[styles.menuText, disabled && styles.menuTextDisabled]}>{action.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function BarButton({ icon, label, active, danger, disabled, onPress }) {
  const color = danger ? colors.danger : colors.text
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ ...(active != null && { selected: active }), disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.button, active && styles.chipActive, pressed && styles.pressed, disabled && styles.buttonDisabled]}
    >
      <Icon name={icon} size={17} forText={12.5} color={color} />
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  )
}

function IconButton({ icon, label, danger, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.text} />
    </Pressable>
  )
}


const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    height: CHIP_HEIGHT,
    maxWidth: 300,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    ...shadow.float,
  },
  chipLink: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 8, borderRadius: 9 },
  chipText: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: colors.primaryStrong, textDecorationLine: 'underline' },
  chipDivider: { width: 1, height: 18, marginHorizontal: 2, backgroundColor: colors.border },
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    borderRadius: 16,
    backgroundColor: colors.surface,
    ...shadow.float,
  },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    padding: 5,
    borderRadius: 14,
    backgroundColor: colors.surface,
    ...shadow.float,
  },
  compactMenu: { position: 'absolute', width: 166, borderRadius: 14, backgroundColor: colors.surface, zIndex: 8, overflow: 'hidden', ...shadow.float },
  compactMenuContent: { paddingVertical: 5 },
  compactMenuItem: { paddingHorizontal: 15, borderRadius: 0 },
  compactMenuThumb: { position: 'absolute', right: 3, width: 3, borderRadius: 2, backgroundColor: 'rgba(11,23,102,0.25)' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 10, borderRadius: 10 },
  menuText: { fontSize: 13, fontWeight: '700', color: colors.text },
  menuTextDisabled: { color: 'rgba(11,23,102,0.3)' },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 42, paddingHorizontal: 10, borderRadius: 11 },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  buttonDisabled: { opacity: DISABLED_OPACITY },
  iconButton: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  divider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: colors.border },
  chipActive: { backgroundColor: colors.primarySoft },
  // 텍스트·필기 바도 스티커·마테·사진 바(bar)와 같은 모양: 둥글기 16, 테두리 없음, 버튼 간격 2
  barScroll: { flexShrink: 1 },
  barContent: { alignItems: 'center', gap: 2 },
  kind: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 12, marginVertical: 5, borderRadius: 20, backgroundColor: colors.text },
  kindText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  swatch: { width: 27, height: 27, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  swatchChosen: { borderWidth: 3, borderColor: colors.primary },
})
