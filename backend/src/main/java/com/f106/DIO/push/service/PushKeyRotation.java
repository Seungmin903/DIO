package com.f106.DIO.push.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 외부 발송 없이 설치별 암호문을 활성 키로 이전한다. 호출자는 모든 인스턴스의 키 배포를 먼저 확인한다. */
@Service
public class PushKeyRotation {
    private final JdbcTemplate jdbc;
    private final PushInstallationService installations;
    public PushKeyRotation(JdbcTemplate jdbc,PushInstallationService installations){this.jdbc=jdbc;this.installations=installations;}
    private record Installation(UUID id,byte[] token,String keyId,Integer format) {}
    private record Response(UUID session,UUID request,byte[] data,String keyId,int format) {}
    private byte[] decrypt(com.f106.DIO.push.security.PushKeyring keys,String id,int format,byte[] data,byte[] aad){
        if(format==0)return keys.decryptLegacy(id,data,aad);
        if(format==1)return keys.decrypt(id,data,aad);
        throw new IllegalArgumentException("Unsupported push ciphertext format");
    }
    /** 잠긴 행을 포함한 잔여량. 쓰기 키 전환이 끝난 뒤 반복 확인해야 한다. */
    @Transactional(readOnly=true)
    public long remaining(String environment,String appId){
        if(!installations.scopeMatches(environment,appId))throw new IllegalArgumentException("Invalid rotation scope");
        String target=installations.secrets().activeId();
        Long count=jdbc.queryForObject("""
          select count(*) from push_installations i where i.environment=? and i.app_id=? and (
            (i.token_ciphertext is not null and (i.token_key_id<>? or i.token_cipher_format<>1))
            or exists(select 1 from push_registration_requests r where r.installation_id=i.installation_id
              and r.encrypted_response is not null and r.expires_at>? and (r.response_key_id<>? or r.response_cipher_format<>1)))
          """,Long.class,environment,appId,target,Timestamp.from(Instant.now()),target);
        return count==null?0:count;
    }
    public record BatchResult(int processed, java.util.List<UUID> failed, UUID nextCursor) {}
    @Transactional
    public int rotateBatch(String environment,String appId,int batchSize){
        var result=rotateBatchReport(environment,appId,batchSize,null);
        if(!result.failed().isEmpty()) throw new IllegalStateException("Push rotation contains failed ciphertexts; use the operator report");
        return result.processed();
    }
    @Transactional
    public BatchResult rotateBatchReport(String environment,String appId,int batchSize,UUID after){
        if(!installations.scopeMatches(environment,appId))throw new IllegalArgumentException("Invalid rotation scope");
        if(batchSize<1||batchSize>500)throw new IllegalArgumentException("Invalid rotation batch size");
        var keys=installations.secrets();String target=keys.activeId();Instant now=Instant.now();
        var rows=jdbc.query("""
          select i.installation_id,i.token_ciphertext,i.token_key_id,i.token_cipher_format
          from push_installations i
          where i.environment=? and i.app_id=? and (
            (i.token_ciphertext is not null and (i.token_key_id<>? or i.token_cipher_format<>1))
            or exists(select 1 from push_registration_requests r where r.installation_id=i.installation_id
              and r.encrypted_response is not null and r.expires_at>? and (r.response_key_id<>? or r.response_cipher_format<>1)))
          and i.installation_id > ?
          order by i.installation_id limit ? for update of i skip locked
          """,(r,n)->new Installation(r.getObject(1,UUID.class),r.getBytes(2),r.getString(3),r.getObject(4)==null?null:r.getInt(4)),environment,appId,target,Timestamp.from(now),target,after==null?new UUID(0,0):after,batchSize);
        var failed=new java.util.ArrayList<UUID>();
        int processed=0;
        for(var row:rows){
            try {
            com.f106.DIO.push.security.PushKeyring.Encrypted token=null;
            if(row.token()!=null && (!target.equals(row.keyId()) || row.format()!=1)){
                token=keys.encrypt(decrypt(keys,row.keyId(),row.format(),row.token(),installations.aad(row.id(),"token")),installations.aad(row.id(),"token"));
            }
            var responses=jdbc.query("select session_id,request_id,encrypted_response,response_key_id,response_cipher_format from push_registration_requests where installation_id=? and encrypted_response is not null and expires_at>? and (response_key_id<>? or response_cipher_format<>1) order by session_id,request_id for update skip locked",(r,n)->new Response(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getBytes(3),r.getString(4),r.getInt(5)),row.id(),Timestamp.from(now),target);
            var encrypted=new java.util.ArrayList<com.f106.DIO.push.security.PushKeyring.Encrypted>();
            for(var response:responses){
                var aad=installations.aad(row.id(),"registration:"+response.request());
                encrypted.add(keys.encrypt(decrypt(keys,response.keyId(),response.format(),response.data(),aad),aad));
            }
            if(token!=null) jdbc.update("update push_installations set token_ciphertext=?,token_key_id=?,token_cipher_format=1 where installation_id=?",token.ciphertext(),token.keyId(),row.id());
            for(int i=0;i<responses.size();i++){
                var response=responses.get(i);var changed=encrypted.get(i);
                jdbc.update("update push_registration_requests set encrypted_response=?,response_key_id=?,response_cipher_format=1 where session_id=? and installation_id=? and request_id=? and encrypted_response is not null and expires_at>?",changed.ciphertext(),changed.keyId(),response.session(),row.id(),response.request(),Timestamp.from(Instant.now()));
            }
            processed++;
            } catch(IllegalArgumentException ex) { failed.add(row.id()); }

        }
        return new BatchResult(processed,java.util.List.copyOf(failed),rows.isEmpty()?after:rows.get(rows.size()-1).id());
    }
    @Transactional(readOnly=true)
    public long orphanCiphertexts() {
        Long count=jdbc.queryForObject("select count(*) from push_registration_requests r where r.encrypted_response is not null and not exists (select 1 from push_installations i where i.installation_id=r.installation_id)",Long.class);
        return count==null?0:count;
    }
}
