import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { COLORS } from '../constants';
import { styles as s } from '../styles';
import Cover from '../components/Cover';
import Header from '../components/Header';
import IconButton from '../components/IconButton';

export default function DiaryFormScreen({ editing, title, color, error, onTitleChange, onColorChange, onSave, onCancel }) {
  const preview = { title: title || '새 다이어리', color };
  return (
    <ScrollView contentContainerStyle={s.formScreen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Header
        eyebrow={editing ? 'UPDATE COVER' : 'CREATE A NEW DIARY'}
        title={editing ? '표지 수정' : '새 다이어리 만들기'}
        right={<IconButton label="취소" icon="×" onPress={onCancel} />}
      />
      <View style={s.formContent}>
        <View style={s.previewArea}>
          <View style={s.previewGlow} />
          <Cover diary={preview} preview />
          <Text style={s.previewNote}>제목과 색상은 나중에도 바꿀 수 있어요.</Text>
        </View>
        <View style={s.formPanel}>
          <Text style={s.formEyebrow}>BASIC COVER</Text>
          <Text style={s.formHeading}>기본 표지를 정해 주세요</Text>
          <Text style={s.formLabel}>다이어리 이름</Text>
          <TextInput
            accessibilityLabel="다이어리 이름"
            value={title}
            onChangeText={onTitleChange}
            placeholder="예: 2026 봄의 기록"
            placeholderTextColor="#98A4BB"
            maxLength={24}
            style={[s.field, error && s.fieldError]}
          />
          <View style={s.helperRow}>
            <Text style={error ? s.error : s.helper}>{error || '24자 이내로 입력해 주세요.'}</Text>
            <Text style={s.helper}>{title.length}/24</Text>
          </View>
          <Text style={[s.formLabel, s.colorLabel]}>표지 색상</Text>
          <View style={s.colors}>
            {COLORS.map((choice) => (
              <Pressable
                key={choice.label}
                accessibilityRole="radio"
                accessibilityLabel={`${choice.label} 표지 색상`}
                accessibilityState={{ selected: color === choice.value }}
                onPress={() => onColorChange(choice.value)}
                style={({ pressed }) => [s.colorChoice, color === choice.value && s.colorSelected, pressed && s.pressed]}
              >
                <View style={[s.colorDot, { backgroundColor: choice.value }]} />
                <Text style={s.colorName}>{choice.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.formDivider} />
          <Text style={s.formTip}>공유는 다이어리를 만든 뒤 상세 화면에서 초대할 수 있어요.</Text>
          <Pressable accessibilityRole="button" onPress={onSave} style={({ pressed }) => [s.primary, pressed && s.pressed]}>
            <Text style={s.primaryText}>{editing ? '표지 저장하기' : '다이어리 만들기'}</Text>
            <Text style={s.primaryArrow}>→</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
