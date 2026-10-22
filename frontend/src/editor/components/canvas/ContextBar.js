import { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../constants'
import { clamp, unionBounds } from '../../utils/common'
import Icon from '../controls/Icon'
import LassoSelectionMenu from '../LassoSelectionMenu'
import { EDITOR_COLORS } from '../../utils/penSettings'
import { normalizeTextLink } from '../../utils/textFormats'


const BAR_HEIGHT = 52
const CHIP_HEIGHT = 40 // 링크 카드 높이
const ROTATE_CLEARANCE = 56 // 요소 위쪽 회전 손잡이(34 + 반지름 9)와 겹치지 않게 비우는 높이
const EDGE = 8 // 페이지 가장자리와 바 사이 여백
const GAP = 18
const MENU_WIDTH = 148
const COMPACT_MENU_HEIGHT = 4.5 * 44 + 10 // 더보기 메뉴: 항목 네 개 반이 보이고 나머지는 스크롤
/** 요소에 걸린 링크 (스티커·테이프·사진은 href, 텍스트는 글자 서식의 첫 링크) */
const linkOf = (object) => object?.href ?? object?.styleRanges?.find((range) => range.href)?.href ?? null
// 요소 전체에 하이퍼링크를 거는 요소 (텍스트는 글자 서식 링크로 따로 건다)
export const LINKABLE_TYPES = ['sticker', 'tape', 'photo']
/** 선택한 요소 근처에 뜨는 빠른 편집 바. 자르기·그룹·순서·잠금·복제·삭제만 두고, 꾸미기는 '옵션'(MorePanel) 에서 */
export default function ContextBar({
  compact = false,
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
}) {
  const [barWidth, setBarWidth] = useState(0)
  const [chipWidth, setChipWidth] = useState(0)
  // 링크가 걸린 요소를 고르면 바에 '링크 열기' 를 바로 보여 준다
  const href = objects.length === 1 ? linkOf(objects[0]) : null
  const openLink = () => Linking.openURL(normalizeTextLink(href)).catch(() => onToast?.('링크를 열지 못했어요.'))
  const [orderOpen, setOrderOpen] = useState(false)
  // 더보기 메뉴는 연 선택에서만 열린 것으로 본다. 다른 요소를 고르면 저절로 닫힌다.
  const selectionKey = objects.map((o) => o.id).join(',')
  const [compactMenuFor, setCompactMenuFor] = useState(null)
  const compactMenuOpen = compactMenuFor === selectionKey
  const setCompactMenuOpen = (open) => setCompactMenuFor(open ? selectionKey : null)
  const [orderRight, setOrderRight] = useState(0) // 순서 버튼 오른쪽 끝 (바 기준). 순서 메뉴를 여기에 맞춘다.
  const ids = objects.map((o) => o.id)
  const editable = objects.filter((o) => !o.locked)
  const single = objects.length === 1 ? objects[0] : null
  const bounds = unionBounds(objects)
  const pageW = pageWidth * zoom
  const pageH = pageHeight * zoom
  // 바는 늘 페이지 안쪽에 둔다. Android·iOS 는 부모(페이지) 영역 밖으로 나간 버튼에 터치를 전달하지 않는다.
  // 요소 아래에 자리가 있으면 아래, 없으면 위, 둘 다 없으면 페이지 안에서 가능한 가까운 곳(요소와 겹칠 수 있음).
  const below = bounds.bottom * zoom + GAP + BAR_HEIGHT < pageH - EDGE
  const top = clamp(
    below ? bounds.bottom * zoom + GAP : bounds.top * zoom - GAP - BAR_HEIGHT,
    EDGE,
    Math.max(EDGE, pageH - BAR_HEIGHT - EDGE),
  )
  // 순서 메뉴는 바 위·아래 중 페이지 안에 더 넉넉한 쪽으로 편다.
  const menuBelow = pageH - (top + BAR_HEIGHT) >= top
  const left = clamp(bounds.cx * zoom - barWidth / 2, 8, Math.max(8, pageW - barWidth - 8))
  // 더보기 메뉴는 늘 바 아래, 오른쪽 끝에 맞춰 편다. 페이지 아래로 삐져나가도 되고(바탕 위), 항목은 안에서 스크롤한다.
  const compactMenuHeight = COMPACT_MENU_HEIGHT
  const compactMenuPosition = { left: Math.max(EDGE, left + barWidth - 166), top: top + BAR_HEIGHT + 6 }
  // 링크 카드: Google 슬라이드처럼 편집 바와 따로, 요소의 반대쪽(바가 아래면 위)에 띄운다. 주소를 누르면 열린다.
  const chipTop = clamp(below ? bounds.top * zoom - ROTATE_CLEARANCE - CHIP_HEIGHT : bounds.bottom * zoom + GAP, EDGE, Math.max(EDGE, pageH - CHIP_HEIGHT - EDGE))
  const chipLeft = clamp(bounds.cx * zoom - chipWidth / 2, 8, Math.max(8, pageW - chipWidth - 8))
  const linkCard = href && single && !single.locked && (
    <View style={[styles.chip, { top: chipTop, left: chipLeft, opacity: chipWidth ? 1 : 0 }]} onLayout={(event) => setChipWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} {...insideHandlers}>
      <Pressable onPress={openLink} accessibilityRole="link" accessibilityLabel="링크 열기" style={({ pressed }) => [styles.chipLink, pressed && styles.pressed]}>
        <Icon name="external" size={15} color={colors.primary} />
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
  const hasLeading = objects.length > 1 || linkable

  if (compact && single?.type !== 'text' && single?.type !== 'stroke') return <>
    <View accessibilityLabel="객체 빠른 편집" style={[styles.bar, { top, left, maxWidth: Math.max(120, pageW - EDGE * 2), opacity: barWidth ? 1 : 0 }]}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} {...insideHandlers}>
      {single?.type === 'photo' && !single.locked && <BarButton icon="crop" label="자르기" onPress={() => onCrop(single.id)} />}
      {single?.type === 'tape' && !single.locked && single.src && single.imageWidth && <BarButton icon="crop" label="자르기" onPress={() => onCrop(single.id)} />}
      {linkable && <BarButton icon="link" label="링크" active={Boolean(single.href)} onPress={() => onObjectLink?.(single)} />}
      {objects.length > 1 && <BarButton icon="folder" label={grouped ? '그룹 해제' : '그룹'} onPress={() => {
        dispatch({ type: grouped ? 'ungroup' : 'group', ids })
        onToast(grouped ? '그룹을 풀었어요.' : '그룹으로 묶었어요. 레이어에서 폴더로 보여요.')
      }} />}
      {hasLeading && <View style={styles.divider} />}
      <BarButton icon="more" label="더보기" active={compactMenuOpen} onPress={() => { setCompactMenuOpen(!compactMenuOpen); setOrderOpen(false) }} />
      {orderOpen && <OrderMenu placement={menuBelow ? 'below' : 'above'} right={Math.max(MENU_WIDTH, barWidth - 5)} objects={objects} allObjects={allObjects} onPick={(mode) => dispatch({ type: 'reorder', ids, mode })} />}
    </View>
    {/* 메뉴를 52px 높이 바 밖의 형제로 둬서 네이티브에서도 전체 영역이 스크롤 터치를 받는다. */}
    {compactMenuOpen && <CompactMenu position={compactMenuPosition} maxHeight={compactMenuHeight} insideHandlers={insideHandlers}
      onOrder={() => { setCompactMenuOpen(false); setOrderOpen(true) }} onOptions={() => { setCompactMenuOpen(false); onToggleMore?.() }}
      allLocked={allLocked} onLock={() => { setCompactMenuOpen(false); dispatch({ type: 'updateMany', record: true, patches: Object.fromEntries(ids.map((id) => [id, { locked: !allLocked }])) }) }}
      onCopy={() => { setCompactMenuOpen(false); onCopy?.(objects) }} canPaste={canPaste} onPaste={() => { setCompactMenuOpen(false); onPaste?.() }}
      onDuplicate={() => { setCompactMenuOpen(false); dispatch({ type: 'duplicateObjects', ids }) }} onDelete={() => {
        setCompactMenuOpen(false)
        if (allLocked) return onToast('잠긴 요소예요. 잠금을 풀고 지워 주세요.')
        dispatch({ type: 'removeObjects', ids: editable.map((o) => o.id) })
      }} />}
    {linkCard}
  </>

  // 텍스트 요소 선택: 문자열 복사는 편집 모드에서, 여기서는 상자 전체를 복제한다.
  if (single?.type === 'text' && !single.locked) return <>
    <View accessibilityLabel="텍스트 빠른 편집" style={[styles.bar, { top, left, maxWidth: Math.max(120, pageW - EDGE * 2), opacity: barWidth ? 1 : 0 }]} onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} {...insideHandlers}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.barContent}>
        <BarButton icon="edit" label="수정" onPress={() => onEditText?.(single)} />
        <BarButton icon="text" label="서식" active={textSettingsOpen} onPress={() => onTextSettings?.()} />
        <BarButton icon="link" label="링크" active={single.styleRanges?.some((r) => r.href)} onPress={() => onTextLink?.(single)} />
        <View style={styles.divider} />
        <BarButton icon="duplicate" label="복제" onPress={() => dispatch({ type: 'duplicateObjects', ids })} />
        <BarButton icon="trash" label="삭제" danger onPress={() => dispatch({ type: 'removeObjects', ids })} />
      </ScrollView>
    </View>
    {linkCard}
    {lassoActions && <LassoSelectionMenu objects={objects} mode={lassoActions.mode} onModeChange={lassoActions.onModeChange} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} anchor={{ top, height: BAR_HEIGHT }} />}
  </>

  if (single?.type === 'stroke' && !single.locked) return <>
    <View accessibilityLabel="필기 빠른 편집" style={[styles.bar, { top, left, maxWidth: Math.max(120, pageW - EDGE * 2), opacity: barWidth ? 1 : 0 }]} onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} {...insideHandlers}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.barContent}>
        {EDITOR_COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`선택 요소 색상 ${color}`} accessibilityState={{ selected: single.color?.toUpperCase() === color.toUpperCase() }}
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
      </ScrollView>
    </View>
    {lassoActions && <LassoSelectionMenu objects={objects} mode={lassoActions.mode} onModeChange={lassoActions.onModeChange} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} anchor={{ top, height: BAR_HEIGHT }} />}
  </>

  return (
    <>
    <View
      style={[styles.bar, { top, left, maxWidth: Math.max(120, pageW - EDGE * 2), opacity: barWidth ? 1 : 0 }]}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      {...insideHandlers}
    >

      {single?.type === 'photo' && !single.locked && (
        <>
          <BarButton icon="crop" label="자르기" onPress={() => onCrop(single.id)} />
        </>
      )}
      {single?.type === 'tape' && !single.locked && (
        <>
          {single.src && single.imageWidth && <BarButton icon="crop" label="자르기" onPress={() => onCrop(single.id)} />}
        </>
      )}
      {linkable && <BarButton icon="link" label="링크" active={Boolean(single.href)} onPress={() => onObjectLink?.(single)} />}

      {objects.length > 1 && (
        <BarButton
          icon="folder"
          label={grouped ? '그룹 해제' : '그룹'}
          onPress={() => {
            dispatch({ type: grouped ? 'ungroup' : 'group', ids })
            onToast(grouped ? '그룹을 풀었어요.' : '그룹으로 묶었어요. 레이어에서 폴더로 보여요.')
          }}
        />
      )}

      {/* 앞쪽 버튼이 하나도 없으면(무늬 테이프 등) 구분선도 뺀다 */}
      {hasLeading && <View style={styles.divider} />}
      <View onLayout={(event) => setOrderRight(event.nativeEvent.layout.x + event.nativeEvent.layout.width)}>
        <BarButton icon="layers" label="순서" active={orderOpen} onPress={() => setOrderOpen(!orderOpen)} />
      </View>
      {/* 세부 옵션(꾸미기·배치). 아이콘만 있으면 잘 안 보여서 글자를 함께 쓴다. */}
      <BarButton icon="more" label="옵션" active={moreOpen} onPress={onToggleMore} />
      <BarButton
        icon={allLocked ? 'unlock' : 'lock'}
        label={allLocked ? '잠금 해제' : '잠금'}
        onPress={() =>
          dispatch({
            type: 'updateMany',
            record: true,
            patches: Object.fromEntries(ids.map((id) => [id, { locked: !allLocked }])),
          })
        }
      />
      {/* 복사·붙여넣기: 다른 페이지·다른 다이어리 탭으로 옮긴다 (복사한 게 없으면 붙여넣기는 흐리게). 복제는 이 자리에 바로 하나 더 */}
      <BarButton icon="copy" label="복사" onPress={() => onCopy?.(objects)} />
      <BarButton icon="clipboard" label="붙여넣기" disabled={!canPaste} onPress={onPaste} />
      <BarButton icon="duplicate" label="복제" onPress={() => dispatch({ type: 'duplicateObjects', ids })} />
      <BarButton
        icon="trash"
        label="삭제"
        danger
        onPress={() => {
          if (allLocked) {
            onToast('잠긴 요소예요. 잠금을 풀고 지워 주세요.')
            return
          }
          dispatch({ type: 'removeObjects', ids: editable.map((o) => o.id) })
        }}
      />
      {orderOpen && (
        <OrderMenu
          placement={menuBelow ? 'below' : 'above'}
          right={orderRight}
          objects={objects}
          allObjects={allObjects}
          onPick={(mode) => dispatch({ type: 'reorder', ids, mode })}
        />
      )}
    </View>
    {linkCard}
    {lassoActions && <LassoSelectionMenu objects={objects} mode={lassoActions.mode}
      onModeChange={lassoActions.onModeChange} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight}
      anchor={{ top, height: BAR_HEIGHT }} />}
    </>
  )
}

