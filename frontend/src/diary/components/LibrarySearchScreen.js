import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { loadJSON, saveJSON } from '../../editor/services/storage';
import { C } from '../constants';
import { styles as s } from '../styles';
import AppIcon from '../../shared/AppIcon';
import IconButton from './IconButton';
import DiaryCard from './DiaryCard';
import EmptyState from './EmptyState';

const HISTORY_KEY = 'dio:diary:search-history:v1';
const cleanHistory = values => Array.isArray(values)
  ? [...new Set(values.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))].slice(0, 10) : [];

export default function LibrarySearchScreen({ compact, query, onQueryChange, onBack, diaries, metadata = {}, onOpen, onFavorite, onEdit, onDelete, optionsMenu = null, selectionBar = null, selecting = false, selected = [], onToggleSelect, requestNotice = null, hasMore = false, suppressEmpty = false, historyKey = HISTORY_KEY }) {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);
  const [history, setHistory] = useState([]);
  const [ready, setReady] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    setReady(false); setHistory([]);
    loadJSON(historyKey, []).then(values => {
      if (cancelled) return;
      setHistory(cleanHistory(values));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [historyKey]);
  const updateHistory = values => {
    if (!ready) return;
    const next = cleanHistory(values);
    setHistory(next);
    writes.current = writes.current.then(() => saveJSON(historyKey, next));
  };
  const remember = value => {
    const term = value.trim();
    if (term) updateHistory([term, ...history.filter(item => item !== term)]);
  };
  const searching = Boolean(query.trim());
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.libraryScreen, compact && s.libraryScreenCompact]}>
    <View style={s.librarySearchHeading}>
      <IconButton label={selecting ? '편집 완료' : '검색 닫기'} iconName="chevron-left" onPress={onBack} />
      <Text style={[s.libraryTitle, compact && s.libraryTitleCompact, { flex: 1 }]}>다이어리 검색</Text>
      {optionsMenu}
    </View>
    <View style={[s.librarySearchBar, s.librarySearchPageInput]}>
      <AppIcon name="search" size={20} color={C.muted} />
      <TextInput autoFocus editable={!selecting} accessibilityLabel="다이어리 제목 검색" placeholder="다이어리 이름을 검색해 주세요" placeholderTextColor={C.muted} value={query} onChangeText={onQueryChange} onSubmitEditing={() => remember(query)} returnKeyType="search" style={s.librarySearchInput} />
      <View style={s.librarySearchClearSlot}>
        {!!query && !selecting && <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => onQueryChange('')} style={({ pressed }) => [s.librarySearchClear, pressed && s.pressed]}>
          <AppIcon name="close" size={20} color={C.muted} />
        </Pressable>}
      </View>
    </View>
    {selectionBar}
    {requestNotice}
    {!searching ? <View style={s.librarySearchHistory}>
      <View style={s.librarySearchHistoryHeading}>
        <Text style={s.chipText}>최근 검색어</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="최근 검색어 전체 지우기" disabled={!ready || !history.length} onPress={() => updateHistory([])} style={({ pressed }) => [s.librarySearchHistoryClear, pressed && s.pressed]}>
          <Text style={s.librarySearchHistoryMuted}>전체 지우기</Text>
        </Pressable>
      </View>
      {history.map(term => <View key={term} style={s.librarySearchHistoryRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${term} 다시 검색`} onPress={() => { onQueryChange(term); remember(term); }} style={s.librarySearchHistoryTerm}>
          <Text style={s.librarySearchHistoryText}>{term}</Text>
        </Pressable>
        <IconButton label={`${term} 검색어 삭제`} iconName="close" onPress={() => updateHistory(history.filter(item => item !== term))} />
      </View>)}
    </View> : <View style={s.librarySearchResults}>
      {!suppressEmpty && <Text accessibilityLiveRegion="polite" style={s.chipText}>{`‘${query.trim()}’ 검색 결과 ${diaries.length}개${hasMore ? ' 불러옴 · 더 있음' : ''}`}</Text>}
      {!diaries.length && suppressEmpty ? null : !diaries.length ? <EmptyState compact={compact} search title="검색 결과가 없어요." /> : <View style={[s.grid, compact && s.gridCompact]}>
        {diaries.map(diary => <DiaryCard key={diary.id} diary={diary} pageCount={metadata[diary.id]?.pageCount} compact={compact} layout="grid" onOpen={item => { remember(query); onOpen(item); }} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} selecting={selecting} selected={selected.includes(diary.id)} onToggleSelect={onToggleSelect} />)}
      </View>}
    </View>}
  </ScrollView>;
}
