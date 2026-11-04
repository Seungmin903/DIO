import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { authStyles as s } from './styles';

// 로그인 화면 아래의 계정 링크 줄: 비밀번호 찾기 | 회원가입.
// 아이디 찾기는 두지 않는다(이메일이 곧 아이디이고 서버에 찾기 API가 없어 막다른 길이었다).
export const ACCOUNT_LINKS = [
  { id: 'password-reset', label: '비밀번호 찾기' },
  { id: 'signup', label: '회원가입' },
];

// disabled: 로그인 요청 중(busy)에는 눌리지 않는다(진행 중인 입력이 비워지지 않게)
export default function AccountLinks({ onPress, disabled = false }) {
  return (
    <View style={s.accountLinks}>
      {ACCOUNT_LINKS.map((item, index) => (
        // 한 줄 컨테이너 하나에 링크와 구분선을 나란히 둔다(겹 View 없음)
        <Fragment key={item.id}>
          {index > 0 && (
            <Text accessibilityElementsHidden importantForAccessibility="no" style={s.accountSeparator}>|</Text>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ disabled }} disabled={disabled} onPress={() => onPress(item.id)} style={[s.link, s.accountLink]}>
            <Text style={s.linkText}>{item.label}</Text>
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}
