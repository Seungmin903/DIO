import Svg, { Circle, G, Path } from 'react-native-svg';
import { APP_INK, textIconSpec } from './iconInk';
import EditorIcon from '../editor/components/controls/Icon';
import { colors } from './theme';

// 편집 화면에도 있는 아이콘은 편집 화면 모양으로 그린다 (휴지통·더하기·연필 등이 화면마다 달라 보이지 않게)
const EDITOR_ICONS = {
  text: 'text',
  crop: 'crop',
  scissors: 'scissors',
  folder: 'folder',
  people: 'people',
  share: 'userPlus', // 편집 화면 상단 바의 공유 버튼과 같은 모양
  bell: 'bell',
  add: 'plus',
  edit: 'edit',
  search: 'search',
  more: 'more',
  trash: 'trash',
  bin: 'trash', // 좌측 메뉴 휴지통도 삭제 버튼과 같은 모양
  undo: 'undo',
  grid: 'pages',
  swap: 'swap',
  'chevron-left': 'chevronLeft',
  'chevron-right': 'chevronRight',
  close: 'close',
  eye: 'eye',
  check: 'check',
  'eye-off': 'eyeOff',
  mail: 'mail',
  menu: 'menu',
  book: 'book',
  person: 'person',
  star: 'star',
  moon: 'moon',
  'arrow-up': 'up',
  'arrow-down': 'down',
  // 제작 화면(사진 오리기, 시트 분리, 내 폰트)이 쓰는 편집기 아이콘
  image: 'image',
  redo: 'redo',
  pen: 'pen',
  eraser: 'eraser',
  reset: 'reset',
  hand: 'hand',
  fit: 'fit',
  minus: 'minus',
  upload: 'upload',
};

const common = (color, strokeWidth) => ({
  fill: 'none',
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

/** 앱 전반에서 쓰는 선형 아이콘. 편집 화면에 없는 것(book-user·book-open·library·workshop)만 여기서 그린다 */
export default function AppIcon({ name, size = 24, color = colors.text, strokeWidth = 1.8, fill = 'none', forText }) {
  if (EDITOR_ICONS[name]) return <EditorIcon name={EDITOR_ICONS[name]} size={size} color={color} strokeWidth={strokeWidth} fill={fill} forText={forText} />;
  // forText: 글자 크기(px). 주면 그 글자와 같은 높이로 보이게 size · 선 굵기 · 세로 위치를 계산한다(디자인 가이드 "글자 옆 아이콘")
  const spec = forText ? textIconSpec(APP_INK, name, forText) : null;
  if (spec) { size = spec.size; strokeWidth = spec.strokeWidth; }
  const line = common(color, strokeWidth);

  let graphic = null;
  switch (name) {
    case 'book-user':
      // 사람이 든 책(공유된 다이어리). '내 다이어리'(book)와 같은 책 모양에 Lucide `book-user` (ISC) 의 선을 쓴다.
      graphic = <><Path {...line} d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" /><Path {...line} d="M15 13a3 3 0 1 0-6 0" /><Circle {...line} cx="12" cy="8" r="2" /></>;
      break;
    case 'book-open':
      // 펼친 책. Lucide `book-open` (ISC) 의 선을 그대로 쓴다.
      graphic = <><Path {...line} d="M12 7v14" /><Path {...line} d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></>;
      break;
    case 'library':
      // 책꽂이(전체 기록). Lucide `library` (ISC) 의 선을 그대로 쓴다.
      graphic = <><Path {...line} d="m16 6 4 14" /><Path {...line} d="M12 6v14" /><Path {...line} d="M8 8v12" /><Path {...line} d="M4 4v16" /></>;
      break;
    case 'workshop':
      // 팔레트. Lucide `palette` (ISC, https://github.com/lucide-icons/lucide) 의 선을 그대로 쓰고, 물감 점은 윤곽선 색으로 꽉 채운 원(선 굵기와 무관한 크기)으로 그린다.
      graphic = <><Path {...line} d="M12 22a1 1 0 0 1 0-20a10 9 0 0 1 10 9a5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><Circle fill={color} cx="13.5" cy="6.5" r="1.3" /><Circle fill={color} cx="17.5" cy="10.5" r="1.3" /><Circle fill={color} cx="6.5" cy="12.5" r="1.3" /><Circle fill={color} cx="8.5" cy="7.5" r="1.3" /></>;
      break;
    case 'camera':
      // 사진 바꾸기(프로필 수정의 `사진 변경`). 연필(프로필 전체 수정)과 뜻이 겹치지 않게 Lucide `camera` (ISC) 의 선을 그대로 쓴다.
      graphic = <><Path {...line} d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><Circle {...line} cx="12" cy="13" r="3" /></>;
      break;
    default:
      graphic = <Circle {...line} cx="12" cy="12" r="7" />;
  }

  return <Svg width={size} height={size} viewBox="0 0 24 24">{spec && Math.abs(spec.dy) > 0.05 ? <G transform={`translate(0 ${spec.dy})`}>{graphic}</G> : graphic}</Svg>;
}
