import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles as s } from '../styles';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import Cover from '../components/Cover';
import AppIcon from '../../shared/AppIcon';
import { formatUpdatedAt } from '../utils/diaryLibrary';

export default function TrashScreen({ diaries, onRestore, onDeletePermanently }) {
  return (
    <ScrollView contentContainerStyle={s.screen} showsVerticalScrollIndicator={false}>
      <Header eyebrow="TRASH" title="휴지통" />
      {!diaries.length ? (
        <EmptyState title="휴지통이 비어 있어요" copy="삭제한 다이어리는 이곳에서 복원하거나 영구 삭제할 수 있어요." />
      ) : (
        <View style={s.trashGrid}>
          {diaries.map((diary) => (
            <View key={diary.id} style={s.trashCard}>
              <View style={s.trashCover}><Cover diary={diary} grid /></View>
              <Text numberOfLines={1} style={s.trashTitle}>{diary.title}</Text>
              <Text style={s.trashDate}>삭제 {formatUpdatedAt(diary.trashedAt)}</Text>
              <View style={s.trashActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${diary.title} 복원`}
                  onPress={() => onRestore(diary.id)}
                  style={({ pressed }) => [s.trashRestore, pressed && s.pressed]}
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
