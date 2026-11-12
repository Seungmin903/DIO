import { useMemo, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import EditorModal from '../../editor/components/controls/EditorModal';
import EditorIcon from '../../editor/components/controls/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppIcon from '../../shared/AppIcon';
import { notify } from '../../shared/dialogs';
import { colors, radius } from '../../shared/theme';
import BackButton from './BackButton';
import EmptyState from './EmptyState';
import licenses from '../data/contentLicenses.json';
import software from '../../licenses/softwareNotices';
import { obtainLicenseSource } from '../../licenses/sourceFiles';

// 오픈소스 및 콘텐츠 라이선스(2026-11-09 지라 596 A안): 카드 없이 '이름 한 줄 목록 → 상세(고지 · 전문 원문)'.
// 안드로이드 Open source licenses · iOS Acknowledgements · 카카오톡 · 구글 드라이브와 같은 2단 구조. 태블릿 가로(넓은 창)는 목록 320 + 상세를 나란히.
// 머리줄은 앱 원래 바탕 연보라(surfaceSoft), 본문은 흰 바탕. 검색창은 프로필 입력 칸처럼 흰 면 + primary 테두리.
const LEGAL_CHUNK = 24000;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const hasVersion = version => typeof version === 'string' && /\d/.test(version);
const summary = entry => [entry.license, hasVersion(entry.version) ? entry.version : null].filter(Boolean).join(' · ');
// 대소문자를 가리지 않고 숫자는 크기대로 보는 이름 순(예전엔 데이터 순서라 Zstandard 다음에 libavif 가 왔다).
// localeCompare(locale · 옵션)는 안드로이드 Hermes 에서 부를 때마다 ICU 를 거쳐 300개 정렬에도 설정이 버벅였다.
// 그래서 항목마다 비교 키를 한 번 만들고 문자열 비교만 한다: 소문자로 바꾸고, 숫자 묶음은 앞 0을 떼고 자릿수(4자리)를 앞에 붙인다.
// 자릿수가 먼저 비교되어 몇 자리 숫자든 크기 순이 된다(lib2 → lib0001 2, lib10 → lib0002 10)
const sortKey = name => String(name ?? '').toLowerCase().replace(/\d+/g, digits => {
  const value = digits.replace(/^0+(?=\d)/, '');
  return String(value.length).padStart(4, '0') + value;
});
export function sortByName(entries) {
  return entries.map(entry => [sortKey(entry.name), entry]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, entry]) => entry);
}
// 목록은 앱이 도는 동안 바뀌지 않아 처음 열 때 한 번만 정렬하고 다시 쓴다(화면을 다시 열어도 정렬하지 않는다)
let sortedAll = null;
const allEntries = () => (sortedAll ??= sortByName([...licenses, ...software.components]));

