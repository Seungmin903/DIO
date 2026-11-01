// Existing retry-button wiring, scoped to the mounted collaboration session.
const handlers=new Map()
export function registerRemoteMediaRetry(id,retry){
 const token=Symbol(),entries=handlers.get(id)??new Map();entries.set(token,retry);handlers.set(id,entries)
 return ()=>{entries.delete(token);if(!entries.size)handlers.delete(id)}
}
export async function retryRemoteMedia(id){
 const entries=handlers.get(id)
 if(!entries?.size)return false
 const retry=[...entries.values()].at(-1);await retry();return true
}
