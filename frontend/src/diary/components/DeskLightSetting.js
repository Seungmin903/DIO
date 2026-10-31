import { View } from 'react-native';
import { setDeskMode, useDeskMode } from '../utils/deskTimeStore';
import SettingRow, { SettingTitle } from './SettingRow';

const OPTIONS = [
  { id: 'auto', label: '실시간' },
  { id: 'off', label: '조명 없음' },
];

/**
 * 내 공간 환경 설정: 홈 책상이 실시간 빛을 따를지, 조명 없이 둘지(표지에도 조명 효과를 얹지 않는다). 기기에 저장된다.
 * 카드 없이 제목 + 한 줄(SettingRow): 왼쪽 이름 · 오른쪽 2분절 선택.
 */
export default function DeskLightSetting() {
  const mode = useDeskMode();
  return (
    <View>
      <SettingTitle>환경 설정</SettingTitle>
      <SettingRow label="홈 책상 빛" options={OPTIONS} value={mode} onChange={setDeskMode} />
    </View>
  );
}
