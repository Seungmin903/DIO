import { Pressable, StyleSheet, Text } from 'react-native'
import { colors } from '../../../shared/theme'
import Icon from './Icon'

const SAVE_INFO = {
  saving: '이 기기에 저장하는 중이에요.',
  saved: '모든 변경 사항을 이 기기에 자동 저장했어요.',
  error: '저장 공간이 부족해 이 기기에 저장하지 못했어요. 큰 GIF나 사진을 지우면 다시 저장돼요.',
  // 저장된 문서를 읽지 못해 기존 기록을 지키려고 저장을 멈춘 상태
  'load-error': '저장된 기록을 불러오지 못해 기존 기록을 지키려고 저장하지 않았어요. 앱을 다시 열어 주세요.',
}

// 서버 캔버스 연결 상태별 안내 (회원 다이어리). 문제가 있을 때만 기기 저장 안내보다 앞선다.
const SERVER_INFO = {
  conflict: '서버와 기기의 내용이 달라 자동 덮어쓰기를 멈췄어요. 기기 내용은 유지돼요.',
  error: '서버 연결에 실패했어요. 기기 내용을 유지하고 다시 시도해요.',
  'local-error': '기기 연결 기록을 읽거나 저장하지 못해 서버 전송을 멈췄어요.',
}
const SERVER_PROBLEMS = Object.keys(SERVER_INFO)

/**
 * 저장 상태. 편집 기록(되돌리기·다시 실행) 옆에 둔다.
 * 기기 저장과 서버 전송(server, 회원 다이어리만)을 한 칸에 합쳐 저장 중 · 저장됨 · 저장 안 됨 으로 쓴다. 누르면 자세한 안내.
 * server: { status, errorMessage, retry } — status 는 loading · saving · saved · conflict · error · local-error
 */
export default function SaveIndicator({ status, server, onInfo }) {
  const serverProblem = SERVER_PROBLEMS.includes(server?.status)
  const error = status === 'error' || status === 'load-error' || serverProblem
  const saving = status === 'saving' || server?.status === 'saving'
  // 늘 글자를 함께 보여 준다 (아이콘만으로는 무슨 버튼인지 알기 어려웠다)
  const text = error ? '저장 안 됨' : saving ? '저장 중' : '저장됨'
  const info = serverProblem && !(status === 'error' || status === 'load-error')
    ? (server.status === 'error' && server.errorMessage) || SERVER_INFO[server.status]
    : server && !error && !saving && server.status === 'saved' ? '모든 변경 사항을 이 기기와 서버에 저장했어요.'
    : server?.status === 'saving' && status !== 'saving' ? '이 기기에는 저장했고, 서버로 보내는 중이에요.' : SAVE_INFO[status]
  return (
    <Pressable
      onPress={() => {
        onInfo(info)
        if (server?.status === 'error') server.retry?.()
      }}
      hitSlop={8}
      style={styles.save}
      accessibilityRole="button"
      accessibilityLabel={info}
    >
      <Icon
        name={error ? 'alert' : saving ? 'saving' : 'saved'}
        size={15}
        forText={11}
        color={error ? colors.danger : colors.textMuted}
      />
      {text && <Text style={[styles.saveText, error && styles.saveTextError]}>{text}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 36,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 11,
  },
  saveText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  saveTextError: { color: colors.danger, fontWeight: '700' },
})
