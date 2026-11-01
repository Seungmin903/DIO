// src · App.js 가 'react-native' 를 불러오면 metro.config.cjs 가 이 파일을 준다. 모두 그대로 넘기고 Text · TextInput 만 Pretendard 판으로 바꾼다.
// 이 파일과 DioText.js 안의 'react-native' 는 진짜 react-native(웹은 react-native-web)로 풀린다.
export * from 'react-native';
export { Text, TextInput } from './DioText';
