import { registerRootComponent } from 'expo'
import { useState } from 'react'
import { View, Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import DecorDrawer from '../../src/editor/components/panels/DecorDrawer'

function Fixture() {
  const [toast, setToast] = useState(''), [added, setAdded] = useState(0)
  return <SafeAreaProvider>
    <View style={{ flex: 1, padding: 16, backgroundColor: '#F1F3F7' }}>
      <Text testID="added-stickers">{added}</Text><Text>{toast}</Text>
      <DecorDrawer tab="sticker" onAdd={() => setAdded(value => value + 1)} onAddPhotos={() => {}}
        onToast={setToast} onClose={() => {}} />
    </View>
  </SafeAreaProvider>
}
registerRootComponent(Fixture)
