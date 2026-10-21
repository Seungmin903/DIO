// 실제 글꼴 파일과 설정 UI를 사용하는 독립 검증 화면. 앱 저장소를 사용하지 않는다.
import { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { View } from 'react-native'
import TextSettings from '../../src/editor/components/TextSettings'
import ObjectContent from '../../src/editor/components/canvas/ObjectView'
import { preloadTextFonts } from '../../src/editor/services/textFonts'
import { DEFAULT_TEXT_SETTINGS } from '../../src/editor/utils/text'

preloadTextFonts().then(() => { window.__fontFilesReady = true })
function Fixture() {
  const [settings, setSettings] = useState({ ...DEFAULT_TEXT_SETTINGS, font: 'nanum-gothic', fontSize: 32 })
  useEffect(() => { window.__fontFixtureSettings = settings }, [settings])
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 20, gap: 30 }}>
    <TextSettings settings={settings} onChange={patch => setSettings(current => ({ ...current, ...patch }))} onClose={() => {}} />
    <View testID="font-sample" style={{ width: 450, height: 120, backgroundColor: '#FFFFFF' }}>
      <ObjectContent object={{ id: 'sample', type: 'text', x: 0, y: 0, w: 450, h: 120, baseWidth: 450, text: '가나다 한글 ABC 123', ...settings }} zoom={1} />
    </View>
  </View>
}
registerRootComponent(Fixture)
