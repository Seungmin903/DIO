import { DRAWING_INPUTS, setDrawingInput, useDrawingInput } from '../../shared/drawingInput';
import SettingDropdown from './SettingDropdown';
import { SettingSection } from './SettingRow';

/**
 * 내 공간 편집 설정: 캔버스에 무엇으로 그릴지(자동 · 펜만 · 펜 · 손가락). 기기에 저장된다(shared/drawingInput).
 * 칩 셋은 폰 폭에 다 들어가지 않아 기록 알림 시각과 같은 값 고르기 행으로 고른다.
 */
export default function EditSetting({ compact = false }) {
  const input = useDrawingInput();
  return (
    <SettingSection title="편집" compact={compact}>
      <SettingDropdown label="그리기 입력" options={DRAWING_INPUTS} value={input} onChange={setDrawingInput} />
    </SettingSection>
  );
}
