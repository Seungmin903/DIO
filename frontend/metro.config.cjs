// Expo 기본 설정 + 앱 UI 글꼴(Pretendard) 끼우기.
// 앱 코드(src/ · App.js)가 react-native 의 Text · TextInput 을 불러오면 Pretendard 판(src/shared/dioText/DioText.js)을 준다.
// 끼우는 파일은 전용 폴더(src/shared/dioText)에만 둔다. metro 는 해석 결과를 폴더 단위로 기억해, 앱 파일과 같은 폴더에 두면 자기 자신을 다시 받는다.
// 라이브러리(node_modules)와 끼우는 파일 자신은 진짜 react-native(웹은 react-native-web)를 그대로 받는다.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const SRC = path.resolve(__dirname, 'src') + path.sep;
const APP = path.resolve(__dirname, 'App.js');
const SHARED = path.resolve(__dirname, 'src/shared/dioText');
const SHIM = path.join(SHARED, 'dioReactNative.js');
// 네이티브: 앱에서 쓰는 이름을 명시적으로 내보내고 Text · TextInput 을 바꾼 묶음
// 웹: babel 이 'react-native-web/dist/exports/Text' 처럼 하나씩 바로 불러오게 바꾸므로 그 두 경로만 바꾼다
const WEB = {
  'react-native-web/dist/exports/Text': path.join(SHARED, 'dioWebText.js'),
  'react-native-web/dist/exports/TextInput': path.join(SHARED, 'dioWebTextInput.js'),
  'react-native-web/dist/cjs/exports/Text': path.join(SHARED, 'dioWebText.js'),
  'react-native-web/dist/cjs/exports/TextInput': path.join(SHARED, 'dioWebTextInput.js'),
};
// 경로는 드라이브 글자 대소문자(c: · C:)가 섞여 들어올 수 있어 소문자로 맞춰 비교한다
const low = value => value.toLowerCase();
const PASS = new Set([SHIM, path.join(SHARED, 'DioText.js'), ...Object.values(WEB)].map(low));
const previous = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = low(context.originModulePath);
  if (!PASS.has(origin) && (origin === low(APP) || origin.startsWith(low(SRC)))) {
    if (moduleName === 'react-native') return { type: 'sourceFile', filePath: SHIM };
    if (WEB[moduleName]) return { type: 'sourceFile', filePath: WEB[moduleName] };
  }
  return (previous ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
