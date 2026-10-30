package com.f106.DIO.push.service;

import com.f106.DIO.push.security.PushKeyring;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** 기기별 자격증명과 세션 변경을 원자적으로 처리한다. 외부 발송은 수행하지 않는다. */
@Service
public class PushInstallationService {
    private final JdbcTemplate jdbc;
    private final PushSessionLock sessions;
    private final String key;
    private String activeKeyId = "legacy";
    private String configuredKeys = "";
    @Value("${dio.push.active-key-id:legacy}") void setActiveKeyId(String value) { activeKeyId=value; }
    @Value("${dio.push.encryption-keys:}") void setConfiguredKeys(String value) { configuredKeys=value; }
    private final String environment;
    private final String appId;
    public PushInstallationService(JdbcTemplate jdbc, PushSessionLock sessions,
            @Value("${dio.push.encryption-key:}") String key,
            @Value("${dio.push.environment:}") String environment,
            @Value("${dio.push.app-id:dio}") String appId) {
        this.jdbc=jdbc; this.sessions=sessions; this.key=key; this.environment=environment; this.appId=appId;
    }
    public record Input(String provider,String platform,String pushToken,String permission,Boolean enabled) {}
    public record Registration(UUID installationId,String installationSecret,String bindingVersion,String tokenVersion) {}
    public record State(UUID installationId,String provider,String platform,String permission,boolean enabled,String bindingVersion,String tokenVersion) {}
    private record Row(long userId,UUID sid,byte[] credentialHash,long bindingVersion,long tokenVersion,String provider,String platform,String permission,boolean enabled,byte[] tokenHash,boolean disabled) {}
    boolean scopeMatches(String env,String app) { return environment.equals(env) && appId.equals(app); }
    PushKeyring secrets() {
        try {
            if(environment==null || !environment.matches("[A-Za-z0-9_.-]{1,32}") || appId==null || !appId.matches("[A-Za-z0-9_.-]{1,160}")) throw new IllegalArgumentException();
            var values=new java.util.LinkedHashMap<String,String>();
            if(configuredKeys!=null && !configuredKeys.isBlank()) for(String entry:configuredKeys.split(";")) {
                int separator=entry.indexOf('=');
                if(separator<=0 || values.putIfAbsent(entry.substring(0,separator),entry.substring(separator+1))!=null) throw new IllegalArgumentException();
            }
            if(!key.isBlank()) {
                if(values.containsKey("legacy") && !values.get("legacy").equals(key)) throw new IllegalArgumentException();
                values.putIfAbsent("legacy",key);
            }
            return new PushKeyring(activeKeyId,values);
        } catch(IllegalArgumentException e){throw error(HttpStatus.SERVICE_UNAVAILABLE,"PUSH_NOT_CONFIGURED");}
    }
    private static ResponseStatusException error(HttpStatus status,String code){return new ResponseStatusException(status,code);}
    byte[] aad(UUID id,String purpose){return (environment+"|"+appId+"|"+id+"|"+purpose).getBytes(StandardCharsets.UTF_8);}
    private static void validate(Input in) {
        if(in==null || !"EXPO".equals(in.provider()) || !("ANDROID".equals(in.platform()) || "IOS".equals(in.platform()))
           || !("GRANTED".equals(in.permission()) || "DENIED".equals(in.permission()) || "UNDETERMINED".equals(in.permission())) || in.enabled()==null
           || (in.pushToken()!=null && (in.pushToken().length()>4096 || !in.pushToken().matches("(?:ExpoPushToken|ExponentPushToken)\\[[A-Za-z0-9_-]+\\]")))
           || (in.enabled() && (in.pushToken()==null || !"GRANTED".equals(in.permission())))) throw error(HttpStatus.BAD_REQUEST,"INVALID_PUSH_INPUT");
    }
    private byte[] requestHash(PushKeyring s,String op,UUID id,long version,Input in) {
        String canonical=op+"\n"+id+"\n"+version+"\n"+(in==null?"":in.provider()+"\n"+in.platform()+"\n"+in.permission()+"\n"+in.enabled()+"\n"+(in.pushToken()==null?"-":Base64.getEncoder().encodeToString(s.hash(in.pushToken()))));
        return s.hash(canonical);
    }
    private Row lock(UUID id){
        return jdbc.query("select user_id,session_id,credential_hash,binding_version,token_version,provider,platform,permission,enabled,token_hash,disabled_at from push_installations where installation_id=? and environment=? and app_id=? for update",(r,n)->new Row(r.getLong(1),r.getObject(2,UUID.class),r.getBytes(3),r.getLong(4),r.getLong(5),r.getString(6),r.getString(7),r.getString(8),r.getBoolean(9),r.getBytes(10),r.getTimestamp(11)!=null),id,environment,appId).stream().findFirst().orElseThrow(()->error(HttpStatus.NOT_FOUND,"PUSH_INSTALLATION_NOT_FOUND"));
    }
    private static State state(UUID id,Row r){return new State(id,r.provider(),r.platform(),r.permission(),r.enabled(),Long.toString(r.bindingVersion()),Long.toString(r.tokenVersion()));}
    @Transactional
    public Registration register(Jwt jwt,UUID id,UUID requestId,Input in) {
        validate(in); if(id==null||id.version()!=4||id.variant()!=2||requestId==null)throw error(HttpStatus.BAD_REQUEST,"INVALID_PUSH_REQUEST");
        var session=sessions.lockActive(jwt);var s=secrets();byte[] hash=requestHash(s,"REGISTER",id,0,in);
        var existing=jdbc.query("select request_hash,encrypted_response,expires_at,response_key_id,response_cipher_format from push_registration_requests where session_id=? and installation_id=? and request_id=?",(r,n)->new Object[]{r.getBytes(1),r.getBytes(2),r.getTimestamp(3).toInstant(),r.getString(4),r.getInt(5)},session.getSessionId(),id,requestId);
        if(!existing.isEmpty()){
            Object[] old=existing.get(0);if(!java.security.MessageDigest.isEqual(hash,(byte[])old[0]))throw error(HttpStatus.CONFLICT,"PUSH_REQUEST_CONFLICT");
            Row current=lock(id);
            sessions.assertActive(session);
            if(!Instant.now().isBefore((Instant)old[2])||old[1]==null)throw error(HttpStatus.GONE,"PUSH_REGISTRATION_EXPIRED");
            if(current.userId()!=session.getUserId()||!current.sid().equals(session.getSessionId()))throw error(HttpStatus.CONFLICT,"PUSH_BINDING_CONFLICT");
            try {
                String credential=new String(((int)old[4]==0?s.decryptLegacy((String)old[3],(byte[])old[1],aad(id,"registration:"+requestId)):s.decrypt((String)old[3],(byte[])old[1],aad(id,"registration:"+requestId))),StandardCharsets.UTF_8);
                return new Registration(id,credential,Long.toString(current.bindingVersion()),Long.toString(current.tokenVersion()));
            } catch (IllegalArgumentException unavailable) { throw error(HttpStatus.SERVICE_UNAVAILABLE,"PUSH_KEY_UNAVAILABLE"); }
        }
        Instant now=Instant.now();
        String credential=s.newCredential();var token=in.pushToken()==null?null:s.encrypt(in.pushToken().getBytes(StandardCharsets.UTF_8),aad(id,"token"));byte[] tokenHash=in.pushToken()==null?null:s.hash(in.pushToken());
        try {
            jdbc.update("insert into push_installations(installation_id,environment,app_id,user_id,session_id,credential_hash,provider,platform,token_ciphertext,token_key_id,token_cipher_format,token_hash,permission,enabled,binding_version,token_version,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?)",id,environment,appId,session.getUserId(),session.getSessionId(),s.hash(credential),in.provider(),in.platform(),token==null?null:token.ciphertext(),token==null?null:token.keyId(),token==null?null:1,tokenHash,in.permission(),in.enabled(),Timestamp.from(now),Timestamp.from(now));
            var response=s.encrypt(credential.getBytes(StandardCharsets.UTF_8),aad(id,"registration:"+requestId));
            jdbc.update("insert into push_registration_requests(session_id,installation_id,request_id,request_hash,encrypted_response,response_key_id,response_cipher_format,expires_at,created_at) values(?,?,?,?,?,?,1,?,?)",session.getSessionId(),id,requestId,hash,response.ciphertext(),response.keyId(),Timestamp.from(now.plusSeconds(86400)),Timestamp.from(now));
        }catch(DataIntegrityViolationException e){throw error(HttpStatus.CONFLICT,"PUSH_INSTALLATION_CONFLICT");}
        sessions.assertActive(session);
        return new Registration(id,credential,"1","1");
    }
    @Transactional
    public State get(Jwt jwt,UUID id){var session=sessions.lockActive(jwt);Row r=lock(id);sessions.assertActive(session);if(r.userId()!=session.getUserId())throw error(HttpStatus.NOT_FOUND,"PUSH_INSTALLATION_NOT_FOUND");return state(id,r);}
    @Transactional
    public State mutate(Jwt jwt,UUID id,UUID requestId,String credential,long version,String operation,Input input){
        if(id==null||requestId==null||credential==null||credential.isBlank()||version<1)throw error(HttpStatus.BAD_REQUEST,"INVALID_PUSH_REQUEST");
        if("UPDATE".equals(operation))validate(input);else if(!"BIND".equals(operation)&&!"UNBIND".equals(operation))throw error(HttpStatus.BAD_REQUEST,"INVALID_PUSH_REQUEST");
        var session=sessions.lockActive(jwt);var s=secrets();Row r=lock(id);
        sessions.assertActive(session);Instant now=Instant.now();
        if(!s.matches(credential,r.credentialHash()))throw error(HttpStatus.NOT_FOUND,"PUSH_INSTALLATION_NOT_FOUND");
        if(!"BIND".equals(operation) && (r.userId()!=session.getUserId()||!r.sid().equals(session.getSessionId())))throw error(HttpStatus.CONFLICT,"PUSH_BINDING_CONFLICT");
        byte[] hash=requestHash(s,operation,id,version,input);
        var prior=jdbc.query("select request_hash,binding_version,token_version,result_provider,result_platform,result_permission,result_enabled from push_mutation_requests where session_id=? and installation_id=? and request_id=?",(rs,n)->new Object[]{rs.getBytes(1),rs.getLong(2),rs.getLong(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getBoolean(7)},session.getSessionId(),id,requestId);
        if(!prior.isEmpty()){
            Object[] old=prior.get(0);if(!java.security.MessageDigest.isEqual(hash,(byte[])old[0]))throw error(HttpStatus.CONFLICT,"PUSH_REQUEST_CONFLICT");
            if(r.userId()!=session.getUserId()||!r.sid().equals(session.getSessionId()))throw error(HttpStatus.CONFLICT,"PUSH_BINDING_CONFLICT");
            return new State(id,(String)old[3],(String)old[4],(String)old[5],(boolean)old[6],Long.toString((long)old[1]),Long.toString((long)old[2]));
        }
        if(r.bindingVersion()!=version)throw error(HttpStatus.CONFLICT,"PUSH_BINDING_CONFLICT");
        long bv=r.bindingVersion(),tv=r.tokenVersion();
        if("BIND".equals(operation)){
            cancel(id,bv);bv++;
            jdbc.update("update push_installations set user_id=?,session_id=?,binding_version=?,enabled=false,disabled_at=null,updated_at=? where installation_id=?",session.getUserId(),session.getSessionId(),bv,Timestamp.from(now),id);
        }else if("UNBIND".equals(operation)){
            if(!r.disabled()){cancel(id,bv);bv++;jdbc.update("update push_installations set enabled=false,disabled_at=?,updated_at=?,binding_version=? where installation_id=?",Timestamp.from(now),Timestamp.from(now),bv,id);}
        }else {
            if(r.disabled())throw error(HttpStatus.CONFLICT,"PUSH_BINDING_CONFLICT");
            if(!r.platform().equals(input.platform()))throw error(HttpStatus.CONFLICT,"PUSH_PLATFORM_CONFLICT");
            byte[] tokenHash=input.pushToken()==null?null:s.hash(input.pushToken());
            if(!Arrays.equals(tokenHash,r.tokenHash())){tv++;cancel(id,bv);}
            var ciphertext=input.pushToken()==null?null:s.encrypt(input.pushToken().getBytes(StandardCharsets.UTF_8),aad(id,"token"));
            try{jdbc.update("update push_installations set provider=?,platform=?,permission=?,enabled=?,token_hash=?,token_ciphertext=?,token_key_id=?,token_cipher_format=?,token_version=?,updated_at=? where installation_id=?",input.provider(),input.platform(),input.permission(),input.enabled(),tokenHash,ciphertext==null?null:ciphertext.ciphertext(),ciphertext==null?null:ciphertext.keyId(),ciphertext==null?null:1,tv,Timestamp.from(now),id);}catch(DataIntegrityViolationException e){throw error(HttpStatus.CONFLICT,"PUSH_TOKEN_CONFLICT");}
            if(!input.enabled())cancel(id,bv);
        }
        State result=state(id,lock(id));
        jdbc.update("insert into push_mutation_requests(session_id,installation_id,request_id,request_hash,operation,binding_version,token_version,result_provider,result_platform,result_permission,result_enabled,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",session.getSessionId(),id,requestId,hash,operation,bv,tv,result.provider(),result.platform(),result.permission(),result.enabled(),Timestamp.from(now));
        sessions.assertActive(session);
        return result;
    }
    private void cancel(UUID id,long version){jdbc.update("update push_deliveries set status='CANCELLED',lease_id=null,lease_until=null where installation_id=? and binding_version=? and status in ('PENDING','LEASED')",id,version);}
}
