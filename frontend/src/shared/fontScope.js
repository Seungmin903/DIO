import { createContext, createElement } from 'react';

// 글자 글꼴 구역. 'dio' = 바깥 글자가 앱 UI 글꼴(Pretendard), 'raw' = 정해진 글꼴을 그대로 써야 하는 구역.
// 속지 · 특수 속지(날짜 · 플래너 · 디데이 등) · 캔버스 요소는 KeepFont 안에서 그려 Pretendard 를 넣지 않는다(DioText).
export const FontScope = createContext(null);
// 속지·캔버스의 좌표에 맞춘 글자만 시스템 글자 크기에서 제외한다.
export const PageFontScaleScope = createContext(false);

/** 안쪽 글자는 앱 UI 글꼴로 바꾸지 않는다(속지 · 페이지 그림 · 사용자 글자). */
export function KeepFont({ children }) {
  return createElement(FontScope.Provider, { value: 'raw' },
    createElement(PageFontScaleScope.Provider, { value: true }, children));
}
