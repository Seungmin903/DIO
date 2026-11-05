import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorModal from '../editor/components/controls/EditorModal';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Icon from '../editor/components/controls/Icon';
import MemberAvatar from './MemberAvatar';
import { sharingStyles as s } from './styles';
import { notificationCountLabel } from '../notifications/notificationCount.js';

export default function SharingEntry({
  vertical = false,
  members = [],
  onPress,
  count = 0,
  compact = false,
  // variant 'bar': 편집 화면 상단 바 전용 테두리 칩. showLabel 이 꺼지면 아이콘만, memberLimit 은 보이는 사진 수, hideCounter 는 +N 숨김
  variant = 'default',
  showLabel = true,
  memberLimit = 2,
  hideCounter = false,
  plain = false, // 'bar' 아이콘만: 테두리 · 바탕 없이 옆의 다른 상단 바 아이콘과 같은 모양
  notifications = false,
  notificationLabel = '받은 초대',
  notificationCount,
}) {
  const circles = useRef(null);
  const alive = useRef(true);
  const measurement = useRef(0);
  const insets = useSafeAreaInsets();
  const [anchor, setAnchor] = useState(null);
  const { width, height } = useWindowDimensions();
  const closePeople = () => {
    measurement.current++;
    setAnchor(null);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      measurement.current++;
    };
  }, []);
  useEffect(() => {
    closePeople();
  }, [width, height, insets.left, insets.right, insets.top, insets.bottom]);
  const openPeople = () => {
    const request = ++measurement.current;
    circles.current?.measureInWindow((x, y, w, h) => {
      if (alive.current && request === measurement.current) setAnchor({ x, y, w, h });
    });
  };
  const leftEdge = insets.left + 8,
    rightEdge = width - insets.right - 8;
  const topEdge = insets.top + 8,
    bottomEdge = height - insets.bottom - 8;
  const cardWidth = Math.min(320, Math.max(0, rightEdge - leftEdge));
  const cardHeight = Math.min(82 + members.length * 72, Math.max(0, bottomEdge - topEdge));
  const left = anchor
    ? Math.max(leftEdge, Math.min(anchor.x + anchor.w - cardWidth, rightEdge - cardWidth))
    : leftEdge;
  const top = anchor
    ? Math.max(topEdge, Math.min(anchor.y + anchor.h + 8, bottomEdge - cardHeight))
    : topEdge;
  const bar = variant === 'bar';
  const visibleCount = bar ? memberLimit : compact ? 1 : 2;
  const label = notifications ? notificationLabel : '다이어리 공유';
  const summary = notifications && notificationCount ? notificationCountLabel(notificationCount.data) : null;
  const countDescription = summary ? (summary.value === null ? '' : `, ${summary.label} ${summary.value}개`) : (count ? `, 새 초대 ${count}개` : '');
  const needsCheck = notifications && notificationCount?.status === 'error' ? ', 알림 수 확인 필요' : '';
  return (
    <View ref={circles} style={[s.entryGroup, vertical && { flexDirection: 'column' }]}>
      {!notifications && members.length > 0 && (
        <Pressable
          style={bar ? s.barMembers : s.memberCircles}
          accessibilityRole="button"
          accessibilityLabel={`참여자 ${members.length}명 보기`}
          accessibilityState={{ expanded: !!anchor }}
          onPress={openPeople}
        >
          {members.slice(0, visibleCount).map((member, index) => (
            <View
              key={member.id}
              style={[
                s.memberCircle,
                index === 1 && s.memberCircleAlternate,
                { zIndex: visibleCount - index },
                compact && s.memberCircleCompact,
              ]}
              accessibilityLabel={`${member.nickname} 참여 중`}
            >
              <MemberAvatar member={member} />
            </View>
          ))}
          {members.length > visibleCount && !(bar && hideCounter) && (bar ? (
            <View style={s.barCounter}>
              <Text style={s.barCounterText}>+{members.length - visibleCount}</Text>
            </View>
          ) : (
            <View style={[s.memberCircle, s.memberCounter, compact && s.memberCircleCompact]}>
              <Text style={s.avatarText}>+{members.length - visibleCount}</Text>
            </View>
          ))}
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${countDescription}${needsCheck}`}
        hitSlop={4}
        onPress={() => {
          closePeople();
          onPress?.();
        }}
        style={bar ? [s.barEntry, !showLabel && s.barEntryIcon, plain && s.barEntryPlain] : notifications && compact ? [s.entry, s.entryBell, summary && { flexDirection: 'column', gap: 0 }] : s.entry}
      >
        <Icon name={notifications ? 'bell' : 'userPlus'} size={20} forText={bar && showLabel ? 13 : undefined} />
        {!compact && (!bar || showLabel) && <Text style={bar ? s.barText : s.bold}>{notifications ? '알림' : '공유'}</Text>}
        {summary && summary.value > 0 && <Text style={[s.bold, compact && { fontSize: 12, lineHeight: 14 }]}>{summary.value > 99 ? '99+' : summary.value}</Text>}
        {(summary ? summary.showDot : count > 0) && <View testID="notification-dot" style={bar ? [s.barDot, !showLabel && s.barDotIcon] : s.dot} />}
      </Pressable>
      {!!anchor && (
        <EditorModal transparent visible animationType="none" onRequestClose={closePeople}>
          <Pressable
            accessible={false}
            testID="sharing-people-outside"
            style={s.peopleBackdrop}
            onPress={closePeople}
          >
            <Pressable
              accessible={false}
              style={[s.peopleCard, { left, top, width: cardWidth, maxHeight: cardHeight }]}
              onPress={(event) => event.stopPropagation()}
            >
              <Text accessibilityRole="header" style={s.peopleTitle}>
                공유 중인 사람 · {members.length}명
              </Text>
              <ScrollView style={s.peopleList} keyboardShouldPersistTaps="handled">
                {members.map((member, index) => (
                  <View key={member.id} style={s.peopleRow}>
                    <View
                      style={[
                        s.peopleAvatar,
                        index % 2 === 1 && s.memberCircleAlternate,
                        member.presence === '자리 비움' && s.peopleAway,
                      ]}
                    >
                      <MemberAvatar
                        member={member}
                        muted={member.presence === '자리 비움'}
                      />
                    </View>
                    <View style={s.grow}>
                      <Text numberOfLines={1} style={s.bold}>
                        {member.nickname}
                      </Text>
                      <Text style={s.muted}>
                        {member.id === 'self' ? '나 · ' : ''}
                        {member.presence}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </EditorModal>
      )}
    </View>
  );
}
