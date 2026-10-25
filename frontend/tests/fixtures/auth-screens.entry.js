import {useState} from 'react'
import {registerRootComponent} from 'expo'
import {Pressable,Text,View} from 'react-native'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import AuthScreen from '../../src/auth/AuthScreen'
function Fixture(){const [session,setSession]=useState(null);return <SafeAreaProvider>{session?<View><Text testID="session">{session.nickname}</Text><Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={()=>setSession(null)}><Text>로그아웃</Text></Pressable></View>:<AuthScreen onContinue={setSession}/>}</SafeAreaProvider>}
registerRootComponent(Fixture)
