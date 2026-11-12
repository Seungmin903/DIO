import { Platform, Pressable, Text, View } from 'react-native';
import Icon from '../editor/components/controls/Icon';
import { colors } from '../shared/theme';
import { marketingDocuments } from '../shared/legalDocuments';
import { authStyles as s } from './styles';

const REQUIRED = [
  { id: 'service', label: '[필수] 이용약관 동의' },
  { id: 'privacy', label: '[필수] 개인정보 수집·이용 동의' },
];

// Optional choices are recorded separately through the existing agreements API.
export default function SignupTerms({ terms, onChange, onView, disabled }) {
  const all = REQUIRED.every(item => terms[item.id]);
  return (
    <View style={s.consentSection}>
      <Text accessibilityRole="header" style={s.consentTitle}>약관 및 개인정보</Text>
      <View style={s.consentRequired}>
        <Agreement label="필수 항목 전체 동의" checked={all} disabled={disabled}
          onPress={() => onChange({ ...terms, service: !all, privacy: !all, marketing: false })} />
        <View style={s.consentDivider} />
        {REQUIRED.map(item => (
          <View key={item.id} style={s.termRow}>
            <Agreement label={item.label} checked={!!terms[item.id]} disabled={disabled}
              onPress={() => onChange({ ...terms, [item.id]: !terms[item.id] })} />
            <ViewButton label={item.label} disabled={disabled} onPress={() => onView(item.id, item.label)} />
          </View>
        ))}
      </View>
      <DocumentRow label="개인정보 처리방침" accessibilityLabel="개인정보 처리방침 보기"
        disabled={disabled} onPress={() => onView('policy', '개인정보 처리방침')} />
      <View style={s.consentDivider} />
      <Text accessibilityRole="header" style={s.consentTitle}>마케팅 수신 동의 (선택)</Text>
      <View style={s.consentRequired}>
        {marketingDocuments.map(item => (
          <View key={item.id} style={s.termRow}>
            <Agreement label={`[선택] ${item.label}`} checked={!!terms[item.id]} disabled={disabled}
              onPress={() => onChange({ ...terms, [item.id]: !terms[item.id] })} />
            <ViewButton label={item.label} disabled={disabled} onPress={() => onView(item.id, item.label)} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Agreement({ label, checked, onPress, disabled }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      {...(Platform.OS === 'web' ? { 'aria-checked': checked, 'aria-disabled': !!disabled } : {})}
      disabled={disabled} onPress={onPress} style={s.termButton}>
      <View style={[s.checkbox, checked && s.checked]}>
        {checked && <Icon name="check" size={14} color={colors.surface} />}
      </View>
      <Text style={s.termText}>{label}</Text>
    </Pressable>
  );
}

function ViewButton({ label, onPress, disabled }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} 내용 보기`}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={s.termView}>
      <Text style={s.consentViewText}>보기</Text>
    </Pressable>
  );
}

function DocumentRow({ label, accessibilityLabel = `${label} 내용 보기`, onPress, disabled }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={s.consentDocument}>
      <Text style={s.consentDocumentText}>{label}</Text>
      <Text style={s.consentViewText}>보기</Text>
    </Pressable>
  );
}
