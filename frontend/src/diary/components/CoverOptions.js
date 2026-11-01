import { useEffect, useRef, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import Icon from '../../editor/components/controls/Icon'
import StickerThumbImage from '../../editor/components/controls/StickerThumbImage'
import { stickerLibrary } from '../../editor/stickerLibrary'
import { stickerKey, useCustomDecor } from '../../editor/hooks/useCustomDecor'
import { useMediaUri } from '../../editor/hooks/useMediaUri'
import { pickImages } from '../../editor/services/image'
import { mediaFailureMessage } from '../../editor/utils/mediaRecovery.js'
import { createId } from '../../editor/utils/common'
import { colors } from '../../shared/theme'
import { AutoSwatch, ChipGroup, ColorRow, CustomSwatch, ElementRow, NumberField, OptionRow, PickerPanel, Segmented, Swatch, Toggle } from './FormControls'
import CoverPattern from './CoverPattern'
import { textStyle } from '../../editor/utils/text'
import { loadPhotoTone } from '../utils/loadPhotoTone'
import {
  ANCHORS, BAND_COLORS, COVER_COLORS, COVER_FONTS, COVER_GRADIENTS, COVER_PATTERNS, INK_COLORS, isLegacyGradient, isPickableGradient, PLATE_SHAPES, RETIRED_PATTERNS, RIBBON_COLORS, SUBTITLE_COLORS, SUBTITLE_SIZE, TITLE_SIZE,
  bandAutoColor, changeCoverKind, coverLineColor, coverTitle, coverElementSummary, paintStops,
} from '../utils/coverDesign'

// 표지 종류(위 세 갈래)는 배경만 바꾸고, 아래 다섯 줄은 종류와 상관없이 같은 값을 쓴다.
// 글씨(내용 · 글씨체 · 크기 · 색)는 '제목 · 소제목', 라벨 모양과 위치(9칸 · 끌어 옮기기)는 '라벨'에서만 고친다.
export const COVER_ELEMENTS = [['base', '배경'], ['band', '고무줄'], ['text', '제목 · 소제목'], ['plate', '라벨'], ['stickers', '스티커']]
const KINDS = [{ id: 'none', label: '표지 없음' }, { id: 'plain', label: '색 · 무늬' }, { id: 'photo', label: '사진' }]
const chips = list => list.map(([id, label]) => ({ id, label }))

// 견본도 표지와 같이 물감 섞기로 중간색을 채워 그린다
function GradientTile({ id, stops: keys, legacy = false }) {
  const stops = legacy ? keys : paintStops(keys) // 예전 프리셋은 표지와 같이 고른 색만 잇는다
  return <Svg width="100%" height="100%"><Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    {stops.map((color, i) => <Stop key={i} offset={i / (stops.length - 1)} stopColor={color} />)}
  </LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`} /></Svg>
}

/**
 * 바탕: 한 격자에 첫 줄 단색 6 + 직접 고르기, 둘째 줄 그라데이션 6 + 직접 고르기(위 · 아래 두 색).
 * 펼친 색 고르기는 한 번에 하나만 연다. 아래에 무늬 타일과 무늬 색.
 */
function BaseOptions({ cover, onChange }) {
  const [picking, setPicking] = useState(null) // 'solid' | 'gradient'
  const [edge, setEdge] = useState(0) // 직접 고르는 그라데이션: 0 위 색, 1 아래 색
  const set = patch => onChange({ ...cover, ...patch })
  const customStops = cover.gradientColors
  return <>
    <OptionRow label="색">
      <ColorRow label="배경색" value={cover.color} active={cover.gradient == null} swatches={COVER_COLORS} onChange={color => set({ color, gradient: null })}
        picking={picking === 'solid'} onPicking={open => setPicking(open ? 'solid' : null)}
        after={<>
          {/* 예전 프리셋 · 뺀 프리셋은 이 표지가 지금 쓰고 있을 때만 보인다. 새로 고를 수는 없다 */}
          {COVER_GRADIENTS.map(([name, stops], index) => (isPickableGradient(index) || cover.gradient === index) && <Swatch key={index} label={`바탕 그라데이션 ${name}`} on={cover.gradient === index}
            onPress={() => { set({ gradient: index }); setPicking(null) }}><GradientTile id={`cover-gradient-${index}`} stops={stops} legacy={isLegacyGradient(index)} /></Swatch>)}
          <CustomSwatch label="바탕 그라데이션 직접 고르기" on={cover.gradient === 'custom'} open={picking === 'gradient'}
            onPress={() => { if (cover.gradient !== 'custom') set({ gradient: 'custom' }); setPicking(picking === 'gradient' ? null : 'gradient') }}>
            <GradientTile id="cover-gradient-custom" stops={customStops} />
          </CustomSwatch>
        </>} />
      {picking === 'gradient' && <View style={styles.gradientEdit}>
        <Segmented items={[{ id: 0, label: '위 색' }, { id: 1, label: '아래 색' }]} selected={id => id === edge} onPress={setEdge} />
        <PickerPanel label={edge ? '그라데이션 아래 색' : '그라데이션 위 색'} value={customStops[edge]}
          onChange={color => set({ gradient: 'custom', gradientColors: customStops.map((value, i) => i === edge ? color : value) })} />
      </View>}
    </OptionRow>
    <OptionRow label="무늬"><PatternGrid cover={cover} onChange={type => set({ pattern: { ...cover.pattern, type } })} /></OptionRow>
    {cover.pattern.type !== 'none' && <OptionRow label="무늬 밝기"><Segmented items={[{ id: 'dark', label: '어둡게' }, { id: 'light', label: '밝게' }]} selected={id => id === cover.pattern.tone} onPress={tone => set({ pattern: { ...cover.pattern, tone } })} /></OptionRow>}
  </>
}

// 견본 안쪽 크기(타일 48 − 안쪽 여백 2 · 테두리 2 · 칸 테두리 1씩). 미리 넘겨 두면 화면을 잰 뒤가 아니라 첫 프레임부터 그려진다.
const PATTERN_FILL = 38

/** 무늬: 지금 바탕색 위에 무늬를 그린 타일 4열 */
function PatternGrid({ cover, onChange }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="무늬" style={styles.patterns}>
    {COVER_PATTERNS.filter(([id]) => !RETIRED_PATTERNS.has(id) || cover.pattern.type === id).map(([id, name]) => {
      const on = cover.pattern.type === id
      return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={`무늬 ${name}`} accessibilityState={{ selected: on, checked: on }} onPress={() => onChange(id)}
        style={({ pressed }) => [styles.patternCell, pressed && styles.pressed]}>
        <View style={[styles.patternTile, on && styles.patternTileOn]}>
          <View style={[styles.patternFill, { backgroundColor: cover.color }]}><CoverPattern pattern={id} tone={cover.pattern.tone} line={coverLineColor({ ...cover, pattern: { ...cover.pattern, type: id } })} initialWidth={PATTERN_FILL} initialHeight={PATTERN_FILL} /></View>
        </View>
        <Text numberOfLines={1} style={[styles.patternName, on && styles.patternNameOn]}>{name}</Text>
      </Pressable>
    })}
  </View>
}

function OwnPhotoTile({ photo }) {
  const uri = useMediaUri(photo, { still: true })
  return uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null
}

function PhotoOptions({ cover, onChange, onNotice, pickNow, onPickHandled }) {
  const [busy, setBusy] = useState(false)
  const latest = useRef(null)
  const choose = async () => {
    if (busy) return
    setBusy(true)
    try {
      const [item] = await pickImages({ multiple: false, usage: 'photo' })
      if (item) latest.current.onChange({ ...latest.current.cover, photo: { src: item.src, mediaFileId: item.mediaFileId, aspect: item.aspect } })
    } catch (error) { onNotice?.(mediaFailureMessage(error)) } finally { setBusy(false) }
  }
  latest.current = { cover, onChange }
  // 사진 표지로 바꿨는데 사진이 없으면 바로 사진 고르기를 연다. 요청은 한 번만 처리하고 비운다 (줄을 접었다 펴도 다시 열리지 않게)
  useEffect(() => { if (!pickNow) return; onPickHandled?.(); choose() }, [pickNow]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <OptionRow label="사진">
      <View style={styles.tiles}>
        <Pressable accessibilityRole="button" accessibilityLabel="내 사진 고르기" disabled={busy} onPress={choose} style={({ pressed }) => [styles.addPhoto, busy && styles.dim, pressed && styles.pressed]}>
          <Icon name="image" size={16} forText={12.5} /><Text style={styles.addPhotoText}>{busy ? '여는 중…' : cover.photo?.src ? '사진 바꾸기' : '사진 고르기'}</Text>
        </Pressable>
        {cover.photo?.src ? <View style={[styles.photoTile, styles.photoTileOn]}><OwnPhotoTile photo={cover.photo} /></View> : null}
      </View>
    </OptionRow>
  </>
}

function AnchorGrid({ value, onChange }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="제목 위치" style={styles.anchor}>
    {ANCHORS.map(([id, name]) => {
      const on = value === id
      return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ selected: on, checked: on }} onPress={() => onChange(id)} style={styles.anchorCell}>
        <View style={[styles.anchorDot, on && styles.anchorDotOn]} />
      </Pressable>
    })}
  </View>
}

function StickerTile({ item, favorite, onPress, onLongPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name ?? '스티커'} 붙이기${favorite ? ', 즐겨찾기' : ''}`} onPress={onPress} onLongPress={onLongPress}
    style={({ pressed }) => [styles.stickerTile, pressed && styles.pressed]}>
    <StickerThumbImage item={item} style={styles.stickerImage} />
    {favorite && <View style={styles.favorite} />}
  </Pressable>
}

