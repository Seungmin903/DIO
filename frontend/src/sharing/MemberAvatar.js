import { Image } from 'react-native';
import DefaultAvatar from '../shared/DefaultAvatar';
import { DISABLED_OPACITY } from '../shared/theme';

// 사진이 없으면 모아 얼굴 기본 프로필(사람 실루엣은 쓰지 않는다). 색은 회원 id 로 고른다(어디서나 같은 사람은 같은 색, 지라 638).
export default function MemberAvatar({ member, muted = false }) {
  return member?.photoUri ? (
    <Image
      source={{ uri: member.photoUri }}
      style={{ width: '100%', height: '100%', borderRadius: 999 }}
      accessibilityLabel={`${member.nickname || '다이어리'} 프로필 사진`}
    />
  ) : (
    <DefaultAvatar user={member} style={[{ width: '100%', height: '100%' }, muted && { opacity: DISABLED_OPACITY }]} />
  );
}
