package com.f106.DIO.diary.http;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods=false)
public class MemberDiaryHttpConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public MemberDiaryHttpConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins) {
        this.origins=java.util.Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/member/diaries/**").allowedOrigins(origins).allowedMethods("GET","POST","PATCH","OPTIONS")
            .allowedHeaders("Content-Type","Authorization","X-DIO-Access-Token","Idempotency-Key")
            .exposedHeaders("Location","Idempotency-Replayed","Retry-After").allowCredentials(false).maxAge(600);
    }
}