/**
 * 편집기 스티커 보관함과 같은 모음: 찾기 · 즐겨찾기 · 최근 · 출처별 분류 · 내 폴더 (순서 · 숨김 · 마지막 칩도 같다).
 * 누르면 표지 가운데쯤 붙고 최근에 남는다. 길게 누르면 즐겨찾기에 넣고 뺀다.
 */
function StickerPicker({ cover, onChange, onNotice }) {
  const custom = useCustomDecor()
  const [query, setQuery] = useState('')
  const keyword = query.trim()
  const { favorites, recents, favoriteKeys, chips, active, folder, groups, folderMatches } = stickerLibrary(custom.items, custom.lastStickerCategory, keyword, { widgets: false })
  const list = keyword ? [...groups.flatMap(group => group.items), ...folderMatches]
    : active === 'favorites' ? favorites : active === 'recent' ? recents : folder ? folder.items : groups[0]?.items ?? []
  const add = item => {
    custom.markRecent(item)
    onChange({ ...cover, stickers: [...cover.stickers, { id: createId(), asset: item.asset, src: item.src, mediaFileId: item.mediaFileId, name: item.name, x: 40 + Math.random() * 25, y: 45 + Math.random() * 25, size: 14, rotation: 0 }] })
  }
  const toggleFavorite = item => {
    const has = favoriteKeys.has(stickerKey(item))
    custom.toggleFavorite(item)
    onNotice?.(has ? '즐겨찾기에서 뺐어요.' : '즐겨찾기에 넣었어요.')
  }
  return <View style={styles.stickers}>
    <TextInput accessibilityLabel="스티커 찾기" placeholder="스티커 찾기" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} style={styles.search} />
    {!keyword && <ChipGroup label="스티커 분류" items={chips.map(item => ({ id: item.id, label: item.name }))} value={active} onChange={custom.setStickerCategory} />}
    <View style={styles.stickerGrid}>
      {list.map(item => <StickerTile key={`${item.folderId ?? ''}-${stickerKey(item)}`} item={item} favorite={favoriteKeys.has(stickerKey(item))} onPress={() => add(item)} onLongPress={() => toggleFavorite(item)} />)}
    </View>
    {!list.length && <Text style={styles.empty}>{keyword ? '찾는 스티커가 없어요' : active === 'favorites' ? '즐겨찾기한 스티커가 없어요' : '스티커가 없어요'}</Text>}
  </View>
}

