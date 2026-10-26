import { Image } from 'react-native';
import Icon from '../editor/components/controls/Icon';
import { colors } from '../shared/theme';

export default function MemberAvatar({ member, size = 20, muted = false }) {
  return member?.photoUri ? (
    <Image
      source={{ uri: member.photoUri }}
      style={{ width: '100%', height: '100%', borderRadius: 999 }}
      accessibilityLabel={`${member.nickname || '다이어리'} 프로필 사진`}
    />
  ) : (
    <Icon name="person" size={size} color={muted ? colors.textMuted : colors.text} />
  );
}
