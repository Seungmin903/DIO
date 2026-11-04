import {Pressable,Text,View} from 'react-native';
import {styles as s} from '../styles';
import {authenticationErrorMessage} from '../../auth/sessionExpiry.js';
import AuthenticationRecovery from '../../auth/AuthenticationRecovery';
export default function MemberTrashNotice({state,onReload,onRetry}) {
 const warnings=[state.metadataCleanupError,state.metadataError].filter(Boolean);
 const op=state.lifecycle,busy=Boolean(op?.busy||state.trashLoading),error=op?.error||state.trashError;
 // 평소(불러오는 중 · 오류 · 다시 시도 없음)에는 칸을 그리지 않는다. 휴지통은 들어올 때 서버 목록을 다시 받는다.
 if(!busy&&!error&&!warnings.length&&!op?.canRetry) return null;
 return <View accessibilityLiveRegion="polite" style={{gap:8,padding:12}}>
   {busy&&<Text>{op?.busy?'휴지통 변경을 확인하고 있어요.':'휴지통을 불러오고 있어요.'}</Text>}
   {error&&<Text accessibilityRole="alert">{error.code==='INVALID_LOCAL_CACHE'?error.message:error.status===410?'복원 기한이 지났어요.':error.status===401?authenticationErrorMessage(error):error.status===403?'소유자만 변경할 수 있어요.':error.status===404?'최신 목록에서 다이어리를 확인해 주세요.':op?.resultKnown?'변경은 완료됐어요. 목록을 다시 확인해 주세요.':'처리 결과를 확인하지 못했어요. 다시 확인해 주세요.'}</Text>}
   {warnings.map(warning=><Text key={warning.code} accessibilityRole="alert">{warning.message}</Text>)}
   {state.metadataCleanupError&&state.store?.dismissMetadataCleanupWarning&&<Pressable accessibilityRole="button" accessibilityLabel="표지 정리 안내 닫기" onPress={()=>state.store.dismissMetadataCleanupWarning()} style={s.secondary}><Text>표지 정리 안내 닫기</Text></Pressable>}
   <AuthenticationRecovery error={error} />
   <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} onPress={onReload} style={s.secondary}><Text>휴지통 새로고침</Text></Pressable>
   {op?.canRetry&&error?.code!=='INVALID_LOCAL_CACHE'&&<Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} onPress={onRetry} style={s.secondary}><Text>{op.resultKnown?'변경 후 목록 다시 확인':'휴지통 작업 다시 시도'}</Text></Pressable>}
 </View>;
}