// 글씨체 칩은 그 글씨체로 쓴다. 글꼴을 다 불러오면(표지 화면이 다시 그림) 실제 글꼴로 바뀐다.
// 손글씨는 같은 크기에서 글자가 작아 표지(CoverArt)와 같이 키운다
const FONT_SCALE = { 'nanum-pen': 1.35, 'poor-story': 1.1 }
const fontChips = () => COVER_FONTS.map(([id, label]) => ({ id, label,
  textStyle: (({ fontFamily, fontWeight, fontSize }) => ({ fontFamily, fontWeight, fontSize }))(textStyle({ font: id, fontSize: 12.5 * (FONT_SCALE[id] ?? 1), color: colors.text }, 1, Platform.OS)) }))

function ElementOptions({ element, cover, name, onChange, onNotice, pickNow, onPickHandled }) {
  const set = patch => onChange({ ...cover, ...patch })
  if (element === 'base' && cover.kind === 'photo') return <PhotoOptions cover={cover} onChange={onChange} onNotice={onNotice} pickNow={pickNow} onPickHandled={onPickHandled} />
  if (element === 'base') return <BaseOptions cover={cover} onChange={onChange} />
  // 꺼진 고무줄도 고칠 수 있게 두되 흐리게 보인다
  if (element === 'band') return <View style={!cover.band.on && styles.off}>
    <OptionRow label="방향"><Segmented items={[{ id: 'v', label: '세로' }, { id: 'h', label: '가로' }]} selected={id => id === cover.band.dir} onPress={dir => set({ band: { ...cover.band, dir } })} /></OptionRow>
    <OptionRow label="위치"><Segmented items={[{ id: 'near', label: cover.band.dir === 'v' ? '오른쪽' : '아래쪽' }, { id: 'center', label: '가운데' }]} selected={id => id === cover.band.pos} onPress={pos => set({ band: { ...cover.band, pos } })} /></OptionRow>
    <OptionRow label="색">
      <ColorRow label="고무줄 색" value={cover.band.color === 'auto' ? bandAutoColor(cover) : cover.band.color} active={cover.band.color !== 'auto'} swatches={BAND_COLORS}
        lead={<AutoSwatch label="고무줄 색 표지에 맞춤" color={bandAutoColor(cover)} on={cover.band.color === 'auto'} onPress={() => set({ band: { ...cover.band, color: 'auto' } })} />}
        onChange={color => set({ band: { ...cover.band, color } })} />
    </OptionRow>
  </View>
  // 제목 칸은 다이어리 이름으로 채워 두고, 고쳐 쓰면 그 글을 쓴다(이름과 같게 쓰면 다시 이름을 따른다)
  if (element === 'text') return <>
    <OptionRow label="제목">
      <TextInput accessibilityLabel="표지 제목" placeholder="표지 제목" placeholderTextColor={colors.textMuted} maxLength={24} value={coverTitle(cover, name)}
        onChangeText={text => set({ title: { ...cover.title, useName: text === coverTitle({ title: { useName: true } }, name), text } })} style={styles.input} />
    </OptionRow>
    <OptionRow label="글씨체"><ChipGroup label="제목 글씨체" columns={3} items={fontChips()} value={cover.title.font} onChange={font => set({ title: { ...cover.title, font } })} /></OptionRow>
    <OptionRow label="크기"><NumberField label="제목 크기" unit="pt" min={TITLE_SIZE.min} max={TITLE_SIZE.max} value={cover.title.size} onChange={size => set({ title: { ...cover.title, size } })} /></OptionRow>
    <OptionRow label="색"><ColorRow label="제목 색" value={cover.title.color} swatches={INK_COLORS} onChange={color => set({ title: { ...cover.title, color } })} /></OptionRow>
    <View style={styles.subHead}>
      <Toggle label={`소제목 ${cover.subtitle.on ? '끄기' : '켜기'}`} value={cover.subtitle.on} onChange={on => set({ subtitle: { ...cover.subtitle, on } })} />
      <Text style={styles.subTitle}>소제목</Text>
    </View>
    {cover.subtitle.on && <>
      <OptionRow label="내용"><TextInput accessibilityLabel="소제목" maxLength={30} value={cover.subtitle.text} onChangeText={text => set({ subtitle: { ...cover.subtitle, text } })} style={styles.input} /></OptionRow>
      <OptionRow label="크기"><NumberField label="소제목 크기" unit="pt" min={SUBTITLE_SIZE.min} max={SUBTITLE_SIZE.max} value={cover.subtitle.size} onChange={size => set({ subtitle: { ...cover.subtitle, size } })} /></OptionRow>
      <OptionRow label="색"><ColorRow label="소제목 색" value={cover.subtitle.color} swatches={SUBTITLE_COLORS} onChange={color => set({ subtitle: { ...cover.subtitle, color } })} /></OptionRow>
    </>}
  </>
  // 꺼진 라벨도 고칠 수 있게 두되 흐리게 보인다. 모양을 고르면 라벨이 다시 켜진다.
  if (element === 'plate') return <View style={cover.plate === 'none' && styles.off}>
    <OptionRow label="모양"><Segmented items={chips(PLATE_SHAPES)} selected={id => id === cover.plateStyle} onPress={plate => set({ plate, plateStyle: plate })} /></OptionRow>
    {cover.plateStyle === 'ribbon' && <OptionRow label="띠지 색"><ColorRow label="띠지 색" value={cover.ribbon.color} swatches={RIBBON_COLORS} onChange={color => set({ ribbon: { ...cover.ribbon, color } })} /></OptionRow>}
    <OptionRow label="위치"><AnchorGrid value={cover.title.at ? null : cover.title.anchor} onChange={anchor => set({ title: { ...cover.title, anchor, at: null } })} /></OptionRow>
  </View>
  if (element === 'stickers') return <StickerPicker cover={cover} onChange={onChange} onNotice={onNotice} />
  return null
}

