import { StyleSheet } from 'react-native';
import DioButton from '../../shared/DioButton';

// 공방의 만들기 도구 버튼(내 폰트 만들기 · 스티커 시트 분리 · 사진 속 대상 오리기). 도구함 안에 버튼으로 놓인다.
// variant: 'filled'(그 화면의 주 동작, 하나만) | 'tonal'. state: 한 단어 상태('준비 중' · '미리보기')를 버튼 안 버터 칩으로 보인다.
// description 은 화면에 쓰지 않고 화면 읽기 프로그램에만 알린다(안내 문구를 늘리지 않는다).
export default function StudioTool({ icon, title, description, state = null, variant = 'tonal', disabled = false, onPress }) {
  return <DioButton variant={variant} label={title} icon={icon} badge={state} disabled={disabled} onPress={onPress}
    hint={state ? `${state}, ${description}` : description} style={local.small} />;
}

// 제목줄 오른쪽에 놓이는 40 높이 버튼(코덱스 10번)
const local = StyleSheet.create({ small: { minHeight: 40 } });
