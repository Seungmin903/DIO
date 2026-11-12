package com.f106.DIO.font;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 웹 프론트(Expo web)에서 폰트 공유 동의 API 를 부를 수 있게 허용한다. 허용 주소는 다른 기능과 같은 AUTH_ALLOWED_ORIGINS. */
@Configuration(proxyBeanMethods = false)
public class FontShareConsentWebConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public FontShareConsentWebConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins) {
        this.origins = java.util.Arrays.stream(origins.split(",")).map(String::strip).filter(value -> !value.isEmpty()).toArray(String[]::new);
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/handwriting-fonts/share-consent").allowedOrigins(origins).allowedMethods("GET", "PUT", "OPTIONS")
            .allowedHeaders("Content-Type", "Authorization", "X-DIO-Access-Token").allowCredentials(false).maxAge(600);
    }
}
