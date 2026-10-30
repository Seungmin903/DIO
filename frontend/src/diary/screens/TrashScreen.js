import { memo, useCallback, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { DISABLED_OPACITY } from '../../shared/theme';
import { styles as s } from '../styles';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import Cover from '../components/Cover';
import { isTrashExpired, trashStatus } from '../utils/trashRetention';

// 보관함 카드(DiaryCard)처럼 memo 로 감싸 메뉴를 여닫을 때 값이 같은 카드(표지 · 패턴)는 다시 그리지 않는다.
// now 같이 매번 바뀌는 값은 카드에 넘기지 않고 계산한 문구·불리언만 넘긴다.
const TrashCard = memo(function TrashCard({ diary, compact, busy, status, restoreDisabled, canDelete, onRestore, onDeletePermanently }) {
  const restoreOff = busy || restoreDisabled;
  return (
    <View style={[s.trashCard, compact && s.trashCardCompact]}>
      <View style={[s.trashCover, compact && s.trashCoverCompact]}><Cover diary={diary} grid fill centered compact={compact} /></View>
      <Text numberOfLines={1} style={s.trashTitle}>{diary.title}</Text>
      <Text style={s.trashDate}>{status}</Text>
      <View style={s.trashActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${diary.title} 복원`}
          disabled={restoreOff}
          accessibilityState={{ disabled: restoreOff }}
          onPress={() => onRestore(diary.id)}
          style={({ pressed }) => [s.trashRestore, restoreOff && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
        >
          <Text style={s.trashRestoreText}>복원</Text>
        </Pressable>
        {canDelete && <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${diary.title} 영구 삭제`}
          disabled={busy}
          accessibilityState={{ disabled: busy }}
          onPress={() => onDeletePermanently(diary)}
          style={({ pressed }) => [s.trashDelete, busy && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
        >
          <Text style={s.trashDeleteText}>삭제</Text>
        </Pressable>}
      </View>
    </View>
  );
});

// 폰과 태블릿 모두 같은 카드·복원·영구 삭제 흐름을 사용한다.
export default function TrashScreen({ diaries, onRestore, onDeletePermanently, compact = false, now = Date.now(), cleanupError, onRetryCleanup,
  serverMode = false, busy = false, requestNotice = null, suppressEmpty = false }) {
  // 부모가 매번 새 함수를 넘겨도 카드(memo)가 다시 그려지지 않도록 최신 콜백을 ref 로 들고 고정된 함수만 카드에 준다.
  const latest = useRef({ onRestore, onDeletePermanently });
  latest.current = { onRestore, onDeletePermanently };
  const restore = useCallback(id => latest.current.onRestore?.(id), []);
  const purge = useCallback(diary => latest.current.onDeletePermanently?.(diary), []);
  return (
    // 한눈에 보기처럼 제목은 위에 고정하고 카드 목록만 스크롤한다.
    <View style={s.libraryRoot}>
    <View style={[s.libraryScreen, compact && s.libraryScreenCompact, s.libraryFixedTop]}>
      <Header title="휴지통" compact={compact} />
    </View>
    <ScrollView contentContainerStyle={[s.libraryGridScroll, compact && s.libraryGridScrollCompact]} showsVerticalScrollIndicator={false}>
      {requestNotice}
      {cleanupError && <View accessibilityRole="alert" style={s.trashNotice}>
        <Text style={s.trashPolicy}>{cleanupError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="휴지통 정리 다시 시도" onPress={onRetryCleanup} style={s.trashRestore}>
          <Text style={s.trashRestoreText}>다시 시도</Text>
        </Pressable>
      </View>}
      {!diaries.length ? (suppressEmpty ? null :
        <EmptyState compact={compact} title="휴지통이 비어 있어요" copy={serverMode && !onDeletePermanently ? "삭제한 다이어리를 이곳에서 확인하고 복원할 수 있어요." : "삭제한 다이어리는 이곳에서 복원하거나 영구 삭제할 수 있어요."} />
      ) : (
        <View style={[s.trashGrid, compact && s.trashGridCompact]}>
          {diaries.map((diary) => (
            <TrashCard
              key={diary.id}
              diary={diary}
              compact={compact}
              busy={busy}
              status={serverMode ? (diary.retentionStatus === 'EXPIRED' ? '보관 기한 만료 · 복원할 수 없어요' : diary.expiresAt ? `보관 기한 ${new Date(diary.expiresAt).toLocaleDateString('ko-KR')}` : '보관 기한 확인 필요') : trashStatus(diary, now)}
              restoreDisabled={!onRestore || (serverMode ? !diary.canRestore : isTrashExpired(diary, now))}
              canDelete={Boolean(onDeletePermanently) && (!serverMode || diary.canPermanentlyDelete === true)}
              onRestore={restore}
              onDeletePermanently={purge}
            />
          ))}
        </View>
      )}
    </ScrollView>
    </View>
  );
}
