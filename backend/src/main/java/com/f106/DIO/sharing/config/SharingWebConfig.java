package com.f106.DIO.sharing.config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
@Configuration(proxyBeanMethods=false)
public class SharingWebConfig implements WebMvcConfigurer {
    private final String[] origins;
    public SharingWebConfig(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins){
        this.origins=java.util.Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }
    @Override public void addCorsMappings(CorsRegistry registry){
        for(String path:new String[]{"/api/v1/diaries/*/membership","/api/v1/diaries/*/members/**",
                "/api/v1/diaries/*/transfer-owner","/api/v1/diaries/*/invites/**","/api/v1/invites/**","/api/v1/me/invites/**"})
            registry.addMapping(path).allowedOrigins(origins).allowedMethods("GET","POST","PATCH","DELETE","OPTIONS")
                .allowedHeaders("Content-Type","Authorization","X-DIO-Access-Token").exposedHeaders("Retry-After").maxAge(600);
    }
    @Override public void addInterceptors(InterceptorRegistry registry){
        registry.addInterceptor(new org.springframework.web.servlet.HandlerInterceptor(){
            @Override public boolean preHandle(jakarta.servlet.http.HttpServletRequest request,jakarta.servlet.http.HttpServletResponse response,Object handler){
                response.setHeader("Cache-Control","no-store");response.setHeader("Referrer-Policy","no-referrer");return true;
            }
        }).addPathPatterns("/api/v1/diaries/*/membership","/api/v1/diaries/*/members/**",
            "/api/v1/diaries/*/transfer-owner","/api/v1/diaries/*/invites/**","/api/v1/invites/**","/api/v1/me/invites/**");
    }
}
