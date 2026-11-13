import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LibraryScreen from '../../src/diary/screens/LibraryScreen';

function Fixture() {
  const [view, setView] = useState('open');
  const [filter, setFilter] = useState('personal');
  const { width, height } = useWindowDimensions();
  return <SafeAreaProvider><View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', gap: 10, padding: 8 }}>
      {['open', 'carousel', 'grid'].map(value => <Pressable key={value} accessibilityLabel={`QA ${value}`} onPress={() => setView(value)}><Text>{value}</Text></Pressable>)}
      {['personal', 'shared', 'favorite'].map(value => <Pressable key={value} accessibilityLabel={`QA ${value}`} onPress={() => setFilter(value)}><Text>{value}</Text></Pressable>)}
    </View>
    <LibraryScreen compact={Math.min(width, height) < 600} portrait={width < height} diaries={[]} filter={filter}
      view={view} carousel={0} onViewChange={setView} onFilterChange={setFilter} onCarouselChange={() => {}} onCreate={() => {}} />
  </View></SafeAreaProvider>;
}
registerRootComponent(Fixture);
