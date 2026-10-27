import { useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';

// 키보드 표시 후 포커스된 입력칸의 현재 좌표를 다시 측정한다.
export function useProfileKeyboard() {
  const scroll = useRef(null),
    focused = useRef(null),
    offset = useRef(0),
    top = useRef(Infinity);
  const timer = useRef(null),
    alive = useRef(true);
  const reveal = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const input = focused.current;
      if (!alive.current || !input || Platform.OS === 'web') return;
      scroll.current?.measureInWindow((sx, sy, sw, sh) =>
        input.measureInWindow?.((x, y, w, h) => {
          if (!alive.current || input !== focused.current || !h) return;
          const start = sy + 16,
            end = Math.min(sy + sh, top.current) - 16;
          if (end <= start) return;
          const delta = y + h > end ? y + h - end : y < start ? y - start : 0;
          if (delta)
            scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
        }),
      );
    }, 80);
  };
  const dismiss = () => {
    focused.current = null;
    clearTimeout(timer.current);
    Keyboard.dismiss();
  };
  useEffect(() => {
    alive.current = true;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      top.current = event.endCoordinates.screenY;
      reveal();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      top.current = Infinity;
    });
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      show.remove();
      hide.remove();
    };
  }, []);
  return {
    scroll,
    reveal,
    dismiss,
    focus: (input) => {
      focused.current = input;
      reveal();
    },
    blur: (input) => {
      if (focused.current === input) focused.current = null;
    },
    onScroll: (event) => {
      offset.current = event.nativeEvent.contentOffset.y;
    },
  };
}
