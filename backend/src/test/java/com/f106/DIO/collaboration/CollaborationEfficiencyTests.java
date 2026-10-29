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
        var jwt=Jwt.withTokenValue("token").header("alg","HS256").subject("42").expiresAt(Instant.now().plusSeconds(600)).build();
        when(decoder.decode("token")).thenReturn(jwt);
        var handler=new CollaborationSocket(access,decoder,json,Runnable::run);UUID diary=UUID.randomUUID();
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
}
