import { setDeskMode, useDeskMode } from '../utils/deskTimeStore';
import SettingRow, { ON_OFF, SettingSection } from './SettingRow';

/**
 * 내 공간 환경 설정: 홈 책상이 실시간 빛을 따를지(켬), 조명 없이 둘지(끔, 표지에도 조명 효과를 얹지 않는다). 기기에 저장된다.
 * 다른 설정 줄과 같은 스위치 한 줄: 켬 = 실시간(auto), 끔 = 조명 없음(off).
 */
export default function DeskLightSetting({ compact = false }) {
  const mode = useDeskMode();
  return (
    <SettingSection title="환경 설정" compact={compact}>
      <SettingRow label="홈 책상 실시간 조명" options={ON_OFF} value={mode === 'auto' ? 'on' : 'off'} onChange={id => setDeskMode(id === 'on' ? 'auto' : 'off')} />
    </SettingSection>
  );
}
