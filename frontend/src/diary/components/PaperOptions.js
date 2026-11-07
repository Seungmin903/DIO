import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SvgAst, parse } from 'react-native-svg'
import PageBackground from '../../editor/components/PageBackground'
import Icon from '../../editor/components/controls/Icon'
import { usePan } from '../../editor/hooks/usePan'
import { useRemoteTemplates } from '../../editor/hooks/useRemoteTemplates'
import { TEMPLATE_VERSION, getTemplate, templateCanvasSize } from '../../editor/templates/catalog.js'
import { colorTemplateXml, withPaperBackground } from '../../editor/templates/appearance.js'
import { loadTemplate, peekTemplate } from '../../editor/templates/loadTemplate'
import { colors } from '../../shared/theme'
import { NumberField, OptionRow, QuickValues, Segmented } from './FormControls'
import PaperFontDropdown from './PaperFontDropdown'
import EditablePalette from '../../editor/components/controls/EditablePalette'
import PaperSketch, { paperSketchKey } from './PaperSketch'
import { DEFAULT_PAPER_FONT } from '../../editor/templates/paperFont.js'
import {
  COUNT_LIMIT, COUNT_STEPS, INSERT_LIMIT, MONTH_LIMIT, MONTH_STEPS, PAPER_EVERY, PAPER_YEARS, REPEAT_LIMIT, ROW_LIMIT, paperGroups,
  appendPaper, changeRow, changeRowPaper, isPeriodSection, mergeSections, mixOrder, moveDown, movePaper, moveUp, paperById, paperPreviewId, papersIn, periodLabel,
  removePaper, rowAmount, splitSection,
} from '../utils/paperChoice'

// 노트(줄 · 모눈 · 도트) 미리보기: 실제 선은 1 굵기 · 연한 색 · 28 간격이라 그대로 줄이면 흐려지거나 0.1px 아래로 사라진다.
// 그래서 선은 화면 1px · 점은 지름 2px 로, 색은 #bfc1c4 로 그린다. 폭 NOTE_THUMB_MAX 아래 칸은 실제 속지의 왼쪽 위 일부(폭 NOTE_VIEW)를 확대해 보인다.
// (모눈 · 도트는 여백 없이 페이지 끝까지 무늬가 있어 왼쪽 위 끝부터, 줄은 여백 안쪽부터 보인다)
const NOTE_THUMB_MAX = 160
const NOTE_VIEW = 260
const NOTE_ORIGIN = { ruled: [24, 48], grid: [0, 0], dots: [0, 0] }
// 코덱스 검수(2026-11-02): 플래너 · 일기 대표 그림보다 무겁지 않게 모두 #bfc1c4 로(예전 #aeb3b8)
const DARKER = { '#e8e9eb': '#bfc1c4', '#d7d9dc': '#bfc1c4', '#bfc1c4': '#bfc1c4' }

