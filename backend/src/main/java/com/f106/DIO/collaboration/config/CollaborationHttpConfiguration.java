package com.f106.DIO.collaboration.config;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
@Configuration(proxyBeanMethods=false)
public class CollaborationHttpConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public CollaborationHttpConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins){this.origins=Arrays.stream(origins.split(",")).map(String::strip).filter(v->!v.isEmpty()).toArray(String[]::new);}
    @Override public void addCorsMappings(CorsRegistry registry){
        registry.addMapping("/api/v1/pages/**").allowedOrigins(origins).allowedMethods("GET","POST","PATCH","DELETE","OPTIONS")
            .allowedHeaders("Content-Type","Authorization","X-DIO-Access-Token").allowCredentials(false).maxAge(600);
    }
}
