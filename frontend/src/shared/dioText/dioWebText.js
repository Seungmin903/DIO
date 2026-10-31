// 웹 빌드는 react-native 의 Text 를 'react-native-web/dist/exports/Text' 로 바로 불러온다. metro.config.cjs 가 앱 코드의 그 요청에 이 파일을 준다.
export { Text as default } from './DioText';
