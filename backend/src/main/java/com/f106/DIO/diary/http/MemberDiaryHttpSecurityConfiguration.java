package com.f106.DIO.diary.http;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods=false)
public class MemberDiaryHttpSecurityConfiguration {
    @Bean @Order(10)
    SecurityFilterChain memberDiarySecurity(HttpSecurity http,@Qualifier("loginJwtDecoder") JwtDecoder decoder,
            @Qualifier("loginBearerTokenResolver") BearerTokenResolver resolver,ObjectMapper json) throws Exception {
        return http.securityMatcher("/api/v1/member/diaries","/api/v1/member/diaries/**")
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .csrf(c -> c.disable()).formLogin(c -> c.disable()).httpBasic(c -> c.disable()).logout(c -> c.disable()).requestCache(c -> c.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a.requestMatchers(HttpMethod.OPTIONS,"/**").permitAll().anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.bearerTokenResolver(resolver).jwt(j -> j.decoder(decoder))
                .authenticationEntryPoint((request,response,error) -> {
                    response.setStatus(401); response.setContentType("application/problem+json;charset=UTF-8");
                    response.setHeader("Cache-Control","no-store"); response.setHeader("WWW-Authenticate","Bearer");
                    json.writeValue(response.getOutputStream(),new MemberDiaryProblem(401,"Unauthorized","INVALID_TOKEN","다시 로그인해 주세요."));
                })).build();
    }
}
