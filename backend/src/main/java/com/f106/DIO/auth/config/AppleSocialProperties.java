package com.f106.DIO.auth.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Apple ID 토큰의 aud로 허용할 값. 네이티브 iOS 로그인은 앱 번들 ID(com.f106.DIO)다. 비밀값이 아니다. */
@Component
public record AppleSocialProperties(List<String> clientIds) {
    public AppleSocialProperties { clientIds=List.copyOf(clientIds); }
    @Autowired
    public AppleSocialProperties(@Value("${dio.auth.apple.client-ids:}") String value) {this(GoogleSocialProperties.parse(value));}
}