/**
 * 표지 구역: 위에 세 갈래(표지 없음 · 색 · 무늬 · 사진), 아래에 요소 줄. 한 번에 한 줄만 펼친다.
 * 고무줄은 줄 머리의 스위치로, 소제목은 '글' 안의 스위치로 켜고 끈다. 꺼도 설정은 남는다.
 */
/**
 * 사진 표지의 대표 색을 사진에서 뽑아 photo.tone 에 둔다 (고무줄 '맞춤' 색이 사진을 따른다).
 * 새로 고른 사진과 대표 색이 없는 예전 사진 모두 한 번 뽑는다. 구역을 옮겨도 이어지게 작업대(DiaryCreateModal)에서 부른다.
 */
export function usePhotoTone(cover, onChange) {
  const uri = useMediaUri(cover.photo, { still: true })
  const latest = useRef(null)
  latest.current = { cover, onChange }
  const src = cover.photo?.src
  const missing = cover.kind === 'photo' && Boolean(src) && !cover.photo.tone
  useEffect(() => {
    if (!missing || !uri) return undefined
    let active = true
    loadPhotoTone(uri).then(tone => {
      const now = latest.current.cover
      if (active && tone && now.photo?.src === src && !now.photo.tone) latest.current.onChange({ ...now, photo: { ...now.photo, tone } })
    })
    return () => { active = false }
  }, [missing, uri, src])
}

