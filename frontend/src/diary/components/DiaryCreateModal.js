import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DiaryPaperColors, { DiaryPaperPreview } from './DiaryPaperColors';
import { DEFAULT_PAPER_APPEARANCE } from '../../editor/templates/appearance.js';
import DiaryTemplateSettings from './DiaryTemplateSettings';
import { defaultTemplateConfig, templatePageCount } from '../../editor/templates/creation.js';
import AppIcon from '../../shared/AppIcon';
import { COLORS, COVER_PATTERNS, DIARY_DEFAULTS, PAGE_SIZES } from '../constants';
import { styles as s } from '../styles';
import CoverPattern from './CoverPattern';

const TITLE_LIMIT = 24;

// 왼쪽 미리보기의 책 모양 표지
function BookPreview({ title, color, pattern }) {
  return (
    <View style={[s.bookPreview, { backgroundColor: color }]}>
      <CoverPattern pattern={pattern} />
      <View style={s.bookSpine} />
      <View style={s.bookBand} />
      <View style={s.bookLabel}>
        <Text numberOfLines={1} style={s.bookLabelTitle}>{title.trim() || DIARY_DEFAULTS.title}</Text>
        <Text style={s.bookLabelMeta}>DIARY · 2026</Text>
      </View>
    </View>
  );
}

