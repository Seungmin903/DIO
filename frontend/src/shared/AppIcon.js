import Svg, { Circle, Line, Path } from 'react-native-svg';
import EditorIcon from '../editor/components/controls/Icon';
import { colors } from './theme';

// 편집 화면에도 있는 아이콘은 편집 화면 모양으로 그린다 (휴지통·더하기·연필 등이 화면마다 달라 보이지 않게)
const EDITOR_ICONS = {
  text: 'text',
  crop: 'crop',
  folder: 'folder',
  people: 'people',
  bell: 'bell',
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
  eye: 'eye',
  'eye-off': 'eyeOff',
};

const common = (color, strokeWidth) => ({
  fill: 'none',
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

/** 앱 전반에서 쓰는 선형 아이콘. 편집 화면에 없는 것(menu·book·person·star·workshop·check·moon)만 여기서 그린다 */
export default function AppIcon({ name, size = 24, color = colors.text, strokeWidth = 1.8, fill = 'none' }) {
  if (EDITOR_ICONS[name]) return <EditorIcon name={EDITOR_ICONS[name]} size={size} color={color} strokeWidth={strokeWidth} />;
  const line = common(color, strokeWidth);

  let graphic = null;
  switch (name) {
    case 'mail':
      graphic = <><Path {...line} d="M3 5h18v14H3z" /><Path {...line} d="m3 6 9 7 9-7" /></>;
      break;
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
    case 'arrow-up':
      graphic = <><Line {...line} x1="12" y1="19" x2="12" y2="5" /><Path {...line} d="m6 11 6-6 6 6" /></>;
      break;
    case 'arrow-down':
      graphic = <><Line {...line} x1="12" y1="5" x2="12" y2="19" /><Path {...line} d="m6 13 6 6 6-6" /></>;
      break;
    case 'workshop':
      // 팔레트. Lucide `palette` (ISC, https://github.com/lucide-icons/lucide) 의 선 · 점을 그대로 쓴다.
      graphic = <><Path {...line} d="M12 22a1 1 0 0 1 0-20a10 9 0 0 1 10 9a5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><Circle {...line} fill={color} cx="13.5" cy="6.5" r=".5" /><Circle {...line} fill={color} cx="17.5" cy="10.5" r=".5" /><Circle {...line} fill={color} cx="6.5" cy="12.5" r=".5" /><Circle {...line} fill={color} cx="8.5" cy="7.5" r=".5" /></>;
      break;
    case 'check':
      // 직선 두 획. 끝을 둥글리지 않고 모서리도 뾰족하게 둔다.
      graphic = <Path {...line} strokeLinecap="butt" strokeLinejoin="miter" d="M5 12.5 10 17.5 19 7.5" />;
      break;
    case 'moon':
      graphic = <Path {...line} d="M18.7 15.1A7.5 7.5 0 0 1 8.9 5.3 7.5 7.5 0 1 0 18.7 15.1Z" />;
      break;
    default:
      graphic = <Circle {...line} cx="12" cy="12" r="7" />;
  }

  return <Svg width={size} height={size} viewBox="0 0 24 24">{graphic}</Svg>;
}