function CompactMenu({ position, maxHeight, insideHandlers, onOrder, onOptions, allLocked, onLock, onCopy, canPaste, onPaste, onDuplicate, onDelete }) {
  const actions = [
    { icon: 'layers', label: '순서', onPress: onOrder }, { icon: 'more', label: '옵션', onPress: onOptions },
    { icon: allLocked ? 'unlock' : 'lock', label: allLocked ? '잠금 해제' : '잠금', onPress: onLock },
    { icon: 'copy', label: '복사', onPress: onCopy }, { icon: 'clipboard', label: '붙여넣기', onPress: onPaste, disabled: !canPaste },
    { icon: 'duplicate', label: '복제', onPress: onDuplicate }, { icon: 'trash', label: '삭제', onPress: onDelete, danger: true },
  ]
  // 메뉴 안(버튼 사이 여백 포함)을 누른 터치가 아래 캔버스·화면 이동으로 새지 않게 메뉴가 받는다.
  // '바깥 누르기'로도 치지 않아야 열린 옵션 창이 닫히거나 선택이 풀리지 않는다.
  return <View accessibilityLabel="객체 편집 더보기" style={[styles.compactMenu, position, { maxHeight }]}
    onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => true} {...insideHandlers}>
    {/* 스크롤 영역 높이를 직접 정해 두어야 Android·iOS 에서도 항목이 메뉴 안에서 스크롤된다 (바깥 maxHeight 만으로는 펼쳐질 수 있다). */}
    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator keyboardShouldPersistTaps="handled" style={{ maxHeight: maxHeight - 10 }} contentContainerStyle={styles.compactMenuContent}>
      {actions.map((action) => <MenuAction key={action.label} {...action} />)}
    </ScrollView>
  </View>
}

