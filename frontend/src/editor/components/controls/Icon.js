import Svg, { G, Path } from 'react-native-svg'
import { colors } from '../../../shared/theme'

// 24x24 라인 아이콘 (목업 아이콘 세트 기준)
const PATHS = {
  panel: 'M4 4h16v16H4z M9 4v16',
  home: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  // 화살표 끝(왼쪽 위)과 몸통이 대각선 위에 오도록 24칸 가운데에 맞춘 커서
  cursor: 'M5 5l14.5 6-6.2 1.9L11.4 19z',
  // 올가미: 점선 고리(DASHED_PARTS) + 매듭 + 늘어진 끈 (Lucide lasso 모양 참고, ISC)
  lasso: 'M7 22a5 5 0 0 1-2-4 M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  pen: 'M4 20l4.2-1 11-11a2.1 2.1 0 0 0-3-3l-11 11z M14.5 6.5l3 3',
  // 형광펜: 펜과 같은 몸통에 납작한 촉·촉 띠, 지우개처럼 바닥 줄이 이어진다 (Tabler highlight 모양 참고, MIT)
  highlighter: 'M3 19h17 M7 19l10.5-10.5a2.83 2.83 0 1 0-4-4L3 15v4 M12.5 5.5l4 4 M4.5 13.5l4 4',
  eraser: 'M8 20h12 M4.6 14.6l9-9a2 2 0 0 1 2.8 0l2.8 2.8a2 2 0 0 1 0 2.8L11 19.4H8.4z M9 10l5 5',
  text: 'M5 7V5h14v2 M12 5v14 M9 19h6',
  textLarger: 'M3 19L8 5l5 14 M5 14h6 M18 7v8 M14 11h8',
  textSmaller: 'M3 19L8 5l5 14 M5 14h6 M15 11h7',
  sticker: 'M12 21a9 9 0 1 1 9-9v.5L12.5 21z M12.5 21v-4.5a4 4 0 0 1 4-4H21 M8.5 14.5s1.2 1.5 3.5 1.5 M9 9.5h.01 M15 9.5h.01',
  // 테이프 롤 + 풀려 나온 테이프 (끝은 절취선)
  // 스티커 동그라미(반지름 9)와 같은 크기로 보이게 롤을 반지름 8 로 키우고 전체를 2~22 칸에 맞춤
  tape: 'M2 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M7.2 12a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0 M16.6 16.5H22l-1 .875 1 .875-1 .875 1 .875H10',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2.5-2.5L20 17 M15 9.5h.01',
  grid: 'M4 4h16v16H4z M4 9h16 M4 14h16 M9 4v16 M14 4v16',
  link: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2 M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2',
  layers: 'M3 7l9-5 9 5-9 5-9-5z M3 12l9 5 9-5 M3 17l9 5 9-5',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3',
  rotate: 'M10 4a8 8 0 0 0 0 16 M10 16v4H6 M14 20a8 8 0 0 0 0-16 M14 8V4h4',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  share: 'M4 13v6h16v-6 M12 3v12 M7 8l5-5 5 5',
  copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14 M2 6h14a2 2 0 0 1 2 2v14',
  flip: 'M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 7.6-1.8',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.6 M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  check: 'M5 12l5 5 9-10',
  group: 'M3 3h8v8H3z M13 13h8v8h-8z M11 7h4a2 2 0 0 1 2 2v4',
  focus: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  fit: 'M9 4H4v5 M15 4h5v5 M9 20H4v-5 M15 20h5v-5 M8 8h8v8H8z',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7 M4 4v5h5',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  bookmark: 'M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z',
  swap: 'M4 8h14 M14 4l4 4-4 4 M20 16H6 M10 12l-4 4 4 4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z',
  chevronDown: 'M6 9l6 6 6-6',
  toFront: 'M12 20V9 M7 13.5l5-5 5 5 M5 4.5h14',
  forward: 'M12 19V6 M7 11l5-5 5 5',
  backward: 'M12 5v13 M7 13l5 5 5-5',
  toBack: 'M12 4v11 M7 10.5l5 5 5-5 M5 19.5h14',
  // 이름 바꾸기: 끝이 왼쪽 아래를 향한 단순한 연필
  edit: 'M4 20l1.2-4.2L15.5 5.5l3 3L8.2 18.8z M13.5 7.5l3 3',
  saved: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8.5 12.2l2.4 2.4 4.6-5',
  saving: 'M12 3a9 9 0 1 0 9 9 M12 7v5l3 2',
  alert: 'M12 3l9.5 17h-19z M12 10v4.5 M12 17.5h.01',
  // 손바닥(화면 이동): 손가락 폭을 좁혀 다른 아이콘과 비슷한 폭(약 15)으로
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12 M11 11.5V4.5a1.5 1.5 0 0 1 3 0V12 M14 12V6a1.5 1.5 0 0 1 3 0v6.5 M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a5.5 5.5 0 0 1-4.3-2l-3-3.6a1.5 1.5 0 0 1 2.3-1.9L8 15',
  // 동그라미 안 물음표 (Lucide circle-help 모양 참고, ISC)
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01',
  // 액자: 바깥 틀 + 안쪽 사진 자리
  frame: 'M4 4h16v16H4z M7.5 7.5h9v9h-9z',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
}

const DOT_ICONS = new Set(['grip', 'more'])
// 툴바에서 위아래 높이·가운데를 맞추는 보정 (대부분 아이콘은 세로 4~20, 가운데 12)
// 올가미는 세로 2~22 로 커서 줄이고, 형광펜은 가로로, 지우개는 세로로 조금 치우쳐 있어 가운데로 옮긴다.
// 크기 보정(scale)은 선 굵기가 같아 보이도록 SCALE 로 나눠 준다.
const SCALE = { lasso: 0.84, cursor: 1.1 }
const FIT = {
  lasso: 'translate(12 12) scale(0.84) translate(-12 -12)',
  // 테두리만 있는 화살표는 같은 칸에서 작아 보여 조금 키운다
  cursor: 'translate(12 12) scale(1.1) translate(-12.25 -12)',
  highlighter: 'translate(0 0.6)', // 세로 3.7~19 → 가운데 12
  eraser: 'translate(0 -0.6)',
}
// 점선으로 그리는 부분 (같은 아이콘의 실선 path 와 겹쳐 그린다)
const DASHED_PARTS = { lasso: 'M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1' }

export default function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.8 }) {
  // 줄여 그린 아이콘도 선 굵기는 같게
  const width = strokeWidth / (SCALE[name] ?? 1)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform={FIT[name]}>
      {DASHED_PARTS[name] && (
        <Path d={DASHED_PARTS[name]} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray="3 2.6" />
      )}
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={DOT_ICONS.has(name) ? 3 : width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      </G>
    </Svg>
  )
}