function noteThumbXml(xml, { background, pageWidth, previewWidth, ratio, crop }, appearance) {
  const [x, y] = NOTE_ORIGIN[background] ?? [0, 0]
  const view = crop ? NOTE_VIEW : pageWidth
  const unit = view / previewWidth // 화면 1px 의 속지 단위
  const viewH = NOTE_VIEW / ratio
  // 확대해 보이는 칸은 보이지 않는 점을 미리 덜어 내 해석할 양을 줄인다 (도트 속지는 점이 수백 개)
  const visible = crop ? xml.replace(/<circle\b[^>]*\/>/g, tag => {
    const cx = Number(/\bcx="(-?[\d.]+)"/.exec(tag)?.[1]), cy = Number(/\bcy="(-?[\d.]+)"/.exec(tag)?.[1])
    if (Number.isNaN(cx) || Number.isNaN(cy) || /\btransform=/.test(tag)) return tag // 좌표를 못 읽거나 옮겨 그린 원은 그대로 둔다
    return cx >= x - 4 && cx <= x + NOTE_VIEW + 4 && cy >= y - 4 && cy <= y + viewH + 4 ? tag : ''
  }) : xml
  const boosted = (crop ? visible.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${NOTE_VIEW} ${viewH}"`) : visible)
    .replace(/stroke-width="1"/g, `stroke-width="${Math.max(1, unit).toFixed(3)}"`)
    .replace(/(<circle\b[^>]*\br=")([\d.]+)"/g, (_, head, r) => `${head}${Math.max(Number(r), unit).toFixed(3)}"`)
    .replace(/#(e8e9eb|d7d9dc|bfc1c4)\b/gi, color => DARKER[color.toLowerCase()])
  return colorTemplateXml(boosted, appearance)
}

// 만든 미리보기는 해석한 채로 모아 둬, 팝업을 다시 열 때 정규식 처리와 SVG 해석을 되풀이하지 않는다
const thumbAsts = new Map()
const THUMB_AST_LIMIT = 80 // 오래된 것부터 버려 계속 늘지 않게 한다

function NoteThumb({ assetId, background, pageWidth, width, height, crop, appearance }) {
  // 이미 불러온 속지는 기다리지 않고 첫 그림부터 보인다
  // 어느 속지의 XML인지 함께 들고 있어, 속지가 바뀐 직후에 이전 속지의 XML 로 그리지 않는다
  const [loaded, setLoaded] = useState(() => { const ready = peekTemplate({ backgroundAssetId: assetId }); return ready ? { assetId, xml: ready } : null })
  useEffect(() => {
    let active = true
    const ready = peekTemplate({ backgroundAssetId: assetId })
    if (ready) { setLoaded({ assetId, xml: ready }); return undefined }
    loadTemplate({ backgroundAssetId: assetId, templateVersion: TEMPLATE_VERSION }).then(text => { if (active) setLoaded({ assetId, xml: text }) }).catch(() => {})
    return () => { active = false }
  }, [assetId])
  const xml = loaded?.assetId === assetId ? loaded.xml : null
  const ast = useMemo(() => {
    if (!xml) return null
    const key = `${assetId}|${background}|${pageWidth}|${width}x${height}|${crop}|${appearance?.backgroundColor}|${appearance?.layoutColor}`
    if (!thumbAsts.has(key)) {
      if (thumbAsts.size >= THUMB_AST_LIMIT) thumbAsts.delete(thumbAsts.keys().next().value)
      thumbAsts.set(key, parse(noteThumbXml(xml, { background, pageWidth, previewWidth: width, ratio: width / height, crop }, appearance)))
    }
    return thumbAsts.get(key)
  }, [xml, assetId, background, pageWidth, width, height, crop, appearance?.backgroundColor, appearance?.layoutColor]) // eslint-disable-line react-hooks/exhaustive-deps
  return ast ? <SvgAst ast={ast} override={{ width, height }} /> : null
}

/**
 * 속지 한 장 미리보기. 실제 속지 SVG 로 그리고, 노트의 줄 · 모눈 · 도트는 선이 또렷하게 보이도록 진하게 그린다.
 * sketch: 속지 고르기 칸(작은 칸)이면 플래너 · 일기는 실제 속지를 줄이지 않고 대표 그림(PaperSketch)으로 그린다. 페이지 목록 · 큰 미리보기는 쓰지 않는다.
 */
export function TemplatePreview({ assetId, width: previewWidth, appearance, style, sketch = false }) {
  const asset = getTemplate(assetId)
  const { width, height } = templateCanvasSize(asset.orientation)
  const previewHeight = previewWidth * height / width
  const lined = asset.type === 'note' && asset.background !== 'plain'
  const sketchKey = sketch && !lined && previewWidth < NOTE_THUMB_MAX ? paperSketchKey(assetId) : null
  return <View pointerEvents="none" style={[styles.preview, { width: previewWidth, height: previewHeight, backgroundColor: appearance?.backgroundColor ?? '#FFFFFF' }, style]}>
    {sketchKey ? <PaperSketch sketchKey={sketchKey} orientation={asset.orientation} width={previewWidth} height={previewHeight} appearance={appearance} />
      : lined ? <NoteThumb assetId={assetId} background={asset.background} pageWidth={width} width={previewWidth} height={previewHeight} crop={previewWidth < NOTE_THUMB_MAX} appearance={appearance} />
      : <PageBackground page={{ id: `preview-${assetId}`, backgroundAssetId: assetId, templateVersion: TEMPLATE_VERSION, canvasWidth: width, canvasHeight: height, paperAppearance: appearance }} zoom={previewWidth / width} compact />}
  </View>
}

/** 속지 없는 빈 페이지 미리보기 */
export function BlankPreview({ orientation, width: previewWidth, appearance, style }) {
  const { width, height } = templateCanvasSize(orientation)
  return <View pointerEvents="none" style={[styles.preview, { width: previewWidth, height: previewWidth * height / width, backgroundColor: appearance?.backgroundColor ?? '#FFFFFF' }, style]} />
}

// 탭이 이보다 많으면(목록이 탭을 더했을 때) 같은 폭으로 나누지 않고 가로로 넘긴다
const TAB_FIT = 4

/** 위쪽 가로 분류 탭 (노트 · 플래너 · 일기 + 목록이 더한 탭). 고른 탭은 밑줄. 탭이 많으면 가로로 넘긴다. */
export function PaperTabs({ groups, value, onChange }) {
  const scroll = groups.length > TAB_FIT
  const tabs = groups.map(group => {
    const on = group.id === value
    return <Pressable key={group.id} accessibilityRole="tab" accessibilityLabel={group.name} accessibilityState={{ selected: on }} onPress={() => onChange(group.id)}
      style={({ pressed }) => [styles.tab, scroll && styles.tabScroll, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.tabText, on && styles.tabTextOn]}>{group.name}</Text>
      <View style={[styles.tabLine, on && styles.tabLineOn]} />
    </Pressable>
  })
  if (!scroll) return <View accessibilityRole="tablist" style={styles.tabs}>{tabs}</View>
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={[styles.tabs, styles.tabsScrollBox]} contentContainerStyle={styles.tabsScroll}>{tabs}</ScrollView>
}

/**
 * 분류 안의 속지: 미리보기 + 이름 타일 3열 (세로로 길어지지 않게 작게).
 * 폭을 재지 않고 칸은 1/3 폭, 미리보기는 고정 크기로 그린다 (잰 뒤 다시 그리면 아래 옵션이 밀린다).
 */
export function PaperGrid({ papers, selected, onSelect, orientation, appearance, period = null, minSlots = 0 }) {
  const { width: w, height: h } = templateCanvasSize(orientation)
  const thumb = w > h ? 72 : 54
  const empty = Math.max(0, minSlots - papers.length) // 적은 분류도 줄 수가 같게 빈 칸으로 채운다
  return <View accessibilityRole="radiogroup" style={styles.grid}>
    {papers.map(paper => {
      const on = paper.id === selected
      return <View key={paper.id} style={styles.cell}><Pressable accessibilityRole="radio" accessibilityLabel={paper.name} accessibilityState={{ selected: on, checked: on }}
        onPress={() => onSelect(paper.id)} style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.pressed]}>
        <TemplatePreview assetId={paperPreviewId(paper.id, orientation, period)} width={thumb} appearance={appearance} sketch />
        <Text numberOfLines={1} style={[styles.tileName, on && styles.tileNameOn]}>{paper.name}</Text>
      </Pressable></View>
    })}
    {Array.from({ length: empty }, (_, i) => <View key={`empty-${i}`} pointerEvents="none" style={styles.cell}>
      <View style={styles.tile}><View style={{ width: thumb, height: thumb * h / w }} /><Text style={styles.tileName}> </Text></View>
    </View>)}
  </View>
}

/** 속지 고르기: 가로 분류 탭 + 그 분류의 속지 타일. 고른 속지가 있으면 그 분류에서 연다. */
function PaperPicker({ groups, selected, onSelect, orientation, appearance, period }) {
  const [group, setGroup] = useState(() => groups.find(item => item.papers.some(paper => paper.id === selected))?.id ?? groups[0].id)
  // 새 목록이 와서 고른 탭이 사라지면 첫 탭을 고른 것으로 본다(탭 밑줄과 목록이 같은 값)
  const current = groups.find(item => item.id === group) ?? groups[0]
  return <View style={styles.picker}>
    <PaperTabs groups={groups} value={current.id} onChange={setGroup} />
    <PaperGrid papers={current.papers} selected={selected} onSelect={onSelect} orientation={orientation} appearance={appearance} period={period} />
  </View>
}

// 탭별 속지. 원격 속지(catalog.json)가 바뀌면 다시 만든다(PaperOptions 의 useRemoteTemplates)
// 목록이 더한 탭은 속지가 하나도 없으면(모두 숨김 등) 보이지 않는다
const allGroups = () => paperGroups().map(group => ({ ...group, papers: papersIn(group.id) })).filter(group => !group.remote || group.papers.length)

function Stepper({ label, text, onPrev, onNext, prevDisabled, nextDisabled }) {
  return <View style={styles.stepper}>
    <Pressable accessibilityRole="button" accessibilityLabel={`이전 ${label}`} disabled={prevDisabled} onPress={onPrev} hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }} style={[styles.step, prevDisabled && styles.dim]}><Icon name="chevronLeft" size={16} forText={13.5} /></Pressable>
    <Text style={styles.stepText}>{text}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`다음 ${label}`} disabled={nextDisabled} onPress={onNext} hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }} style={[styles.step, nextDisabled && styles.dim]}><Icon name="chevronRight" size={16} forText={13.5} /></Pressable>
  </View>
}

