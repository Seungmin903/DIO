// 앱에서 쓰는 React Native 이름을 명시해 미사용 네이티브 getter가 시작 중 실행되지 않도록 한다.
// Text · TextInput은 Pretendard 판으로 바꾸며 새 import는 목록과 테스트를 함께 갱신한다.
// 이 파일과 DioText.js 안의 'react-native' 는 진짜 react-native(웹은 react-native-web)로 풀린다.
export { AccessibilityInfo, ActivityIndicator, Alert, Animated, AppState, BackHandler, Dimensions, Easing, FlatList, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, PanResponder, PixelRatio, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, UIManager, View, findNodeHandle, useWindowDimensions } from 'react-native';
export { Text, TextInput } from './DioText';
