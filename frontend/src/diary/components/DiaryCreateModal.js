import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DiaryPaperColors, { DiaryPaperColorButton, DiaryPaperPreview } from './DiaryPaperColors';
import DiaryMonthPreview from './DiaryMonthPreview';
import { DEFAULT_PAPER_APPEARANCE } from '../../editor/templates/appearance.js';
import DiaryTemplateSettings from './DiaryTemplateSettings';
import { templatePageCount } from '../../editor/templates/creation.js';
import { activeCreationConfig, creationFlowReducer, initialCreationFlow } from '../utils/creationFlow.js';
import DiaryPresets, { CompositionSummary } from './DiaryPresets';
import AppIcon from '../../shared/AppIcon';
import { COLORS, COVER_PATTERNS, DIARY_DEFAULTS, PAGE_SIZES, C } from '../constants';
import { styles as s } from '../styles';
import CoverPattern from './CoverPattern';

const TITLE_LIMIT = 24;
const SHEET_SLIDE = 600;

// 왼쪽 미리보기의 책 모양 표지
function BookPreview({ title, color, pattern, dateMode }) {
  return (
    <View style={[s.bookPreview, { backgroundColor: color }]}>
      <CoverPattern pattern={pattern} />
      <View style={s.bookSpine} />
      <View style={s.bookBand} />
      <View style={s.bookLabel}>
        <Text numberOfLines={1} style={s.bookLabelTitle}>{title.trim() || DIARY_DEFAULTS.title}</Text>
        <Text style={s.bookLabelMeta}>DIARY · {dateMode === 'undated' ? '만년형' : '2026'}</Text>
      </View>
    </View>
  );
}

