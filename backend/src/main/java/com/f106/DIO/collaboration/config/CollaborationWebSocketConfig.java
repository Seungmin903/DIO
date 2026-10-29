package com.f106.DIO.collaboration.config;
import com.f106.DIO.collaboration.infrastructure.CollaborationSocket;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.HandshakeInterceptor;
@Configuration(proxyBeanMethods=false) @EnableWebSocket @EnableScheduling
public class CollaborationWebSocketConfig implements WebSocketConfigurer {
    private final CollaborationSocket socket;private final String[] origins;
    public CollaborationWebSocketConfig(CollaborationSocket socket,@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins){this.socket=socket;this.origins=Arrays.stream(origins.split(",")).map(String::strip).filter(s->!s.isEmpty()).toArray(String[]::new);}
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry){
        registry.addHandler(socket,"/ws/diaries/{diaryId}").setAllowedOrigins(origins).addInterceptors(new HandshakeInterceptor(){
            public boolean beforeHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Map<String,Object> attributes){
                try{
                    if(request.getURI().getRawQuery()!=null)throw new IllegalArgumentException();
                    String path=request.getURI().getPath();attributes.put("diaryId",UUID.fromString(path.substring(path.lastIndexOf('/')+1)));
                    // Uses Tomcat RemoteIpValve (dev/prod native strategy), never raw forwarded headers.
                    attributes.put("remoteIp",request.getRemoteAddress()==null?"unknown":request.getRemoteAddress().getAddress().getHostAddress());return true;
                }catch(IllegalArgumentException error){response.setStatusCode(HttpStatus.BAD_REQUEST);return false;}
            }
            public void afterHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Exception error){}
        });
    }
    @Bean @Order(4) SecurityFilterChain collaborationSocketSecurity(HttpSecurity http)throws Exception{
        var matcher=org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.withDefaults().matcher("/ws/diaries/{diaryId}");
        // Browser WebSockets cannot attach a Bearer header. The first bounded frame must authenticate.
        return http.securityMatcher(matcher).csrf(c->c.disable()).formLogin(c->c.disable()).httpBasic(c->c.disable()).logout(c->c.disable())
            .requestCache(c->c.disable()).sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(c->c.anyRequest().permitAll()).build();
    }
    @Bean(name="collaborationEventsExecutor",defaultCandidate=false) static ThreadPoolTaskExecutor collaborationEventsExecutor(){
        var executor=new ThreadPoolTaskExecutor();executor.setCorePoolSize(1);executor.setMaxPoolSize(1);executor.setQueueCapacity(256);
        executor.setThreadNamePrefix("collaboration-events-");return executor;
    }
}
