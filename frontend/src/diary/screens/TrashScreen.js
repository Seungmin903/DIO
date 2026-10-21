import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles as s } from '../styles';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import Cover from '../components/Cover';
import TrashSwipeRow from '../components/TrashSwipeRow';
import AppIcon from '../../shared/AppIcon';
import { formatUpdatedAt } from '../utils/diaryLibrary';
import { isTrashExpired, trashStatus } from '../utils/trashRetention';

// compact: 폰에서는 카드 대신 쓸어서 복원·삭제하는 한 줄 목록으로 보여 준다.
export default function TrashScreen({ diaries, onRestore, onDeletePermanently, compact = false, now = Date.now(), cleanupError, onRetryCleanup }) {
  return (
    <ScrollView contentContainerStyle={[s.screen, compact && s.screenCompact]} showsVerticalScrollIndicator={false}>
      <Header eyebrow="TRASH" title="휴지통" />
      <Text style={s.trashPolicy}>삭제한 다이어리는 30일 동안 복원할 수 있어요. 기한이 지나면 영구 삭제되며, 앱이 꺼져 있으면 다음 실행 시 정리해요.</Text>
      {cleanupError && <View accessibilityRole="alert" style={s.trashNotice}>
        <Text style={s.trashPolicy}>{cleanupError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="휴지통 정리 다시 시도" onPress={onRetryCleanup} style={s.trashRestore}>
          <Text style={s.trashRestoreText}>다시 시도</Text>
        </Pressable>
      </View>}
      {!diaries.length ? (
        <EmptyState title="휴지통이 비어 있어요" copy="삭제한 다이어리는 이곳에서 복원하거나 영구 삭제할 수 있어요." />
      ) : compact ? (
        <>
          <Text style={s.trashHint}>왼쪽으로 쓸어 복원하거나 영구 삭제하세요.</Text>
          <View style={s.trashList}>
            {diaries.map((diary) => (
              <TrashSwipeRow key={diary.id} diary={diary} now={now} onRestore={onRestore} onDelete={onDeletePermanently} />
            ))}
          </View>
        </>
      ) : (
        <View style={s.trashGrid}>
          {diaries.map((diary) => (
            <View key={diary.id} style={s.trashCard}>
              <View style={s.trashCover}><Cover diary={diary} grid /></View>
              <Text numberOfLines={1} style={s.trashTitle}>{diary.title}</Text>
              <Text style={s.trashDate}>삭제 {formatUpdatedAt(diary.trashedAt)}</Text>
              <Text style={s.trashDate}>{trashStatus(diary, now)}</Text>
              <View style={s.trashActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${diary.title} 복원`}
                  disabled={isTrashExpired(diary, now)}
                  accessibilityState={{ disabled: isTrashExpired(diary, now) }}
                  onPress={() => onRestore(diary.id)}
                  style={({ pressed }) => [s.trashRestore, isTrashExpired(diary, now) && { opacity: 0.45 }, pressed && s.pressed]}
                >
                  <Text style={s.trashRestoreText}>복원</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${diary.title} 영구 삭제`}
                  onPress={() => onDeletePermanently(diary)}
                  style={({ pressed }) => [s.trashDelete, pressed && s.pressed]}
                >
                  <AppIcon name="trash" size={17} color="#BD5B58" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
