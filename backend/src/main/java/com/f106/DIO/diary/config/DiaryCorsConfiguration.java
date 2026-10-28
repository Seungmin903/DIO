package com.f106.DIO.diary.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;

@Configuration(proxyBeanMethods=false)
public class DiaryCorsConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public DiaryCorsConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins) {
        this.origins=java.util.Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/diaries/**").allowedOrigins(origins).allowedMethods("GET","POST","PATCH","DELETE","OPTIONS")
            .allowedHeaders("Authorization","X-DIO-Access-Token","Content-Type","Idempotency-Key").exposedHeaders("Location").allowCredentials(false).maxAge(600);
    }
}
