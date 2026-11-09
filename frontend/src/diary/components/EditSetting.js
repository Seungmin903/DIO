import { DRAWING_INPUTS, setDrawingInput, useDrawingInput } from '../../shared/drawingInput';
import { setPenDynamics, usePenDynamics } from '../../shared/penDynamics';
import { confirmAction, notify } from '../../shared/dialogs';
import { useFontShareConsent } from '../../handwriting/fontShareConsent';
import SettingDropdown from './SettingDropdown';
import SettingRow, { ON_OFF, SettingSection } from './SettingRow';

/**
 * 내 공간 편집 설정: 캔버스에 무엇으로 그릴지(펜만 · 펜 · 손가락), 펜이 필압과 기울기를 따를지(한 줄로 함께 켜고 끈다). 기기에 저장된다(shared/drawingInput · shared/penDynamics).
 * 칩 셋은 폰 폭에 다 들어가지 않아 기록 알림 시각과 같은 값 고르기 행으로 고른다.
 * accountId 가 있으면(회원) 공유 다이어리에 내 손글씨 폰트를 올려 공유할지도 고른다(처음 공유할 때 한 번 묻고, 여기서 바꾼다).
 */
export default function EditSetting({ compact = false, accountId = null }) {
  const input = useDrawingInput();
  const pen = usePenDynamics();
  return (
    <SettingSection title="편집" compact={compact}>
      <SettingDropdown label="그리기 입력" options={DRAWING_INPUTS} value={input} onChange={setDrawingInput} />
      <SettingRow label="펜 필압 및 기울기 반영" options={ON_OFF} value={pen.pressure || pen.tilt ? 'on' : 'off'} onChange={value => setPenDynamics({ pressure: value === 'on', tilt: value === 'on' })} />
      {accountId ? <FontShareRow accountId={accountId} /> : null}
    </SettingSection>
  );
}

const saveFailed = () => notify('설정을 저장하지 못했어요', '잠시 후 다시 시도해 주세요.');

function FontShareRow({ accountId }) {
  const consent = useFontShareConsent(accountId);
  const change = value => {
    if (value === 'on') { consent.set('granted').catch(saveFailed); return; }
    // 끄면 앞으로 쓰는 글의 폰트만 올리지 않는다. 이미 공유한 다이어리에서는 그대로 보인다
    confirmAction({ title: '내 폰트 공유를 끌까요?', message: '앞으로 공유 다이어리에 내 폰트를 올리지 않아요. 이미 공유한 다이어리에서는 그대로 보여요.',
      confirmLabel: '끄기', danger: false, onConfirm: () => consent.set('denied').catch(saveFailed) });
  };
  return <SettingRow label="공유 다이어리에 내 폰트 공유" options={ON_OFF} value={consent.value === 'granted' ? 'on' : 'off'} onChange={change} />;
}
