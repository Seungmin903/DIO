import { isRunningInExpoGo, registerRootComponent } from 'expo'
import Constants from 'expo-constants'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import * as FS from 'expo-file-system/legacy'
import { registerFontFile, correctRegisteredFont } from '../../src/handwriting/storage.js'
import { refreshPersonalFonts } from '../../src/handwriting/library.js'
import { loadedFontFamily } from '../../src/editor/utils/text.js'
import { capabilities } from '../../src/handwriting/generator.js'

const endpoint = 'http://10.0.2.2:54845'
function Fixture() {
  const [fonts, setFonts] = useState(null), [widths, setWidths] = useState({}), [error, setError] = useState('')
  useEffect(() => {
    ;(async () => {
      const download = await FS.downloadAsync(`${endpoint}/font.ttf`, `${FS.cacheDirectory}spacing-audit-source.ttf`)
      try {
        const original = await registerFontFile(download.uri, 'Expo Go spacing source')
        const corrected = await correctRegisteredFont(original)
        await refreshPersonalFonts()
        if (!loadedFontFamily(original.id) || !loadedFontFamily(corrected.id)) throw new Error('Font was not loaded')
        setFonts([original, corrected])
      } finally { await FS.deleteAsync(download.uri, { idempotent: true }) }
    })().catch(e => setError(String(e)))
  }, [])
  useEffect(() => {
    if (!error && !(fonts && widths.original && widths.corrected)) return
    ;(async () => {
      const support = await capabilities()
      await fetch(`${endpoint}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        status: error ? 'failed' : 'passed', error, executionEnvironment: Constants.executionEnvironment, isExpoGo: isRunningInExpoGo(),
        nativeApplicationId: requireOptionalNativeModule('ExpoApplication')?.applicationId,
        nativeGeneratorAvailable: support.available, fontsLoaded: fonts?.length ?? 0,
        distinctIds: fonts ? fonts[0].id !== fonts[1].id : false,
        sourceFontLinked: fonts ? fonts[1].sourceFontId === fonts[0].id : false,
        spacingVersion: fonts?.[1].spacingVersion, widths,
      }) })
    })()
  }, [fonts, widths.original, widths.corrected, error])
  return <View style={{ flex: 1, backgroundColor: 'white', paddingTop: 80, paddingHorizontal: 12 }}>
    <Text>Local Expo Go font spacing validation</Text>
    {error ? <Text>{error}</Text> : fonts?.map((font, i) => <Text key={font.id} numberOfLines={1}
      style={{ fontSize: 48, fontFamily: loadedFontFamily(font.id), color: '#111' }}
      onTextLayout={e => setWidths(w => ({ ...w, [i ? 'corrected' : 'original']: e.nativeEvent.lines[0]?.width }))}>이가횡핀한민글</Text>)}
  </View>
}
registerRootComponent(Fixture)
