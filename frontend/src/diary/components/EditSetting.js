import { DRAWING_INPUTS, setDrawingInput, useDrawingInput } from '../../shared/drawingInput';
import { setPenDynamics, usePenDynamics } from '../../shared/penDynamics';
import SettingDropdown from './SettingDropdown';
import SettingRow, { ON_OFF, SettingSection } from './SettingRow';

/**
 * 내 공간 편집 설정: 캔버스에 무엇으로 그릴지(자동 · 펜만 · 펜 · 손가락), 펜이 필압과 기울기를 따를지. 기기에 저장된다(shared/drawingInput · shared/penDynamics).
 * 칩 셋은 폰 폭에 다 들어가지 않아 기록 알림 시각과 같은 값 고르기 행으로 고른다.
 */
export default function EditSetting({ compact = false }) {
  const input = useDrawingInput();
  const pen = usePenDynamics();
  return (
    <SettingSection title="편집" compact={compact}>
      <SettingDropdown label="그리기 입력" options={DRAWING_INPUTS} value={input} onChange={setDrawingInput} />
      <SettingRow label="필압" options={ON_OFF} value={pen.pressure ? 'on' : 'off'} onChange={value => setPenDynamics({ pressure: value === 'on' })} />
      <SettingRow label="기울기" options={ON_OFF} value={pen.tilt ? 'on' : 'off'} onChange={value => setPenDynamics({ tilt: value === 'on' })} />
    </SettingSection>
  );
}
