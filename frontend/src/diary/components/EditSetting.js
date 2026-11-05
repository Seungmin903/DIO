import { DRAWING_INPUTS, setDrawingInput, useDrawingInput } from '../../shared/drawingInput';
import { setPenDynamics, usePenDynamics } from '../../shared/penDynamics';
import SettingDropdown from './SettingDropdown';
import SettingRow, { ON_OFF, SettingSection } from './SettingRow';

/**
 * 내 공간 편집 설정: 캔버스에 무엇으로 그릴지(펜만 · 펜 · 손가락), 펜이 필압과 기울기를 따를지(한 줄로 함께 켜고 끈다). 기기에 저장된다(shared/drawingInput · shared/penDynamics).
 * 칩 셋은 폰 폭에 다 들어가지 않아 기록 알림 시각과 같은 값 고르기 행으로 고른다.
 */
export default function EditSetting({ compact = false }) {
  const input = useDrawingInput();
  const pen = usePenDynamics();
  return (
    <SettingSection title="편집" compact={compact}>
      <SettingDropdown label="그리기 입력" options={DRAWING_INPUTS} value={input} onChange={setDrawingInput} />
      <SettingRow label="펜 필압 및 기울기 반영" options={ON_OFF} value={pen.pressure || pen.tilt ? 'on' : 'off'} onChange={value => setPenDynamics({ pressure: value === 'on', tilt: value === 'on' })} />
    </SettingSection>
  );
}