/** 시작: ‹ 2026년 ›  ‹ 3월 › 한 줄. 달을 넘기면 해도 넘어간다. */
function PeriodStart({ year, month, onChange }) {
  const at = PAPER_YEARS.indexOf(year)
  const shift = step => {
    const index = year * 12 + month - 1 + step
    const next = Math.floor(index / 12)
    if (PAPER_YEARS.includes(next)) onChange(next, index % 12 + 1)
  }
  return <View style={styles.period}>
    <Stepper label="해" text={`${year}년`} onPrev={() => onChange(PAPER_YEARS[at - 1], month)} onNext={() => onChange(PAPER_YEARS[at + 1], month)} prevDisabled={at <= 0} nextDisabled={at >= PAPER_YEARS.length - 1} />
    <Stepper label="달" text={`${month}월`} onPrev={() => shift(-1)} onNext={() => shift(1)} prevDisabled={at <= 0 && month === 1} nextDisabled={at >= PAPER_YEARS.length - 1 && month === 12} />
  </View>
}

/** 기간 묶음 옵션: 날짜 · 시작 · 기간. 접어 두면 한 줄 요약, 누르면 펼친다. */
function PeriodOptions({ section, onChange }) {
  const [open, setOpen] = useState(false)
  return <View style={styles.context}>
    <Pressable accessibilityRole="button" accessibilityLabel={`기간 ${periodLabel(section)}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={({ pressed }) => [styles.periodHead, pressed && styles.pressed]}>
      <Text style={styles.periodLabel}>기간</Text>
      <Text numberOfLines={1} style={styles.periodValue}>{periodLabel(section)}</Text>
      <View style={open && styles.flip}><Icon name="chevronDown" size={15} forText={13.5} color={colors.textMuted} /></View>
    </Pressable>
    {open && <>
      <OptionRow label="날짜"><Segmented items={[{ id: 'dated', label: '날짜 있음' }, { id: 'undated', label: '날짜 없이' }]} selected={id => (id === 'dated') === section.dated} onPress={id => onChange({ ...section, dated: id === 'dated' })} /></OptionRow>
      {section.dated && <OptionRow label="시작"><PeriodStart year={section.year} month={section.startMonth} onChange={(year, startMonth) => onChange({ ...section, year, startMonth })} /></OptionRow>}
      <OptionRow label="개월 수">
        <NumberField label="기간" unit="개월" min={1} max={MONTH_LIMIT} value={section.months} onChange={months => onChange({ ...section, months })} />
        <QuickValues label="기간" unit="개월" values={MONTH_STEPS} value={section.months} onChange={months => onChange({ ...section, months })} />
      </OptionRow>
    </>}
  </View>
}

/** 이웃한 두 속지 사이: 이어서(앞 속지 다음에) | 섞어서(번갈아 · 날짜 속지와는 달마다) */
function Joint({ mixed, onChange, label, disabled = false }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.joint}>
    {[[false, '이어서'], [true, '섞어서']].map(([value, text]) => {
      const on = value === mixed
      return <Pressable key={text} accessibilityRole="radio" accessibilityLabel={`${label} ${text}`} accessibilityState={{ selected: on, checked: on, disabled: disabled && !on }}
        disabled={on || disabled} hitSlop={10} onPress={() => onChange(value)} style={({ pressed }) => [styles.jointItem, on && styles.jointItemOn, disabled && !on && styles.dim, pressed && styles.pressed]}>
        <Icon name={value ? 'swap' : 'down'} size={13} forText={12} color={on ? colors.primaryStrong : colors.textMuted} />
        <Text style={[styles.jointText, on && styles.jointTextOn]}>{text}</Text>
      </Pressable>
    })}
  </View>
}

/** 끌기 손잡이: 누른 채 위아래로 끌면 줄이 따라오고, 놓은 자리로 옮긴다 */
function Grip({ label, onStart, onMove, onEnd }) {
  const handlers = usePan({ onStart, onMove: (dx, dy) => onMove(dy), onEnd })
  return <View {...handlers} accessibilityLabel={label} style={styles.grip}>
    <Icon name="grip" size={17} color={colors.primary} />
  </View>
}

/** 속지 한 줄: 미리보기 · 이름(누르면 그 자리에서 바꾸기) · 위로 · 아래로 · 빼기 · 끌기, 그 아래 넣는 양 */
function PaperRow({ section, row, number, orientation, appearance, open, onToggle, onUp, onDown, onRemove, onChange, picker, rowRef, drag, dropLine }) {
  const paper = paperById(row.paper)
  const period = isPeriodSection(section)
  const fixed = period && paper.kind !== 'count'
  const { width: w, height: h } = templateCanvasSize(orientation)
  return <View ref={rowRef} style={[styles.row, open && styles.rowOn, drag.dragging && [styles.rowDragging, { transform: [{ translateY: drag.dy }] }]]}>
    {dropLine && <View pointerEvents="none" style={[styles.dropLine, dropLine === 'before' ? styles.dropBefore : styles.dropAfter]} />}
    <View style={styles.rowHead}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${number}번째 속지 ${paper.name} 바꾸기`} accessibilityState={{ expanded: open }}
        onPress={onToggle} style={({ pressed }) => [styles.rowPick, pressed && styles.pressed]}>
        <TemplatePreview assetId={paperPreviewId(row.paper, orientation, period ? section : null)} width={w > h ? 40 : 30} appearance={appearance} sketch />
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.rowName}>{paper.name}</Text>
          {fixed && <Text style={styles.rowAmount}>{rowAmount(section, row)}</Text>}
        </View>
        <View style={open && styles.flip}><Icon name="chevronDown" size={15} forText={13.5} color={colors.textMuted} /></View>
      </Pressable>
      {onUp && <Pressable accessibilityRole="button" accessibilityLabel={`${number}번째 속지 위로`} hitSlop={8} onPress={onUp} style={({ pressed }) => [styles.rowTool, pressed && styles.pressed]}>
        <Icon name="up" size={15} color={colors.textMuted} />
      </Pressable>}
      {onDown && <Pressable accessibilityRole="button" accessibilityLabel={`${number}번째 속지 아래로`} hitSlop={8} onPress={onDown} style={({ pressed }) => [styles.rowTool, pressed && styles.pressed]}>
        <Icon name="down" size={15} color={colors.textMuted} />
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${number}번째 속지 빼기`} hitSlop={8} onPress={onRemove} style={({ pressed }) => [styles.rowTool, pressed && styles.pressed]}>
        <Icon name="close" size={14} color={colors.textMuted} />
      </Pressable>
      <Grip label={`${number}번째 속지 끌어서 옮기기`} {...drag.handlers} />
    </View>
    {!fixed && <View style={styles.rowControls}>
      {period && <View style={styles.every}><Segmented items={PAPER_EVERY} selected={id => id === row.every} onPress={every => onChange(changeRow(section, row.key, { every }))} /></View>}
      <NumberField label={`${paper.name} 장수`} unit={period ? '' : '장'} min={COUNT_LIMIT.min} max={period ? INSERT_LIMIT : COUNT_LIMIT.max} value={row.count} onChange={count => onChange(changeRow(section, row.key, { count }))} />
      {!period && section.rows.length === 1 && <QuickValues label="장수" unit="장" values={COUNT_STEPS} value={row.count} onChange={count => onChange(changeRow(section, row.key, { count }))} />}
    </View>}
    {picker}
  </View>
}

/**
 * 속지 구역: 속지를 한 줄 목록으로 넣는 차례대로 둔다. 미리 골라 둔 속지는 없다.
 * 이웃한 두 속지 사이마다 '이어서 | 섞어서' 를 고른다. 섞은 속지는 한 판에 묶여 보이고,
 * 장수 속지끼리는 번갈아 반복(반복 횟수), 날짜 속지가 있으면 달마다 차례로 넣는다(기간).
 * 속지 이름을 누르면 그 자리에서 바꾸고, 맨 아래 '속지 추가' 는 고르기를 먼저 펼친다.
 */
export default function PaperOptions({ sections, onChange, orientation, appearance }) {
  const remoteRevision = useRemoteTemplates()
  const groups = useMemo(allGroups, [remoteRevision])
  const [picking, setPicking] = useState(null) // null | 'new' | 줄 key
  // 끌기: 시작할 때 줄마다 화면 위 가운데 높이를 재 두고, 끄는 줄의 가운데가 지나간 줄 수로 놓을 자리(뺀 뒤 목록 기준)를 정한다
  const [drag, setDrag] = useState(null) // { key, dy }
  const rowRefs = useRef({})
  const centers = useRef({})
  const dragRef = useRef(null)
  const order = sections.flatMap(section => section.rows.map(row => row.key))
  const dropAt = current => {
    if (!current || centers.current[current.key] == null) return null
    const mine = centers.current[current.key] + current.dy
    return order.filter(key => key !== current.key && centers.current[key] != null && centers.current[key] < mine).length
  }
  const dragHandlers = (s, r, key) => ({
    onStart: () => {
      centers.current = {}
      for (const id of order) rowRefs.current[id]?.measureInWindow?.((x, y, w, h) => { centers.current[id] = y + h / 2 })
      dragRef.current = { key, dy: 0 }
      setPicking(null)
      setDrag(dragRef.current)
    },
    onMove: dy => { dragRef.current = { key, dy }; setDrag(dragRef.current) },
    onEnd: () => {
      const to = dropAt(dragRef.current)
      dragRef.current = null
      setDrag(null)
      if (to != null) onChange(movePaper(sections, s, r, to))
    },
  })
  const target = dropAt(drag)
  const others = drag ? order.filter(key => key !== drag.key) : []
  const dropLine = key => {
    if (target == null || key === drag?.key) return null
    if (others[target] === key) return 'before'
    return target === others.length && others[others.length - 1] === key ? 'after' : null
  }
  const picker = (selected, onSelect, period) => <PaperPicker groups={groups} selected={selected} orientation={orientation} appearance={appearance} period={period}
    onSelect={id => { onSelect(id); setPicking(null) }} />
  const set = (index, next) => onChange(sections.map((section, s) => s === index ? next : section))
  let number = 0
  // 웹에서 끄는 동안 지나가는 글자가 선택되지 않게
  return <View style={[styles.panel, drag && Platform.OS === 'web' && styles.noSelect]}>
    {sections.map((section, s) => {
      const period = isPeriodSection(section)
      const total = section.rows.reduce((sum, row) => sum + row.count, 0) * section.repeat
      return <Fragment key={section.key}>
        {s > 0 && <Joint mixed={false} label={`${number}번째와 ${number + 1}번째 속지 사이`} disabled={sections[s - 1].rows.length + section.rows.length > ROW_LIMIT}
          onChange={() => onChange(mergeSections(sections, s - 1))} />}
        <View style={[styles.group, section.rows.length > 1 && styles.groupMixed, drag && section.rows.some(row => row.key === drag.key) && styles.groupDragging]}>
          {section.rows.map((row, r) => {
            number += 1
            const at = number
            return <Fragment key={row.key}>
              {r > 0 && <Joint mixed label={`${at - 1}번째와 ${at}번째 속지 사이`} onChange={() => onChange(splitSection(sections, s, r - 1))} />}
              <PaperRow section={section} row={row} number={at} orientation={orientation} appearance={appearance}
                open={picking === row.key} onToggle={() => setPicking(picking === row.key ? null : row.key)}
                onUp={at > 1 ? () => onChange(moveUp(sections, s, r)) : null}
                onDown={at < order.length ? () => onChange(moveDown(sections, s, r)) : null}
                rowRef={el => { rowRefs.current[row.key] = el }} dropLine={dropLine(row.key)}
                drag={{ dragging: drag?.key === row.key, dy: drag?.key === row.key ? drag.dy : 0, handlers: dragHandlers(s, r, row.key) }}
                onRemove={() => { onChange(removePaper(sections, s, row.key)); if (picking === row.key) setPicking(null) }}
                onChange={next => set(s, next)}
                picker={picking === row.key && picker(row.paper, id => set(s, changeRowPaper(section, row.key, id)), period ? section : null)} />
            </Fragment>
          })}
          {period && <PeriodOptions section={section} onChange={next => set(s, next)} />}
          {!period && section.rows.length > 1 && <View style={styles.context}>
            <OptionRow label="반복">
              <NumberField label="반복" unit="번" min={1} max={REPEAT_LIMIT} value={section.repeat} onChange={repeat => set(s, { ...section, repeat })} />
            </OptionRow>
            <Text style={styles.order}>{mixOrder(section)} · 모두 {total}장</Text>
          </View>}
        </View>
      </Fragment>
    })}
    {sections.length < 12 && <Pressable accessibilityRole="button" accessibilityLabel="속지 추가" accessibilityState={{ expanded: picking === 'new' }}
      onPress={() => setPicking(picking === 'new' ? null : 'new')} style={({ pressed }) => [styles.addSection, picking === 'new' && styles.addSectionOn, pressed && styles.pressed]}>
      <Icon name={picking === 'new' ? 'close' : 'plus'} size={16} forText={13.5} color={colors.primaryStrong} /><Text style={styles.addSectionText}>속지 추가</Text>
    </Pressable>}
    {picking === 'new' && picker(null, id => onChange(appendPaper(sections, id)), null)}
  </View>
}

/**
 * 속지 스타일: 종이 색 · 선과 글자 색 · 글꼴. 수정에서는 바꿀 페이지(이 다이어리의 모든 페이지 / 새 페이지만)를 고르고 세 가지가 같은 범위를 따른다.
 * 글꼴은 인쇄 글자가 있는 속지에만 있다(plainOnly 면 선 · 글씨 색과 함께 숨긴다).
 */
export function PaperStyleOptions({ appearance, onChange, scope, onScope, plainOnly = false }) {
  const setBackground = backgroundColor => onChange(withPaperBackground(appearance, backgroundColor))
  const setLayout = layoutColor => onChange({ ...appearance, layoutColor })
  return <View style={styles.panel}>
    <OptionRow label="종이 색">
      <EditablePalette scope="paper" label="종이" value={appearance.backgroundColor} onPick={setBackground} />
    </OptionRow>
    {!plainOnly && <OptionRow label="선 · 글자">
      <EditablePalette scope="paperLine" label="선과 글씨" value={appearance.layoutColor} onPick={setLayout} />
    </OptionRow>}
    {!plainOnly && <OptionRow label="글꼴">
      <PaperFontDropdown value={appearance.font ?? DEFAULT_PAPER_FONT} onChange={font => onChange({ ...appearance, font: font === DEFAULT_PAPER_FONT ? undefined : font })} />
    </OptionRow>}
    {onScope && <OptionRow label="바꿀 페이지"><Segmented items={[{ id: 'all', label: '모든 페이지' }, { id: 'new', label: '새 페이지만' }]} selected={id => id === scope} onPress={onScope} /></OptionRow>}
  </View>
}


const styles = StyleSheet.create({
  panel: { gap: 8 },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  dim: { opacity: 0.3 },
  preview: { overflow: 'hidden', borderRadius: 5, borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'flex-end' },
  tabScroll: { flex: 0, minWidth: 76, paddingHorizontal: 12 },
  tabsScroll: { flexGrow: 1 },
  tabsScrollBox: { flexGrow: 0 },
  tabText: { paddingBottom: 9, color: colors.textMuted, fontSize: 13.5, fontWeight: '700' },
  tabTextOn: { color: colors.text, fontWeight: '800' },
  tabLine: { alignSelf: 'stretch', height: 2.5, marginBottom: -1, borderRadius: 2, backgroundColor: 'transparent' },
  tabLineOn: { backgroundColor: colors.primaryStrong },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '33.333%', padding: 4 },
  tile: { alignItems: 'center', gap: 5, paddingTop: 8, paddingBottom: 6, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileName: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },
  tileNameOn: { color: colors.text, fontWeight: '800' },
  context: { padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSoft },
  period: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 40, paddingHorizontal: 2, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  step: { width: 28, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepText: { minWidth: 48, textAlign: 'center', color: colors.text, fontSize: 13.5, fontWeight: '800' },
  picker: { gap: 4, paddingTop: 4 },
  rows: { gap: 8 },
  row: { gap: 8, padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  rowOn: { borderColor: colors.primary },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowPick: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 6, borderRadius: 8 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  rowAmount: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  grip: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  rowDragging: { zIndex: 2, shadowColor: colors.text, shadowOpacity: 0.09, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  dropLine: { position: 'absolute', left: 8, right: 8, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  dropBefore: { top: -5 },
  dropAfter: { bottom: -5 },
  rowTool: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  rowControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  // 넣는 때(처음 · 매달 · 매주 · 매일)와 장수를 한 줄에
  every: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
  flip: { transform: [{ rotate: '180deg' }] },
  order: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  addSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary },
  addSectionOn: { borderStyle: 'solid', backgroundColor: colors.primarySoft },
  // 섞은 속지는 한 판에 묶어 보인다
  group: { gap: 6 },
  // 끄는 줄이 다른 판 위로 지나가도 위에 그려지게
  groupDragging: { zIndex: 2 },
  noSelect: { userSelect: 'none' },
  groupMixed: { padding: 6, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  joint: { flexDirection: 'row', alignSelf: 'center', gap: 2, padding: 2, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  jointItem: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 12, borderRadius: 999 },
  jointItemOn: { backgroundColor: colors.surface },
  jointText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  jointTextOn: { color: colors.primaryStrong, fontWeight: '800' },
  periodHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  periodLabel: { width: 40, color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
  periodValue: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '800' },
  addSectionText: { color: colors.primaryStrong, fontSize: 13.5, fontWeight: '800' },
})
