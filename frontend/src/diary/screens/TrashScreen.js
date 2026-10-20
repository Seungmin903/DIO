import { ScrollView } from 'react-native';
import { styles as s } from '../styles';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';

export default function TrashScreen() {
  return (
    <ScrollView contentContainerStyle={s.screen} showsVerticalScrollIndicator={false}>
      <Header eyebrow="TRASH" title="휴지통" />
      <EmptyState title="휴지통이 비어 있어요" copy="삭제한 다이어리는 이곳에서 다시 확인할 수 있어요." />
    </ScrollView>
  );
}
