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
@org.springframework.test.context.jdbc.Sql("/push-session-h2.sql")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=jdbc:h2:mem:collaboration-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","dio.signup.photos.storage=local",
    "dio.signup.photos.local-directory=build/collaboration-photos/${org.gradle.test.worker:0}","dio.media.local-directory=build/collaboration-media/${org.gradle.test.worker:0}","spring.datasource.hikari.maximum-pool-size=12","server.forward-headers-strategy=native","server.tomcat.remoteip.remote-ip-header=X-Forwarded-For","server.tomcat.remoteip.protocol-header=X-Forwarded-Proto","server.tomcat.remoteip.port-header=X-Forwarded-Port","server.tomcat.remoteip.internal-proxies=127\\.0\\.0\\.1|::1"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class CanvasCollaborationTests {
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @Autowired org.springframework.context.ApplicationEventPublisher events;
    @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired UserRepository users;@Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;@Autowired DiaryRepository diaries;@Autowired DiaryMemberRepository members;
    @Autowired DiaryPageRepository pages;@Autowired com.f106.DIO.page.repository.CanvasElementRepository elements;@Autowired JdbcTemplate jdbc;
    record Actor(long id,String token){}
    Actor actor(){String key=UUID.randomUUID().toString();var user=users.saveAndFlush(new User(key+"@example.com","편집"+key.substring(0,12),Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),new BCryptPasswordEncoder(4).encode("DioMember123!"),Instant.now()));
        return new Actor(user.getUserId(),login.login(new LoginRequest(user.getEmail(),"DioMember123!","collaboration-test"),"127.0.0.1").accessToken());}
    UUID diary(Actor owner){return diaries.saveAndFlush(new Diary("공동 편집","#123456","PLAIN","MEMBERS",owner.id())).getDiaryId();}
    UUID page(UUID diary){return pages.saveAndFlush(new DiaryPage(diary,null,null,"페이지",BigDecimal.ONE,new BigDecimal("100"),new BigDecimal("100"),false,"#FFFFFF")).getPageId();}
    void join(UUID diary,Actor actor){members.saveAndFlush(new DiaryMember(diary,actor.id(),"EDITOR","#ABCDEF",Instant.now()));}
    Map<String,Object> text(UUID id,String value){return Map.of("elementId",id,"elementType","TEXT","x",1,"y",2,"width",30,"height",20,"propertiesJson",Map.of("text",value));}
    Map<String,Object> albumPhoto(UUID id){return Map.of("elementId",id,"elementType","PHOTO","x",40,"y",120,"width",335,"height",232.7,"propertiesJson",Map.of("albumSlot",0,"frame","none"));}
    JsonNode postJson(UUID page,Actor actor,String path,Object body,int expected)throws Exception{
        var result=mvc.perform(post("/api/v1/pages/"+page+path).header("Authorization","Bearer "+actor.token()).contentType("application/json").content(json.writeValueAsString(body)))
            .andExpect(status().is(expected)).andReturn().getResponse();return result.getContentAsString().isBlank()?json.nullNode():json.readTree(result.getContentAsString());}
    JsonNode apply(UUID page,Actor actor,UUID client,Map<String,Object> changes)throws Exception{return postJson(page,actor,"/canvas-operations",Map.of("clientOperationId",client,"changes",changes),200);}
    JsonNode create(UUID page,Actor actor,UUID element,String value)throws Exception{return apply(page,actor,UUID.randomUUID(),Map.of("creates",List.of(text(element,value))));}
    JsonNode update(UUID page,Actor actor,UUID element,String value,long version)throws Exception{return apply(page,actor,UUID.randomUUID(),Map.of("updates",List.of(Map.of("elementId",element,"version",version,"propertiesJson",Map.of("text",value)))));}
    JsonNode history(UUID page,Actor actor)throws Exception{return json.readTree(mvc.perform(get("/api/v1/pages/"+page+"/history/me").header("Authorization","Bearer "+actor.token())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());}
    Map<String,Object> command(JsonNode item,UUID client){return Map.of("operationId",item.path("operationId").asText(),"expectedRevision",item.path("revision").asInt(),"clientOperationId",client);}
    @Test void concurrentAlbumPhotosUseDifferentSlotsAndEachMemberCanUndo() throws Exception {
        var owner=actor();var editor=actor();UUID book=diary(owner);join(book,editor);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("768"),new BigDecimal("1024"),false,"#FFFFFF")).getPageId();
        byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");
        var file=new org.springframework.mock.web.MockMultipartFile("file","album.png","image/png",png);
        String ownerMedia=json.readTree(mvc.perform(multipart("/api/v1/media").file(file).header("Authorization","Bearer "+owner.token())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("mediaFileId").asText();
        String editorMedia=json.readTree(mvc.perform(multipart("/api/v1/media").file(file).header("Authorization","Bearer "+editor.token())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("mediaFileId").asText();
        UUID first=UUID.randomUUID(),second=UUID.randomUUID(),ownerOp=UUID.randomUUID(),editorOp=UUID.randomUUID();
        var firstPhoto=new HashMap<String,Object>(albumPhoto(first));firstPhoto.put("mediaFileId",ownerMedia);
        var secondPhoto=new HashMap<String,Object>(albumPhoto(second));secondPhoto.put("mediaFileId",editorMedia);
        var gate=new java.util.concurrent.CountDownLatch(1);
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var a=pool.submit(()->{gate.await();return apply(album,owner,ownerOp,Map.of("creates",List.of(firstPhoto)));});
            var b=pool.submit(()->{gate.await();return apply(album,editor,editorOp,Map.of("creates",List.of(secondPhoto)));});
            gate.countDown();a.get(30,java.util.concurrent.TimeUnit.SECONDS);b.get(30,java.util.concurrent.TimeUnit.SECONDS);
            var rows=json.readTree(mvc.perform(get("/api/v1/pages/"+album+"/elements").header("Authorization","Bearer "+owner.token())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("items");
            assertThat(rows).hasSize(2);
            assertThat(List.of(rows.get(0).path("propertiesJson").path("albumSlot").asInt(),rows.get(1).path("propertiesJson").path("albumSlot").asInt())).containsExactlyInAnyOrder(0,1);
            assertThat(apply(album,owner,ownerOp,Map.of("creates",List.of(firstPhoto))).path("replayed").asBoolean()).isTrue();
            postJson(album,owner,"/undo",command(history(album,owner).path("nextUndo"),UUID.randomUUID()),200);
            postJson(album,editor,"/undo",command(history(album,editor).path("nextUndo"),UUID.randomUUID()),200);
            assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=? and deleted_at is null",Integer.class,album)).isZero();
            postJson(album,owner,"/redo",command(history(album,owner).path("nextRedo"),UUID.randomUUID()),200);
            postJson(album,editor,"/redo",command(history(album,editor).path("nextRedo"),UUID.randomUUID()),200);
            assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=? and deleted_at is null",Integer.class,album)).isEqualTo(2);
        } finally {pool.shutdownNow();}
    }
    @Test void fullAlbumRejectsNextPhotoWithoutOverwritingAndUnrelatedPaperIsUnchanged() throws Exception {
        var owner=actor();UUID book=diary(owner);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("768"),new BigDecimal("1024"),false,"#FFFFFF")).getPageId();
        for(int i=0;i<6;i++) apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(UUID.randomUUID()))));
        var rejected=postJson(album,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(albumPhoto(UUID.randomUUID())))),422);
        assertThat(rejected.path("code").asText()).isEqualTo("PHOTO_ALBUM_FULL");
        mvc.perform(post("/api/v1/pages/"+album+"/elements").header("Authorization","Bearer "+owner.token()).contentType("application/json").content(json.writeValueAsString(albumPhoto(UUID.randomUUID())))).andExpect(status().isUnprocessableEntity());
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=? and deleted_at is null",Integer.class,album)).isEqualTo(6);
        UUID other=page(book);apply(other,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(UUID.randomUUID()))));
        apply(other,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(UUID.randomUUID()))));
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=? and deleted_at is null",Integer.class,other)).isEqualTo(2);
    }
    @Test void albumBatchDeleteCreateUsesFreedSlotAndRestoreRejectsConflict() throws Exception {
        var owner=actor();UUID book=diary(owner);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("768"),new BigDecimal("1024"),false,"#FFFFFF")).getPageId();
        UUID first=UUID.randomUUID();apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(first))));
        for(int i=1;i<6;i++) apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(UUID.randomUUID()))));
        UUID replacement=UUID.randomUUID();
        var result=postJson(album,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("deleteElementIds",List.of(first),"creates",List.of(albumPhoto(replacement))),"expectedVersions",Map.of(first,1)),200).path("items");
        assertThat(result).hasSize(6);
        assertThat(result.findValues("albumSlot").stream().filter(n->n.asInt()==0)).hasSize(1);
        postJson(album,owner,"/elements/"+first+"/restore",Map.of(),409);
        postJson(album,owner,"/elements/batch",Map.of("restoreElementIds",List.of(first)),409);
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=? and deleted_at is null",Integer.class,album)).isEqualTo(6);
        var swap=postJson(album,owner,"/elements/batch",Map.of("deleteElementIds",List.of(replacement),"restoreElementIds",List.of(first)),200).path("items");
        assertThat(swap).hasSize(6);
    }
    @Test void batchCreateKeepsPreBatchLayerOrderAfterTopLayerDeletion() throws Exception {
        var owner=actor();UUID page=page(diary(owner)), bottom=UUID.randomUUID(), top=UUID.randomUUID(), added=UUID.randomUUID();
        create(page,owner,bottom,"bottom");create(page,owner,top,"top");
        var result=postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("deleteElementIds",List.of(top),"creates",List.of(text(added,"new"))),"expectedVersions",Map.of(top,1)),200).path("items");
        assertThat(result).hasSize(2);
        assertThat(result.get(1).path("elementId").asText()).isEqualTo(added.toString());
        assertThat(result.get(1).path("sortKey").asDouble()).isEqualTo(3.0);
    }
    @Test void batchRejectsRepeatedElementIdButAllowsMixedChangesAndGroupIdentifier() throws Exception {
        var owner=actor(); UUID page=page(diary(owner)), existing=UUID.randomUUID(), added=UUID.randomUUID(), group=UUID.randomUUID();
        create(page,owner,existing,"before");
        var created=new HashMap<String,Object>(text(added,"new")); created.put("groupId",group);
        var updated=Map.of("elementId",existing,"version",1,"groupId",group,"propertiesJson",Map.of("text","after"));
        var items=postJson(page,owner,"/elements/batch",Map.of("creates",List.of(created),"updates",List.of(updated)),200).path("items");
        assertThat(items).hasSize(2);
        for(var item:items) assertThat(item.path("groupId").asText()).isEqualTo(group.toString());
        UUID repeated=UUID.randomUUID();
        postJson(page,owner,"/elements/batch",Map.of("creates",List.of(text(repeated,"new")),"updates",List.of(Map.of("elementId",repeated,"version",1))),400);
        postJson(page,owner,"/elements/batch",Map.of("creates",List.of(text(repeated,"new")),"deleteElementIds",List.of(repeated)),400);
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where element_id=?",Integer.class,repeated)).isZero();
    }
    @Test void landscapeAlbumCollisionUsesNextLandscapeSlot() throws Exception {
        var owner=actor();UUID book=diary(owner);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("1024"),new BigDecimal("768"),false,"#FFFFFF")).getPageId();
        var first=new HashMap<String,Object>(albumPhoto(UUID.randomUUID()));first.put("width",302.7);first.put("height",251);
        var second=new HashMap<String,Object>(first);second.put("elementId",UUID.randomUUID());
        apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(first)));
        var result=apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(second))).path("items");
        assertThat(result).hasSize(2);
        assertThat(result.get(1).path("propertiesJson").path("albumSlot").asInt()).isEqualTo(1);
        assertThat(result.get(1).path("x").asDouble()).isEqualTo(360.7);
        assertThat(result.get(1).path("y").asDouble()).isEqualTo(120);
    }
    @Test void albumUpdatesCannotMovePhotosIntoAnOccupiedSlotButCanMoveIntoAnEmptySlot() throws Exception {
        var owner=actor();UUID book=diary(owner);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("768"),new BigDecimal("1024"),false,"#FFFFFF")).getPageId();
        var first=apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(UUID.randomUUID())))).path("items").get(0);
        var secondRequest=new HashMap<String,Object>(albumPhoto(UUID.randomUUID()));
        var second=apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(secondRequest))).path("items").get(1);
        UUID firstId=UUID.fromString(first.path("elementId").asText()),secondId=UUID.fromString(second.path("elementId").asText());
        long version=second.path("version").asLong();
        var collision=Map.of("elementId",secondId,"version",version,"x",40,"y",120,"propertiesJson",Map.of("albumSlot",0,"frame","none"));
        postJson(album,owner,"/elements/batch",Map.of("updates",List.of(collision)),409);
        assertThat(mvc.perform(patch("/api/v1/pages/"+album+"/elements/"+secondId).header("Authorization","Bearer "+owner.token()).contentType("application/json").content(json.writeValueAsString(Map.of("version",version,"x",40,"y",120,"propertiesJson",Map.of("albumSlot",0,"frame","none")))))
            .andExpect(status().isConflict()).andReturn().getResponse().getStatus()).isEqualTo(409);
        var moved=postJson(album,owner,"/elements/batch",Map.of("updates",List.of(Map.of("elementId",secondId,"version",version,"x",40,"y",705.3,"propertiesJson",Map.of("albumSlot",4,"frame","none")))),200);
        var rows=moved.path("items");
        assertThat(rows).anySatisfy(row->{assertThat(row.path("elementId").asText()).isEqualTo(secondId.toString());assertThat(row.path("propertiesJson").path("albumSlot").asInt()).isEqualTo(4);});
        assertThat(rows).anySatisfy(row->{assertThat(row.path("elementId").asText()).isEqualTo(firstId.toString());assertThat(row.path("propertiesJson").path("albumSlot").asInt()).isEqualTo(0);});
    }
    @Test void correctingMismatchedAlbumSlotCannotOccupyAnotherPhotosSlot() throws Exception {
        var owner=actor();UUID book=diary(owner);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("768"),new BigDecimal("1024"),false,"#FFFFFF")).getPageId();
        UUID firstId=UUID.randomUUID(),secondId=UUID.randomUUID();
        apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(firstId),albumPhoto(secondId))));
        var second=elements.findByElementIdAndPageIdAndDeletedAtIsNull(secondId,album).orElseThrow();
        second.update(null,null,null,new BigDecimal("40"),new BigDecimal("120"),new BigDecimal("335"),new BigDecimal("232.7"),BigDecimal.ZERO,null,null,null,null,"{\"albumSlot\":4,\"frame\":\"none\"}");
        elements.saveAndFlush(second);
        long version=second.getVersion();
        var properties=Map.of("albumSlot",0,"frame","none");
        postJson(album,owner,"/elements/batch",Map.of("updates",List.of(Map.of("elementId",secondId,"version",version,"propertiesJson",properties))),409);
        mvc.perform(patch("/api/v1/pages/"+album+"/elements/"+secondId).header("Authorization","Bearer "+owner.token()).contentType("application/json").content(json.writeValueAsString(Map.of("version",version,"propertiesJson",properties)))).andExpect(status().isConflict());
        var unchanged=elements.findByElementIdAndPageIdAndDeletedAtIsNull(secondId,album).orElseThrow();
        assertThat(json.readTree(unchanged.getPropertiesJson()).path("albumSlot").asInt()).isEqualTo(4);
    }
    @Test void legacyDuplicatePhotoCanBeEditedWithoutChangingItsSlotAndMovedOutToRecover() throws Exception {
        var owner=actor();UUID book=diary(owner);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("768"),new BigDecimal("1024"),false,"#FFFFFF")).getPageId();
        UUID firstId=UUID.randomUUID(),secondId=UUID.randomUUID();
        apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(firstId),albumPhoto(secondId))));
        var second=elements.findByElementIdAndPageIdAndDeletedAtIsNull(secondId,album).orElseThrow();
        second.update(null,null,null,new BigDecimal("40"),new BigDecimal("120"),new BigDecimal("335"),new BigDecimal("232.7"),BigDecimal.ZERO,null,null,null,null,"{\"albumSlot\":0,\"frame\":\"none\"}");
        elements.saveAndFlush(second); // simulate older/corrupt data that already contains an occupied-slot duplicate

        long version=elements.findByElementIdAndPageIdAndDeletedAtIsNull(secondId,album).orElseThrow().getVersion();
        var cropOnly=Map.of("elementId",secondId,"version",version,"propertiesJson",Map.of("albumSlot",0,"frame","none","crop",Map.of("fx",0.4,"fy",0.5,"zoom",1.5)));
        var edited=postJson(album,owner,"/elements/batch",Map.of("updates",List.of(cropOnly)),200).path("items");
        assertThat(edited).anySatisfy(row->{assertThat(row.path("elementId").asText()).isEqualTo(secondId.toString());assertThat(row.path("propertiesJson").path("crop").path("zoom").asDouble()).isEqualTo(1.5);});

        var current=elements.findByElementIdAndPageIdAndDeletedAtIsNull(secondId,album).orElseThrow();
        var moved=postJson(album,owner,"/elements/batch",Map.of("updates",List.of(Map.of("elementId",secondId,"version",current.getVersion(),"x",40,"y",705.3,"propertiesJson",Map.of("albumSlot",4,"frame","none")))),200).path("items");
        assertThat(moved).anySatisfy(row->{assertThat(row.path("elementId").asText()).isEqualTo(secondId.toString());assertThat(row.path("propertiesJson").path("albumSlot").asInt()).isEqualTo(4);});
    }
    @Test void redoCannotRestorePhotoIntoSlotTakenByAnotherMember() throws Exception {
        var owner=actor();var editor=actor();UUID book=diary(owner);join(book,editor);
        UUID album=pages.saveAndFlush(new DiaryPage(book,null,"{\"remoteTemplate\":\"photo-album\"}","앨범",BigDecimal.ONE,new BigDecimal("768"),new BigDecimal("1024"),false,"#FFFFFF")).getPageId();
        apply(album,owner,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(UUID.randomUUID()))));
        postJson(album,owner,"/undo",command(history(album,owner).path("nextUndo"),UUID.randomUUID()),200);
        apply(album,editor,UUID.randomUUID(),Map.of("creates",List.of(albumPhoto(UUID.randomUUID()))));
        postJson(album,owner,"/redo",command(history(album,owner).path("nextRedo"),UUID.randomUUID()),409);
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=? and deleted_at is null",Integer.class,album)).isEqualTo(1);
    }
    @Test void hiddenNestedReferencesCannotPinAnotherUsersPrivateFile()throws Exception{
        var owner=actor();var attacker=actor();UUID page=page(diary(attacker));
        byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");
        var file=new org.springframework.mock.web.MockMultipartFile("file","photo.png","image/png",png);
        var uploaded=mvc.perform(multipart("/api/v1/media").file(file).header("Authorization","Bearer "+owner.token())).andExpect(status().isCreated()).andReturn();
        String media=json.readTree(uploaded.getResponse().getContentAsString()).path("mediaFileId").asText();
        var element=UUID.randomUUID();create(page,attacker,element,"safe");
        var before=history(page,attacker);
        for(var properties:List.of(Map.of("x",Map.of("mediaFileId",media)),Map.of("x",List.of(Map.of("mediaFileId",media))),Map.of("cells",List.of(Map.of("hidden",Map.of("mediaFileId",media)))))){
            var hidden=new HashMap<String,Object>(text(UUID.randomUUID(),"hidden"));hidden.put("propertiesJson",properties);
            postJson(page,attacker,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(hidden))),404);
            postJson(page,attacker,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("updates",List.of(Map.of("elementId",element,"version",1,"propertiesJson",properties)))),404);
        }
        assertThat(history(page,attacker)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=?",Integer.class,page)).isEqualTo(1);
        mvc.perform(get("/api/v1/media/"+media+"/file").header("Authorization","Bearer "+attacker.token())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/media/"+media).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
    }

    @Test void photoStripOnlyMediaIsReadableAndProtectedWithoutPrimaryForeignKey()throws Exception{
        var owner=actor();var editor=actor();var stranger=actor();UUID book=diary(owner),page=page(book);join(book,editor);
        byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");
        var file=new org.springframework.mock.web.MockMultipartFile("file","photo.png","image/png",png);
        var result=mvc.perform(multipart("/api/v1/media").file(file).header("Authorization","Bearer "+owner.token())).andExpect(status().isCreated()).andReturn();
        String media=json.readTree(result.getResponse().getContentAsString()).path("mediaFileId").asText();
        var strip=new HashMap<String,Object>(text(UUID.randomUUID(),"strip"));strip.put("elementType","PHOTO");strip.put("propertiesJson",Map.of("cells",List.of(Map.of("mediaFileId",media.toUpperCase(Locale.ROOT)))));
        postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(strip))),200);
        mvc.perform(get("/api/v1/media/"+media+"/file").header("Authorization","Bearer "+editor.token())).andExpect(status().isOk()).andExpect(content().bytes(png));
        var stolen=new HashMap<String,Object>(strip);stolen.put("elementId",UUID.randomUUID());
        postJson(page(diary(stranger)),stranger,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(stolen))),404);
        mvc.perform(delete("/api/v1/media/"+media).header("Authorization","Bearer "+owner.token())).andExpect(status().isConflict());
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        mvc.perform(delete("/api/v1/media/"+media).header("Authorization","Bearer "+owner.token())).andExpect(status().isConflict());
        postJson(page,owner,"/redo",command(history(page,owner).path("nextRedo"),UUID.randomUUID()),200);
        mvc.perform(get("/api/v1/media/"+media+"/file").header("Authorization","Bearer "+editor.token())).andExpect(status().isOk());
    }

    @Test void personalTapeImageIsVisibleToOtherMembersOnlyAfterPlacement() throws Exception {
        var owner = actor();
        var editor = actor();
        var outsider = actor();
        UUID book = diary(owner), page = page(book);
        join(book, editor);
        byte[] png = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");
        var file = new org.springframework.mock.web.MockMultipartFile("file", "tape.png", "image/png", png);
        var upload = mvc.perform(multipart("/api/v1/media").file(file).param("libraryCategory", "TAPE")
            .header("Authorization", "Bearer " + owner.token())).andExpect(status().isCreated()).andReturn();
        String media = json.readTree(upload.getResponse().getContentAsString()).path("mediaFileId").asText();
        var folder = Map.of("id", "tapes", "name", "내 테이프", "items", List.of(Map.of("id", "t1", "mediaFileId", media)));
        mvc.perform(put("/api/v1/me/tape-library").header("Authorization", "Bearer " + owner.token())
            .contentType("application/json").content(json.writeValueAsString(Map.of("expectedVersion", 0, "folders", List.of(folder)))))
            .andExpect(status().isOk());

        String filePath = "/api/v1/media/" + media + "/file";
        mvc.perform(get(filePath).header("Authorization", "Bearer " + editor.token())).andExpect(status().isNotFound());

        var crop = Map.of("fx", 0.25, "fy", 0.5, "zoom", 2);
        var tape = Map.of("elementId", UUID.randomUUID(), "elementType", "TAPE", "x", 1, "y", 2,
            "width", 30, "height", 10, "mediaFileId", media, "propertiesJson", Map.of("crop", crop, "pieceRatio", 3));
        apply(page, owner, UUID.randomUUID(), Map.of("creates", List.of(tape)));
        mvc.perform(get("/api/v1/pages/" + page).header("Authorization", "Bearer " + editor.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.elements[0].elementType").value("TAPE"))
            .andExpect(jsonPath("$.elements[0].mediaFileId").value(media))
            .andExpect(jsonPath("$.elements[0].propertiesJson.crop.fx").value(0.25));
        mvc.perform(get(filePath).header("Authorization", "Bearer " + editor.token()))
            .andExpect(status().isOk()).andExpect(content().bytes(png));
        mvc.perform(get(filePath).header("Authorization", "Bearer " + outsider.token())).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/tape-library").header("Authorization", "Bearer " + editor.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.folders.length()").value(0));
    }

    @Test void existingMediaApisShareImagesOnlyWithCurrentDiaryMembers()throws Exception{
        var owner=actor();var editor=actor();var outsider=actor();UUID book=diary(owner),page=page(book);join(book,editor);
        byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");
        var upload=new org.springframework.mock.web.MockMultipartFile("file","photo.png","image/png",png);
        var uploaded=mvc.perform(multipart("/api/v1/media").file(upload).param("libraryCategory","STICKER").header("Authorization","Bearer "+owner.token())).andExpect(status().isCreated()).andReturn();
        String media=json.readTree(uploaded.getResponse().getContentAsString()).path("mediaFileId").asText();
        mvc.perform(get("/api/v1/media/"+media+"/file").header("Authorization","Bearer "+editor.token())).andExpect(status().isNotFound());
        UUID element=UUID.randomUUID();var image=new HashMap<String,Object>(text(element,"photo"));image.put("elementType","PHOTO");image.put("mediaFileId",media);
        var created=postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(image))),200);
        mvc.perform(get("/api/v1/media/"+media+"/file").header("Authorization","Bearer "+editor.token())).andExpect(status().isOk()).andExpect(content().bytes(png));
        mvc.perform(get("/api/v1/media/"+media+"/file").header("Authorization","Bearer "+outsider.token())).andExpect(status().isNotFound());
        UUID otherPage=page(diary(outsider));var stolen=new HashMap<String,Object>(image);stolen.put("elementId",UUID.randomUUID());
        postJson(otherPage,outsider,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(stolen))),404);
        // Nested strip cells reuse the same file permission, without a new table.
        var strip=new HashMap<String,Object>(text(UUID.randomUUID(),"strip"));strip.put("elementType","PHOTO");strip.put("propertiesJson",Map.of("cells",List.of(Map.of("mediaFileId",media))));
        postJson(page,editor,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(strip))),200);
        mvc.perform(delete("/api/v1/media/"+media).header("Authorization","Bearer "+owner.token())).andExpect(status().isConflict());
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        postJson(page,owner,"/redo",command(history(page,owner).path("nextRedo"),UUID.randomUUID()),200);
        jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=?",book,editor.id());
        mvc.perform(get("/api/v1/media/"+media+"/file").header("Authorization","Bearer "+editor.token())).andExpect(status().isNotFound());
    }

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

    @Test void emptyBatchesAreRejectedWithoutChangingHistoryOrRedo()throws Exception{
        var owner=actor();UUID page=page(diary(owner));
        create(page,owner,UUID.randomUUID(),"keep redo");
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        var before=history(page,owner);
        for(var empty:List.<Map<String,Object>>of(Map.of(),Map.of("creates",List.of(),"updates",List.of(),"deleteElementIds",List.of(),"restoreElementIds",List.of()))){
            postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",empty),400);
            postJson(page,owner,"/elements/batch",empty,400);
            assertThat(history(page,owner)).isEqualTo(before);
        }
        assertThat(postJson(page,owner,"/redo",command(before.path("nextRedo"),UUID.randomUUID()),200).path("items").size()).isEqualTo(1);
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
    @Test void sameColorTastingUpdateHasOwnUndoHistory()throws Exception{
        var owner=actor();var editor=actor();UUID diary=diary(owner),page=page(diary),star=UUID.randomUUID();join(diary,editor);
        var props=Map.of("shape","rect","tastingMark","star-0","fill","#112233");
        var first=apply(page,owner,UUID.randomUUID(),Map.of("creates",List.of(Map.of("elementId",star,"elementType","SHAPE","x",0,"y",0,"width",1,"height",1,"isLocked",true,"isHidden",true,"propertiesJson",props))));
        var second=apply(page,editor,UUID.randomUUID(),Map.of("updates",List.of(Map.of("elementId",star,"version",first.path("items").get(0).path("version").asLong(),"propertiesJson",props))));
        assertThat(history(page,editor).path("nextUndo").path("operationId").asText()).isEqualTo(second.path("operationId").asText());
        var undone=postJson(page,editor,"/undo",command(history(page,editor).path("nextUndo"),UUID.randomUUID()),200);
        assertThat(undone.path("items").get(0).path("propertiesJson").path("fill").asText()).isEqualTo("#112233");
    }
    @Test void simultaneousTastingMarkCreatesAreSerializedAsMemberUpdates()throws Exception{
        var owner=actor();var editor=actor();UUID diary=diary(owner),page=page(diary),star=UUID.randomUUID();join(diary,editor);
        var firstProps=Map.of("shape","rect","tastingMark","star-0","fill","#112233");
        var element=Map.of("elementId",star,"elementType","SHAPE","x",0,"y",0,"width",1,"height",1,"sortKey",1,"isLocked",true,"isHidden",true,"propertiesJson",firstProps);
        apply(page,owner,UUID.randomUUID(),Map.of("creates",List.of(element)));
        // Model two offline clients that both created the deterministic mark ID from
        // an empty base: the second request is still a create, never an update.
        var raced=Map.of("shape","rect","tastingMark","star-0","fill","#abcdef");
        var secondElement=Map.of("elementId",star,"elementType","SHAPE","x",0,"y",0,"width",1,"height",1,"sortKey",99,"isLocked",true,"isHidden",true,"propertiesJson",raced);
        var second=apply(page,editor,UUID.randomUUID(),Map.of("creates",List.of(secondElement)));
        assertThat(second.path("items")).hasSize(1);
        assertThat(second.path("items").get(0).path("propertiesJson").path("fill").asText()).isEqualTo("#abcdef");
        assertThat(history(page,editor).path("nextUndo").path("operationId").asText()).isEqualTo(second.path("operationId").asText());
        var undone=postJson(page,editor,"/undo",command(history(page,editor).path("nextUndo"),UUID.randomUUID()),200);
        assertThat(undone.path("items").get(0).path("propertiesJson").path("fill").asText()).isEqualTo("#112233");
    }
    @Test void twoMembersFillingSameTastingStarHaveConflictSafeUndo()throws Exception{
        var owner=actor();var editor=actor();UUID diary=diary(owner),page=page(diary),star=UUID.randomUUID();join(diary,editor);
        var first=apply(page,owner,UUID.randomUUID(),Map.of("creates",List.of(Map.of("elementId",star,"elementType","SHAPE","x",0,"y",0,"width",1,"height",1,"isLocked",true,"isHidden",true,"propertiesJson",Map.of("shape","rect","tastingMark","star-0","fill","#112233")))));
        long version=first.path("items").get(0).path("version").asLong();
        var second=apply(page,editor,UUID.randomUUID(),Map.of("updates",List.of(Map.of("elementId",star,"version",version,"propertiesJson",Map.of("shape","rect","tastingMark","star-0","fill","#abcdef")))));
        assertThat(second.path("items").size()).isEqualTo(1);
        assertThat(second.path("items").get(0).path("propertiesJson").path("fill").asText()).isEqualTo("#abcdef");
        postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),409);
        var undone=postJson(page,editor,"/undo",command(history(page,editor).path("nextUndo"),UUID.randomUUID()),200);
        assertThat(undone.path("items").get(0).path("propertiesJson").path("fill").asText()).isEqualTo("#112233");
        var ownerUndone=postJson(page,owner,"/undo",command(history(page,owner).path("nextUndo"),UUID.randomUUID()),200);
        assertThat(ownerUndone.path("items").size()).isZero();
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
    String proxyHandshake(String host,String origin,String forwardedPort)throws Exception{
        try(var socket=new java.net.Socket("127.0.0.1",port)){
            socket.setSoTimeout(5000);
            byte[] nonce=new byte[16];new java.security.SecureRandom().nextBytes(nonce);
            String handshakeNonce=Base64.getEncoder().encodeToString(nonce);
            String request="GET /ws/diaries/"+UUID.randomUUID()+" HTTP/1.1\r\nHost: "+host+
                "\r\nOrigin: "+origin+"\r\nX-Forwarded-Proto: https"+(forwardedPort==null?"":"\r\nX-Forwarded-Port: "+forwardedPort)+"\r\nConnection: Upgrade\r\nUpgrade: websocket"+
                "\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: "+handshakeNonce+"\r\n\r\n";
            socket.getOutputStream().write(request.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            return new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream(),java.nio.charset.StandardCharsets.US_ASCII)).readLine();
        }
    }
    @Test void proxyMustPreserveExternalPortForNativeSameOriginHandshake()throws Exception{
        // 이 Origin은 허용 목록에 없다. 신뢰 프록시의 scheme과 Host 포트가 같을 때만 same-origin이다.
        assertThat(proxyHandshake("native-proxy.example:8443","https://native-proxy.example:8443","8443")).contains(" 101 ");
        assertThat(proxyHandshake("native-proxy.example","https://native-proxy.example:8443",null)).contains(" 403 ");
        assertThat(proxyHandshake("native-proxy.example:8443","https://untrusted.example:8443","8443")).contains(" 403 ");
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
        var page=pages.saveAndFlush(new DiaryPage(diary,blankLandscapeTemplateId(),"{\"blank\":true}","공유 페이지",BigDecimal.ONE,new BigDecimal("1024"),new BigDecimal("768"),false,"#FFFFFF")).getPageId();
        mvc.perform(get("/api/v1/diaries/"+diary+"/pages").header("Authorization","Bearer "+friend.token())).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].pageId").value(page.toString())).andExpect(jsonPath("$.items[0].templateCode").value("dio-blank-landscape"));
        mvc.perform(get("/api/v1/pages/"+page).header("Authorization","Bearer "+friend.token())).andExpect(status().isOk())
            .andExpect(jsonPath("$.page.templateVersion").value("1.0.0"));
    }
    /** dio-blank-landscape · 1.0.0 행(없으면 만든다). 서버는 페이지 추가 때 설정의 속지 코드로 이 행을 찾는다 */
    private Long blankLandscapeTemplateId(){
        var ids=jdbc.queryForList("select template_id from page_templates where code='dio-blank-landscape' and template_version='1.0.0'",Long.class);
        if(!ids.isEmpty())return ids.get(0);
        jdbc.update("insert into page_templates(code,template_version,canvas_width,canvas_height,is_active) values('dio-blank-landscape','1.0.0',1024,768,true)");
        return jdbc.queryForObject("select template_id from page_templates where code='dio-blank-landscape' and template_version='1.0.0'",Long.class);
    }
    @Test void pageLifecycleUsesExistingApisAndNotifiesBothMembersAfterCommit()throws Exception{
        blankLandscapeTemplateId();
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
    @Test void farOutsidePageStrokeCoordinatesPersistAndReloadWithoutClamping() throws Exception {
        var owner=actor(); UUID page=page(diary(owner));
        for (long[] box : List.of(new long[]{-1000000,-1000000,2000004,1000004}, new long[]{-300,20,1504,24}, new long[]{999000000,20,100004,24})) {
            UUID id=UUID.randomUUID();
            var points=List.of(Map.of("x",2,"y",2,"pressure",1),Map.of("x",box[2]-2,"y",box[3]-2,"pressure",1));
            var stroke=new HashMap<String,Object>();
            stroke.put("elementId",id); stroke.put("elementType","STROKE");
            stroke.put("x",box[0]); stroke.put("y",box[1]); stroke.put("width",box[2]); stroke.put("height",box[3]);
            stroke.put("propertiesJson",Map.of("points",points,"baseWidth",box[2],"baseHeight",box[3],"strokeWidth",4,"penKind","ball","color","#123456"));
            apply(page,owner,UUID.randomUUID(),Map.of("creates",List.of(stroke)));
            var rows=json.readTree(mvc.perform(get("/api/v1/pages/"+page+"/elements").header("Authorization","Bearer "+owner.token())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("items");
            JsonNode found=null;
            for (JsonNode row:rows) if (row.path("elementId").asText().equals(id.toString())) found=row;
            assertThat(found).isNotNull();
            assertThat(found.path("x").asLong()).isEqualTo(box[0]);
            assertThat(found.path("y").asLong()).isEqualTo(box[1]);
            assertThat(found.path("width").asLong()).isEqualTo(box[2]);
            assertThat(found.path("height").asLong()).isEqualTo(box[3]);
            assertThat(found.path("propertiesJson").path("points")).isEqualTo(json.readTree(json.writeValueAsString(points)));
        }
    }
    @Test void outOfContractStrokeCoordinatesAreRejectedWithoutSavingAnElement() throws Exception {
        var owner=actor(); UUID page=page(diary(owner)),id=UUID.randomUUID();
        var stroke=Map.of("elementId",id,"elementType","STROKE","x",-1000000000000L,"y",0,"width",1000000000004L,"height",20,
            "propertiesJson",Map.of("points",List.of(Map.of("x",2,"y",2),Map.of("x",1000000000002L,"y",2))));
        postJson(page,owner,"/canvas-operations",Map.of("clientOperationId",UUID.randomUUID(),"changes",Map.of("creates",List.of(stroke))),400);
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where element_id=?",Integer.class,id)).isZero();
    }
}
