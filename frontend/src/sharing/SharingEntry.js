import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from '../editor/components/controls/Icon';
import MemberAvatar from './MemberAvatar';
import { sharingStyles as s } from './styles';
import { notificationCountLabel } from '../notifications/notificationCount.js';

// 편집기 상단의 참여자 얼굴(2026-11-08 지라 680): 구글 스프레드시트 같은 워크스페이스처럼 나를 뺀 다른 참여자를 최대 3명.
// - 공유하지 않은 다이어리(참여자가 나뿐)는 얼굴을 띄우지 않고 공유 버튼만 둔다.
// - 접속 상태를 모르면(서버가 PRESENCE 를 아직 보내지 않음, member.online 이 없음) 모두 또렷하게 참여 순서대로.
// - 접속 상태를 알면 접속 안 한 사람(online === false)은 흐리게(OFFLINE_OPACITY), 지금 같은 다이어리를 연 사람(online === true)은
//   또렷하게 하고 앞(위)으로 보낸다. 같은 무리 안에서는 참여 순서 그대로.
// - 얼굴을 누르면 그 사람 닉네임만 얼굴 아래 작은 알약으로 NAME_PEEK_MS(1.5초, 머티리얼 툴팁 기본) 동안 보여 준다. 다른 얼굴을 누르면 바로 바뀐다.
//   목록 · 관리는 없다 — 누가 함께하는지 자세히 보기 · 관리는 옆의 공유 버튼(공유 창)이 맡는다. 알약은 나타나고 사라질 때 애니메이션이 없다.
// 50% 는 피그마의 유휴 표시 값이고, 누를 수 없는 버튼(DISABLED_OPACITY 0.4)과 헷갈리지 않게 그보다 조금 진하다. 노션도 안 보는 사람 얼굴을 흐리게 둔다.
export const MAX_FACES = 3;
export const OFFLINE_OPACITY = 0.5;
export const NAME_PEEK_MS = 1500;
export const isSelfMember = member => member?.self === true || member?.id === 'self';
export const othersOf = members => members.filter(member => !isSelfMember(member));
/** 접속한 사람이 먼저(참여 순서 유지), 그다음 접속 안 한 사람 */
export const facesOf = members => {
  const others = othersOf(members);
  return [...others.filter(member => member.online === true), ...others.filter(member => member.online !== true)];
};

