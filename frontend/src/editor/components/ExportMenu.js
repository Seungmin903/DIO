import EditorModal from './controls/EditorModal'
import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { ExportButton } from './ExportScreen'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { colors } from '../../shared/theme'
import { pageSize } from '../utils/pageGeometry.js'
import { createMenuPdfSnapshot, menuPdfPolicy, pdfMenuFailure } from '../utils/pdfMenu.js'
import { pageListKey, parsePageSpec } from '../utils/exportSelection.js'
import { isAnimatedMedia } from '../stickerAssets'

export { ExportButton }

// 무엇을 내보낼지 (문서 앱 인쇄 창처럼: 현재 페이지 · 전체 · 페이지 지정). 영역 내보내기는 지금은 뺐다.
const MODES = [
  { id: 'current', label: '현재 페이지' },
  { id: 'all', label: '전체 페이지' },
  { id: 'custom', label: '페이지 지정' },
]
const FORMATS = [{ id: 'png', label: 'PNG' }, { id: 'pdf', label: 'PDF' }, { id: 'gif', label: 'GIF' }]
const RUN_TITLES = { png: 'PNG 만들기', pdf: 'PDF 만들기', gif: 'GIF 만들기' }
const BUBBLE_WIDTH = 360 // 코덱스 21번: 내보내기 버튼 아래 360 폭 앵커 패널

