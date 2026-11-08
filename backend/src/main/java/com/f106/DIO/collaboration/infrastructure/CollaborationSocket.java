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
    private static final int MAX_PENDING=64,MAX_AUTH_FRAMES=4;
    private static final long AUTH_WINDOW_NANOS=10_000_000_000L,PING_INTERVAL_NANOS=1_000_000_000L;
    private static final long AUTH_WAIT_MILLIS=5000;
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(CollaborationSocket.class);
    private static final class Connection {
        final WebSocketSession socket;final UUID diary;final String ip;final long connected=System.currentTimeMillis();
        final Deque<TextMessage> outgoing=new ArrayDeque<>();boolean sending;volatile long sendingSince;
        volatile UUID sessionId;volatile long actor=-1;volatile java.time.Instant expiresAt;volatile long lastPing;final Deque<Long> authAttempts=new ArrayDeque<>();
        Connection(WebSocketSession socket){this.socket=new ConcurrentWebSocketSessionDecorator(socket,2000,65536);diary=(UUID)socket.getAttributes().get("diaryId");ip=(String)socket.getAttributes().getOrDefault("remoteIp","unknown");}
        @Override public String toString(){return "CollaborationConnection[credentials=REDACTED]";}
    }
    private final Map<String,Connection> connections=new ConcurrentHashMap<>();
    private final CollaborationAccess access;private final JwtDecoder decoder;private final ObjectMapper json;private final TaskExecutor executor;private final TaskExecutor sendExecutor;
    private final java.util.concurrent.atomic.AtomicLong droppedEvents=new java.util.concurrent.atomic.AtomicLong(),droppedMessages=new java.util.concurrent.atomic.AtomicLong();
    public CollaborationSocket(CollaborationAccess access,@Qualifier("loginJwtDecoder") JwtDecoder decoder,ObjectMapper json,@Qualifier("collaborationEventsExecutor") TaskExecutor executor,@Qualifier("collaborationSocketSendExecutor") TaskExecutor sendExecutor){this.access=access;this.decoder=decoder;this.json=json;this.executor=executor;this.sendExecutor=sendExecutor;}
    @Override public synchronized void afterConnectionEstablished(WebSocketSession socket)throws IOException{
        expirePendingConnections();
        String ip=(String)socket.getAttributes().getOrDefault("remoteIp","unknown");
        if(connections.values().stream().filter(c->c.actor<0).count()>=MAX_PENDING){socket.close(new CloseStatus(1013,"Authentication capacity exceeded"));return;}
        if(connections.size()>=512){socket.close(new CloseStatus(1013,"Try again later"));return;}
        if(connections.values().stream().filter(c->c.actor<0&&c.ip.equals(ip)).count()>=4){socket.close(CloseStatus.POLICY_VIOLATION);return;}
        socket.setTextMessageSizeLimit(4096);socket.setBinaryMessageSizeLimit(1024);
        connections.put(socket.getId(),new Connection(socket));
    }
    @Override protected void handleTextMessage(WebSocketSession socket,TextMessage message){
        var connection=connections.get(socket.getId());if(connection==null)return;
        try{
            if(message.getPayloadLength()>4096)throw new IllegalArgumentException();
            tools.jackson.databind.JsonNode frame;
            try{frame=json.readTree(message.getPayload());}
            catch(tools.jackson.core.JacksonException malformed){close(connection,CloseStatus.POLICY_VIOLATION);return;}
            if(frame==null||!frame.isObject())throw new IllegalArgumentException();String type=frame.path("type").asText();
            if("AUTH".equals(type)){
                reserveAuth(connection);
                String token=frame.path("accessToken").asText();var jwt=decoder.decode(token);long actor=Long.parseLong(jwt.getSubject());UUID sessionId=sessionId(jwt);access.requireSession(sessionId,actor);access.requireDiary(connection.diary,actor);
                synchronized(this){
                    if(!connections.containsKey(socket.getId()))return;
                    if(connection.actor>=0&&connection.actor!=actor)throw new IllegalArgumentException();
                    if(connections.values().stream().filter(c->c!=connection&&c.actor==actor).count()>=8)throw new IllegalArgumentException();
                    connection.sessionId=sessionId;connection.expiresAt=jwt.getExpiresAt();
                    // Queue READY before exposing a newly authenticated connection to broadcasts.
                    send(connection,Map.of("type","READY","diaryId",connection.diary.toString()));connection.actor=actor;
                }
            }else if("PING".equals(type)){
                validateToken(connection);reservePing(connection);send(connection,Map.of("type","PONG"));
            }else throw new IllegalArgumentException();
        }catch(RuntimeException error){validationFailure(connection,error);}
    }
    private void reserveAuth(Connection connection){
        long now=System.nanoTime();
        synchronized(connection.authAttempts){
            while(!connection.authAttempts.isEmpty()&&now-connection.authAttempts.peekFirst()>=AUTH_WINDOW_NANOS)connection.authAttempts.removeFirst();
            if(connection.authAttempts.size()>=MAX_AUTH_FRAMES)throw new IllegalArgumentException("Too many AUTH frames");
            connection.authAttempts.addLast(now);
        }
    }
    private void reservePing(Connection connection){
        long now=System.nanoTime();
        synchronized(connection.authAttempts){
            if(connection.lastPing!=0&&now-connection.lastPing<PING_INTERVAL_NANOS)throw new IllegalArgumentException("Too many PING frames");
            connection.lastPing=now;
        }
    }
    private void validationFailure(Connection connection,RuntimeException error){
        if(error instanceof JwtException||error instanceof IllegalArgumentException||error instanceof CollaborationException denied&&denied.status.is4xxClientError()){
            close(connection,CloseStatus.POLICY_VIOLATION);
        }else{
            // Never convert a transient DB/infrastructure failure into revoked access.
            LOG.warn("Collaboration validation unavailable: errorType={}",error.getClass().getSimpleName());
            close(connection,CloseStatus.SERVER_ERROR);
        }
    }
    private UUID sessionId(Jwt jwt){
        String sid=jwt.getClaimAsString("sid");
        if(sid==null||!sid.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))throw new IllegalArgumentException("Invalid session claim");
        return UUID.fromString(sid);
    }
    @Scheduled(fixedDelay=1000) public synchronized void expirePendingConnections(){
        long now=System.currentTimeMillis();
        for(var connection:connections.values())if(connection.actor<0&&now-connection.connected>=AUTH_WAIT_MILLIS)close(connection,CloseStatus.POLICY_VIOLATION);
    }
    private void validateToken(Connection connection){
        // AUTH already verified the signature; keep expiry rather than the bearer credential.
        if(connection.actor<0||connection.expiresAt==null||!java.time.Instant.now().isBefore(connection.expiresAt))throw new IllegalArgumentException();
    }
    private void validate(Connection connection,Map<String,Boolean> permissions){
        validateToken(connection);
        String sessionKey="session:"+connection.sessionId+":"+connection.actor;
        if(!permissions.computeIfAbsent(sessionKey,k->{
            try{access.requireSession(connection.sessionId,connection.actor);return true;}
            catch(CollaborationException denied){if(!denied.status.is4xxClientError())throw denied;return false;}
        }))throw new IllegalArgumentException();
        String key=connection.diary+":"+connection.actor;
        boolean allowed=permissions.computeIfAbsent(key,k->{
            try{access.requireDiary(connection.diary,connection.actor);return true;}
            catch(CollaborationException denied){if(!denied.status.is4xxClientError())throw denied;return false;}
        });
        if(!allowed)throw new IllegalArgumentException();
    }
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void committed(CanvasCommitted event){
        // Dispatch after commit on a separate executor; socket I/O never retains the writer's DB transaction.
        try{executor.execute(()->broadcast(event));}
        catch(RuntimeException error){LOG.warn("Canvas notification dropped: total={}, errorType={}",droppedEvents.incrementAndGet(),error.getClass().getSimpleName());}
    }
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void pagesChanged(com.f106.DIO.page.domain.PageCatalogChanged event){
        try{executor.execute(()->{
            var permissions=new HashMap<String,Boolean>();
            for(var connection:connections.values())if(connection.actor>=0&&connection.diary.equals(event.diaryId())){
                try{validate(connection,permissions);send(connection,Map.of("type","PAGES_CHANGED","diaryId",event.diaryId().toString()));}
                catch(RuntimeException error){validationFailure(connection,error);}
            }
        });}catch(RuntimeException error){LOG.warn("Page notification dropped: total={}, errorType={}",droppedEvents.incrementAndGet(),error.getClass().getSimpleName());}
    }
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void membersChanged(com.f106.DIO.sharing.domain.DiaryMembershipChanged event){
        try{executor.execute(()->{
            var permissions=new HashMap<String,Boolean>();
            for(var connection:connections.values())if(connection.actor>=0&&connection.diary.equals(event.diaryId())){
                try{validate(connection,permissions);send(connection,Map.of("type","MEMBERS_CHANGED","diaryId",event.diaryId().toString()));}
                catch(RuntimeException error){validationFailure(connection,error);}
            }
        });}catch(RuntimeException error){LOG.warn("Membership notification dropped: total={}, errorType={}",droppedEvents.incrementAndGet(),error.getClass().getSimpleName());}
    }
    private void broadcast(CanvasCommitted event){
        var permissions=new HashMap<String,Boolean>();
        for(var connection:connections.values())if(connection.actor>=0&&connection.diary.equals(event.diaryId())){
            try{
                validate(connection,permissions);
                send(connection,Map.of("type","PAGE_CHANGED","pageId",event.pageId().toString(),"operationId",event.operationId(),
                    "clientOperationId",event.clientOperationId().toString(),"actorUserId",Long.toString(event.actorUserId()),"revision",event.revision(),"action",event.action()));
            }catch(RuntimeException error){validationFailure(connection,error);}
        }
    }
    @Scheduled(fixedDelay=5000) public void checkConnections(){
        var permissions=new HashMap<String,Boolean>();
        for(var connection:connections.values()){
            if(connection.sendingSince>0&&System.currentTimeMillis()-connection.sendingSince>2000){close(connection,CloseStatus.SERVER_ERROR);continue;}
            if(connection.actor<0){if(System.currentTimeMillis()-connection.connected>=AUTH_WAIT_MILLIS)close(connection,CloseStatus.POLICY_VIOLATION);continue;}
            try{validate(connection,permissions);}catch(RuntimeException error){validationFailure(connection,error);}
        }
    }
    private void send(Connection connection,Object frame){
        TextMessage message=new TextMessage(json.writeValueAsString(frame));
        synchronized(connection.outgoing){
            if(!connections.containsKey(connection.socket.getId()))return;
            if(connection.outgoing.size()>=32){
                LOG.warn("Socket send queue full: droppedTotal={}",droppedMessages.incrementAndGet());close(connection,CloseStatus.SERVER_ERROR);return;
            }
            connection.outgoing.addLast(message);
            if(connection.sending)return;
            connection.sending=true;
        }
        dispatchSend(connection);
    }
    private void dispatchSend(Connection connection){
        try{sendExecutor.execute(()->{
            TextMessage message;
            synchronized(connection.outgoing){message=connection.outgoing.pollFirst();}
            if(message==null||!connections.containsKey(connection.socket.getId()))return;
            try{
                connection.sendingSince=System.currentTimeMillis();connection.socket.sendMessage(message);
            }catch(IOException|RuntimeException error){close(connection,CloseStatus.SERVER_ERROR);return;}
            finally{connection.sendingSince=0;}
            synchronized(connection.outgoing){
                if(connection.outgoing.isEmpty()){connection.sending=false;return;}
            }
            // One task per frame preserves connection order without monopolising the pool.
            dispatchSend(connection);
        });}catch(RuntimeException error){
            LOG.warn("Socket send rejected: droppedTotal={}, errorType={}",droppedMessages.incrementAndGet(),error.getClass().getSimpleName());
            close(connection,CloseStatus.SERVER_ERROR);
        }
    }
    private void close(Connection connection,CloseStatus status){
        connections.remove(connection.socket.getId());
        synchronized(connection.outgoing){connection.outgoing.clear();}
        try{connection.socket.close(status);}catch(IOException ignored){}
    }
    @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status){connections.remove(socket.getId());}
    @Override public void handleTransportError(WebSocketSession socket,Throwable error){var connection=connections.get(socket.getId());if(connection!=null)close(connection,CloseStatus.SERVER_ERROR);}
}
