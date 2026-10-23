import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import EditorIcon from '../editor/components/controls/Icon';

// 편집 화면에도 있는 아이콘은 편집 화면 모양으로 그린다 (휴지통·더하기·연필 등이 화면마다 달라 보이지 않게)
const EDITOR_ICONS = {
  add: 'plus',
  edit: 'edit',
  search: 'search',
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

/** 앱 전반에서 쓰는 기기 독립적 선형 아이콘 */
export default function AppIcon({ name, size = 24, color = '#0B1957', strokeWidth = 1.9, fill = 'none' }) {
  if (EDITOR_ICONS[name]) return <EditorIcon name={EDITOR_ICONS[name]} size={size} color={color} strokeWidth={strokeWidth} />;
  const line = common(color, strokeWidth);

  let graphic = null;
  switch (name) {
    case 'menu':
      graphic = <><Line {...line} x1="4" y1="7" x2="20" y2="7" /><Line {...line} x1="4" y1="12" x2="20" y2="12" /><Line {...line} x1="4" y1="17" x2="20" y2="17" /></>;
      break;
    case 'add':
      graphic = <><Line {...line} x1="12" y1="5" x2="12" y2="19" /><Line {...line} x1="5" y1="12" x2="19" y2="12" /></>;
      break;
    case 'edit':
      graphic = <><Path {...line} d="m5 19 3.7-.8L19 7.9a2.1 2.1 0 0 0-3-3L5.8 15.2 5 19Z" /><Line {...line} x1="13.9" y1="7" x2="17" y2="10.1" /></>;
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
    case 'search':
      graphic = <><Circle {...line} cx="10.6" cy="10.6" r="5.7" /><Line {...line} x1="15" y1="15" x2="20" y2="20" /></>;
      break;
    case 'trash':
      graphic = <><Path {...line} d="M5.5 7.5h13" /><Path {...line} d="M9 7.5V5.3c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v2.2" /><Path {...line} d="M7.4 7.5 8.2 20h7.6l.8-12.5" /><Line {...line} x1="10" y1="11" x2="10" y2="16.5" /><Line {...line} x1="14" y1="11" x2="14" y2="16.5" /></>;
      break;
    case 'moon':
      graphic = <Path {...line} d="M18.7 15.1A7.5 7.5 0 0 1 8.9 5.3 7.5 7.5 0 1 0 18.7 15.1Z" />;
      break;
    case 'grid':
      graphic = <><Rect {...line} x="4.5" y="4.5" width="6" height="6" rx="1" /><Rect {...line} x="13.5" y="4.5" width="6" height="6" rx="1" /><Rect {...line} x="4.5" y="13.5" width="6" height="6" rx="1" /><Rect {...line} x="13.5" y="13.5" width="6" height="6" rx="1" /></>;
      break;
    case 'swap':
      graphic = <><Path {...line} d="M5 8h12" /><Polyline {...line} points="14,5 17,8 14,11" /><Path {...line} d="M19 16H7" /><Polyline {...line} points="10,13 7,16 10,19" /></>;
      break;
    case 'chevron-left':
      graphic = <Polyline {...line} points="14.5,5 7.5,12 14.5,19" />;
      break;
    case 'chevron-right':
      graphic = <Polyline {...line} points="9.5,5 16.5,12 9.5,19" />;
      break;
    case 'close':
      graphic = <><Line {...line} x1="6" y1="6" x2="18" y2="18" /><Line {...line} x1="18" y1="6" x2="6" y2="18" /></>;
      break;
    default:
      graphic = <Circle {...line} cx="12" cy="12" r="7" />;
  }

  return <Svg width={size} height={size} viewBox="0 0 24 24">{graphic}</Svg>;
}
