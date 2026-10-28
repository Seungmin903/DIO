import {createDiaryMutation} from './diaryMutation.js';

// Session-scoped: one in-flight intent, retries retain its target; disposal ignores late responses.
export function createAccountDiaryLifecycle(api) {
  return createDiaryMutation(async (input,options)=>{
    if(!['trash','restore','permanentlyDelete'].includes(input.kind))throw Object.assign(Error('지원하지 않는 작업이에요.'),{status:400});
    const row=await api[input.kind](input.id,options);
    return {kind:input.kind,id:input.id,row};
  });
}
