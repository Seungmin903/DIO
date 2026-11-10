import { Platform } from 'react-native';
import Constants from 'expo-constants';
let configured=false;
const loadSdk=async()=>{
 const webClientId=process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '180873138469-4h7mm1trcg1cde6ubfipqi06dt36bbai.apps.googleusercontent.com';
 const iosClientId=process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '180873138469-94fobh49akflvnq8lof6o8da5hj06dh8.apps.googleusercontent.com';
 let sdk;
 try{sdk=await import('@react-native-google-signin/google-signin');}
 catch{throw new Error('구글 로그인 설정이 포함된 DIO 앱을 다시 설치해 주세요.');}
 if(!configured){sdk.GoogleSignin.configure({webClientId,iosClientId,offlineAccess:false});configured=true;}
 return sdk;
};
export async function signInWithGoogle(){
 if(Constants.appOwnership==='expo')throw new Error('구글 로그인은 Expo Go에서 사용할 수 없어요. DIO 개발 빌드로 실행해 주세요.');
 const sdk=await loadSdk();
 try{
  if(Platform.OS==='android')await sdk.GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog:true});
  // SDK는 마지막 계정을 기억해 선택 창 없이 그 계정으로 바로 로그인한다. 매번 계정을 고를 수 있게 먼저 지운다.
  try{if(sdk.GoogleSignin.hasPreviousSignIn())await sdk.GoogleSignin.signOut();}
  catch(error){console.warn('[GoogleSignin] 이전 계정 정리 실패',error?.code);}
  const response=await sdk.GoogleSignin.signIn();
  if(response.type==='cancelled')throw new Error('구글 로그인을 취소했어요.');
  const user=response.data;
  if(!user?.idToken||!user.user?.email)throw new Error('구글 인증 정보를 받지 못했어요. 다시 시도해 주세요.');
  return {idToken:user.idToken,email:user.user.email};
 }catch(error){
  if(error?.code===sdk.statusCodes.SIGN_IN_CANCELLED)throw new Error('구글 로그인을 취소했어요.');
  if(error?.code===sdk.statusCodes.IN_PROGRESS)throw new Error('구글 로그인 창에서 진행해 주세요.');
  if(error?.code===sdk.statusCodes.PLAY_SERVICES_NOT_AVAILABLE)throw new Error('Google Play 서비스를 확인해 주세요.');
  if(error?.code){
   console.warn('[GoogleSignin] 실패',error.code,error.message);
   const code=String(error.code);
   if(code==='10'||code==='DEVELOPER_ERROR')throw new Error(`구글 로그인 앱 설정이 맞지 않아요. (오류 코드: ${code})`);
   throw new Error(`구글 로그인을 완료하지 못했어요. 앱 설정과 네트워크를 확인해 주세요. (오류 코드: ${code})`);
  }
  throw error;
 }
}
// 회원 탈퇴 뒤 구글 쪽 앱 연결을 끊는다(구글 계정 설정 > 연결된 앱에서 DIO가 사라진다). 서버는 구글 토큰을 저장하지 않아 기기 SDK로 끊는다.
// 이 기기에서 구글로 로그인한 계정만 끊을 수 있다: SDK에 계정이 없으면 기억된 계정을 창 없이 되살리고, 기록이 없으면 아무것도 하지 않는다.
// 끊었으면 true, 끊을 계정이 없으면 false. 실패는 그대로 던진다(부르는 쪽이 경고만 남긴다).
export async function revokeGoogleAccess(){
 if(Constants.appOwnership==='expo')return false;
 const {GoogleSignin}=await loadSdk();
 if(!GoogleSignin.getCurrentUser()){
  if(!GoogleSignin.hasPreviousSignIn())return false;
  const restored=await GoogleSignin.signInSilently();
  if(restored?.type!=='success')return false;
 }
 await GoogleSignin.revokeAccess();
 // 다음 로그인에서 계정 선택 창이 뜨도록 SDK에 남은 계정도 지운다(끊은 뒤라 실패해도 무방)
 try{await GoogleSignin.signOut();}catch{}
 return true;
}