function MenuAction({ icon, label, danger, disabled, onPress }) {
  const color = danger ? colors.danger : disabled ? colors.border : colors.text
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
    <Icon name={icon} size={18} color={color} /><Text style={[styles.menuText, { color }]}>{label}</Text>
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
            <Icon name={action.icon} size={18} color={disabled ? colors.border : colors.text} />
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
      <Icon name={icon} size={17} color={color} />
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
  chipText: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
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
  compactMenu: { position: 'absolute', width: 166, padding: 5, borderRadius: 14, backgroundColor: colors.surface, zIndex: 8, overflow: 'hidden', ...shadow.float },
  compactMenuContent: { paddingBottom: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 10, borderRadius: 10 },
  menuText: { fontSize: 13, fontWeight: '700', color: colors.text },
  menuTextDisabled: { color: 'rgba(11,25,87,0.3)' },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 42, paddingHorizontal: 10, borderRadius: 11 },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  buttonDisabled: { opacity: 0.35 },
  iconButton: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.primarySoft },
  divider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: colors.border },
  chipActive: { backgroundColor: colors.surfaceSoft },
  // 텍스트·필기 바도 스티커·마테·사진 바(bar)와 같은 모양: 둥글기 16, 테두리 없음, 버튼 간격 2
  barContent: { alignItems: 'center', gap: 2 },
  kind: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 12, marginVertical: 5, borderRadius: 20, backgroundColor: colors.text },
  kindText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  swatch: { width: 27, height: 27, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  swatchChosen: { borderWidth: 3, borderColor: colors.primary },
})
