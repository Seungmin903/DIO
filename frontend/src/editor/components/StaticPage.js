import { StyleSheet, View } from 'react-native'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import ObjectContent from './ObjectView'

/** 상호작용 없이 페이지를 그린다. (페이지 썸네일용) */
export default function StaticPage({ page, zoom }) {
  return (
    <View style={[styles.page, { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }]} pointerEvents="none">
      {page.objects
        .filter((object) => !object.hidden)
        .map((object) => (
          <View
            key={object.id}
            style={{
              position: 'absolute',
              left: object.x * zoom,
              top: object.y * zoom,
              width: object.w * zoom,
              height: object.h * zoom,
              transform: [{ rotate: `${object.rotation}deg` }],
            }}
          >
            <ObjectContent object={object} zoom={zoom} />
          </View>
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#FFFFFF', overflow: 'hidden' },
})