/** 무엇을·어떤 형식으로 내보낼지 고르는 말풍선. 만들기를 누르면 닫히고, 만들기·저장은 편집 화면이 화면 없이 진행한다 (ExportRunner) */
export default function ExportMenu({ mobilePortrait = false, anchor, doc, currentId, onClose, onRegion, onPng, onGif, onPdf }) {
  const viewport = useWindowDimensions()
  const Root = mobilePortrait ? View : Fragment
  const [modalHeight, setModalHeight] = useState(null)
  const centered = mobilePortrait || !anchor
  // 말풍선: 내보내기 버튼 바로 아래, 오른쪽 끝을 버튼에 맞추고 꼬리가 버튼 가운데를 가리킨다
  const panelWidth = Math.min(BUBBLE_WIDTH, viewport.width - 32)
  const panelTop = Math.min(anchor ? anchor.y + anchor.height + 12 : 80, Math.max(16, viewport.height - 200))
  const panelLeft = Math.max(16, Math.min(anchor ? anchor.x + anchor.width - panelWidth : (viewport.width - panelWidth) / 2, viewport.width - panelWidth - 16))
  const tailLeft = anchor ? Math.min(panelWidth - 28, Math.max(16, anchor.x + anchor.width / 2 - panelLeft - 8)) : null
  // 기준 버튼이 없으면(폰) 말풍선 대신 화면 가운데 창으로 띄운다.
  const placement = !centered
    ? { position: 'absolute', width: panelWidth, left: panelLeft, top: panelTop, maxHeight: viewport.height - panelTop - 16 }
    : { width: panelWidth, maxHeight: Math.max(1, (mobilePortrait ? modalHeight ?? viewport.height : viewport.height) - 32) }
  const [mode, setMode] = useState('current'), [format, setFormat] = useState('png')
  const number = doc.pages.findIndex((p) => p.id === currentId) + 1
  const [spec, setSpec] = useState(String(number)) // 페이지 지정: '1-3, 5'
  const key = `${pageListKey(doc.pages)}:${currentId}`, [confirmedKey, setConfirmedKey] = useState(key)
  const changed = key !== confirmedKey
  const [failure, setFailure] = useState('')
  const exportDoc = useMemo(() => ({ ...doc, pages: doc.pages.map(page => ({ ...page, canvasWidth: pageSize(page).width, canvasHeight: pageSize(page).height })) }), [doc])
  const policy = menuPdfPolicy(exportDoc, pageSize(doc.pages.find(page => page.id === currentId)))
  const selectionKey = JSON.stringify([mode, currentId, spec, format, key])
  useEffect(() => { setFailure('') }, [selectionKey])
  // 내보낼 페이지 번호(1부터). 이어진 번호면 범위로, 아니면 고른 페이지로 PDF 를 만든다
  let numbers = [], invalid = ''
  try {
    numbers = mode === 'current' ? [number] : mode === 'all' ? doc.pages.map((_, index) => index + 1) : mode === 'custom' ? parsePageSpec(spec, doc.pages.length) : []
  } catch (e) { invalid = e.message }
  const ids = numbers.map((n) => doc.pages[n - 1].id)
  // PDF 한 파일에 넣을 수 있는 장수(보통 20)를 넘으면 그만큼씩 잘라 여러 파일로 만든다
  const parts = []
  for (let i = 0; i < ids.length; i += Math.max(1, policy.maxPages)) parts.push(numbers.slice(i, i + Math.max(1, policy.maxPages)))
  // GIF 는 현재 페이지에 움직이는 GIF(스티커·사진)가 있을 때만
  const currentPage = doc.pages.find((p) => p.id === currentId)
  if (format === 'gif' && !currentPage?.objects.some((o) => !o.hidden && o.opacity !== 0 && isAnimatedMedia(o))) invalid = '이 페이지에는 움직이는 GIF가 없어요. 움직이는 스티커나 GIF 사진을 넣으면 만들 수 있어요.'
  const contiguous = numbers.length > 1 && numbers.every((n, i) => !i || n === numbers[i - 1] + 1)
  const selection = mode === 'current' ? { mode: 'current', currentId }
    : contiguous && mode !== 'all' ? { mode: 'range', currentId, from: String(numbers[0]), to: String(numbers.at(-1)) }
      : { mode: 'pages', currentId, selectedIds: ids }
  const partSelection = (part) => part.length > 1 && part.every((n, i) => !i || n === part[i - 1] + 1)
    ? { mode: 'range', currentId, from: String(part[0]), to: String(part.at(-1)) }
    : { mode: 'pages', currentId, selectedIds: part.map((n) => doc.pages[n - 1].id) }
  const run = () => {
    if (changed || invalid) return
    if (format === 'png') { onPng(ids[0]); return }
    if (format === 'gif') { onGif(ids[0]); return }
    try {
      const size = pageSize(doc.pages.find(page => page.id === currentId))
      onPdf(parts.length > 1
        ? parts.map((part, i) => { const snapshot = createMenuPdfSnapshot(exportDoc, partSelection(part), size); return { ...snapshot, fileName: snapshot.fileName.replace(/.pdf$/, `_${i + 1}of${parts.length}.pdf`) } })
        : [createMenuPdfSnapshot(exportDoc, selection, size)])
    } catch (error) { setFailure(pdfMenuFailure(error).message ?? '') }
  }
  const chooseMode = (value) => {
    setMode(value)
    // 현재 페이지는 PNG 부터, 여러 페이지는 PDF 한 파일, 영역은 PNG
    setFormat(value === 'current' ? 'png' : 'pdf')
  }
  return <EditorModal visible transparent animationType="none" onRequestClose={onClose}>
    <Root {...(mobilePortrait ? { style: styles.portraitRoot, onLayout: (event) => setModalHeight(event.nativeEvent.layout.height) } : {})}>
    {/* 화면을 어둡게 덮지 않는다 (덮으면 뒤의 요소가 반투명해 보였다). 바깥을 누르면 닫는다 */}
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="내보내기 닫기" />
    {/* 꼬리는 카드 바깥에 그린다 (카드 안에 두면 둥근 모서리 자르기에 가려졌다) */}
    {!centered && tailLeft != null && <View pointerEvents="none" style={[styles.tail, { left: panelLeft + tailLeft, top: panelTop - 7 }]} />}
    <View style={mobilePortrait ? styles.portraitCenter : anchor ? StyleSheet.absoluteFill : styles.center} pointerEvents="box-none">
    <View style={[toolPanelStyles.card, styles.card, placement]} accessibilityViewIsModal>
      <ToolPanelHeader icon="share" title="내보내기" closeLabel="내보내기 창 닫기" onClose={onClose} />
      <ScrollView contentContainerStyle={toolPanelStyles.content}>
        <Text style={toolPanelStyles.label}>내보낼 범위</Text>
        <Segmented items={MODES} selected={(id) => mode === id} onPress={chooseMode} />
        {changed && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.hint}>페이지 목록이나 순서가 바뀌었어요. 선택·범위를 다시 확인해 주세요.</Text><ExportButton title="변경된 페이지 목록 확인" onPress={() => setConfirmedKey(key)} /></View>}

        {mode === 'current' && <>
          <Text style={toolPanelStyles.label}>형식</Text>
          <Segmented items={FORMATS} selected={(id) => format === id} onPress={setFormat} />

        </>}



        {mode === 'custom' && <>
          <Text style={toolPanelStyles.label}>페이지</Text>
          <TextInput accessibilityLabel="내보낼 페이지" value={spec} onChangeText={setSpec} placeholder="예: 1-3, 5, 8" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" style={styles.spec} />

        </>}

        {format === 'pdf' && !invalid && parts.length > 1 && <Text style={styles.hint}>{policy.maxPages}페이지씩 나눠 PDF {parts.length}개로 만들어요. ({parts.map((part) => part.length > 1 && part.at(-1) - part[0] === part.length - 1 ? `${part[0]}-${part.at(-1)}` : part.length === 1 ? part[0] : `${part.length}장`).join(' · ')})</Text>}
        {!!invalid && <Text accessibilityRole="alert" style={styles.hint}>{invalid}</Text>}
        {!!failure && <Text accessibilityRole="alert" style={styles.hint}>{failure}</Text>}
        <ExportButton primary title={RUN_TITLES[format]} onPress={() => run()} disabled={!!invalid || changed} />
      </ScrollView>
    </View>
    </View>
    </Root>
  </EditorModal>
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface }, // 둥글기 12·테두리·그림자 없음은 공용 옵션 창(카드)을 따른다
  portraitRoot: { flex: 1 },
  portraitCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16 },
  // 말풍선 꼬리: 카드 위쪽에서 내보내기 버튼 가운데를 가리킨다
  tail: { position: 'absolute', width: 16, height: 16, borderRadius: 3, backgroundColor: colors.surface, borderLeftWidth: 1, borderTopWidth: 1, borderColor: colors.cardBorder, transform: [{ rotate: '45deg' }] },
  notice: { gap: 6 },
  hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 19 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 104, padding: 4, gap: 4, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: colors.surfaceMuted },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.surface },
  tileThumb: { width: 96, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.surface },
  tileText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tileTextOn: { color: colors.primaryStrong },
  spec: { height: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'left', ...(Platform.OS === 'web' && { outlineStyle: 'none' }) },
  input: { width: 56, height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: 10, textAlign: 'center', color: colors.text, fontSize: 14, fontWeight: '700' },
})
