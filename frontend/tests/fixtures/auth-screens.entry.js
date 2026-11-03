import {useState} from 'react'
import {registerRootComponent} from 'expo'
import {Pressable,Text,View} from 'react-native'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import AuthScreen from '../../src/auth/AuthScreen'
import {createVerificationPreview} from '../../src/auth/verificationPreview'
// Fixture-only service; never imported by the application.
const previewAuth={signup:async values=>({provider:'email',email:values.email}),cancelPending(){},social:async provider=>({provider,email:''})}
function Fixture(){const production=typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('production');const [session,setSession]=useState(null);const [verification]=useState(()=>({...createVerificationPreview(),prepareSignup:values=>previewAuth.signup(values)}));return <SafeAreaProvider>{session?<View><Text testID="session">{session.nickname}</Text><Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={()=>setSession(null)}><Text>로그아웃</Text></Pressable></View>:<AuthScreen service={previewAuth} legalDocuments={{service:'https://dio.test/legal/v2/service.html',privacy:'https://dio.test/legal/v2/consent.html',policy:'https://dio.test/legal/v2/privacy.html',marketingPrivacy:'https://dio.test/legal/v2/marketing-privacy.html',adEmail:'https://dio.test/legal/v2/email.html',adPush:'https://dio.test/legal/v2/push.html',adNightPush:'https://dio.test/legal/v2/night.html'}} verificationService={production?undefined:verification} emailVerificationEnabled={false} onContinue={setSession}/>}</SafeAreaProvider>}
registerRootComponent(Fixture)
