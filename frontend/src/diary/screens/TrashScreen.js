import { Pressable, ScrollView, Text, View } from 'react-native';
import { C } from '../constants';
import { DISABLED_OPACITY } from '../../shared/theme';
import { styles as s } from '../styles';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import Cover from '../components/Cover';
import AppIcon from '../../shared/AppIcon';
import { formatUpdatedAt } from '../utils/diaryLibrary';
import { isTrashExpired, trashStatus } from '../utils/trashRetention';

// 폰과 태블릿 모두 같은 카드·복원·영구 삭제 흐름을 사용한다.
export default function TrashScreen({ diaries, onRestore, onDeletePermanently, compact = false, now = Date.now(), cleanupError, onRetryCleanup,
  serverMode = false, busy = false, requestNotice = null, suppressEmpty = false }) {
  return (
    <ScrollView contentContainerStyle={[s.screen, compact && s.screenCompact]} showsVerticalScrollIndicator={false}>
      <Header title="휴지통" compact={compact} />
      <Text style={s.trashPolicy}>{serverMode ? '삭제한 다이어리는 30일 동안 복원할 수 있어요. 보관 기한과 복원 가능 여부는 서버에서 확인해요.' : '삭제한 다이어리는 30일 동안 복원할 수 있어요. 기한이 지나면 영구 삭제되며, 앱이 꺼져 있으면 다음 실행 시 정리해요.'}</Text>
      {requestNotice}
      {cleanupError && <View accessibilityRole="alert" style={s.trashNotice}>
        <Text style={s.trashPolicy}>{cleanupError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="휴지통 정리 다시 시도" onPress={onRetryCleanup} style={s.trashRestore}>
          <Text style={s.trashRestoreText}>다시 시도</Text>
        </Pressable>
      </View>}
      {!diaries.length ? (suppressEmpty ? null :
        <EmptyState compact={compact} title="휴지통이 비어 있어요" copy={serverMode && !onDeletePermanently ? "삭제한 다이어리는 이곳에서 30일 안에 복원할 수 있어요." : "삭제한 다이어리는 이곳에서 복원하거나 영구 삭제할 수 있어요."} />
      ) : (
        <View style={[s.trashGrid, compact && s.trashGridCompact]}>
          {diaries.map((diary) => (
            <View key={diary.id} style={[s.trashCard, compact && s.trashCardCompact]}>
              <View style={[s.trashCover, compact && s.trashCoverCompact]}><Cover diary={diary} grid compact={compact} /></View>
              <Text numberOfLines={1} style={s.trashTitle}>{diary.title}</Text>
              <Text style={s.trashDate}>삭제 {formatUpdatedAt(diary.trashedAt)}</Text>
              <Text style={s.trashDate}>{serverMode ? (diary.retentionStatus === 'EXPIRED' ? '보관 기한 만료 · 복원할 수 없어요' : diary.expiresAt ? `보관 기한 ${new Date(diary.expiresAt).toLocaleDateString('ko-KR')}` : '보관 기한 확인 필요') : trashStatus(diary, now)}</Text>
              <View style={s.trashActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${diary.title} 복원`}
                  disabled={busy || !onRestore || (serverMode ? !diary.canRestore : isTrashExpired(diary, now))}
                  accessibilityState={{ disabled: busy || !onRestore || (serverMode ? !diary.canRestore : isTrashExpired(diary, now)) }}
                  onPress={() => onRestore(diary.id)}
                  style={({ pressed }) => [s.trashRestore, serverMode && {minHeight:44}, (busy || !onRestore || (serverMode ? !diary.canRestore : isTrashExpired(diary, now))) && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
                >
                  <Text style={s.trashRestoreText}>복원</Text>
                </Pressable>
                {onDeletePermanently && (!serverMode || diary.canPermanentlyDelete) && <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${diary.title} 영구 삭제`}
                  disabled={busy}
                  accessibilityState={{ disabled: busy }}
                  onPress={() => onDeletePermanently(diary)}
                  style={({ pressed }) => [s.trashDelete, serverMode && {minWidth:44,minHeight:44}, busy && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
                >
                  <AppIcon name="trash" size={17} color={C.danger} />
                </Pressable>}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