function Chip({ label, selected, disabled, onPress, children }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected, disabled }}
      aria-checked={selected}
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
// sheet: 폰에서는 가운데 창 대신 아래에서 올라오는 시트로 띄운다.
export default function DiaryCreateModal({ diary, onSubmit, onCancel, saving = false, sheet = false, bottomInset = 0 }) {
  const editing = Boolean(diary);
  const [title, setTitle] = useState(diary?.title ?? DIARY_DEFAULTS.title);
  const [color, setColor] = useState(diary?.color ?? DIARY_DEFAULTS.color);
  const [pattern, setPattern] = useState(diary ? diary.pattern ?? null : DIARY_DEFAULTS.pattern);
  const [flow, changeFlow] = useReducer(creationFlowReducer, diary?.pageSize, initialCreationFlow);
  const { step, orientation: pageSize } = flow;
  const templateConfig = useMemo(() => activeCreationConfig(flow), [flow]);
  const submitting = useRef(false);
  const recommending = !editing && step === 'recommend';
  const configuring = !editing && step === 'custom';
  const coloring = !editing && step === 'colors';
  const choosing = !editing && step !== 'cover';
  const [paperAppearance, setPaperAppearance] = useState(() => ({ ...DEFAULT_PAPER_APPEARANCE }));
  const [error, setError] = useState('');
  const formScroll = useRef(null);
  const [paletteDragging, setPaletteDragging] = useState(false);
  const onPaletteInteraction = useCallback(active => {
    // 네이티브 스크롤도 즉시 막아 다음 렌더 전의 움직임을 방지한다.
    formScroll.current?.setNativeProps?.({ scrollEnabled: !active });
    setPaletteDragging(active);
  }, []);
  const actionLabel = saving ? '저장 중…' : editing ? '완료하기' : choosing ? '이 구성으로 시작' : '내지 구성 선택하기';
  let count = null, configError = '';
  if (choosing) {
    try { count = templatePageCount(templateConfig); } catch (failure) { configError = failure.message; }
  }
  const changePageSize = orientation => {
    changeFlow({ type: 'orientation', value: orientation });
  };
  const pageSizeLabel = PAGE_SIZES.find((item) => item.id === pageSize)?.label;
  const slide = useRef(new Animated.Value(sheet ? 1 : 0)).current;
  useEffect(() => {
    if (!sheet) return;
    Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [sheet, slide]);

  const onTitleChange = (value) => {
    setTitle(value);
    setError('');
  };

  const onSave = async () => {
    if (saving || submitting.current) return;
    const trimmed = title.trim();
    if (!trimmed) { setError('다이어리 이름을 입력해 주세요.'); return; }
    if (configError) { setError(configError); return; }
    if (!editing && step === 'cover') { setError(''); changeFlow({ type: 'next' }); return; }
    submitting.current = true;
    try {
      const failure = await onSubmit({ title: trimmed, color, pattern, pageSize, templateConfig, paperAppearance });
      if (failure) setError(failure);
    } catch {
      setError('다이어리를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { submitting.current = false; }
  };

  return (
    <Modal
      visible
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={() => { if (!saving) onCancel(); }}
    >
    <View accessibilityViewIsModal style={[s.createOverlay, sheet && s.createOverlaySheet]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} 닫기`}
        disabled={saving}
        onPress={onCancel}
        style={s.createBackdrop}
      />
      <Animated.View style={[s.createDialog, sheet && s.createSheet, sheet && { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, SHEET_SLIDE] }) }] }]}>
        {sheet ? <View style={s.sheetHandle} /> : (
          <View style={[s.createPreviewPane, recommending && { width: 300, paddingHorizontal: 20, paddingVertical: 24 }]}>
            {recommending ? <DiaryMonthPreview config={templateConfig} appearance={paperAppearance} />
              : coloring ? <DiaryPaperPreview config={templateConfig} appearance={paperAppearance} /> : <BookPreview title={title} color={color} pattern={pattern} dateMode={editing ? diary.templateConfig?.dateMode : flow.dateMode} />}
            <Text style={s.createPreviewMeta}>{pageSizeLabel}</Text>
          </View>
        )}

        <View style={[s.createFormPane, sheet && s.createFormPaneSheet]}>
          <View style={s.createDialogHeader}>
            <View>
              <Text style={s.createDialogTitle}>{editing ? '다이어리 수정' : coloring ? '내지 색상' : configuring ? '직접 구성하기' : recommending ? '어떻게 기록할까요?' : '새 다이어리 만들기'}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} 닫기`}
              disabled={saving}
              onPress={onCancel}
              style={({ pressed }) => [s.createClose, pressed && s.pressed]}
            >
              <AppIcon name="close" size={20} color={C.ink} />
            </Pressable>
          </View>

          {choosing && !coloring && <DiaryPaperColorButton appearance={paperAppearance} disabled={saving || Boolean(configError)}
            onPress={() => { changeFlow({ type: 'colors' }); setError(''); }} />}
          {choosing && !coloring && <View style={{ marginBottom: 12 }}>
            <View style={s.createChips}>
              <Chip label="날짜형 · 1년" selected={flow.dateMode === 'dated'} disabled={saving}
                onPress={() => { changeFlow({ type: 'dateMode', value: 'dated' }); setError(''); }} />
              <Chip label="만년형 · 1개월" selected={flow.dateMode === 'undated'} disabled={saving}
                onPress={() => { changeFlow({ type: 'dateMode', value: 'undated' }); setError(''); }} />
            </View>
            <Text style={s.helper}>{flow.dateMode === 'undated' ? '날짜를 직접 쓰는 한 달 구성이에요. 달력은 6주 칸, 주간 계획은 포함 시 6장이에요.' : '2026년 1~12월의 날짜가 적힌 일 년 구성이에요.'}</Text>
          </View>}
          <ScrollView ref={formScroll} scrollEnabled={!paletteDragging} style={s.createFormScroll} contentContainerStyle={s.createFormBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View pointerEvents={saving ? 'none' : 'auto'}>
            {!editing && <Text style={[s.helper, { marginBottom: 12 }]}>{coloring ? '선택 사항 · 내지 색상' : choosing ? '2 / 2 · 내지 구성' : '1 / 2 · 이름과 표지'}</Text>}
            {!choosing && <>
            <Text style={s.createLabel}>이름</Text>
            <TextInput
              accessibilityLabel="다이어리 이름"
              editable={!saving}
              value={title}
              onChangeText={onTitleChange}
              placeholder="예: 2026 봄의 기록"
              placeholderTextColor={C.muted}
              maxLength={TITLE_LIMIT}
              selectTextOnFocus
              style={[s.createField, error && s.fieldError]}
            />
            <View style={s.createHelperRow}>
              {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
              <Text style={[s.helper, s.createCount]}>{title.length}/{TITLE_LIMIT}</Text>
            </View>

            <Text style={s.createLabel}>표지 색상</Text>
            <View style={[s.createColors, sheet && s.createColorsSheet]}>
              {COLORS.map((choice) => (
                <Pressable
                  key={choice.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${choice.label} 표지 색상`}
                  accessibilityState={{ selected: color === choice.value }}
                  onPress={() => setColor(choice.value)}
                  style={({ pressed }) => [s.createColorChoice, sheet && s.createColorChoiceSheet, color === choice.value && s.createColorSelected, pressed && s.pressed]}
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
              <Text style={s.createLabelNote}>다이어리 생성 후 변경 불가</Text>
            </View>
            <View style={s.createChips}>
              {PAGE_SIZES.map((item) => (
                <Chip key={item.id} label={item.label} selected={pageSize === item.id} disabled={editing} onPress={() => changePageSize(item.id)}>
                  <View style={[s.pageSizeIcon, item.id === 'portrait' ? s.pageSizeIconPortrait : s.pageSizeIconLandscape]} />
                </Chip>
              ))}
            </View>

            </>}
            {recommending && sheet && <DiaryMonthPreview config={templateConfig} appearance={paperAppearance} compact />}
            {recommending && <DiaryPresets selected={flow.preset} orientation={pageSize} dateMode={flow.dateMode} appearance={paperAppearance}
              onSelect={id => { changeFlow({ type: 'preset', id }); setError(''); }}
              onCustomize={() => { changeFlow({ type: 'custom' }); setError(''); }} />}
            {configuring && <>
              <CompositionSummary config={templateConfig} />
              <DiaryTemplateSettings value={templateConfig} onChange={value => { changeFlow({ type: 'configure', value }); setError(''); }} />
            </>}
            {coloring && <>
              {sheet && <DiaryPaperPreview config={templateConfig} appearance={paperAppearance} />}
              <DiaryPaperColors onInteractionChange={onPaletteInteraction} value={paperAppearance} onChange={setPaperAppearance} />
            </>}
            </View>
          </ScrollView>

          {choosing && <View>
            <Text accessibilityLiveRegion="polite" style={s.createLabel}>전체 페이지 수 · {count == null ? '—' : count}페이지</Text>
            {(error || configError) ? <Text accessibilityRole="alert" style={[s.error, { marginBottom: 8 }]}>{error || configError}</Text> : null}
          </View>}
          <View style={[s.createFooter, sheet && { paddingBottom: 16 + bottomInset }]}>
            {choosing && <Pressable
              accessibilityRole="button"
              accessibilityLabel={coloring ? '내지 구성으로 돌아가기' : configuring ? '추천 구성으로 돌아가기' : '이름과 표지로 돌아가기'}
              disabled={saving}
              onPress={() => { changeFlow({ type: 'back' }); onPaletteInteraction(false); setError(''); }}
              style={({ pressed }) => [s.createBack, pressed && s.pressed, saving && { opacity: 0.5 }]}
            >
              <AppIcon name="chevron-left" size={18} color={C.inkSoft} />
              <Text style={s.createBackText}>{coloring ? '내지 구성' : configuring ? '추천 구성' : '이름과 표지'}</Text>
            </Pressable>}
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
      </Animated.View>
    </View>
    </Modal>
  );
}
