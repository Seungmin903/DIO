import { forwardRef, useContext } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput } from 'react-native';
import { FontScope, PageFontScaleScope } from '../fontScope';

// 앱 UI 글꼴(Pretendard). metro.config.cjs 가 src · App.js 의 react-native Text · TextInput 을 이 파일의 것으로 바꿔 끼운다
// (src/shared/dioText/dioReactNative.js). 글꼴을 직접 정한 글자와 KeepFont 구역(속지 · 특수 속지 · 캔버스 요소)은 건드리지 않는다.
// 굵기마다 다른 파일을 이름으로 고른다. 안드로이드는 직접 불러온 글꼴에 fontWeight 를 주면 가짜 굵기를 덧그리기 때문이다.
export const PRETENDARD = {
  400: 'Pretendard-Regular',
  500: 'Pretendard-Medium',
  600: 'Pretendard-SemiBold',
  700: 'Pretendard-Bold',
  800: 'Pretendard-ExtraBold',
};

const numeric = weight => (weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight) || 400);

/**
 * 굵기 단계(1020 감성 점검, B안): 제목만 굵게, 본문은 400~500, 작은 이름표는 500~600.
 * 화면마다 적어 둔 굵기(대부분 700 · 800)를 글자 크기에 따라 한 단계씩 낮춰 읽는다. 순서(더 굵은 것이 더 굵게)는 그대로 지킨다.
 * 20 이상(화면 · 구역 제목): 그대로(900 → 800). 16~19: 600 → 500 · 700 → 600 · 800↑ → 700. 16 미만: 600 · 700 → 500 · 800 → 600 · 900 → 700.
 */
export function uiWeight(weight, fontSize = 14) {
  const w = numeric(weight);
  if (w <= 400) return 400;
  if (w === 500) return 500;
  if (fontSize >= 20) return w >= 800 ? 800 : w >= 700 ? 700 : 600;
  if (fontSize >= 16) return w >= 800 ? 700 : w >= 700 ? 600 : 500;
  return w >= 900 ? 700 : w >= 800 ? 600 : 500;
}

/** 글꼴을 정하지 않은 글자 모양에 넣을 Pretendard 굵기 파일. 정한 글자면 null. */
export function dioFontStyle(style) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return null;
  return { fontFamily: PRETENDARD[uiWeight(flat.fontWeight, flat.fontSize)], fontWeight: 'normal' };
}

// 안쪽 글자는 바깥 글꼴을 이어받는다. 바깥이 'raw'(정해진 글꼴)면 안쪽은 손대지 않고,
// 'dio' 면 굵기를 따로 준 안쪽 글자만 그 굵기 파일로 바꾼다(굵기가 없으면 바깥 것을 그대로 이어받는다).
export const Text = forwardRef(function DioText({ dioFont = true, style, children, ...props }, ref) {
  const outer = useContext(FontScope);
  const pageText = useContext(PageFontScaleScope);
  const flat = StyleSheet.flatten(style) || {};
  const raw = !dioFont || outer === 'raw' || Boolean(flat.fontFamily);
  const font = !raw && !(outer === 'dio' && flat.fontWeight == null) ? dioFontStyle(flat) : null;
  return (
    <FontScope.Provider value={raw ? 'raw' : 'dio'}>
      <NativeText ref={ref} style={font ? [style, font] : style}
        {...(pageText ? { allowFontScaling: false } : dioFont && outer == null ? { maxFontSizeMultiplier: 1.3 } : {})}
        {...props}>{children}</NativeText>
    </FontScope.Provider>
  );
});

export const TextInput = forwardRef(function DioTextInput({ dioFont = true, style, ...props }, ref) {
  const outer = useContext(FontScope);
  const pageText = useContext(PageFontScaleScope);
  const font = dioFont && outer !== 'raw' ? dioFontStyle(style) : null;
  return <NativeTextInput ref={ref} style={font ? [style, font] : style}
    {...(pageText ? { allowFontScaling: false } : dioFont && outer == null ? { maxFontSizeMultiplier: 1.3 } : {})}
    {...props} />;
});