// 고지 생성기가 파일마다 붙인 '--- LICENSE ---' · '--- Source copyright header 1 ---' 같은 표시 줄(원문 아님)을 걷어 낸다(2026-11-09 사용자).
// 표시 줄은 지우되, 여러 라이브러리를 묶은 항목(예: Skia 의 HarfBuzz · libpng …)은 어느 고지인지 알 수 있게 대시를 뗀 이름만 작은 소제목으로 남긴다.
// '--- end of FTL.TXT ---' 처럼 원문 마지막 줄인 것과 원문 안의 긴 대시 구분선(OFL 등)은 그대로 둔다.
const MARKER = /^---\s(?!end of\b)(.*\S)\s---$/i;
export function legalSections(text = '') {
  const sections = [];
  let current = { label: '', lines: [] };
  for (const line of text.split('\n')) {
    const marker = line.trim().match(MARKER);
    if (marker) {
      if (current.lines.join('').trim()) sections.push(current);
      current = { label: marker[1], lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.join('').trim()) sections.push(current);
  const tidy = lines => lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // 소제목은 '라이브러리 (파일)' 꼴만 남긴다. 'LICENSE' · 'MIT license' · 'Source copyright header 1' 같은 일반 이름은 정보가 없어 지운다
  return sections.map(section => ({ label: sections.length > 1 && /\(/.test(section.label) ? section.label : '', body: tidy(section.lines) }));
}

async function openLink(url) {
  try { await Linking.openURL(url); }
  catch { notify('링크를 열지 못했어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); }
}

function LinkRow({ label, text, icon = 'external', onPress }) {
  return <Pressable accessibilityRole={icon === 'external' ? 'link' : 'button'} accessibilityLabel={label} onPress={onPress} style={styles.linkRow}>
    <Text style={[styles.rowText, styles.grow]} numberOfLines={1}>{text}</Text>
    <EditorIcon name={icon} size={18} color={colors.textMuted} />
  </Pressable>;
}

function LicenseDetail({ entry, wide }) {
  const [legalLimit, setLegalLimit] = useState(LEGAL_CHUNK);
  const getSource = async source => {
    try { await obtainLicenseSource(source); }
    catch (error) { notify('소스 파일을 열지 못했어요', error.message); }
  };
  const info = [entry.creator, entry.usage, entry.changes].filter(Boolean);
  const sections = useMemo(() => legalSections(entry.text), [entry.text]);
  const total = sections.reduce((sum, section) => sum + section.body.length, 0);
  // 아주 긴 전문(예: Skia 묶음)은 24,000자씩 나눠 그린다
  let budget = legalLimit;
  const shown = [];
  for (const section of sections) {
    if (budget <= 0) break;
    shown.push({ ...section, body: section.body.slice(0, budget) });
    budget -= section.body.length;
  }
  return <ScrollView style={styles.detail} contentContainerStyle={[styles.detailBody, wide && styles.detailBodyWide]}>
    <Text selectable accessibilityRole="header" style={styles.detailTitle}>{entry.name}</Text>
    {!!summary(entry) && <Text selectable style={styles.meta}>{summary(entry)}</Text>}
    {info.map((line, index) => <Text key={index} selectable style={styles.info}>{line}</Text>)}
    <View style={styles.links}>
      {!!entry.sourceUrl && <LinkRow label={`${entry.name} 출처 열기`} text="출처" onPress={() => openLink(entry.sourceUrl)} />}
      {!!entry.licenseUrl && <LinkRow label={`${entry.name} 라이선스 웹페이지 열기`} text="라이선스 웹페이지" onPress={() => openLink(entry.licenseUrl)} />}
      {entry.sourceArchives?.map(source => <LinkRow key={source.fileName} icon="upload" label={`${entry.name} 소스 받기`} text={`소스 받기 · ${source.fileName}`} onPress={() => getSource(source)} />)}
    </View>
    {!!entry.notice && <>
      <Text accessibilityRole="header" style={styles.detailHeading}>고지</Text>
      <Text selectable style={styles.legal}>{entry.notice}</Text>
      <View style={styles.rule} />
    </>}
    <Text accessibilityRole="header" style={styles.detailHeading}>라이선스 전문</Text>
    {shown.map((section, index) => <View key={index} style={index ? styles.legalSection : null}>
      {!!section.label && <Text selectable accessibilityRole="header" style={styles.legalLabel}>{section.label}</Text>}
      <Text selectable style={styles.legal}>{section.body}</Text>
    </View>)}
    {legalLimit < total && <Pressable accessibilityRole="button" onPress={() => setLegalLimit(value => value + LEGAL_CHUNK)} style={styles.more}>
      <Text style={styles.moreText}>전문 더 보기</Text>
    </Pressable>}
  </ScrollView>;
}

export default function ContentLicenses({ visible, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const { width, height } = useWindowDimensions();
  // 넓은 가로 창(태블릿 가로)만 목록 · 상세를 나란히. 폰 · 태블릿 세로는 목록 → 상세로 넘어간다
  const wide = width >= 960 && width > height;
  const all = allEntries();
  const entries = useMemo(() => {
    const term = query.trim().toLowerCase();
    return all.filter(entry => !term || `${entry.name} ${entry.version ?? ''} ${entry.license}`.toLowerCase().includes(term));
  }, [all, query]);
  // 넓은 창은 지금 목록(검색 결과) 안에서만 고른 항목을 둔다 — 검색으로 빠진 항목의 상세가 오른쪽에 남지 않게(리뷰 !489)
  const selected = wide ? entries.find(entry => entry.id === selectedId) || entries[0] || null : all.find(entry => entry.id === selectedId) || null;
  const showDetail = !wide && Boolean(selected);
  const back = () => { if (showDetail) setSelectedId(null); else onClose(); };
  const list = <View style={wide ? styles.listPaneWide : styles.listPane}>
    <View style={styles.search}>
      <AppIcon name="search" size={20} color={colors.primaryStrong} />
      <TextInput accessibilityLabel="라이선스 검색" placeholder="이름·라이선스로 검색" placeholderTextColor={colors.textMuted} value={query}
        onChangeText={setQuery} style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => setQuery('')} style={styles.clear}>
        <AppIcon name="close" size={18} color={colors.textMuted} />
      </Pressable>}
    </View>
    {entries.length ? <FlatList data={entries} keyExtractor={entry => entry.id} keyboardShouldPersistTaps="handled" initialNumToRender={16} windowSize={9}
      ListHeaderComponent={<Text accessibilityRole="header" style={styles.sectionTitle}>{query.trim() ? `검색 결과 ${entries.length}개` : `전체 ${entries.length}개`}</Text>}
      renderItem={({ item }) => {
        const on = wide && selected?.id === item.id;
        return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 라이선스 전문 보기`} accessibilityState={{ selected: on }} onPress={() => setSelectedId(item.id)}
          style={[styles.row, on && styles.rowOn]}>
          <View style={styles.grow}>
            <Text numberOfLines={1} style={[styles.rowText, on && styles.rowTextOn]}>{item.name}</Text>
            {!!summary(item) && <Text numberOfLines={1} style={styles.rowSub}>{summary(item)}</Text>}
          </View>
          {!wide && <AppIcon name="chevron-right" size={18} forText={16} color={colors.textMuted} />}
        </Pressable>;
      }} contentContainerStyle={styles.listBody} />
      : <EmptyState compact search title="검색 결과가 없어요" />}
  </View>;
  return <EditorModal visible={visible} animationType="none" supportedOrientations={['portrait', 'landscape']} statusBarTranslucent onRequestClose={back}>
    {visible && <StatusBar hidden />}
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <BackButton label={showDetail ? '라이선스 목록으로' : '라이선스 화면 닫기'} onPress={back} />
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{showDetail ? '라이선스 정보' : '오픈소스 및 콘텐츠 라이선스'}</Text>
      </View>
      <View style={styles.body}>
        {wide ? <>{list}{selected ? <LicenseDetail key={selected.id} entry={selected} wide /> : <View style={styles.grow} />}</>
          : showDetail ? <LicenseDetail key={selected.id} entry={selected} /> : list}
      </View>
    </SafeAreaView>
  </EditorModal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceSoft },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceSoft, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '700' },
  body: { flex: 1, flexDirection: 'row', backgroundColor: colors.surface },
  grow: { flex: 1, minWidth: 0 },
  listPane: { flex: 1, paddingTop: 12 },
  // 넓은 창 목록 칸 320 고정. listPane 의 flex: 1 과 합치면 기준 너비가 0 이 되어 웹에서 칸이 1px 로 접혔다
  listPaneWide: { width: 320, paddingTop: 12, borderRightWidth: 1, borderRightColor: colors.cardBorder },
  // 검색창: 프로필 입력 칸과 같은 흰 면 + primary 테두리(흰 본문 위에서 구분), 돋보기 primaryStrong
  search: { minHeight: 48, marginHorizontal: 20, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg, backgroundColor: colors.surface },
  // 웹 기본 검은 포커스 윤곽 대신 바깥 검색창 테두리만(다이어리 검색과 같음)
  searchInput: { flex: 1, minWidth: 0, minHeight: 46, paddingVertical: 10, fontSize: 16, color: colors.text, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  listBody: { paddingHorizontal: 20, paddingBottom: 32 },
  // 구역 제목: 설정 SettingTitle 과 같은 14/700 · 위 16 · 아래 4
  sectionTitle: { marginTop: 16, marginBottom: 4, color: colors.text, fontSize: 14, fontWeight: '700' },
  // 목록 한 줄 64: 이름 16/600 + 라이선스 · 버전 13, 아래 구분선만(카드 없음)
  row: { minHeight: 64, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  rowOn: { marginHorizontal: -20, paddingHorizontal: 20, backgroundColor: colors.surfaceMuted },
  rowText: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  rowTextOn: { color: colors.primaryText },
  rowSub: { marginTop: 2, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  detail: { flex: 1 },
  detailBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  detailBodyWide: { paddingHorizontal: 28 },
  detailTitle: { color: colors.text, fontSize: 21, lineHeight: 28, fontWeight: '800' },
  meta: { marginTop: 6, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  info: { marginTop: 2, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  links: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  linkRow: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  // 고지 · 전문: 카드 없이 흰 바탕 위 고정폭 글(처리방침 화면처럼), 사이는 구분선(아래 12 · 다음 제목 위 16)
  legal: { color: colors.text, fontFamily: MONO, fontSize: 12.5, lineHeight: 20 },
  rule: { marginTop: 12, height: 1, backgroundColor: colors.cardBorder },
  // 상세 안 제목(고지 · 라이선스 전문): 구역 제목보다 한 단계 큰 제목(사용자 요청 2026-11-09)
  detailHeading: { marginTop: 24, marginBottom: 10, color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '800' },
  // 묶음 항목의 구역 이름(예: HarfBuzz (skia-harfbuzz-COPYING.txt)): 대시 없이 작은 소제목
  legalSection: { marginTop: 20 },
  legalLabel: { marginBottom: 6, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  more: { minHeight: 48, justifyContent: 'center' },
  moreText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
});
