import { Pressable, Text, TextInput, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { COLORS } from '../constants';
import { styles as s } from '../styles';

export default function DiaryCreateModal({ editing, title, color, error, onTitleChange, onColorChange, onSave, onDelete, onCancel }) {
  const actionLabel = editing ? '완료하기' : '다이어리 만들기';
  return (
    <View accessibilityViewIsModal style={s.createOverlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} 닫기`}
        onPress={onCancel}
        style={s.createBackdrop}
      />
      <View style={s.createDialog}>
        <View style={s.createDialogHeader}>
          <View>
            <Text style={s.createDialogEyebrow}>{editing ? 'EDIT DIARY' : 'NEW DIARY'}</Text>
            <Text style={s.createDialogTitle}>{editing ? '다이어리 수정' : '새 다이어리 추가'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} 닫기`}
            onPress={onCancel}
            style={({ pressed }) => [s.createClose, pressed && s.pressed]}
          >
            <AppIcon name="close" size={20} color="#0B1957" />
          </Pressable>
        </View>

        <Text style={s.createLabel}>다이어리 이름</Text>
        <TextInput
          accessibilityLabel="다이어리 이름"
          value={title}
          onChangeText={onTitleChange}
          placeholder="예: 2026 봄의 기록"
          placeholderTextColor="#98A4BB"
          maxLength={24}
          style={[s.createField, error && s.fieldError]}
        />
        <View style={s.createHelperRow}>
          <Text style={error ? s.error : s.helper}>{error || '24자 이내로 입력해 주세요.'}</Text>
          <Text style={s.helper}>{title.length}/24</Text>
        </View>

        <Text style={s.createLabel}>표지 색상</Text>
        <View style={s.createColors}>
          {COLORS.map((choice) => (
            <Pressable
              key={choice.label}
              accessibilityRole="radio"
              accessibilityLabel={`${choice.label} 표지 색상`}
              accessibilityState={{ selected: color === choice.value }}
              onPress={() => onColorChange(choice.value)}
              style={({ pressed }) => [
                s.createColorChoice,
                color === choice.value && s.createColorSelected,
                pressed && s.pressed,
              ]}
            >
              <View style={[s.createColorDot, { backgroundColor: choice.value }]} />
              <Text style={s.createColorName}>{choice.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.createDivider} />
        <Text style={s.createTip}>{editing ? '이름과 표지 색상은 언제든 다시 바꿀 수 있어요.' : '생성하면 바로 다이어리를 꾸미고 기록할 수 있어요.'}</Text>
        {editing && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다이어리 삭제"
            onPress={onDelete}
            style={({ pressed }) => [s.createDelete, pressed && s.pressed]}
          >
            <AppIcon name="trash" size={17} color="#BD5B58" />
            <Text style={s.createDeleteText}>다이어리 삭제</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onSave}
          style={({ pressed }) => [s.createSubmit, pressed && s.pressed]}
        >
          <View style={s.createSubmitMark}>
            <AppIcon name={editing ? 'edit' : 'add'} size={17} color="#FFFFFF" />
          </View>
          <Text style={s.createSubmitText}>{actionLabel}</Text>
          <AppIcon name="chevron-right" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
