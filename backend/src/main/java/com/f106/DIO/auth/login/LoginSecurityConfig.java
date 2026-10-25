package com.f106.DIO.auth.login;

import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
class LoginSecurityConfig {
    @Bean
    JwtDecoder loginJwtDecoder(LoginJwt tokens, EmailLoginService service) {
        return encoded -> {
            Jwt jwt;
            try { jwt = tokens.decode(encoded); }
            catch (LoginException error) { throw new BadJwtException("JWT verifier unavailable"); }
            if (!service.active(jwt)) throw new BadJwtException("Inactive login session");
            return jwt;
        };
    }
    @Bean
    SecurityFilterChain loginSecurity(HttpSecurity http, JwtDecoder loginJwtDecoder) throws Exception {
        // 다른 팀의 기존 공개 API/다이어리에는 보호 정책을 임의 적용하지 않는다.
        return http.securityMatcher("/api/v1/auth/logout")
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .csrf(csrf -> csrf.disable()).formLogin(form -> form.disable()).httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable()).requestCache(cache -> cache.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.decoder(loginJwtDecoder))
                .authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401); response.setContentType("application/problem+json;charset=UTF-8");
                    response.setHeader("Cache-Control", "no-store"); response.setHeader("WWW-Authenticate", "Bearer");
                    response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"code\":\"INVALID_TOKEN\",\"detail\":\"다시 로그인해 주세요.\"}");
                })).build();
    }
}
