package com.f106.DIO.collaboration;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginRequest;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.collaboration.domain.CanvasCommitted;
import com.f106.DIO.diary.domain.*;
import com.f106.DIO.diary.repository.*;
import com.f106.DIO.page.domain.DiaryPage;
import com.f106.DIO.page.repository.DiaryPageRepository;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=jdbc:h2:mem:collaboration-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","dio.signup.photos.storage=local",
    "dio.signup.photos.local-directory=build/collaboration-photos","spring.datasource.hikari.maximum-pool-size=12","server.forward-headers-strategy=native","server.tomcat.remoteip.remote-ip-header=X-Forwarded-For","server.tomcat.remoteip.internal-proxies=127\\.0\\.0\\.1|::1"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class CanvasCollaborationTests {
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @Autowired org.springframework.context.ApplicationEventPublisher events;
    @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired UserRepository users;@Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;@Autowired DiaryRepository diaries;@Autowired DiaryMemberRepository members;
    @Autowired DiaryPageRepository pages;@Autowired JdbcTemplate jdbc;
    record Actor(long id,String token){}
    Actor actor(){String key=UUID.randomUUID().toString();var user=users.saveAndFlush(new User(key+"@example.com","편집"+key.substring(0,12),Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),new BCryptPasswordEncoder(4).encode("DioMember123!"),Instant.now()));
        return new Actor(user.getUserId(),login.login(new LoginRequest(user.getEmail(),"DioMember123!","collaboration-test"),"127.0.0.1").accessToken());}
    UUID diary(Actor owner){return diaries.saveAndFlush(new Diary("공동 편집","#123456","PLAIN","MEMBERS",owner.id())).getDiaryId();}
    UUID page(UUID diary){return pages.saveAndFlush(new DiaryPage(diary,null,null,"페이지",BigDecimal.ONE,new BigDecimal("100"),new BigDecimal("100"),false,"#FFFFFF")).getPageId();}
    void join(UUID diary,Actor actor){members.saveAndFlush(new DiaryMember(diary,actor.id(),"EDITOR","#ABCDEF",Instant.now()));}
    Map<String,Object> text(UUID id,String value){return Map.of("elementId",id,"elementType","TEXT","x",1,"y",2,"width",30,"height",20,"propertiesJson",Map.of("text",value));}
    JsonNode postJson(UUID page,Actor actor,String path,Object body,int expected)throws Exception{
        var result=mvc.perform(post("/api/v1/pages/"+page+path).header("Authorization","Bearer "+actor.token()).contentType("application/json").content(json.writeValueAsString(body)))
            .andExpect(status().is(expected)).andReturn().getResponse();return result.getContentAsString().isBlank()?json.nullNode():json.readTree(result.getContentAsString());}
    JsonNode apply(UUID page,Actor actor,UUID client,Map<String,Object> changes)throws Exception{return postJson(page,actor,"/canvas-operations",Map.of("clientOperationId",client,"changes",changes),200);}
    JsonNode create(UUID page,Actor actor,UUID element,String value)throws Exception{return apply(page,actor,UUID.randomUUID(),Map.of("creates",List.of(text(element,value))));}
    JsonNode update(UUID page,Actor actor,UUID element,String value,long version)throws Exception{return apply(page,actor,UUID.randomUUID(),Map.of("updates",List.of(Map.of("elementId",element,"version",version,"propertiesJson",Map.of("text",value)))));}
    JsonNode history(UUID page,Actor actor)throws Exception{return json.readTree(mvc.perform(get("/api/v1/pages/"+page+"/history/me").header("Authorization","Bearer "+actor.token())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());}
    Map<String,Object> command(JsonNode item,UUID client){return Map.of("operationId",item.path("operationId").asText(),"expectedRevision",item.path("revision").asInt(),"clientOperationId",client);}
    @Test void settingsReplacementKeepsCreationIdentityAndPreventsDuplicateRetry()throws Exception{
        var owner=actor();var diary=diary(owner);String nonce=UUID.randomUUID().toString();
        String body=json.writeValueAsString(Map.of("templateConfig",Map.of("clientPageRequestId",nonce,"blank",true)));
        var created=mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andReturn();
        String id=json.readTree(created.getResponse().getContentAsString()).path("page").path("pageId").asText();
        mvc.perform(patch("/api/v1/pages/"+id).header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"templateConfig\":{\"blank\":false}}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.clientPageRequestId").value(nonce));
        mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from pages where diary_id=?",Integer.class,diary)).isEqualTo(1);
        mvc.perform(patch("/api/v1/pages/"+id).header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("templateConfig",Map.of("clientPageRequestId",UUID.randomUUID().toString()))))).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/pages/"+id).header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"templateConfig\":[]}")).andExpect(status().isBadRequest());
        UUID legacy=page(diary);
        mvc.perform(patch("/api/v1/pages/"+legacy).header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
    }

    @Test void createUndoRedoAndOwnHistorySurviveRetries()throws Exception{
        var owner=actor();UUID page=page(diary(owner)),element=UUID.randomUUID(),client=UUID.randomUUID();
        var request=Map.<String,Object>of("creates",List.of(text(element,"hello")));
        var first=apply(page,owner,client,request);var again=apply(page,owner,client,request);
        assertThat(again.path("operationId").asText()).isEqualTo(first.path("operationId").asText());assertThat(again.path("replayed").asBoolean()).isTrue();
        assertThat(history(page,owner).path("items").size()).isEqualTo(1);
        var undo=command(history(page,owner).path("nextUndo"),UUID.randomUUID());
        assertThat(postJson(page,owner,"/undo",undo,200).path("items").size()).isZero();
        assertThat(postJson(page,owner,"/undo",undo,200).path("replayed").asBoolean()).isTrue();
        var redo=command(history(page,owner).path("nextRedo"),UUID.randomUUID());
        var restored=postJson(page,owner,"/redo",redo,200);
        assertThat(restored.path("items").get(0).path("propertiesJson").path("text").asText()).isEqualTo("hello");
        postJson(page,owner,"/undo",Map.of("operationId",first.path("operationId").asText(),"expectedRevision",0,"clientOperationId",UUID.randomUUID()),409);
    }
    @Test void otherEditorsChangesConflictOnlyWhenTheyTouchTheSameElement()throws Exception{
        var owner=actor();var editor=actor();UUID diary=diary(owner),page=page(diary),a=UUID.randomUUID(),b=UUID.randomUUID();join(diary,editor);
        var one=create(page,owner,a,"A");create(page,editor,b,"B");
        var own=history(page,owner);assertThat(own.path("items").size()).isEqualTo(1);
        postJson(page,owner,"/undo",command(own.path("nextUndo"),UUID.randomUUID()),200);
        assertThat(history(page,editor).path("items").size()).isEqualTo(1);
        postJson(page,owner,"/redo",command(history(page,owner).path("nextRedo"),UUID.randomUUID()),200);
        var current=json.readTree(mvc.perform(get("/api/v1/pages/"+page+"/elements").header("Authorization","Bearer "+owner.token())).andReturn().getResponse().getContentAsString()).path("items");
        long version=0;for(var e:current)if(e.path("elementId").asText().equals(a.toString()))version=e.path("version").asLong();
        update(page,editor,a,"friend",version);
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),409);
    }
    @Test void consecutiveUpdatesUndoInOrderAndNewEditInvalidatesOnlyOwnPageRedo()throws Exception{
        var owner=actor();var editor=actor();UUID diary=diary(owner),page=page(diary),other=page(diary),id=UUID.randomUUID();join(diary,editor);
        var a=create(page,owner,id,"A");long v=a.path("items").get(0).path("version").asLong();
        var b=update(page,owner,id,"B",v);v=b.path("items").get(0).path("version").asLong();update(page,owner,id,"C",v);
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        var reverted=postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        assertThat(reverted.path("items").get(0).path("propertiesJson").path("text").asText()).isEqualTo("A");
        create(other,owner,UUID.randomUUID(),"other page");assertThat(history(page,owner).path("nextRedo").isNull()).isFalse();
        create(page,editor,UUID.randomUUID(),"friend");assertThat(history(page,owner).path("nextRedo").isNull()).isFalse();
        create(page,owner,UUID.randomUUID(),"new");assertThat(history(page,owner).path("nextRedo").isNull()).isTrue();
    }
    @Test void wholeBatchRollsBackAndLegacyChangesAreAlsoTracked()throws Exception{
        var owner=actor();UUID page=page(diary(owner)),first=UUID.randomUUID();
        postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(text(first,"A")),"updates",List.of(Map.of("elementId",UUID.randomUUID(),"version",1,"x",2)))),404);
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=?",Integer.class,page)).isZero();
        assertThat(history(page,owner).path("items").size()).isZero();
        postJson(page,owner,"/elements",text(first,"legacy"),201);
        assertThat(history(page,owner).path("items").size()).isEqualTo(1);
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
    }
    @Test void requestReuseVersionChecksAndMembershipAreEnforced()throws Exception{
        var owner=actor();var outsider=actor();UUID diary=diary(owner),page=page(diary),id=UUID.randomUUID(),client=UUID.randomUUID();
        var created=apply(page,owner,client,Map.of("creates",List.of(text(id,"A"))));
        postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",client,"changes",Map.of("creates",List.of(text(id,"different")))),409);
        postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("deleteElementIds",List.of(id))),400);
        postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("deleteElementIds",List.of(id)),"expectedVersions",Map.of(id,999)),409);
        postJson(page,outsider,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(text(UUID.randomUUID(),"bad")))),403);
        join(diary,outsider);mvc.perform(get("/api/v1/pages/"+page+"/history/me").header("Authorization","Bearer "+outsider.token())).andExpect(status().isOk()).andExpect(jsonPath("items").isEmpty());
        jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=?",diary,outsider.id());
        mvc.perform(get("/api/v1/pages/"+page+"/history/me").header("Authorization","Bearer "+outsider.token())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/pages/"+page+"/history/me")).andExpect(status().isUnauthorized());
    }
    static class SocketProbe implements java.net.http.WebSocket.Listener,AutoCloseable {
        final java.util.concurrent.BlockingQueue<String> frames=new java.util.concurrent.LinkedBlockingQueue<>();
        final java.util.concurrent.CountDownLatch closed=new java.util.concurrent.CountDownLatch(1);
        final StringBuilder pending=new StringBuilder();java.net.http.WebSocket socket;volatile int closeCode;
        public void onOpen(java.net.http.WebSocket socket){this.socket=socket;socket.request(1);}
        public java.util.concurrent.CompletionStage<?> onText(java.net.http.WebSocket socket,CharSequence data,boolean last){pending.append(data);if(last){frames.add(pending.toString());pending.setLength(0);}socket.request(1);return null;}
        public java.util.concurrent.CompletionStage<?> onClose(java.net.http.WebSocket socket,int status,String reason){closeCode=status;closed.countDown();return null;}
        public void close(){if(socket!=null)socket.abort();}
    }
    SocketProbe connect(UUID diary,String token)throws Exception{
        return connectFrom(diary,token,"198.51.100.1");
    }
    SocketProbe connectFrom(UUID diary,String token,String clientIp)throws Exception{
        var probe=new SocketProbe();
        java.net.http.HttpClient.newHttpClient().newWebSocketBuilder().header("Origin","http://localhost:8081").header("X-Forwarded-For",clientIp)
            .buildAsync(java.net.URI.create("ws://127.0.0.1:"+port+"/ws/diaries/"+diary),probe).get(10,java.util.concurrent.TimeUnit.SECONDS);
        if(token!=null)probe.socket.sendText(json.writeValueAsString(Map.of("type","AUTH","accessToken",token)),true).join();return probe;
    }
    JsonNode frame(SocketProbe probe)throws Exception{String raw=probe.frames.poll(10,java.util.concurrent.TimeUnit.SECONDS);assertThat(raw).as("WebSocket frame").isNotNull();return json.readTree(raw);}
    @Test void liveSocketsAuthenticateBroadcastAfterCommitAndRejectRevokedMembers()throws Exception{
        var owner=actor();var editor=actor();var outsider=actor();UUID diary=diary(owner),page=page(diary);join(diary,editor);
        try(var own=connect(diary,owner.token());var friend=connect(diary,editor.token());var denied=connect(diary,outsider.token());var bad=connect(diary,"invalid")){
            assertThat(frame(own).path("type").asText()).isEqualTo("READY");assertThat(frame(friend).path("type").asText()).isEqualTo("READY");
            assertThat(denied.closed.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(denied.closeCode).isEqualTo(1008);
            assertThat(bad.closed.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            UUID id=UUID.randomUUID();var applied=create(page,owner,id,"live");
            var event=frame(friend);assertThat(event.path("type").asText()).isEqualTo("PAGE_CHANGED");assertThat(event.path("pageId").asText()).isEqualTo(page.toString());
            assertThat(event.path("operationId").asText()).isEqualTo(applied.path("operationId").asText());frame(own);
            assertThat(jdbc.queryForObject("select count(*) from canvas_history_operations where page_id=?",Integer.class,page)).isEqualTo(1);
            jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=?",diary,editor.id());
            create(page,owner,UUID.randomUUID(),"after kick");
            assertThat(friend.closed.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(friend.closeCode).isEqualTo(1008);
            assertThat(frame(own).path("type").asText()).isEqualTo("PAGE_CHANGED");
        }
    }
    @Test void failedTransactionsAndUnauthenticatedSocketsDoNotReceiveChanges()throws Exception{
        var owner=actor();UUID diary=diary(owner),page=page(diary);
        try(var own=connect(diary,owner.token());var pending=connect(diary,null)){
            frame(own);
            postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(text(UUID.randomUUID(),"rollback")),"updates",List.of(Map.of("elementId",UUID.randomUUID(),"version",1,"x",2)))),404);
            new org.springframework.transaction.support.TransactionTemplate(manager).execute(tx->{
                events.publishEvent(new CanvasCommitted(diary,page,"rolled-back",UUID.randomUUID(),owner.id(),0,"APPLY"));tx.setRollbackOnly();return null;
            });
            assertThat(own.frames.poll(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isNull();
            create(page,owner,UUID.randomUUID(),"committed");frame(own);
            assertThat(pending.frames.poll(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test void removedImageEndpointsAreNotRegistered()throws Exception{
        var owner=actor();UUID page=page(diary(owner));
        String path="/api/v1/pages/"+page+"/collaboration-media/"+UUID.randomUUID();
        mvc.perform(get(path).header("Authorization","Bearer "+owner.token())).andExpect(status().isNotFound());
        mvc.perform(post(path).header("Authorization","Bearer "+owner.token())).andExpect(status().is4xxClientError());
    }
    @Test void strokeAndBuiltinStickerShareOneAtomicUndoRedoHistory()throws Exception{
        var owner=actor();var page=page(diary(owner));UUID stroke=UUID.randomUUID(),sticker=UUID.randomUUID();
        var b=new LinkedHashMap<String,Object>(text(stroke,"stroke"));b.put("elementType","STROKE");b.put("propertiesJson",Map.of("points",List.of(Map.of("x",1,"y",2,"pressure",0.5),Map.of("x",3,"y",4,"pressure",1)),"penKind","brush","strokeWidth",4));
        var c=new LinkedHashMap<String,Object>(text(sticker,"sticker"));c.put("elementType","STICKER");c.put("propertiesJson",Map.of("asset","tw-1f600","flipX",true));
        apply(page,owner,UUID.randomUUID(),Map.of("creates",List.of(b,c)));
        assertThat(history(page,owner).path("items").size()).isEqualTo(1);
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        var restored=postJson(page,owner,"/redo",command(history(page,owner).path("nextRedo"),UUID.randomUUID()),200);
        assertThat(restored.path("items").size()).isEqualTo(2);
    }
    @Test void joinedMemberReadsActualPageAndTemplateIdentifiers()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner);join(diary,friend);
        var ids=jdbc.queryForList("select template_id from page_templates where code='dio-blank-landscape'",Long.class);
        if(ids.isEmpty()){
            jdbc.update("insert into page_templates(code,template_version,canvas_width,canvas_height,is_active) values('dio-blank-landscape','1.0.0',1024,768,true)");
            ids=jdbc.queryForList("select template_id from page_templates where code='dio-blank-landscape'",Long.class);
        }
        var page=pages.saveAndFlush(new DiaryPage(diary,ids.get(0),"{\"blank\":true}","공유 페이지",BigDecimal.ONE,new BigDecimal("1024"),new BigDecimal("768"),false,"#FFFFFF")).getPageId();
        mvc.perform(get("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+friend.token())).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].pageId").value(page.toString())).andExpect(jsonPath("$.items[0].templateCode").value("dio-blank-landscape"));
        mvc.perform(get("/api/v1/pages/"+page).header("Authorization","Bearer "+friend.token())).andExpect(status().isOk())
            .andExpect(jsonPath("$.page.templateVersion").value("1.0.0"));
    }
    @Test void pageLifecycleUsesExistingApisAndNotifiesBothMembersAfterCommit()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner);join(diary,friend);page(diary);
        try(var own=connect(diary,owner.token());var peer=connect(diary,friend.token())){
            frame(own);frame(peer);
            var created=json.readTree(mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("""
                {"canvasWidth":1024,"canvasHeight":768,"templateConfig":{"templateCode":"dio-blank-landscape","templateVersion":"1.0.0","blank":true}}
                """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
            UUID added=UUID.fromString(created.path("page").path("pageId").asText());
            assertThat(frame(peer).path("type").asText()).isEqualTo("PAGES_CHANGED");frame(own);
            mvc.perform(get("/api/v1/pages/"+added).header("Authorization","Bearer "+friend.token())).andExpect(status().isOk());
            create(added,owner,UUID.randomUUID(),"copy me");frame(peer);frame(own);
            var copied=json.readTree(mvc.perform(post("/api/v1/pages/"+added+"/copies").header("Authorization","Bearer "+friend.token()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
            String copiedId=copied.path("page").path("pageId").asText();
            assertThat(copiedId).isNotEqualTo(added.toString());assertThat(frame(peer).path("type").asText()).isEqualTo("PAGES_CHANGED");frame(own);
            mvc.perform(get("/api/v1/pages/"+copiedId).header("Authorization","Bearer "+owner.token())).andExpect(status().isOk()).andExpect(jsonPath("$.elements.length()").value(1));
            mvc.perform(delete("/api/v1/pages/"+added).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
            assertThat(frame(peer).path("type").asText()).isEqualTo("PAGES_CHANGED");frame(own);
            mvc.perform(get("/api/v1/pages/"+added).header("Authorization","Bearer "+friend.token())).andExpect(status().isNotFound());
            mvc.perform(get("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+friend.token())).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
            new org.springframework.transaction.support.TransactionTemplate(manager).execute(tx->{events.publishEvent(new com.f106.DIO.page.domain.PageCatalogChanged(diary));tx.setRollbackOnly();return null;});
            assertThat(peer.frames.poll(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test void repeatedPageCreationRequestCreatesExactlyOnePageWithoutAnotherTable()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner);join(diary,friend);
        String request=json.writeValueAsString(Map.of("canvasWidth",1024,"canvasHeight",768,"templateConfig",Map.of("blank",true,"clientPageRequestId",UUID.randomUUID().toString())));
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var gate=new java.util.concurrent.CountDownLatch(1);
        try{
            java.util.concurrent.Callable<String> own=()->{gate.await();return mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(request)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();};
            java.util.concurrent.Callable<String> peer=()->{gate.await();return mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+friend.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(request)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();};
            var a=pool.submit(own);var b=pool.submit(peer);gate.countDown();
            String id=json.readTree(a.get(15,java.util.concurrent.TimeUnit.SECONDS)).path("page").path("pageId").asText();
            assertThat(json.readTree(b.get(15,java.util.concurrent.TimeUnit.SECONDS)).path("page").path("pageId").asText()).isEqualTo(id);
            assertThat(jdbc.queryForObject("select count(*) from pages where diary_id=?",Integer.class,diary)).isEqualTo(1);
            mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(request.replace("1024","900")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAGE_CREATION_CONFLICT"));
            mvc.perform(post("/api/v1/pages/"+id+"/copies").header("Authorization","Bearer "+friend.token())).andExpect(status().isCreated()).andExpect(jsonPath("$.page.templateConfig.clientPageRequestId").doesNotExist());
            mvc.perform(delete("/api/v1/pages/"+id).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
            mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(request)).andExpect(status().isConflict());
        }finally{pool.shutdownNow();}
    }

    @Test void editorReordersPagesThroughExistingApiAndBothSocketsAreNotified()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner);join(diary,friend);
        UUID a=page(diary),b=page(diary),c=page(diary);create(a,owner,UUID.randomUUID(),"keep content");
        try(var own=connect(diary,owner.token());var peer=connect(diary,friend.token())){
            frame(own);frame(peer);
            mvc.perform(patch("/api/v1/diaries/"+diary+"/pages/order").header("Authorization","Bearer "+friend.token())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("pageIds",List.of(c,a,b)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].pageId").value(c.toString()));
            assertThat(frame(own).path("type").asText()).isEqualTo("PAGES_CHANGED");assertThat(frame(peer).path("type").asText()).isEqualTo("PAGES_CHANGED");
            for(var actor:List.of(owner,friend))mvc.perform(get("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+actor.token()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].pageId").value(c.toString()))
                .andExpect(jsonPath("$.items[1].pageId").value(a.toString())).andExpect(jsonPath("$.items[2].pageId").value(b.toString()));
            mvc.perform(get("/api/v1/pages/"+a).header("Authorization","Bearer "+friend.token())).andExpect(status().isOk()).andExpect(jsonPath("$.elements.length()").value(1));
            mvc.perform(patch("/api/v1/diaries/"+diary+"/pages/order").header("Authorization","Bearer "+friend.token())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("pageIds",List.of(a,b)))))
                .andExpect(status().isBadRequest());
            assertThat(peer.frames.poll(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test void trustedProxyKeepsUnauthenticatedIpBudgetsSeparate()throws Exception{
        var owner=actor();UUID diary=diary(owner);
        var pending=new ArrayList<SocketProbe>();
        try{
            for(int i=0;i<4;i++)pending.add(connectFrom(diary,null,"198.51.100.40"));
            try(var blocked=connectFrom(diary,null,"198.51.100.40");var other=connectFrom(diary,owner.token(),"198.51.100.41")){
                assertThat(blocked.closed.await(3,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                assertThat(blocked.closeCode).isEqualTo(1008);
                assertThat(frame(other).path("type").asText()).isEqualTo("READY");
            }
        }finally{pending.forEach(SocketProbe::close);}
    }
    @Test void pageSettingsNotifyBothParticipantsAfterCommit()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner),page=page(diary);join(diary,friend);
        try(var own=connect(diary,owner.token());var peer=connect(diary,friend.token())){
            frame(own);frame(peer);
            mvc.perform(patch("/api/v1/pages/"+page).header("Authorization","Bearer "+owner.token()).contentType("application/json")
                .content("{\"title\":\"updated\",\"gridVisible\":true}")).andExpect(status().isOk());
            assertThat(frame(own).path("type").asText()).isEqualTo("PAGES_CHANGED");
            assertThat(frame(peer).path("type").asText()).isEqualTo("PAGES_CHANGED");
            mvc.perform(get("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+friend.token()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].title").value("updated")).andExpect(jsonPath("$.items[0].gridVisible").value(true));
        }
    }
    @Autowired com.f106.DIO.collaboration.infrastructure.CollaborationSocket sockets;
    @Autowired com.f106.DIO.collaboration.repository.CanvasHistoryRepository historyRows;
    @Test void revokedLoginSessionClosesOnlyItsSocket()throws Exception{
        var owner=actor();UUID diary=diary(owner),page=page(diary);
        String other=login.login(new LoginRequest(users.findById(owner.id()).orElseThrow().getEmail(),"DioMember123!","second"),"127.0.0.1").accessToken();
        try(var first=connect(diary,owner.token());var second=connect(diary,other)){
            frame(first);frame(second);
            mvc.perform(post("/api/v1/auth/logout").header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
            sockets.checkConnections();assertThat(first.closed.await(3,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(first.closeCode).isEqualTo(1008);
            var active=new Actor(owner.id(),other);create(page,active,UUID.randomUUID(),"still active");
            assertThat(frame(second).path("type").asText()).isEqualTo("PAGE_CHANGED");
        }
    }
    @Test void legacyExpectedSnapshotsRemainUndoable()throws Exception{
        var owner=actor();UUID page=page(diary(owner));var applied=create(page,owner,UUID.randomUUID(),"legacy");
        var row=historyRows.findById(Long.valueOf(applied.path("operationId").asText())).orElseThrow();
        var after=(tools.jackson.databind.node.ObjectNode)json.readTree(row.getAfterStateJson());
        assertThat(after.has("expected")).isFalse();after.set("expected",after.get("elements"));row.transition(false,after.toString());historyRows.saveAndFlush(row);
        var result=postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        assertThat(result.path("items").size()).isZero();
        assertThat(postJson(page,owner,"/redo",command(history(page,owner).path("nextRedo"),UUID.randomUUID()),200).path("items").size()).isEqualTo(1);
    }
    @Test void snapshotLimitKeepsOtherUsersAndRejectsExpiredCommandRetries()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner),page=page(diary),element=UUID.randomUUID(),client=UUID.randomUUID();join(diary,friend);
        var changes=Map.<String,Object>of("creates",List.of(text(element,"first")));var result=apply(page,owner,client,changes);
        create(page,friend,UUID.randomUUID(),"friend");
        for(int i=0;i<81;i++){
            long version=0;for(var item:result.path("items"))if(element.toString().equals(item.path("elementId").asText()))version=item.path("version").asLong();
            result=update(page,owner,element,"edit-"+i,version);
        }
        assertThat(jdbc.queryForObject("select count(*) from canvas_history_operations where page_id=? and actor_user_id=? and snapshot_format='COLLAB_ELEMENTS_V1'",Integer.class,page,owner.id())).isEqualTo(80);
        assertThat(jdbc.queryForObject("select count(*) from canvas_history_operations where page_id=? and actor_user_id=? and snapshot_format='COLLAB_ELEMENTS_V1'",Integer.class,page,friend.id())).isEqualTo(1);
        var old=historyRows.findFirstByPageIdAndActorUserIdAndClientOperationId(page,owner.id(),client).orElseThrow();
        assertThat(json.readTree(old.getBeforeStateJson()).has("elements")).isFalse();assertThat(json.readTree(old.getAfterStateJson()).has("elements")).isFalse();
        postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",client,"changes",changes),409);
    }
    @Test void pageCreationRetryNormalizesNumbersAndChecksExactRequestField()throws Exception{
        var owner=actor();UUID diary=diary(owner);String id=UUID.randomUUID().toString();
        String body="{\"templateConfig\":{\"clientPageRequestId\":\""+id+"\",\"nested\":{\"size\":1024}},\"canvasWidth\":1024,\"canvasHeight\":768}";
        var first=mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token()).contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var retry=mvc.perform(post("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+owner.token()).contentType("application/json").content(body.replace("1024","1024.0"))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(retry).path("page").path("pageId")).isEqualTo(json.readTree(first).path("page").path("pageId"));
        assertThat(jdbc.queryForObject("select count(*) from pages where diary_id=?",Integer.class,diary)).isEqualTo(1);
    }
    @Test void reorderedElementsRemainOrderedOnBothMembersReloadAndPreserveMediaSlot()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner),page=page(diary);join(diary,friend);
        UUID a=UUID.randomUUID(),b=UUID.randomUUID(),c=UUID.randomUUID(),photo=UUID.randomUUID();
        create(page,owner,a,"a");create(page,owner,b,"b");create(page,owner,c,"c");create(page,owner,photo,"media slot");
        jdbc.update("update canvas_elements set sort_key=10 where element_id=?",a);jdbc.update("update canvas_elements set sort_key=20 where element_id=?",b);
        jdbc.update("update canvas_elements set sort_key=30 where element_id=?",c);jdbc.update("update canvas_elements set sort_key=15,element_type='PHOTO' where element_id=?",photo);
        var updates=new ArrayList<Map<String,Object>>();
        for(var entry:Map.of(a,20,b,30,c,10).entrySet()){
            var element=jdbc.queryForMap("select version from canvas_elements where element_id=?",entry.getKey());
            updates.add(Map.of("elementId",entry.getKey(),"version",((Number)element.get("version")).longValue(),"sortKey",entry.getValue()));
        }
        apply(page,owner,UUID.randomUUID(),Map.of("updates",updates));
        for(var actor:List.of(owner,friend)){
            var result=json.readTree(mvc.perform(get("/api/v1/pages/"+page).header("Authorization","Bearer "+actor.token())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            var ids=new ArrayList<String>();result.path("elements").forEach(e->ids.add(e.path("elementId").asText()));
            assertThat(ids).containsExactly(c.toString(),photo.toString(),a.toString(),b.toString());
        }
        assertThat(jdbc.queryForObject("select sort_key from canvas_elements where element_id=?",BigDecimal.class,photo)).isEqualByComparingTo("15");
    }
    @Test void snapshotCleanupCatchesUpBacklogBeyondFirstBatchAndPreservesOtherUser()throws Exception{
        var owner=actor();var friend=actor();UUID diary=diary(owner),page=page(diary);join(diary,friend);
        var backlog=new ArrayList<com.f106.DIO.collaboration.domain.CanvasHistoryOperation>();
        for(int i=0;i<300;i++)backlog.add(new com.f106.DIO.collaboration.domain.CanvasHistoryOperation(page,owner.id(),UUID.randomUUID(),"UPDATE","{\"elements\":{}}","{\"elements\":{},\"expected\":{},\"revision\":0}"));
        historyRows.saveAllAndFlush(backlog);create(page,friend,UUID.randomUUID(),"other user");
        for(int i=0;i<3;i++)create(page,owner,UUID.randomUUID(),"catchup-"+i);
        assertThat(jdbc.queryForObject("select count(*) from canvas_history_operations where page_id=? and actor_user_id=? and snapshot_format='COLLAB_ELEMENTS_V1'",Integer.class,page,owner.id())).isEqualTo(80);
        assertThat(jdbc.queryForObject("select count(*) from canvas_history_operations where page_id=? and actor_user_id=? and snapshot_format='COLLAB_PRUNED_V1'",Integer.class,page,owner.id())).isEqualTo(223);
        assertThat(jdbc.queryForObject("select count(*) from canvas_history_operations where page_id=? and actor_user_id=? and snapshot_format='COLLAB_ELEMENTS_V1'",Integer.class,page,friend.id())).isEqualTo(1);
    }
    @Test void legacyBatchChecksPagePermissionBeforeDuplicateIdValidation()throws Exception{
        var owner=actor();var outsider=actor();UUID page=page(diary(owner)),element=UUID.randomUUID();
        String body=json.writeValueAsString(Map.of("deleteElementIds",List.of(element,element)));
        mvc.perform(post("/api/v1/pages/"+page+"/elements/batch").header("Authorization","Bearer "+outsider.token()).contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/pages/"+page+"/elements/batch").header("Authorization","Bearer "+owner.token()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
    }
}
