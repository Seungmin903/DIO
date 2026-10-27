import {useState} from 'react'
import {registerRootComponent} from 'expo'
import {Pressable,Text,View} from 'react-native'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import AuthScreen from '../../src/auth/AuthScreen'
import {createVerificationPreview} from '../../src/auth/verificationPreview'
import {previewAuth} from '../../src/auth/previewAuth'
function Fixture(){const production=typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('production');const [session,setSession]=useState(null);const [verification]=useState(()=>({...createVerificationPreview(),prepareSignup:values=>previewAuth.signup(values)}));return <SafeAreaProvider>{session?<View><Text testID="session">{session.nickname}</Text><Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={()=>setSession(null)}><Text>로그아웃</Text></Pressable></View>:<AuthScreen service={previewAuth} verificationService={production?undefined:verification} emailVerificationEnabled={false} onContinue={setSession}/>}</SafeAreaProvider>}
registerRootComponent(Fixture)
