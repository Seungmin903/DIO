package com.f106.DIO.auth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration(proxyBeanMethods = false)
public class AuthPasswordConfig {
    /** 운영·로컬 실행 기본 강도. 테스트 설정에서만 낮춘다. */
    public static final int DEFAULT_BCRYPT_STRENGTH = 12;
    /** 이보다 약한 강도는 테스트 전용 허용값이 켜져 있을 때만 쓴다(설정 실수로 운영 해시가 약해지지 않게 기동을 막는다). */
    public static final int MIN_BCRYPT_STRENGTH = 10;

    @Bean("authPasswordEncoder")
    public PasswordEncoder authPasswordEncoder(
            @Value("${dio.auth.bcrypt-strength:" + DEFAULT_BCRYPT_STRENGTH + "}") int strength,
            // src/test/resources/application.yml 에만 true 로 둔다. 배포 jar 에는 들어가지 않는 파일이다
            @Value("${dio.auth.bcrypt-allow-weak-for-tests:false}") boolean allowWeakForTests) {
        return encoder(strength, allowWeakForTests);
    }

    /** 강도를 확인하고 인코더를 만든다. 약한 강도는 테스트 전용 허용값이 있어야 하고, BCrypt 가 받는 범위(4~31)를 벗어나면 거절한다. */
    public static PasswordEncoder encoder(int strength, boolean allowWeakForTests) {
        if (strength < 4 || strength > 31) {
            throw new IllegalStateException("dio.auth.bcrypt-strength must be between 4 and 31: " + strength);
        }
        if (strength < MIN_BCRYPT_STRENGTH && !allowWeakForTests) {
            throw new IllegalStateException("dio.auth.bcrypt-strength below " + MIN_BCRYPT_STRENGTH
                    + " is allowed only in tests (dio.auth.bcrypt-allow-weak-for-tests=true): " + strength);
        }
        return new BCryptPasswordEncoder(strength);
    }
}
