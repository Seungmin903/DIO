import { useEffect, useRef, useState } from 'react'
import { findNodeHandle, Keyboard, Platform, StyleSheet, TextInput, UIManager, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { FRAME_TEXT } from '../../constants'
import { photoInnerBox } from '../../utils/objects'
import { isStripFrame, stripCellBoxes } from '../../utils/photoStrip'
import { revealOverlap, startTextKeyboard } from '../../utils/textKeyboard'
import { frameColorOf } from './ObjectView'
import { frameTextOf, lineText, MONO, printColor, STRIP_DEFAULT_COLOR, stripLines, ticketLines } from './PhotoFrame'

/** 사진 틀에 인쇄된 고칠 수 있는 줄 (요소 안 좌표, 회전 전). 글자 없는 틀은 빈 목록 */
export function frameTextLines(photo) {
  if (photo?.type !== 'photo' || !FRAME_TEXT[photo.frame]) return []
  if (isStripFrame(photo.frame)) return stripLines(photo.frame, photo.w, photo.h, stripCellBoxes(photo))
  return ticketLines(photo.frame, photo.w, photoInnerBox(photo))
}

/** 줄이 차지하는 칸 (글자 칸 너비 전체, 위아래는 글자 높이) */
export function lineBox(line) {
  const left = line.anchor === 'middle' ? line.x - line.max / 2 : line.anchor === 'end' ? line.x - line.max : line.x
  return { left, top: line.y - line.size * 1.05, width: line.max, height: line.size * 1.4 }
}

/** 누른 자리(요소 안 좌표)의 인쇄 줄 번호. 없으면 -1. 작은 글자도 누를 수 있게 둘레를 조금 넓힌다. */
export function frameTextAt(photo, x, y) {
  return frameTextLines(photo).findIndex((line) => {
    const box = lineBox(line)
    const pad = Math.max(2, line.size * 0.25)
    return x >= box.left - pad && x <= box.left + box.width + pad && y >= box.top - pad && y <= box.top + box.height + pad
  })
}

const ALIGN = { start: 'left', middle: 'center', end: 'right' }

/** 칸마다 늘어나는 번호(필름 4컷)를 그 칸에서 고치면 첫 칸 번호로 되돌려 저장한다 (14A → 셋째 칸이면 12A) */
export function storedLineText(line, value) {
  const match = line.step ? /^(\d+)(.*)$/.exec(value) : null
  return match && Number(match[1]) >= line.step ? `${Number(match[1]) - line.step}${match[2]}` : value
}

/**
 * 틀에 인쇄된 글자를 그 자리에서 고친다 (티켓 · 인생네컷 · 필름 4컷 글자를 두 번 눌렀을 때).
 * 인쇄된 줄 위에 틀 색 바탕의 입력칸을 얹고, 고치는 대로 바로 틀에 반영한다 (되돌리기는 고치기 전으로 한 번).
 */
export default function FrameTextEditor({ object, line: index, zoom, dispatch, onClose, onReveal, visibleTop = 0 }) {
  const line = frameTextLines(object)[index]
  // 입력 중인 글자는 여기 둔다 (문서를 거쳐 다시 받으면 한글 조합이 끊긴다)
  const [draft, setDraft] = useState(() => (line ? lineText(line, frameTextOf(object.frame, object.frameText)) : ''))
  const input = useRef(null)
  const shown = useRef(false)
  useEffect(() => {
    dispatch({ type: 'checkpoint' })
    // autoFocus 만으로는 Android 에서 키보드가 안 뜰 때가 있어 텍스트 상자와 같은 방법으로 다시 요청한다
    const stop = startTextKeyboard({
      platform: Platform.OS, getInput: () => input.current, canFocus: () => true,
      isVisible: () => Boolean(Keyboard.isVisible?.() || shown.current),
      findNodeHandle, dispatchCommand: (tag, command, args) => UIManager.dispatchViewManagerCommand(tag, command, args),
    })
    // 키보드가 내려가도 끝내지 않는다 (Galaxy Tab 은 S Pen 손글씨 창 등으로 키보드가 잠깐 내려간다. 텍스트 상자와 같다).
    // 키보드가 입력칸을 가리면 그만큼 화면을 올린다.
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      shown.current = true
      const keyboardTop = event.endCoordinates?.screenY
      if (keyboardTop == null || !onReveal) return
      input.current?.measureInWindow?.((x, y, width, height) => {
        // 입력칸이 화면 위로 밀려 나가 적는 글자가 안 보이는 일이 없게, 작업창 위 끝 아래까지만 올린다
        // (visibleTop 은 편집 화면이 measureInWindow 로 잰 작업창 위 끝 + 8 이라 y 와 같은 화면 기준)
        const overlap = revealOverlap({ inputY: y, inputHeight: height, keyboardTop, visibleTop })
        if (overlap > 0) onReveal(overlap)
      })
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => { shown.current = false })
    return () => { stop(); show.remove(); hide.remove(); Keyboard.dismiss() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!line) return null
  const box = lineBox(line)
  const field = FRAME_TEXT[object.frame].fields.find((f) => f.key === line.field)
  const background = object.frame === 'filmstrip' ? STRIP_DEFAULT_COLOR : frameColorOf(object)
  const size = line.size * zoom
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.w * zoom,
        height: object.h * zoom,
        transform: [{ rotate: `${object.rotation ?? 0}deg` }],
      }}
    >
      {/* 틀에 인쇄되는 글자라 앱 UI 글꼴(Pretendard)을 넣지 않는다 */}
      <TextInput
        dioFont={false}
        allowFontScaling={false}
        ref={input}
        autoFocus
        selectTextOnFocus
        value={draft}
        onChangeText={(value) => {
          setDraft(value)
          dispatch({ type: 'updateObject', id: object.id, record: false, patch: { frameText: { ...object.frameText, [line.field]: storedLineText(line, value) } } })
        }}
        // 웹은 입력칸 밖을 누르면 포커스가 빠지므로 그때 끝낸다. 앱은 캔버스 터치 · 완료 · 뒤로 가기 · 선택 해제로 끝낸다
        onBlur={Platform.OS === 'web' ? onClose : undefined}
        onSubmitEditing={onClose}
        maxLength={40}
        accessibilityLabel={`${field?.name ?? ''} 글자`}
        style={[
          styles.input,
          {
            left: box.left * zoom,
            top: box.top * zoom,
            width: box.width * zoom,
            height: box.height * zoom,
            fontSize: size,
            fontWeight: line.weight ?? (line.mono ? '500' : '600'),
            fontFamily: line.mono ? MONO : undefined,
            letterSpacing: size * (line.spacing ?? 0.02),
            textAlign: ALIGN[line.anchor ?? 'start'],
            color: printColor(line.tone, object.frame, background),
            backgroundColor: background,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  input: {
    position: 'absolute',
    margin: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 2,
    // 고치는 줄이 어디인지 보이게 (틀 색과 상관없이). 웹 기본 포커스 윤곽은 끈다
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
    borderWidth: 1,
    borderColor: colors.primary,
    ...(Platform.OS === 'android' && { includeFontPadding: false, textAlignVertical: 'center' }),
  },
})
