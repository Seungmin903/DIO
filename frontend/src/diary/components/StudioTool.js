import { StyleSheet } from 'react-native';
import DioButton from '../../shared/DioButton';

// 공방의 만들기 도구 버튼(내 폰트 만들기 · 스티커 시트 분리 · 사진 속 대상 오리기). 도구함 안에 버튼으로 놓인다.
// 만들기 도구는 모두 같은 급의 시작 동작이라 채움(filled) 하나로 통일한다(코덱스 2026-11-01). 쓸 수 없으면 흐리게만 둔다(준비 중 칩 없음: 준비 중인 기능은 출시 때 화면에서 뺀다).
// description 은 화면에 쓰지 않고 화면 읽기 프로그램에만 알린다(안내 문구를 늘리지 않는다).
// block: 폰에서 제목 아래 한 줄씩 전폭으로 쌓는다(두 버튼이 한 줄로 이어져 화면 밖으로 잘리던 것)
export default function StudioTool({ icon, title, description, disabled = false, block = false, onPress }) {
  return <DioButton variant="filled" label={title} icon={icon} disabled={disabled} block={block} onPress={onPress}
    hint={description} style={block ? null : local.small} />;
}

// 제목줄 오른쪽에 놓이는 40 높이 버튼(코덱스 10번). 폰의 전폭 버튼은 기본 높이 48
const local = StyleSheet.create({ small: { minHeight: 40 } });
