package com.f106.DIO.font;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods=false)
public class FontWebConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public FontWebConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins) {
        this.origins=java.util.Arrays.stream(origins.split(",")).map(String::trim).filter(s->!s.isEmpty()).toArray(String[]::new);
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        for(String path:new String[]{"/api/v1/handwriting-fonts","/api/v1/diaries/*/fonts","/api/v1/diaries/*/fonts/*","/api/v1/diaries/*/fonts/*/file"})
            registry.addMapping(path).allowedOrigins(origins).allowedMethods("GET","POST","PATCH","OPTIONS")
                .allowedHeaders("Content-Type","Authorization","X-DIO-Access-Token").allowCredentials(false).maxAge(600);
    }
}
