import { Image } from 'react-native';

const source = require('../../assets/branding/dio-logo-transparent.png');

export default function DioLogo({ height = 36 }) {
  return <Image source={source} resizeMode="contain" accessible={false} style={{ width: height * 746 / 836, height }} />;
}
