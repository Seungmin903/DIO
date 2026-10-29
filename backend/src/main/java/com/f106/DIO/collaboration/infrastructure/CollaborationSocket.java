package com.f106.DIO.collaboration.infrastructure;
import com.f106.DIO.collaboration.domain.CanvasCommitted;
import com.f106.DIO.collaboration.exception.CollaborationException;
import com.f106.DIO.collaboration.service.CollaborationAccess;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.*;
import tools.jackson.databind.ObjectMapper;
@Component
public class CollaborationSocket extends TextWebSocketHandler {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(CollaborationSocket.class);
    private static final class Connection {
        final WebSocketSession socket;final UUID diary;final String ip;final long connected=System.currentTimeMillis();
        volatile long actor=-1;volatile java.time.Instant expiresAt;volatile long lastMessage;
        Connection(WebSocketSession socket){this.socket=new ConcurrentWebSocketSessionDecorator(socket,2000,65536);diary=(UUID)socket.getAttributes().get("diaryId");ip=(String)socket.getAttributes().getOrDefault("remoteIp","unknown");}
        @Override public String toString(){return "CollaborationConnection[credentials=REDACTED]";}
    }
    private final Map<String,Connection> connections=new ConcurrentHashMap<>();
    private final CollaborationAccess access;private final JwtDecoder decoder;private final ObjectMapper json;private final TaskExecutor executor;
    public CollaborationSocket(CollaborationAccess access,@Qualifier("loginJwtDecoder") JwtDecoder decoder,ObjectMapper json,@Qualifier("collaborationEventsExecutor") TaskExecutor executor){this.access=access;this.decoder=decoder;this.json=json;this.executor=executor;}
    @Override public synchronized void afterConnectionEstablished(WebSocketSession socket)throws IOException{
        String ip=(String)socket.getAttributes().getOrDefault("remoteIp","unknown");
        if(connections.size()>=512||connections.values().stream().filter(c->c.actor<0&&c.ip.equals(ip)).count()>=4){socket.close(CloseStatus.POLICY_VIOLATION);return;}
        socket.setTextMessageSizeLimit(4096);socket.setBinaryMessageSizeLimit(1024);
        connections.put(socket.getId(),new Connection(socket));
    }
    @Override protected void handleTextMessage(WebSocketSession socket,TextMessage message){
        var connection=connections.get(socket.getId());if(connection==null)return;
        try{
            if(message.getPayloadLength()>4096||System.currentTimeMillis()-connection.lastMessage<1000)throw new IllegalArgumentException();
            var frame=json.readTree(message.getPayload());String type=frame.path("type").asText();
            if("AUTH".equals(type)){
                String token=frame.path("accessToken").asText();var jwt=decoder.decode(token);long actor=Long.parseLong(jwt.getSubject());access.requireDiary(connection.diary,actor);
                synchronized(this){
                    if(connection.actor>=0&&connection.actor!=actor)throw new IllegalArgumentException();
                    if(connections.values().stream().filter(c->c!=connection&&c.actor==actor).count()>=8)throw new IllegalArgumentException();
                    connection.expiresAt=jwt.getExpiresAt();connection.actor=actor;
                }
                send(connection,Map.of("type","READY","diaryId",connection.diary.toString()));
            }else if("PING".equals(type)){
                if(System.currentTimeMillis()-connection.lastMessage<1000)throw new IllegalArgumentException();
                validateToken(connection);send(connection,Map.of("type","PONG"));
            }else throw new IllegalArgumentException();
            connection.lastMessage=System.currentTimeMillis();
        }catch(JwtException|CollaborationException|IllegalArgumentException error){close(connection,CloseStatus.POLICY_VIOLATION);}
        catch(RuntimeException error){close(connection,CloseStatus.SERVER_ERROR);}
    }
    private void validateToken(Connection connection){
        // AUTH already verified the signature; keep expiry rather than the bearer credential.
        if(connection.actor<0||connection.expiresAt==null||!java.time.Instant.now().isBefore(connection.expiresAt))throw new IllegalArgumentException();
    }
    private void validate(Connection connection,Map<String,Boolean> permissions){
        validateToken(connection);
        String key=connection.diary+":"+connection.actor;
        boolean allowed=permissions.computeIfAbsent(key,k->{
            try{access.requireDiary(connection.diary,connection.actor);return true;}
            catch(CollaborationException denied){return false;}
        });
        if(!allowed)throw new IllegalArgumentException();
    }
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void committed(CanvasCommitted event){
        // Dispatch after commit on a separate executor; socket I/O never retains the writer's DB transaction.
        try{executor.execute(()->broadcast(event));}
        catch(RuntimeException error){LOG.warn("Canvas notification delayed: errorType={}",error.getClass().getSimpleName());}
    }
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void pagesChanged(com.f106.DIO.page.domain.PageCatalogChanged event){
        try{executor.execute(()->{
            var permissions=new HashMap<String,Boolean>();
            for(var connection:connections.values())if(connection.actor>=0&&connection.diary.equals(event.diaryId())){
                try{validate(connection,permissions);send(connection,Map.of("type","PAGES_CHANGED","diaryId",event.diaryId().toString()));}
                catch(RuntimeException error){close(connection,CloseStatus.POLICY_VIOLATION);}
            }
        });}catch(RuntimeException error){LOG.warn("Page notification delayed: errorType={}",error.getClass().getSimpleName());}
    }
    private void broadcast(CanvasCommitted event){
        var permissions=new HashMap<String,Boolean>();
        for(var connection:connections.values())if(connection.actor>=0&&connection.diary.equals(event.diaryId())){
            try{
                validate(connection,permissions);
                send(connection,Map.of("type","PAGE_CHANGED","pageId",event.pageId().toString(),"operationId",event.operationId(),
                    "clientOperationId",event.clientOperationId().toString(),"actorUserId",Long.toString(event.actorUserId()),"revision",event.revision(),"action",event.action()));
            }catch(RuntimeException error){close(connection,CloseStatus.POLICY_VIOLATION);}
        }
    }
    @Scheduled(fixedDelay=5000) public void checkConnections(){
        var permissions=new HashMap<String,Boolean>();
        for(var connection:connections.values()){
            if(connection.actor<0){if(System.currentTimeMillis()-connection.connected>10000)close(connection,CloseStatus.POLICY_VIOLATION);continue;}
            try{validate(connection,permissions);}catch(RuntimeException error){close(connection,CloseStatus.POLICY_VIOLATION);}
        }
    }
    private void send(Connection connection,Object frame){try{connection.socket.sendMessage(new TextMessage(json.writeValueAsString(frame)));}catch(IOException|RuntimeException error){close(connection,CloseStatus.SERVER_ERROR);}}
    private void close(Connection connection,CloseStatus status){connections.remove(connection.socket.getId());try{connection.socket.close(status);}catch(IOException ignored){}}
    @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status){connections.remove(socket.getId());}
    @Override public void handleTransportError(WebSocketSession socket,Throwable error){var connection=connections.get(socket.getId());if(connection!=null)close(connection,CloseStatus.SERVER_ERROR);}
}
