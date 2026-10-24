import Svg, { Circle, Line, Path } from 'react-native-svg';
import EditorIcon from '../editor/components/controls/Icon';
import { colors } from './theme';

// 편집 화면에도 있는 아이콘은 편집 화면 모양으로 그린다 (휴지통·더하기·연필 등이 화면마다 달라 보이지 않게)
const EDITOR_ICONS = {
  add: 'plus',
  edit: 'edit',
  search: 'search',
  more: 'more',
  trash: 'trash',
  grid: 'pages',
  swap: 'swap',
  'chevron-left': 'chevronLeft',
  'chevron-right': 'chevronRight',
  close: 'close',
};

const common = (color, strokeWidth) => ({
  fill: 'none',
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

/** 앱 전반에서 쓰는 선형 아이콘. 편집 화면에 없는 것(menu·book·person·star·moon)만 여기서 그린다 */
export default function AppIcon({ name, size = 24, color = colors.text, strokeWidth = 1.8, fill = 'none' }) {
  if (EDITOR_ICONS[name]) return <EditorIcon name={EDITOR_ICONS[name]} size={size} color={color} strokeWidth={strokeWidth} />;
  const line = common(color, strokeWidth);

  let graphic = null;
  switch (name) {
    case 'menu':
      graphic = <><Line {...line} x1="4" y1="7" x2="20" y2="7" /><Line {...line} x1="4" y1="12" x2="20" y2="12" /><Line {...line} x1="4" y1="17" x2="20" y2="17" /></>;
      break;
    case 'book':
      graphic = <><Path {...line} d="M6 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v13H7.5A1.5 1.5 0 0 0 6 20.5v-16Z" /><Path {...line} d="M6 4.5v16" /><Line {...line} x1="9" y1="8" x2="15" y2="8" /></>;
      break;
    case 'person':
      graphic = <><Circle {...line} cx="12" cy="8" r="3.2" /><Path {...line} d="M5.5 20c.6-3.6 3.1-5.6 6.5-5.6s5.9 2 6.5 5.6" /></>;
      break;
    case 'star':
      graphic = <Path {...line} fill={fill} d="m12 3.8 2.48 5.02 5.54.81-4.01 3.91.95 5.52L12 16.43l-4.96 2.61.95-5.52-4.01-3.91 5.54-.81L12 3.8Z" />;
      break;
    case 'moon':
      graphic = <Path {...line} d="M18.7 15.1A7.5 7.5 0 0 1 8.9 5.3 7.5 7.5 0 1 0 18.7 15.1Z" />;
      break;
    default:
      graphic = <Circle {...line} cx="12" cy="12" r="7" />;
  }

  return <Svg width={size} height={size} viewBox="0 0 24 24">{graphic}</Svg>;
}
