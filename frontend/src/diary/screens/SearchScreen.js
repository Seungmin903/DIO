import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { styles as s } from '../styles';
import DiaryCard from '../components/DiaryCard';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import IconButton from '../components/IconButton';

export default function SearchScreen({ diaries, query, onQueryChange, onOpen, onFavorite, onCreate, onClose }) {
  const word = query.trim().toLowerCase();
  const found = word ? diaries.filter((diary) => diary.title.toLowerCase().includes(word)) : diaries;

  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Header eyebrow="SEARCH YOUR MOMENTS" title="기록 찾기" right={<IconButton label="보관함으로 돌아가기" icon="×" onPress={onClose} />} />
      <View style={s.searchBox}>
        <Text style={s.searchIcon}>⌕</Text>
        <TextInput
          autoFocus
          accessibilityLabel="다이어리 검색"
          value={query}
          onChangeText={onQueryChange}
          placeholder="다이어리 이름으로 찾아보세요"
          placeholderTextColor="#8995AE"
          style={s.searchInput}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => onQueryChange('')} hitSlop={8}>
            <Text style={s.searchClear}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={s.resultCount}>{query ? `“${query}” 검색 결과 ${found.length}개` : `내 다이어리 ${diaries.length}개`}</Text>
      {found.length ? (
        <View style={s.searchList}>
          {found.map((diary) => <DiaryCard key={diary.id} diary={diary} layout="list" onOpen={() => onOpen(diary)} onFavorite={() => onFavorite(diary.id)} />)}
        </View>
      ) : (
        <EmptyState
          search
          title={diaries.length ? '찾는 다이어리가 없어요' : '아직 검색할 다이어리가 없어요'}
          copy={diaries.length ? '다른 이름으로 다시 찾아보세요.' : '새 다이어리를 만들면 이름으로 빠르게 찾을 수 있어요.'}
          onCreate={diaries.length ? null : onCreate}
        />
      )}
    </ScrollView>
  );
}
