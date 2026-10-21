import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import AppIcon from '../../shared/AppIcon';
import { COLORS, COVER_PATTERNS, DIARY_DEFAULTS, FIRST_PAGES } from '../constants';
import { styles as s } from '../styles';
import CoverPattern from './CoverPattern';

const TITLE_LIMIT = 24;
const CALENDAR_YEAR = 2026;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const dateParts = (value) => {
  const match = /^(2026)-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : { year: CALENDAR_YEAR, month: 1, day: 1 };
};
const dateValue = (month, day) => `${CALENDAR_YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const mondayOf = (value) => {
  const { year, month, day } = dateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

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

// 첫 페이지 서식 썸네일
function FirstPageThumb({ id }) {
  const ink = '#9AA6BC';
  let shapes = null;
  if (id === 'monthly') {
    shapes = (
      <>
        <Line x1="5" y1="7" x2="20" y2="7" stroke="#0B1957" strokeWidth="1.4" />
        {Array.from({ length: 4 }, (_, row) => Array.from({ length: 7 }, (_, col) => (
          <Circle key={`${row}-${col}`} cx={7 + col * 7} cy={14 + row * 6} r="0.8" fill={ink} />
        )))}
      </>
    );
  } else if (id === 'weekly') {
    shapes = (
      <>
        <Line x1="5" y1="7" x2="20" y2="7" stroke="#0B1957" strokeWidth="1.4" />
        {[14, 21, 28, 35].map((y) => <Line key={y} x1="5" y1={y} x2="51" y2={y} stroke={ink} strokeWidth="0.6" />)}
        <Line x1="28" y1="11" x2="28" y2="37" stroke={ink} strokeWidth="0.6" />
      </>
    );
  } else if (id === 'lined') {
    shapes = [10, 16, 22, 28, 34].map((y) => <Line key={y} x1="5" y1={y} x2="51" y2={y} stroke={ink} strokeWidth="0.6" />);
  } else if (id === 'grid') {
    shapes = (
      <>
        {[8, 14, 20, 26, 32].map((y) => <Line key={`h${y}`} x1="0" y1={y} x2="56" y2={y} stroke={ink} strokeWidth="0.4" />)}
        {[8, 14, 20, 26, 32, 38, 44, 50].map((x) => <Line key={`v${x}`} x1={x} y1="0" x2={x} y2="40" stroke={ink} strokeWidth="0.4" />)}
      </>
    );
  } else if (id === 'dot') {
    shapes = Array.from({ length: 5 }, (_, row) => Array.from({ length: 8 }, (_, col) => (
      <Circle key={`${row}-${col}`} cx={7 + col * 6} cy={8 + row * 6} r="0.7" fill={ink} />
    )));
  }
  return (
    <Svg width={56} height={40} viewBox="0 0 56 40">
      <Rect x="0.5" y="0.5" width="55" height="39" rx="3" fill="#FFFFFF" stroke="#D5DDEA" />
      {shapes}
    </Svg>
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
export default function DiaryCreateModal({ diary, onSubmit, onDelete, onCancel }) {
  const editing = Boolean(diary);
  const [title, setTitle] = useState(diary?.title ?? DIARY_DEFAULTS.title);
  const [color, setColor] = useState(diary?.color ?? DIARY_DEFAULTS.color);
  const [pattern, setPattern] = useState(diary ? diary.pattern ?? null : DIARY_DEFAULTS.pattern);
  const [firstPage, setFirstPage] = useState(diary?.firstPage ?? DIARY_DEFAULTS.firstPage);
  const [firstPageDate, setFirstPageDate] = useState(diary?.firstPageDate ?? DIARY_DEFAULTS.firstPageDate);
  const [calendarMonth, setCalendarMonth] = useState(dateParts(diary?.firstPageDate ?? DIARY_DEFAULTS.firstPageDate).month);
  const [error, setError] = useState('');
  const actionLabel = editing ? '완료하기' : '다이어리 만들기';
  const pageSizeLabel = '가로형';

  const onTitleChange = (value) => {
    setTitle(value);
    setError('');
  };

  const onSave = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('다이어리 이름을 입력해 주세요.');
      return;
    }
    const failure = onSubmit({
      title: trimmed,
      color,
      pattern,
      pageSize: 'landscape',
      firstPage,
      firstPageDate: firstPage === 'monthly' || firstPage === 'weekly' ? firstPageDate : null,
    });
    if (failure) setError(failure);
  };

  return (
    <View accessibilityViewIsModal style={s.createOverlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} 닫기`}
        onPress={onCancel}
        style={s.createBackdrop}
      />
      <View style={s.createDialog}>
        <View style={s.createPreviewPane}>
          <BookPreview title={title} color={color} pattern={pattern} />
          <Text style={s.createPreviewMeta}>{pageSizeLabel}</Text>
          <Text style={s.createPreviewCopy}>색상과 표지는 언제든 바꿀 수 있어요.</Text>
        </View>

        <View style={s.createFormPane}>
          <View style={s.createDialogHeader}>
            <View>
              <Text style={s.createDialogEyebrow}>{editing ? 'EDIT DIARY' : 'YOUR NEXT CHAPTER'}</Text>
              <Text style={s.createDialogTitle}>{editing ? '다이어리 수정' : '새 다이어리 만들기'}</Text>
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

          <ScrollView style={s.createFormScroll} contentContainerStyle={s.createFormBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.createLabel}>이름</Text>
            <TextInput
              accessibilityLabel="다이어리 이름"
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

            {!editing && (
              <>
                <Text style={s.createLabel}>첫 페이지 서식</Text>
                <View style={s.firstPages}>
                  {FIRST_PAGES.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`${item.label} 첫 페이지`}
                      accessibilityState={{ selected: firstPage === item.id }}
                      onPress={() => setFirstPage(item.id)}
                      style={({ pressed }) => [s.firstPage, firstPage === item.id && s.firstPageSelected, pressed && s.pressed]}
                    >
                      <FirstPageThumb id={item.id} />
                      <Text style={s.firstPageText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {(firstPage === 'monthly' || firstPage === 'weekly') && (
                  <DateCalendar
                    month={calendarMonth}
                    selected={firstPageDate}
                    weekly={firstPage === 'weekly'}
                    onMonthChange={setCalendarMonth}
                    onSelect={setFirstPageDate}
                  />
                )}
              </>
            )}
          </ScrollView>

          <View style={s.createFooter}>
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
              onPress={onSave}
              style={({ pressed }) => [s.createSubmit, pressed && s.pressed]}
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

function DateCalendar({ month, selected, weekly, onMonthChange, onSelect }) {
  const days = new Date(Date.UTC(CALENDAR_YEAR, month, 0)).getUTCDate();
  const leading = new Date(Date.UTC(CALENDAR_YEAR, month - 1, 1)).getUTCDay();
  const cells = [...Array.from({ length: leading }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
  const selectedWeek = mondayOf(selected);

  return (
    <View style={s.calendar}>
      <View style={s.calendarHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 달"
          disabled={month === 1}
          onPress={() => onMonthChange(month - 1)}
          style={({ pressed }) => [s.calendarArrow, month === 1 && s.calendarArrowDisabled, pressed && s.pressed]}
        >
          <AppIcon name="chevron-left" size={17} color="#40517D" />
        </Pressable>
        <Text style={s.calendarTitle}>{CALENDAR_YEAR}년 {month}월</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          disabled={month === 12}
          onPress={() => onMonthChange(month + 1)}
          style={({ pressed }) => [s.calendarArrow, month === 12 && s.calendarArrowDisabled, pressed && s.pressed]}
        >
          <AppIcon name="chevron-right" size={17} color="#40517D" />
        </Pressable>
      </View>
      <Text style={s.calendarCopy}>{weekly ? '원하는 주에 포함된 날짜를 선택해 주세요.' : '원하는 달의 날짜를 선택해 주세요.'}</Text>
      <View style={s.calendarGrid}>
        {WEEKDAYS.map((day) => <Text key={day} style={s.calendarWeekday}>{day}</Text>)}
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} style={s.calendarDay} />;
          const value = dateValue(month, day);
          const selectedDay = weekly ? mondayOf(value) === selectedWeek : value === selected;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${month}월 ${day}일`}
              accessibilityState={{ selected: selectedDay }}
              onPress={() => onSelect(value)}
              style={({ pressed }) => [s.calendarDay, selectedDay && s.calendarDaySelected, pressed && s.pressed]}
            >
              <Text style={[s.calendarDayText, selectedDay && s.calendarDayTextSelected]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
