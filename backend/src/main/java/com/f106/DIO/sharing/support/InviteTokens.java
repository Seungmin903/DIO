package com.f106.DIO.sharing.support;
import com.f106.DIO.sharing.domain.DiaryInvite;
import com.f106.DIO.sharing.exception.SharingException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
@Component
public class InviteTokens {
    private final String secret;
    private final String baseUrl;
    public InviteTokens(@Value("${SHARING_INVITE_SECRET:}") String secret,@Value("${SHARING_INVITE_BASE_URL:/invite/}") String baseUrl) {
        this.secret=secret;this.baseUrl=baseUrl.endsWith("/")?baseUrl:baseUrl+"/";
    }
    public void configured() {key();}
    public void emailConfigured() {
        configured();
        try {
            var uri=java.net.URI.create(baseUrl);
            if(("https".equals(uri.getScheme())||"http".equals(uri.getScheme()))&&uri.getHost()!=null)return;
            if("dio".equals(uri.getScheme())&&!uri.getSchemeSpecificPart().isBlank())return;
        }catch(IllegalArgumentException ignored){}
        throw new SharingException(HttpStatus.SERVICE_UNAVAILABLE,"INVITE_URL_NOT_CONFIGURED","이메일 초대용 SHARING_INVITE_BASE_URL을 설정해 주세요.");
    }
    private byte[] key() {
        try {byte[] key=Base64.getDecoder().decode(secret);if(key.length>=32)return key;}catch(IllegalArgumentException ignored){}
        throw new SharingException(HttpStatus.SERVICE_UNAVAILABLE,"INVITE_NOT_CONFIGURED","초대 링크 서버 설정을 확인해 주세요.");
    }
    public String token(DiaryInvite invite) {
        try {
            Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key(),"HmacSHA256"));
            String message="dio-invite-v1:"+invite.getInviteId()+":"+invite.getDiaryId()+":"+invite.getCreatedAt().toEpochMilli()+":"+invite.getExpiresAt().toEpochMilli();
            return invite.getInviteId()+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        }catch(GeneralSecurityException error){throw new IllegalStateException("Invite signing unavailable",error);}
    }
    public Long id(String token) {
        try {if(token!=null&&token.matches("[1-9][0-9]{0,18}[.][A-Za-z0-9_-]{43}"))return Long.valueOf(token.substring(0,token.indexOf('.')));}catch(NumberFormatException ignored){}
        throw notFound();
    }
    public boolean matches(DiaryInvite invite,String value) {return MessageDigest.isEqual(hash(value),invite.getTokenHash())&&MessageDigest.isEqual(hash(token(invite)),invite.getTokenHash());}
    public byte[] hash(String value) {try{return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    public String url(String token) {return baseUrl+token;}
    public SharingException notFound() {return new SharingException(HttpStatus.NOT_FOUND,"INVITE_NOT_FOUND","사용할 수 없는 초대 링크예요.");}
}
