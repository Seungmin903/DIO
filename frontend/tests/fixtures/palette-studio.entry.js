import { registerRootComponent } from 'expo'
import { View, ScrollView } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import StudioPresets from '../../src/diary/components/StudioPresets'
import StudioPaperStyle from '../../src/diary/components/StudioPaperStyle'
import { useState } from 'react'
// This fixture mounts the real components without login or server access.
function Fixture(){
 const [paper,setPaper]=useState({backgroundColor:'#FFFFFF',layoutColor:'#292929'})
 return <SafeAreaProvider><ScrollView contentContainerStyle={{padding:24,gap:24}}><StudioPresets /><StudioPaperStyle style={paper} save={async next=>{setPaper(next);return true}} /></ScrollView></SafeAreaProvider>
}
registerRootComponent(Fixture)