export default function SharingEntry({
  vertical = false,
  members = [],
  onPress,
  count = 0,
  compact = false,
  // variant 'bar': 편집 화면 상단 바 전용 테두리 칩. showLabel 이 꺼지면 아이콘만, memberLimit 은 보이는 얼굴 수, hideCounter 는 +N 숨김
  variant = 'default',
  showLabel = true,
  memberLimit = 2,
  hideCounter = false,
  plain = false, // 'bar' 아이콘만: 테두리 · 바탕 없이 옆의 다른 상단 바 아이콘과 같은 모양
  notifications = false,
  notificationLabel = '받은 초대',
  notificationCount,
}) {
  const bar = variant === 'bar';
  // 잠깐 보여 줄 닉네임(누른 얼굴 id · 이름). 1.5초 뒤 저절로 사라진다
  const [peek, setPeek] = useState(null);
  const peekTimer = useRef(null);
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  const showName = (at, member) => {
    clearTimeout(peekTimer.current);
    setPeek({ at, id: member.id, name: member.nickname || '참여자' });
    peekTimer.current = setTimeout(() => setPeek(null), NAME_PEEK_MS);
  };
  const faces = notifications ? [] : facesOf(members);
  // 세로로 세운 폰 도구 막대(vertical)는 폭이 좁아 한 명 + 숫자만
  const visibleCount = Math.min(MAX_FACES, bar ? memberLimit : vertical ? 1 : MAX_FACES);
  const shown = faces.slice(0, visibleCount);
  const label = notifications ? notificationLabel : '다이어리 공유';
  const summary = notifications && notificationCount ? notificationCountLabel(notificationCount.data) : null;
  const countDescription = summary ? (summary.value === null ? '' : `, ${summary.label} ${summary.value}개`) : (count ? `, 새 초대 ${count}개` : '');
  const needsCheck = notifications && notificationCount?.status === 'error' ? ', 알림 수 확인 필요' : '';
  return (
    <View style={[s.entryGroup, vertical && { flexDirection: 'column' }]}>
      {/* 묶음을 accessible 로 두지 않는다 — 안쪽 얼굴(눌러서 닉네임 보기)이 화면 읽기에서 하나로 합쳐져 눌리지 않았다(AI 리뷰 2026-11-08).
          얼굴마다 닉네임 · 접속 여부 라벨로 읽히고, 묶음 라벨은 요약으로만 남긴다 */}
      {shown.length > 0 && (
        <View
          style={bar ? s.barMembers : s.memberCircles}
          accessibilityLabel={`함께하는 사람 ${faces.length}명${faces.some(member => typeof member.online === 'boolean') ? `, 지금 접속 ${faces.filter(member => member.online === true).length}명` : ''}`}
        >
          {shown.map((member, index) => (
            <Pressable
              key={member.id}
              onPress={() => showName(index, member)}
              hitSlop={4}
              style={[
                s.memberCircle,
                index === 1 && s.memberCircleAlternate,
                { zIndex: visibleCount - index },
                compact && s.memberCircleCompact,
                member.online === false && s.memberCircleOffline,
              ]}
              accessibilityLabel={`${member.nickname}${member.online === true ? ' 접속 중' : member.online === false ? ' 접속 안 함' : ''}`}
            >
              {/* 흐리게 할 때는 얼굴만 투명하게: 흰 테두리 · 흰 바탕은 그대로라 겹친 앞사람 얼굴이 비쳐 보이지 않는다.
                  얼굴 그림(색 동그라미 · 눈 · 입)을 한 장으로 합친 뒤 흐리게 한다 — 안드로이드는 따로 투명하게 해 눈 · 입 뒤로 바탕색이 비쳤다 */}
              <View needsOffscreenAlphaCompositing renderToHardwareTextureAndroid={member.online === false}
                style={[{ width: '100%', height: '100%' }, member.online === false && { opacity: OFFLINE_OPACITY }]}>
                <MemberAvatar member={member} />
              </View>
            </Pressable>
          ))}
          {faces.length > visibleCount && !(bar && hideCounter) && (bar ? (
            <View style={s.barCounter}>
              <Text style={s.barCounterText}>+{faces.length - visibleCount}</Text>
            </View>
          ) : (
            <View style={[s.memberCircle, s.memberCounter, compact && s.memberCircleCompact]}>
              <Text style={s.avatarText}>+{faces.length - visibleCount}</Text>
            </View>
          ))}
          {/* 누른 얼굴 바로 아래 가운데에 닉네임 알약. 얼굴 지름 d, 겹침 8 → i 번째 얼굴 가운데 = 묶음 왼쪽 여백 - 8 + i(d - 8) + d / 2 */}
          {/* 위치는 누른 순서(at)가 아니라 지금 얼굴 순서로 매번 계산한다 — 1.5초 안에 접속 상태가 바뀌어 순서가 달라지면 알약이 다른 얼굴 아래 남았다(AI 리뷰) */}
          {peek && shown.some(member => member.id === peek.id) && (() => {
            const d = compact ? 24 : 30, pad = bar ? 4 : 8;
            const center = pad - 8 + shown.findIndex(member => member.id === peek.id) * (d - 8) + d / 2;
            return <View pointerEvents="none" style={[s.namePeek, { left: center - 80 }]}>
              <View style={s.namePeekPill}><Text numberOfLines={1} style={s.namePeekText}>{peek.name}</Text></View>
            </View>;
          })()}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${countDescription}${needsCheck}`}
        hitSlop={4}
        onPress={() => onPress?.()}
        style={bar ? [s.barEntry, !showLabel && s.barEntryIcon, plain && s.barEntryPlain] : notifications && compact ? [s.entry, s.entryBell, summary && { flexDirection: 'column', gap: 0 }] : s.entry}
      >
        <Icon name={notifications ? 'bell' : 'userPlus'} size={20} forText={bar && showLabel ? 13 : undefined} />
        {!compact && (!bar || showLabel) && <Text style={bar ? s.barText : s.bold}>{notifications ? '알림' : '공유'}</Text>}
        {summary && summary.value > 0 && <Text style={[s.bold, compact && { fontSize: 12, lineHeight: 14 }]}>{summary.value > 99 ? '99+' : summary.value}</Text>}
        {(summary ? summary.showDot : count > 0) && <View testID="notification-dot" style={bar ? [s.barDot, !showLabel && s.barDotIcon] : s.dot} />}
      </Pressable>
    </View>
  );
}