function Chip({ label, selected, disabled, onPress, children }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.formChip, selected && s.formChipSelected, disabled && s.formChipDisabled, pressed && s.pressed]}
    >
      {children}
      <Text style={[s.formChipText, selected && s.formChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

// 입력 상태를 모달 안에 두어 글자를 칠 때마다 홈 화면 전체가 다시 그려지지 않게 한다.
export default function DiaryCreateModal({ diary, onSubmit, onDelete, onCancel, saving = false }) {
  const editing = Boolean(diary);
  const [title, setTitle] = useState(diary?.title ?? DIARY_DEFAULTS.title);
  const [color, setColor] = useState(diary?.color ?? DIARY_DEFAULTS.color);
  const [pattern, setPattern] = useState(diary ? diary.pattern ?? null : DIARY_DEFAULTS.pattern);
  const pageSize = diary?.pageSize ?? 'landscape';
  const [step, setStep] = useState(0);
  const [templateConfig, setTemplateConfig] = useState(defaultTemplateConfig);
  const submitting = useRef(false);
  const configuring = !editing && step === 1;
  const coloring = !editing && step === 2;
  const [paperAppearance, setPaperAppearance] = useState(() => ({ ...DEFAULT_PAPER_APPEARANCE }));
  const [error, setError] = useState('');
  const formScroll = useRef(null);
  const [paletteDragging, setPaletteDragging] = useState(false);
  const onPaletteInteraction = useCallback(active => {
    // 네이티브 스크롤도 즉시 막아 다음 렌더 전의 움직임을 방지한다.
    formScroll.current?.setNativeProps?.({ scrollEnabled: !active });
    setPaletteDragging(active);
  }, []);
  const actionLabel = saving ? '저장 중…' : editing ? '완료하기' : coloring ? '다이어리 만들기' : configuring ? '내지 색상 선택하기' : '속지 선택하기';
  let count = null, configError = '';
  if (!editing && step > 0) {
    try { count = templatePageCount(templateConfig); } catch (failure) { configError = failure.message; }
  }
  const pageSizeLabel = PAGE_SIZES.find((item) => item.id === pageSize)?.label;

  const onTitleChange = (value) => {
    setTitle(value);
    setError('');
  };

  const onSave = async () => {
    if (saving || submitting.current) return;
    const trimmed = title.trim();
    if (!trimmed) { setError('다이어리 이름을 입력해 주세요.'); return; }
    if (configError) { setError(configError); return; }
    if (!editing && step < 2) { setError(''); setStep(step + 1); return; }
    submitting.current = true;
    try {
      const failure = await onSubmit({ title: trimmed, color, pattern, pageSize, templateConfig, paperAppearance });
      if (failure) setError(failure);
    } catch {
      setError('다이어리를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { submitting.current = false; }
  };

  return (
    <View accessibilityViewIsModal style={s.createOverlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} 닫기`}
        disabled={saving}
        onPress={onCancel}
        style={s.createBackdrop}
      />
      <View style={s.createDialog}>
        <View style={s.createPreviewPane}>
          {coloring ? <DiaryPaperPreview config={templateConfig} appearance={paperAppearance} /> : <BookPreview title={title} color={color} pattern={pattern} />}
          <Text style={s.createPreviewMeta}>{pageSizeLabel}</Text>
          <Text style={s.createPreviewCopy}>{coloring ? '추천 색상과 직접 지정한 색을 바로 확인하세요.' : '표지 색상과 패턴은 만든 뒤에도 바꿀 수 있어요.'}</Text>
        </View>

        <View style={s.createFormPane}>
          <View style={s.createDialogHeader}>
            <View>
              <Text style={s.createDialogEyebrow}>{editing ? 'EDIT DIARY' : 'YOUR NEXT CHAPTER'}</Text>
              <Text style={s.createDialogTitle}>{editing ? '다이어리 수정' : coloring ? '내지 색상' : configuring ? '속지 구성' : '새 다이어리 만들기'}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} 닫기`}
              disabled={saving}
              onPress={onCancel}
              style={({ pressed }) => [s.createClose, pressed && s.pressed]}
            >
              <AppIcon name="close" size={20} color="#0B1957" />
            </Pressable>
          </View>

          <ScrollView ref={formScroll} scrollEnabled={!paletteDragging} style={s.createFormScroll} contentContainerStyle={s.createFormBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View pointerEvents={saving ? 'none' : 'auto'}>
            {!editing && <Text style={[s.helper, { marginBottom: 12 }]}>{coloring ? '3 / 3 · 내지 색상' : configuring ? '2 / 3 · 속지 구성' : '1 / 3 · 이름과 표지'}</Text>}
            {!configuring && !coloring && <>
            <Text style={s.createLabel}>이름</Text>
            <TextInput
              accessibilityLabel="다이어리 이름"
              editable={!saving}
              value={title}
              onChangeText={onTitleChange}
              placeholder="예: 2026 봄의 기록"
              placeholderTextColor="#98A4BB"
              maxLength={TITLE_LIMIT}
              selectTextOnFocus
              style={[s.createField, error && s.fieldError]}
            />
            <View style={s.createHelperRow}>
              <Text style={error ? s.error : s.helper}>{error || `${TITLE_LIMIT}자 이내로 입력해 주세요.`}</Text>
              <Text style={s.helper}>{title.length}/{TITLE_LIMIT}</Text>
            </View>

            <Text style={s.createLabel}>표지 색상</Text>
            <View style={s.createColors}>
              {COLORS.map((choice) => (
                <Pressable
                  key={choice.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${choice.label} 표지 색상`}
                  accessibilityState={{ selected: color === choice.value }}
                  onPress={() => setColor(choice.value)}
                  style={({ pressed }) => [s.createColorChoice, color === choice.value && s.createColorSelected, pressed && s.pressed]}
                >
                  <View style={[s.createColorDot, { backgroundColor: choice.value }]} />
                </Pressable>
              ))}
            </View>

            <Text style={s.createLabel}>표지 패턴</Text>
            <View style={s.createChips}>
              {COVER_PATTERNS.map((item) => (
                <Chip key={item.id} label={item.label} selected={pattern === item.id} onPress={() => setPattern(item.id)} />
              ))}
            </View>

            <View style={s.createLabelRow}>
              <Text style={[s.createLabel, s.createLabelInline]}>페이지 크기</Text>
              <Text style={s.createLabelNote}>만든 뒤에는 유지돼요</Text>
            </View>
            <View style={s.createChips}>
              {PAGE_SIZES.map((item) => (
                <Chip key={item.id} label={item.label + (!editing && item.id === 'portrait' ? ' · 준비 중' : '')} selected={pageSize === item.id} disabled={editing || item.id === 'portrait'} onPress={() => {}}>
                  <View style={[s.pageSizeIcon, item.id === 'portrait' ? s.pageSizeIconPortrait : s.pageSizeIconLandscape]} />
                </Chip>
              ))}
            </View>

            </>}
            {configuring && <DiaryTemplateSettings value={templateConfig} onChange={value => { setTemplateConfig(value); setError(''); }} />}
            {coloring && <DiaryPaperColors onInteractionChange={onPaletteInteraction} value={paperAppearance} onChange={setPaperAppearance} />}
            </View>
          </ScrollView>

          {!editing && step > 0 && <View>
            <Text style={s.createLabel}>총 {count == null ? '—' : count}페이지</Text>
            {(error || configError) ? <Text accessibilityRole="alert" style={[s.error, { marginBottom: 8 }]}>{error || configError}</Text> : null}
          </View>}
          <View style={s.createFooter}>
            {!editing && step > 0 && <Pressable
              accessibilityRole="button"
              accessibilityLabel={coloring ? '속지 구성으로 돌아가기' : '이름과 표지로 돌아가기'}
              disabled={saving}
              onPress={() => { setStep(step - 1); setError(''); }}
              style={({ pressed }) => [s.createBack, pressed && s.pressed, saving && { opacity: 0.5 }]}
            >
              <AppIcon name="chevron-left" size={18} color="#40517D" />
              <Text style={s.createBackText}>{coloring ? '속지 구성' : '이름과 표지'}</Text>
            </Pressable>}
            {editing && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다이어리 삭제"
                onPress={onDelete}
                style={({ pressed }) => [s.createDelete, pressed && s.pressed]}
              >
                <AppIcon name="trash" size={17} color="#BD5B58" />
                <Text style={s.createDeleteText}>삭제</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              disabled={saving || Boolean(configError)}
              onPress={onSave}
              style={({ pressed }) => [s.createSubmit, pressed && s.pressed, (saving || Boolean(configError)) && { opacity: 0.5 }]}
            >
              <Text style={s.createSubmitText}>{actionLabel}</Text>
              <AppIcon name="chevron-right" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
