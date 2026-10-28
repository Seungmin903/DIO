package com.f106.DIO.sharing.support;
import com.f106.DIO.sharing.exception.SharingException;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
public final class SharingActor {
    private SharingActor() {}
    public static Long require(Jwt jwt) {
        try {if(jwt!=null){long id=Long.parseLong(jwt.getSubject());if(id>0)return id;}}catch(NumberFormatException ignored){}
        throw new SharingException(HttpStatus.UNAUTHORIZED,"INVALID_TOKEN","다시 로그인해 주세요.");
    }
}
