package com.f106.DIO.diary.config;

import java.util.Map;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
public class DiarySecurityConfiguration {
    @Bean @Order(1)
    SecurityFilterChain diarySecurity(HttpSecurity http, JwtDecoder loginJwtDecoder, BearerTokenResolver loginBearerTokenResolver) throws Exception {
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        return http.securityMatcher("/api/v1/diaries", "/api/v1/diaries/**")
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .csrf(csrf -> csrf.disable()).formLogin(form -> form.disable()).httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable()).requestCache(cache -> cache.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // 개별 쓰기 컨트롤러가 OWNER 권한·상태를 검사한다. 영구 삭제도 휴지통 상태와 OWNER 권한을 검사한다.
            .authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.GET, "/api/v1/diaries", "/api/v1/diaries/*").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/diaries").authenticated().requestMatchers(HttpMethod.PATCH, "/api/v1/diaries/*").authenticated().requestMatchers(HttpMethod.DELETE, "/api/v1/diaries/*").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/diaries/*/restore").authenticated().anyRequest().denyAll())
            .exceptionHandling(errors -> errors.accessDeniedHandler((request, response, error) -> {
                response.setStatus(403); response.setContentType("application/problem+json;charset=UTF-8");
                response.setHeader("Cache-Control", "no-store");
                response.getWriter().write(json.writeValueAsString(Map.of("status",403,"code","DIARY_WRITE_NOT_AVAILABLE","detail","아직 사용할 수 없는 기능이에요.")));
            }))
            .oauth2ResourceServer(oauth -> oauth.bearerTokenResolver(loginBearerTokenResolver).jwt(jwt -> jwt.decoder(loginJwtDecoder))
                .authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401); response.setContentType("application/problem+json;charset=UTF-8");
                    response.setHeader("Cache-Control", "no-store"); response.setHeader("WWW-Authenticate", "Bearer");
                    response.getWriter().write(json.writeValueAsString(Map.of("status",401,"code","AUTHENTICATION_REQUIRED","detail","다시 로그인해 주세요.")));
                })).build();
    }
}
