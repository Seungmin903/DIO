import {Text,View} from 'react-native';
import {styles as s} from '../styles';
import DioButton from '../../shared/DioButton';
import {authenticationErrorMessage} from '../../auth/sessionExpiry.js';
import AuthenticationRecovery from '../../auth/AuthenticationRecovery';
// quiet: 보관함(홈)에 함께 붙일 때. 휴지통을 다시 받는 중이라는 문구는 휴지통 화면에서만 보인다.
export default function MemberTrashNotice({state,onReload,onRetry,quiet=false}) {
 const warnings=[state.metadataCleanupError,state.metadataError].filter(Boolean);
 const op=state.lifecycle,busy=Boolean(op?.busy||state.trashLoading),error=op?.error||state.trashError;
 // 처음 받는 동안은 휴지통 자리 가운데 스피너(TrashScreen loading)로 보이고 여기서는 줄을 띄우지 않는다(지라 590). 다시 받는 동안도 띄우지 않는다.
 if(!error&&!warnings.length&&!op?.canRetry) return null;
 return <View accessibilityLiveRegion="polite" style={{gap:8,padding:12}}>
   {error&&<Text accessibilityRole="alert" style={s.cardMeta}>{error.code==='INVALID_LOCAL_CACHE'?error.message:error.status===410?'복원 기한이 지났어요.':error.status===401?authenticationErrorMessage(error):error.status===403?'소유자만 변경할 수 있어요.':error.status===404?'최신 목록에서 다이어리를 확인해 주세요.':op?.resultKnown?'변경은 완료됐어요. 목록을 다시 확인해 주세요.':'처리 결과를 확인하지 못했어요. 다시 확인해 주세요.'}</Text>}
   {warnings.map(warning=><Text key={warning.code} accessibilityRole="alert" style={s.cardMeta}>{warning.message}</Text>)}
   {state.metadataCleanupError&&state.store?.dismissMetadataCleanupWarning&&<DioButton label="표지 정리 안내 닫기" text="닫기" onPress={()=>state.store.dismissMetadataCleanupWarning()} style={s.noticeAction}/>}
   <AuthenticationRecovery error={error} />
   {(error||warnings.length>0||op?.canRetry)&&<DioButton label="휴지통 새로고침" text="새로고침" disabled={busy} onPress={onReload} style={s.noticeAction}/>}
   {op?.canRetry&&error?.code!=='INVALID_LOCAL_CACHE'&&<DioButton label={op.resultKnown?'변경 후 목록 다시 확인':'휴지통 작업 다시 시도'} text="다시 시도" disabled={busy} onPress={onRetry} style={s.noticeAction}/>}
 </View>;
}
