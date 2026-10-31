import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../shared/theme';

/**
 * 휴지통 남은 기간 고리: 보관 기간(30일) 대비 남은 비율만큼 채운다. 장식이 아니라 글자("n일 후 영구 삭제")를 보강하는 그림이라
 * 접근성 트리에서는 숨기고 색(금색)만으로 의미를 전하지 않는다.
 */
export default function ProgressRing({ ratio, size = 12, stroke = 2, color = colors.butterStrong, track = 'rgba(11,23,102,0.16)' }) {
  const value = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
      {value > 0 && <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${length * value} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </Svg>
  );
}
