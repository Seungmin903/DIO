import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { colors } from '../../shared/theme';
import DefaultAvatar from '../../shared/DefaultAvatar';

// 기본 프로필(사진이 없을 때, 트위터 알처럼 모두 같은 그림): 단색(primaryStrong) 동그라미에 디오의 표정(눈 · 입)만 흰색으로 — shared/DefaultAvatar(벡터).
// 내 공간 큰 그림 · 메뉴 아래 작은 그림이 같은 그림을 쓴다(작아도 읽히게 실루엣 대신 표정만 굵게).

/**
 * 프로필 그림(메뉴 아래 '내 공간' 자리 등). 사진이 있으면 사진, 없거나 못 불러오면 기본 프로필.
 * user: { photoUri, userId }, getSource(uri): 인증이 필요한 사진 주소를 바꿔 준다. size: 한 변.
 */
export default function ProfileAvatar({ user, getSource, size = 32 }) {
  const uri = user?.photoUri;
  const [failed, setFailed] = useState(null);
  const source = uri && failed !== uri ? (getSource ? getSource(uri) : { uri }) : null;
  const box = { width: size, height: size, borderRadius: size / 2 }; // 프로필 그림은 어디서나 동그라미(내 공간 큰 그림과 같은 모양)
  return source
    ? <Image source={{ ...source, cacheKey: JSON.stringify(['profile', user?.userId || 'guest', uri]) }} contentFit="cover" cachePolicy="memory"
        onError={() => setFailed(uri)} accessible={false} style={[local.avatar, box]} />
    : <DefaultAvatar style={[local.avatar, box]} />;
}

const local = StyleSheet.create({ avatar: { backgroundColor: colors.primaryStrong } });
