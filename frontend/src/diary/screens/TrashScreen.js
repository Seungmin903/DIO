import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { C } from '../constants';
import { DISABLED_OPACITY } from '../../shared/theme';
import { styles as s } from '../styles';
import AppIcon from '../../shared/AppIcon';
import EditorModal from '../../editor/components/controls/EditorModal';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import Cover from '../components/Cover';
import SelectionBar from '../components/SelectionBar';
import SelectionButton from '../components/SelectionButton';
import SelectionMark from '../components/SelectionMark';
import { useDiaryGrid } from '../utils/useDiaryGrid';
import { isTrashExpired, trashDeadline, trashStatus } from '../utils/trashRetention';
import { isAllSelected, isTrashUrgent, pruneSelection, selectableIds, splitSelection, toggleSelection } from '../utils/trashSelection';

const DAY = 24 * 60 * 60 * 1000;
const TRASH_ROW_GAP = 14; // 카드 아래에 남은 기간 줄이 붙어 홈 한눈에 보기(32)보다 좁게 둔다

// 보관함 카드(DiaryCard)처럼 memo 로 감싸 메뉴를 여닫을 때 값이 같은 카드(표지 · 패턴)는 다시 그리지 않는다.
// now 같이 매번 바뀌는 값은 카드에 넘기지 않고 계산한 문구·불리언만 넘긴다.
// 누르면 동작 시트(복원 · 영구 삭제)를 열고, 선택 모드에서는 보관함 편집처럼 체크만 바꾼다.
const TrashCard = memo(function TrashCard({ diary, compact, cell, status, urgent, selecting, selected, selectable, onPress, onLongPress }) {
  // 세로 표지는 칸보다 좁아 가운데에 놓인다. 제목 · 남은 기간을 홈 한눈에 보기처럼 그 표지의 왼쪽 끝에 맞추려고 Cover 가 알려 주는 값
  const [coverInset, setCoverInset] = useState(0);
  return (
    <Pressable
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      // 남은 기간(status)을 이름에 함께 넣어 화면 읽기 프로그램에서도 임박 여부를 알 수 있게 한다(색 · 고리만으로 전하지 않는다)
      accessibilityLabel={selecting ? `${diary.title} 선택, ${status}` : `${diary.title}, ${status}, 복원 또는 영구 삭제`}
      accessibilityState={selecting ? { checked: selected, disabled: !selectable } : undefined}
      aria-checked={selecting ? selected : undefined}
      disabled={selecting && !selectable}
      onPress={() => onPress(diary)}
      // 꾹 눌러 선택 모드에 들어온 손가락을 뗄 때 같은 터치가 onPress 로 한 번 더 와서 방금 고른 카드가 풀렸다.
      // 누르는 중에 onLongPress 가 사라지면 Pressable 이 '긴 누름이 눌림을 취소'했는지 판단하지 못하므로 선택 중에도 늘 넘긴다.
      onLongPress={() => (selecting ? onPress(diary) : onLongPress(diary))}
      style={({ pressed }) => [s.trashCard, compact && s.trashCardCompact, cell && { width: cell }, selecting && !selectable && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
    >
      <View style={[s.trashCover, compact && s.trashCoverCompact]}>
        <Cover diary={diary} grid fill compact={compact} onInset={setCoverInset}>
          {selecting && <SelectionMark selected={selected} compact={compact} />}
        </Cover>
      </View>
      {/* 제목 자리는 홈 한눈에 보기(cardInfoGrid)와 같다: 표지 왼쪽 끝에 맞추고 안쪽 여백 4 · 위 10 */}
      <View style={[s.trashInfo, !cell && coverInset > 0 && { marginLeft: coverInset }]}>
        <Text numberOfLines={1} style={s.trashTitle}>{diary.title}</Text>
        {/* 남은 기간: 글자만. 3일 이하는 버터 칩 + 네이비 글자(적색을 쓰지 않는다) */}
        <View style={[s.trashDateRow, urgent && s.trashDateRowUrgent]}>
          <Text style={[s.trashDate, urgent && s.trashDateUrgent]}>{status}</Text>
        </View>
      </View>
    </Pressable>
  );
});

// 카드를 누르면 뜨는 동작 시트: 복원 · 영구 삭제 · 닫기
function TrashSheet({ diary, status, busy, canRestore, canDelete, onRestore, onDelete, onClose }) {
  if (!diary) return null;
  return (
    <EditorModal transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.trashSheetBackdrop} onPress={onClose} accessibilityLabel="닫기">
        {/* 카드 안을 눌러도 닫히지 않게 터치를 여기서 받는다 */}
        <Pressable style={s.trashSheet} onPress={() => {}} accessibilityRole="menu">
          <Text numberOfLines={1} style={s.trashSheetTitle}>{diary.title}</Text>
          <Text style={s.trashSheetStatus}>{status}</Text>
          <View style={s.trashSheetActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${diary.title} 복원`}
              disabled={busy || !canRestore}
              accessibilityState={{ disabled: busy || !canRestore }}
              onPress={() => onRestore(diary)}
              style={({ pressed }) => [s.trashSheetPrimary, (busy || !canRestore) && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
            >
              <AppIcon name="undo" size={18} forText={14} color={C.white} />
              <Text style={s.trashSheetPrimaryText}>복원</Text>
            </Pressable>
            {canDelete && <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${diary.title} 영구 삭제`}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => onDelete(diary)}
              style={({ pressed }) => [s.trashSheetDanger, busy && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
            >
              <AppIcon name="trash" size={18} forText={14} color={C.dangerStrong} />
              <Text style={s.trashSheetDangerText}>영구 삭제</Text>
            </Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={({ pressed }) => [s.trashSheetClose, pressed && s.pressed]}>
            <Text style={s.trashSheetCloseText}>닫기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </EditorModal>
  );
}

// 폰과 태블릿 모두 같은 카드 · 동작 시트 · 선택 모드를 사용한다.
// onRestoreMany(ids) · onDeleteMany(diaries)는 선택 모드의 묶음 작업이다. 없으면 그 버튼을 보이지 않는다.
export default function TrashScreen({ diaries, onRestore, onDeletePermanently, onRestoreMany, onDeleteMany, compact = false, now = Date.now(), cleanupError, onRetryCleanup,
  serverMode = false, busy = false, requestNotice = null, suppressEmpty = false }) {
  // 부모가 매번 새 함수를 넘겨도 카드(memo)가 다시 그려지지 않도록 최신 값을 ref 로 들고 고정된 함수만 카드에 준다.
  const latest = useRef({ onRestore, onDeletePermanently, onRestoreMany, onDeleteMany, now, serverMode, busy });
  latest.current = { onRestore, onDeletePermanently, onRestoreMany, onDeleteMany, now, serverMode, busy };

  // 홈 한눈에 보기와 같은 칸 크기 · 한 줄 개수 (폰은 null). 위 여백은 선택 중에만 생기는 16 이라 0 으로 둔다(회전 때 보던 줄이 그만큼 어긋날 뿐)
  const grid = useDiaryGrid(compact, TRASH_ROW_GAP, { count: diaries.length });
  const [selected, setSelected] = useState(null); // null 이면 선택 모드가 아니다
  const [sheetId, setSheetId] = useState(null);
  const selecting = selected !== null;
  // 목록이 바뀌어(복원 · 삭제) 사라진 다이어리는 선택 · 시트에서 뺀다.
  useEffect(() => {
    const ids = new Set(diaries.map(diary => diary.id));
    setSelected(current => pruneSelection(current, ids));
    setSheetId(current => (current && !ids.has(current) ? null : current));
  }, [diaries]);

  const infoOf = useCallback((diary) => {
    const { serverMode: server, now: at, onRestore: restore, onDeletePermanently: purge, onDeleteMany: purgeMany } = latest.current;
    const deadline = server ? (diary.expiresAt ? Date.parse(diary.expiresAt) : null) : trashDeadline(diary);
    return {
      status: server
        ? (diary.retentionStatus === 'EXPIRED' ? '보관 기한 만료 · 복원할 수 없어요' : diary.expiresAt ? `${Math.max(0, Math.ceil((deadline - at) / DAY))}일 후 영구 삭제` : '보관 기한 확인 필요')
        : trashStatus(diary, at),
      urgent: isTrashUrgent(deadline, at),
      canRestore: Boolean(restore || latest.current.onRestoreMany) && (server ? Boolean(diary.canRestore) : !isTrashExpired(diary, at)),
      canDelete: Boolean(purge || purgeMany) && (!server || diary.canPermanentlyDelete === true),
    };
  }, []);

  const rows = useMemo(() => diaries.map(diary => ({ diary, ...infoOf(diary) })), [diaries, now, serverMode, onRestore, onDeletePermanently, onRestoreMany, onDeleteMany, infoOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(rows.map(row => [row.diary.id, row])), [rows]);

  const toggle = useCallback((diary) => {
    setSelected(current => toggleSelection(current, diary.id));
  }, []);
  const press = useCallback((diary) => { if (selecting) toggle(diary); else setSheetId(diary.id); }, [selecting, toggle]);
  const longPress = useCallback((diary) => { setSelected([diary.id]); }, []);

  const { picked: selectedRows, restorable, deletable } = splitSelection(rows, selected);
  const selectableCount = selectableIds(rows).length;
  const allSelected = isAllSelected(rows, selected);
  const canBulkRestore = Boolean(onRestoreMany || onRestore), canBulkDelete = Boolean(onDeleteMany);

  const sheet = sheetId ? byId.get(sheetId) : null;
  const closeSheet = () => setSheetId(null);
  const finishSelecting = () => setSelected(null);

  const header = (
    <Header
      title="휴지통"
      icon="bin"
      compact={compact}
    />
  );

  const selectionBar = selecting && (
    <SelectionBar count={selectedRows.length} compact={compact} done={<SelectionButton compact={compact} ghost label="선택 완료" text="완료" disabled={busy} onPress={finishSelecting} />}>
      <SelectionButton compact={compact}
        label={allSelected ? '전체 해제' : '전체 선택'}
        disabled={busy || !selectableCount}
        onPress={() => setSelected(allSelected ? [] : selectableIds(rows))}
      />
      {canBulkRestore && <SelectionButton compact={compact}
        label={`선택한 ${restorable.length}개 복원`}
        text="복원"
        icon="undo"
        tone="primary"
        disabled={busy || !restorable.length}
        onPress={() => {
          const ids = restorable.map(row => row.diary.id);
          if (latest.current.onRestoreMany) latest.current.onRestoreMany(ids); else ids.forEach(id => latest.current.onRestore(id));
          finishSelecting();
        }}
      />}
      {canBulkDelete && <SelectionButton compact={compact}
        label={`선택한 ${deletable.length}개 영구 삭제`}
        text="영구 삭제"
        icon="trash"
        tone="danger"
        disabled={busy || !deletable.length}
        onPress={() => latest.current.onDeleteMany(deletable.map(row => row.diary), finishSelecting)}
      />}
    </SelectionBar>
  );

  return (
    // 한눈에 보기처럼 제목 · 선택 도구는 위에 고정하고 카드 목록만 스크롤한다.
    // 바탕은 공방 · 내 공간과 같은 흰 면(작업 화면). 햇살 책상은 다이어리를 고르는 보관함에만 둔다(원 페이저 01)
    <View style={[s.libraryRoot, s.workRoot]}>
    <View style={[s.libraryScreen, compact && s.libraryScreenCompact, s.libraryFixedTop]}>
      {header}
      {selectionBar}
    </View>
    <ScrollView {...grid?.scroll} contentContainerStyle={[s.libraryGridScroll, compact && s.libraryGridScrollCompact]} showsVerticalScrollIndicator={false}>
      {requestNotice}
      {cleanupError && <View accessibilityRole="alert" style={s.trashNotice}>
        <Text style={s.trashPolicy}>{cleanupError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="휴지통 정리 다시 시도" onPress={onRetryCleanup} style={s.trashRestore}>
          <Text style={s.trashRestoreText}>다시 시도</Text>
        </Pressable>
      </View>}
      {!rows.length ? (suppressEmpty ? null :
        <EmptyState compact={compact} art="dio" raised title="휴지통이 비어 있어요" />
      ) : (
        <View onLayout={grid?.onLayout}><View style={[s.trashGrid, compact && s.trashGridCompact, selecting && (compact ? s.trashGridSelectingCompact : s.trashGridSelecting), grid?.style]}>
          {rows.map(({ diary, status, urgent, canRestore, canDelete }) => (
            <TrashCard
              key={diary.id}
              diary={diary}
              compact={compact}
              cell={grid?.cell}
              status={status}
              urgent={urgent}
              selecting={selecting}
              selected={selecting && selected.includes(diary.id)}
              selectable={canRestore || canDelete}
              onPress={press}
              onLongPress={longPress}
            />
          ))}
        </View></View>
      )}
    </ScrollView>
    <TrashSheet
      diary={sheet?.diary}
      status={sheet?.status}
      busy={busy}
      canRestore={sheet?.canRestore}
      canDelete={sheet?.canDelete && Boolean(onDeletePermanently || onDeleteMany)}
      onRestore={(diary) => { closeSheet(); if (latest.current.onRestore) latest.current.onRestore(diary.id); else latest.current.onRestoreMany?.([diary.id]); }}
      onDelete={(diary) => { closeSheet(); if (latest.current.onDeletePermanently) latest.current.onDeletePermanently(diary); else latest.current.onDeleteMany?.([diary]); }}
      onClose={closeSheet}
    />
    </View>
  );
}
