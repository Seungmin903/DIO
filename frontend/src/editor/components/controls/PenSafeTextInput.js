import { forwardRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native'

// 글자 모양 속성은 Text 로, 나머지(크기·여백·테두리)는 누르는 상자로 나눈다.
const TEXT_KEYS = ['color', 'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'letterSpacing', 'lineHeight', 'textAlign']

/**
 * 탭해야 입력창이 되는 TextInput.
 * Galaxy Tab 의 S Pen 손글씨 입력(Android 손글씨 입력·iPad Scribble 도 같다)은 펜이 입력창 근처에서 움직이기만 해도
 * 입력창을 눌린 것처럼 만든다. 평소에는 글자만 보여 주고, 눌렀을 때만 진짜 입력창을 띄워 포커스를 준다.
 * 웹에서는 그냥 TextInput 이다.
 */
const PenSafeTextInput = forwardRef(function PenSafeTextInput(props, ref) {
  const [editing, setEditing] = useState(false)
  if (Platform.OS === 'web' || editing) {
    return (
      <TextInput
        ref={ref}
        {...props}
        autoFocus={Platform.OS === 'web' ? props.autoFocus : true}
        onBlur={(event) => {
          setEditing(false)
          props.onBlur?.(event)
        }}
      />
    )
  }
  const flat = StyleSheet.flatten(props.style) ?? {}
  const textStyle = {}
  const boxStyle = {}
  for (const [key, value] of Object.entries(flat)) (TEXT_KEYS.includes(key) ? textStyle : boxStyle)[key] = value
  const empty = props.value == null || props.value === ''
  return (
    <Pressable
      onPress={() => setEditing(true)}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      style={[boxStyle, styles.box]}
    >
      <Text numberOfLines={1} style={[textStyle, empty && { color: props.placeholderTextColor ?? textStyle.color }]}>
        {empty ? props.placeholder ?? '' : props.value}
      </Text>
    </Pressable>
  )
})

export default PenSafeTextInput

const styles = StyleSheet.create({
  box: { justifyContent: 'center' },
})