export default function CoverOptions({ cover, name, onChange, openElement, onOpenElement, onNotice }) {
  // 사진 표지로 바꿨는데 사진이 없으면 사진 고르기를 한 번 연다 (처리하면 false 로 비운다)
  const [pickNow, setPickNow] = useState(false)
  const changeKind = kind => {
    onChange(changeCoverKind(cover, kind))
    if (kind === 'photo' && !cover.photo?.src) { onOpenElement('base'); setPickNow(true) }
  }
  const toggles = {
    band: { value: cover.band.on, onChange: on => onChange({ ...cover, band: { ...cover.band, on } }) },
    plate: { value: cover.plate !== 'none', onChange: on => onChange({ ...cover, plate: on ? cover.plateStyle : 'none' }) },
  }
  return <View style={styles.panel}>
    <Segmented items={KINDS} selected={id => id === (cover.enabled ? cover.kind : 'none')} onPress={changeKind} />
    {cover.enabled && <View style={styles.elements}>
        {COVER_ELEMENTS.map(([id, label]) => <ElementRow key={id} title={label} summary={coverElementSummary(cover, id)}
          open={openElement === id} onToggleOpen={() => onOpenElement(openElement === id ? null : id)} toggle={toggles[id]}>
          <ElementOptions element={id} cover={cover} name={name} onChange={onChange} onNotice={onNotice} pickNow={pickNow} onPickHandled={() => setPickNow(false)} />
        </ElementRow>)}
    </View>}
  </View>
}


const styles = StyleSheet.create({
  panel: { gap: 12 },
  elements: { gap: 8 },
  dim: { opacity: 0.4 },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  subTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  off: { opacity: 0.45 },
  empty: { paddingVertical: 12, textAlign: 'center', color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
  gradientEdit: { gap: 8 },
  patterns: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  patternCell: { width: '25%', alignItems: 'center', gap: 4 },
  patternTile: { width: 48, height: 48, padding: 2, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  patternTileOn: { borderColor: colors.primary },
  patternFill: { flex: 1, overflow: 'hidden', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(11,23,102,.12)' },
  patternName: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },
  patternNameOn: { color: colors.text, fontWeight: '800' },
  input: { height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 14, fontWeight: '700', backgroundColor: colors.surfaceSoft },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  addPhoto: { height: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  addPhotoText: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  photoTile: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  photoTileOn: { borderColor: colors.primary },
  anchor: { width: 132, flexDirection: 'row', flexWrap: 'wrap', padding: 0, borderRadius: 11, backgroundColor: colors.surfaceMuted },
  anchorCell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  anchorDot: { width: 10, height: 10, borderRadius: 3, backgroundColor: colors.border },
  anchorDotOn: { width: 16, height: 16, borderRadius: 4, backgroundColor: colors.primaryStrong },
  stickers: { gap: 10, paddingTop: 6 },
  search: { height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 13, backgroundColor: colors.surfaceSoft },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stickerTile: { width: 52, height: 52, padding: 6, borderRadius: 12, backgroundColor: colors.surfaceSoft },
  favorite: { position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryStrong },

  stickerImage: { width: '100%', height: '100%' },
})
