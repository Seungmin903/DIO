package com.f106.DIO.collaboration;

import com.f106.DIO.collaboration.domain.CanvasCommitted;
import com.f106.DIO.collaboration.infrastructure.CollaborationSocket;
import com.f106.DIO.collaboration.repository.CanvasSnapshotRepository;
import com.f106.DIO.collaboration.service.CollaborationAccess;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.socket.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CollaborationEfficiencyTests {
    @Test void snapshotUsesOneQueryForManyIdsAndRetainsMissingEntries(){
        var jdbc=mock(JdbcTemplate.class);
        when(jdbc.query(anyString(),any(RowMapper.class),any(Object[].class))).thenReturn(List.of());
        var ids=new ArrayList<UUID>();for(int i=0;i<200;i++)ids.add(UUID.randomUUID());
        var snapshots=new CanvasSnapshotRepository(jdbc,JsonMapper.builder().build()).capture(UUID.randomUUID(),ids);
        assertThat(snapshots).hasSize(200);assertThat(snapshots.values()).allMatch(Objects::isNull);
        verify(jdbc,times(1)).query(contains("element_id in ("),any(RowMapper.class),any(Object[].class));
        clearInvocations(jdbc);
        assertThat(new CanvasSnapshotRepository(jdbc,JsonMapper.builder().build()).capture(UUID.randomUUID(),List.of())).isEmpty();
        verifyNoInteractions(jdbc);
    }
    @Test void sameUserSocketsSharePermissionCheckAndDoNotDecodeAgain()throws Exception{
        var access=mock(CollaborationAccess.class);var decoder=mock(JwtDecoder.class);var json=JsonMapper.builder().build();
        var jwt=Jwt.withTokenValue("token").header("alg","HS256").subject("42").claim("sid",UUID.randomUUID().toString()).expiresAt(Instant.now().plusSeconds(600)).build();
        when(decoder.decode("token")).thenReturn(jwt);
        var handler=new CollaborationSocket(access,decoder,json,Runnable::run,Runnable::run);UUID diary=UUID.randomUUID();
        for(int i=0;i<2;i++){
            var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn("socket-"+i);when(socket.isOpen()).thenReturn(true);
            when(socket.getAttributes()).thenReturn(Map.of("diaryId",diary,"remoteIp","127.0.0.1"));
            handler.afterConnectionEstablished(socket);handler.handleMessage(socket,new TextMessage("{\"type\":\"AUTH\",\"accessToken\":\"token\"}"));
        }
        clearInvocations(access,decoder);
        handler.committed(new CanvasCommitted(diary,UUID.randomUUID(),"1",UUID.randomUUID(),42,0,"APPLY"));
        verify(access,times(1)).requireDiary(diary,42);verifyNoInteractions(decoder);
        clearInvocations(access);handler.checkConnections();verify(access,times(1)).requireDiary(diary,42);verifyNoInteractions(decoder);
    }
    @Test void blockedRecipientDoesNotDelayOtherSocketAndFramesRemainOrdered()throws Exception{
        var access=mock(CollaborationAccess.class);var decoder=mock(JwtDecoder.class);var json=JsonMapper.builder().build();
        var jwt=Jwt.withTokenValue("token").header("alg","HS256").subject("42").claim("sid",UUID.randomUUID().toString()).expiresAt(Instant.now().plusSeconds(600)).build();when(decoder.decode("token")).thenReturn(jwt);
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var release=new java.util.concurrent.CountDownLatch(1);var blocked=new java.util.concurrent.CountDownLatch(1);var delivered=new java.util.concurrent.CountDownLatch(2);
        var fastIds=new java.util.concurrent.CopyOnWriteArrayList<String>();UUID diary=UUID.randomUUID();
        try{
            var handler=new CollaborationSocket(access,decoder,json,Runnable::run,pool::execute);
            for(String name:List.of("slow","fast")){
                var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn(name);when(socket.isOpen()).thenReturn(true);when(socket.getAttributes()).thenReturn(Map.of("diaryId",diary,"remoteIp","127.0.0.1"));
                doAnswer(call->{var frame=json.readTree(((TextMessage)call.getArgument(0)).getPayload());if("PAGE_CHANGED".equals(frame.path("type").asText())){
                    if(name.equals("slow")){blocked.countDown();release.await(5,java.util.concurrent.TimeUnit.SECONDS);}
                    else{fastIds.add(frame.path("operationId").asText());delivered.countDown();}
                }return null;}).when(socket).sendMessage(any(WebSocketMessage.class));
                handler.afterConnectionEstablished(socket);handler.handleMessage(socket,new TextMessage("{\"type\":\"AUTH\",\"accessToken\":\"token\"}"));
            }
            handler.committed(new CanvasCommitted(diary,UUID.randomUUID(),"1",UUID.randomUUID(),42,0,"APPLY"));
            assertThat(blocked.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            handler.committed(new CanvasCommitted(diary,UUID.randomUUID(),"2",UUID.randomUUID(),42,0,"APPLY"));
            assertThat(delivered.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(fastIds).containsExactly("1","2");
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void globalCapacityUsesRetryLaterWithoutChangingUnauthenticatedIpPolicy()throws Exception{
        var access=mock(CollaborationAccess.class);var decoder=mock(JwtDecoder.class);var json=JsonMapper.builder().build();
        var handler=new CollaborationSocket(access,decoder,json,Runnable::run,Runnable::run);UUID diary=UUID.randomUUID();
        when(decoder.decode(anyString())).thenAnswer(call->Jwt.withTokenValue(call.getArgument(0)).header("alg","HS256").subject(call.getArgument(0))
            .claim("sid",UUID.randomUUID().toString()).expiresAt(Instant.now().plusSeconds(600)).build());
        for(int i=0;i<512;i++){
            var socket=pendingSocket("conn-"+i,diary,"ip-"+i);handler.afterConnectionEstablished(socket);
            handler.handleMessage(socket,new TextMessage("{\"type\":\"AUTH\",\"accessToken\":\""+(i+1)+"\"}"));
        }
        var full=pendingSocket("full",diary,"new-ip");handler.afterConnectionEstablished(full);
        verify(full).close(argThat(status->status.getCode()==1013));
        var limited=new CollaborationSocket(access,decoder,json,Runnable::run,Runnable::run);
        for(int i=0;i<4;i++)limited.afterConnectionEstablished(pendingSocket("ip-conn-"+i,diary,"same-ip"));
        var extra=pendingSocket("extra",diary,"same-ip");limited.afterConnectionEstablished(extra);
        verify(extra).close(CloseStatus.POLICY_VIOLATION);
    }
    @Test void missingOrMalformedSessionClaimClosesWithPolicyViolation()throws Exception{
        for(String sid:Arrays.asList(null,"invalid","1-1-1-1-1")){
            var access=mock(CollaborationAccess.class);var decoder=mock(JwtDecoder.class);
            var builder=Jwt.withTokenValue("token").header("alg","HS256").subject("42").expiresAt(Instant.now().plusSeconds(600));
            if(sid!=null)builder.claim("sid",sid);when(decoder.decode("token")).thenReturn(builder.build());
            var handler=new CollaborationSocket(access,decoder,JsonMapper.builder().build(),Runnable::run,Runnable::run);
            var socket=pendingSocket("sid-test",UUID.randomUUID(),"ip");handler.afterConnectionEstablished(socket);
            handler.handleMessage(socket,new TextMessage("{\"type\":\"AUTH\",\"accessToken\":\"token\"}"));
            verify(socket).close(CloseStatus.POLICY_VIOLATION);verifyNoInteractions(access);
        }
    }
    @Test void pendingQuotaDoesNotConsumeAllCapacityAndAuthenticationFreesPendingSlot()throws Exception{
        var access=mock(CollaborationAccess.class);var decoder=mock(JwtDecoder.class);UUID diary=UUID.randomUUID();
        when(decoder.decode("token")).thenReturn(Jwt.withTokenValue("token").header("alg","HS256").subject("42").claim("sid",UUID.randomUUID().toString()).expiresAt(Instant.now().plusSeconds(600)).build());
        var handler=new CollaborationSocket(access,decoder,JsonMapper.builder().build(),Runnable::run,Runnable::run);
        var first=pendingSocket("first",diary,"first-ip");handler.afterConnectionEstablished(first);
        for(int i=1;i<64;i++)handler.afterConnectionEstablished(pendingSocket("pending-"+i,diary,"ip-"+i));
        var rejected=pendingSocket("rejected",diary,"another-ip");handler.afterConnectionEstablished(rejected);verify(rejected).close(argThat(status->status.getCode()==1013));
        handler.handleMessage(first,new TextMessage("{\"type\":\"AUTH\",\"accessToken\":\"token\"}"));
        var accepted=pendingSocket("accepted",diary,"new-ip");handler.afterConnectionEstablished(accepted);verify(accepted,never()).close(any());verify(first,never()).close(any());
    }
    @Test void expiredPendingConnectionIsReleasedWithoutClosingAuthenticatedSocket()throws Exception{
        var access=mock(CollaborationAccess.class);var decoder=mock(JwtDecoder.class);UUID diary=UUID.randomUUID();
        when(decoder.decode("token")).thenReturn(Jwt.withTokenValue("token").header("alg","HS256").subject("42").claim("sid",UUID.randomUUID().toString()).expiresAt(Instant.now().plusSeconds(600)).build());
        var handler=new CollaborationSocket(access,decoder,JsonMapper.builder().build(),Runnable::run,Runnable::run);
        var pending=pendingSocket("pending",diary,"one");var active=pendingSocket("active",diary,"two");handler.afterConnectionEstablished(pending);handler.afterConnectionEstablished(active);
        handler.handleMessage(active,new TextMessage("{\"type\":\"AUTH\",\"accessToken\":\"token\"}"));
        Thread.sleep(5100);handler.expirePendingConnections();verify(pending).close(CloseStatus.POLICY_VIOLATION);verify(active,never()).close(any());
    }
    private WebSocketSession pendingSocket(String id,UUID diary,String ip){
        var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn(id);when(socket.isOpen()).thenReturn(true);when(socket.getAttributes()).thenReturn(Map.of("diaryId",diary,"remoteIp",ip));return socket;
    }
}
