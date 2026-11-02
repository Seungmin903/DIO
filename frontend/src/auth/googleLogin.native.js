import { Platform } from 'react-native';
import Constants from 'expo-constants';
let configured=false;
export async function signInWithGoogle(){
 if(Constants.appOwnership==='expo')throw new Error('구글 로그인은 Expo Go에서 사용할 수 없어요. DIO 개발 빌드로 실행해 주세요.');
 const webClientId=process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '180873138469-4h7mm1trcg1cde6ubfipqi06dt36bbai.apps.googleusercontent.com';
 const iosClientId=process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '180873138469-94fobh49akflvnq8lof6o8da5hj06dh8.apps.googleusercontent.com';
 let sdk;
 try{sdk=await import('@react-native-google-signin/google-signin');}
 catch{throw new Error('구글 로그인 설정이 포함된 DIO 앱을 다시 설치해 주세요.');}
 try{
  if(!configured){sdk.GoogleSignin.configure({webClientId,iosClientId,offlineAccess:false});configured=true;}
  if(Platform.OS==='android')await sdk.GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog:true});
  const response=await sdk.GoogleSignin.signIn();
  if(response.type==='cancelled')throw new Error('구글 로그인을 취소했어요.');
  const user=response.data;
  if(!user?.idToken||!user.user?.email)throw new Error('구글 인증 정보를 받지 못했어요. 다시 시도해 주세요.');
  return {idToken:user.idToken,email:user.user.email};
 }catch(error){
  if(error?.code===sdk.statusCodes.SIGN_IN_CANCELLED)throw new Error('구글 로그인을 취소했어요.');
  if(error?.code===sdk.statusCodes.IN_PROGRESS)throw new Error('구글 로그인 창에서 진행해 주세요.');
  if(error?.code===sdk.statusCodes.PLAY_SERVICES_NOT_AVAILABLE)throw new Error('Google Play 서비스를 확인해 주세요.');
  if(error?.code)throw new Error('구글 로그인을 완료하지 못했어요. 앱 설정과 네트워크를 확인해 주세요.');
  throw error;
 }
}
