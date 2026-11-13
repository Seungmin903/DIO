import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { bubble, colors, DISABLED_OPACITY } from '../../shared/theme';
import { C } from '../constants';
import { styles as s } from '../styles';
import PopoverMenu from './PopoverMenu';

const MENU_WIDTH = 230;
const LINK_WIDTH = 320;

/**
 * 보관함 오른쪽 아래 + 버튼. 초대 링크를 받은 사람이 다이어리를 열지 않고도 여기서 참여한다.
 * - onCreate · onJoinLink 둘 다: 누르면 말풍선 메뉴(새 다이어리 만들기 · 초대 링크로 참여)
 * - onCreate 만(예: 개발용 목업): 지금처럼 누르면 바로 만든다
 * - onJoinLink 만(공유된 다이어리 탭: 새 다이어리는 개인 다이어리로 들어가 여기서 만들지 않는다): 누르면 바로 링크 칸
 * onJoinLink(link): 붙여 넣은 링크. 확인 · 로그인 · 수락은 앱의 초대 흐름(공유 창)이 맡는다.
 */
export default function LibraryCreateMenu({ compact = false, onCreate, onJoinLink }) {
  const button = useRef(null);
  const field = useRef(null);
  const [mode, setMode] = useState(null); // null · 'menu' · 'link'
  const [anchor, setAnchor] = useState(null);
  const [link, setLink] = useState('');
  const [focused, setFocused] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState(null);
  useEffect(() => {
    if (mode !== 'link') return undefined;
    const show = Keyboard?.addListener?.('keyboardDidShow', event => setKeyboardTop(event.endCoordinates?.screenY ?? null));
    const hide = Keyboard?.addListener?.('keyboardDidHide', () => setKeyboardTop(null));
    return () => { show?.remove(); hide?.remove(); setKeyboardTop(null); };
  }, [mode]);
  if (!onCreate && !onJoinLink) return null;
  const both = Boolean(onCreate && onJoinLink);
  const close = () => { setMode(null); setLink(''); setFocused(false); };
  const open = next => {
    const node = button.current;
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => { setAnchor({ x, y, width, height }); setMode(next); });
    else { setAnchor(null); setMode(next); }
  };
  const press = () => {
    if (mode) { close(); return; }
    if (both) open('menu');
    else if (onCreate) onCreate();
    else open('link');
  };
  const create = () => { close(); onCreate(); };
  const value = link.trim();
  const join = () => {
    if (!value) return;
    close();
    onJoinLink(value);
  };
  const label = both ? '새 다이어리 메뉴' : onCreate ? '새 다이어리 만들기' : '초대 링크로 참여';
  return <>
    <Pressable ref={button} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={both || !onCreate ? { expanded: mode !== null } : undefined} hitSlop={2} onPress={press}
      style={({ pressed }) => [s.createFab, compact && s.createFabCompact, pressed && s.pressed]}>
      <AppIcon name="add" size={compact ? 20 : 24} strokeWidth={2} color={C.white} />
    </Pressable>
    <PopoverMenu open={mode === 'menu'} anchor={anchor} width={MENU_WIDTH} height={112} label="새 다이어리 메뉴 목록" style={m.menu} onClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="새 다이어리 만들기" onPress={create} style={({ pressed }) => [m.option, pressed && s.pressed]}>
        <AppIcon name="add" size={18} forText={14} color={colors.primaryText} />
        <Text style={m.optionText}>새 다이어리 만들기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="초대 링크로 참여" onPress={() => setMode('link')} style={({ pressed }) => [m.option, pressed && s.pressed]}>
        <AppIcon name="link" size={18} forText={14} color={colors.primaryText} />
        <Text style={m.optionText}>초대 링크로 참여</Text>
      </Pressable>
    </PopoverMenu>
    <PopoverMenu open={mode === 'link'} keyboardAware availableHeight={keyboardTop} anchor={anchor ? { ...anchor, width: LINK_WIDTH } : null}
      width={LINK_WIDTH} height={176} label="초대 링크로 참여" style={m.panel} onClose={close}>
      <View style={m.head}>
        <Text accessibilityRole="header" style={m.title} numberOfLines={1}>초대 링크로 참여</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="초대 링크로 참여 닫기" onPress={close} style={m.close}>
          <AppIcon name="close" size={18} color={colors.primaryText} />
        </Pressable>
      </View>
      <View style={m.body}>
        <TextInput ref={field} accessibilityLabel="받은 초대 링크" autoFocus
          placeholder="초대 링크" placeholderTextColor={colors.textMuted}
          value={link} onChangeText={setLink} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go"
          onSubmitEditing={join} style={[m.field, focused && m.fieldFocused]} />
        <Pressable accessibilityRole="button" accessibilityLabel="초대 링크로 참여하기" accessibilityState={{ disabled: !value }}
          disabled={!value} onPress={join} style={({ pressed }) => [m.join, !value && m.disabled, pressed && s.pressed]}>
          <Text style={m.joinText}>참여</Text>
        </Pressable>
      </View>
    </PopoverMenu>
  </>;
}

const m = StyleSheet.create({
  menu: { ...bubble, padding: 8 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 10 },
  optionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  panel: { ...bubble, padding: 0, overflow: 'hidden' },
  head: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  // 입력칸 경계는 흰색 위 3:1 이상(primary), 누르고 있으면 primaryStrong 2(계정 입력 칸과 같다)
  field: { flex: 1, minWidth: 0, height: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 14,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }) }, // 웹의 기본 포커스 윤곽 대신 칸 테두리(포커스 2px)만 보인다
  fieldFocused: { borderColor: colors.primaryStrong, borderWidth: 2, paddingHorizontal: 13 },
  join: { width: 72, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primaryStrong },
  joinText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: DISABLED_OPACITY },
});
