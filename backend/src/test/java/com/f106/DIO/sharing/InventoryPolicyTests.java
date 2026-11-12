package com.f106.DIO.sharing;

import com.f106.DIO.inventory.*;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.service.DiaryCreationService;
import com.f106.DIO.page.service.PageService;
import com.f106.DIO.page.dto.PageCreateRequest;
import com.f106.DIO.tape.TapeLibraryService;
import com.f106.DIO.sticker.StickerLibraryService;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real service/HTTP boundaries; every scenario uses isolated accounts, including racing transactions. */
class InventoryPolicyTests extends SharingTestSupport {
    @Autowired InventoryLimits limits;
    @Autowired DiaryCreationService creation;
    @Autowired PageService pages;
    @Autowired TapeLibraryService tapes;
    @Autowired StickerLibraryService stickers;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    TransactionTemplate tx(){return new TransactionTemplate(manager);}
    @BeforeEach void schema(){
        com.f106.DIO.diary.MemberH2Fixture.align(jdbc);
        jdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
    }
    UUID create(Actor user){return UUID.fromString(creation.create(new DiaryCreateRequest("limit","#CED9EE","PLAIN","PRIVATE"),user.id()).diary().diaryId());}
    void quota(Runnable action){assertThatThrownBy(action::run).isInstanceOf(InventoryLimitException.class);}
    long count(Actor user,boolean shared){return tx().execute(s->limits.diaries(user.id(),shared));}
    UUID media(Actor user,String category){
        UUID id=UUID.randomUUID();
        jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,source_type,library_category,storage_key,mime_type,file_size,status,created_at) values(?,?,'IMAGE','UPLOAD',?,?,'image/png',1,'READY',current_timestamp)",id,user.id(),category,"inventory/"+id);
        return id;
    }
    void seed(Actor user,String category,int n){for(int i=0;i<n;i++)media(user,category);}
    List<Boolean> race(Callable<Boolean> first,Callable<Boolean> second)throws Exception{
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{var a=pool.submit(()->{start.await();return first.call();});var b=pool.submit(()->{start.await();return second.call();});start.countDown();return List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));}
        finally{pool.shutdownNow();}
    }
    boolean attempt(Runnable action){try{action.run();return true;}catch(InventoryLimitException expected){return false;}}

    @Test void acceptingInvitesDoesNotRewriteVisibilityOrMetadataVersion(){
        var owner=actor();var book=diary(owner);var token=links.create(book,owner.id()).token();
        var before=jdbc.queryForMap("select visibility,updated_at,version from diaries where diary_id=?",book);
        links.accept(token,actor().id());
        assertThat(jdbc.queryForMap("select visibility,updated_at,version from diaries where diary_id=?",book)).isEqualTo(before);
        // Legacy links retain their visibility; only the first transition to shared inventory is dirty.
        var legacy=diary(actor());var legacyOwner=jdbc.queryForObject("select owner_user_id from diaries where diary_id=?",Long.class,legacy);
        var legacyToken=links.create(legacy,legacyOwner).token();
        jdbc.update("update diaries set visibility='LINK',inventory_shared=false where diary_id=?",legacy);
        var updated=jdbc.queryForObject("select updated_at from diaries where diary_id=?",java.sql.Timestamp.class,legacy);
        links.accept(legacyToken,actor().id());
        assertThat(jdbc.queryForObject("select visibility from diaries where diary_id=?",String.class,legacy)).isEqualTo("LINK");
        assertThat(jdbc.queryForObject("select updated_at from diaries where diary_id=?",java.sql.Timestamp.class,legacy)).isEqualTo(updated);
        assertThat(jdbc.queryForObject("select inventory_shared from diaries where diary_id=?",Boolean.class,legacy)).isTrue();
        var version=jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,legacy);
        links.accept(legacyToken,actor().id());
        assertThat(jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,legacy)).isEqualTo(version);
    }

    @Test void privateFiveDeleteFreesSlotAndRestoreChecksAgain()throws Exception{
        var user=actor();UUID book=create(user);for(int i=1;i<5;i++)create(user);
        quota(()->create(user));assertThat(count(user,false)).isEqualTo(5);
        mvc.perform(delete("/api/v1/member/diaries/"+book).header("Authorization","Bearer "+user.token())).andExpect(status().isNoContent());
        assertThat(count(user,false)).isEqualTo(4);create(user);
        mvc.perform(post("/api/v1/member/diaries/"+book+"/restore").header("Authorization","Bearer "+user.token()))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_LIMIT_REACHED"));
        assertThat(jdbc.queryForObject("select deleted_at is not null from diaries where diary_id=?",Boolean.class,book)).isTrue();
        UUID replacement=jdbc.queryForList("select diary_id from diaries where owner_user_id=? and deleted_at is null",UUID.class,user.id()).get(0);
        mvc.perform(delete("/api/v1/member/diaries/"+replacement).header("Authorization","Bearer "+user.token())).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/member/diaries/"+book+"/restore").header("Authorization","Bearer "+user.token())).andExpect(status().isOk());
        assertThat(count(user,false)).isEqualTo(5);
    }
    @Test void concurrentPrivateCreatesAtLastSlotOnlyCommitOne()throws Exception{
        var user=actor();for(int i=0;i<4;i++)create(user);
        assertThat(race(()->attempt(()->create(user)),()->attempt(()->create(user)))).containsExactlyInAnyOrder(true,false);
        assertThat(count(user,false)).isEqualTo(5);
    }
    @Test void sharedParticipationCountsAndFailedAcceptDoesNotConsumeInvite(){
        var user=actor();for(int i=0;i<2;i++){var owner=actor();var token=links.create(diary(owner),owner.id()).token();links.accept(token,user.id());}
        var owner=actor();var book=diary(owner);var token=links.create(book,owner.id()).token();
        quota(()->links.accept(token,user.id()));assertThat(count(user,true)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from diary_members where diary_id=? and user_id=? and left_at is null",Long.class,book,user.id())).isZero();
        assertThat(invites.findById(tokenSigner.id(token)).orElseThrow().getUseCount()).isZero();
    }
    @Test void emailAcceptAlsoChecksSharedParticipationWithoutConsumingPendingInvite()throws Exception{
        var user=actor();for(int i=0;i<2;i++){var owner=actor();links.accept(links.create(diary(owner),owner.id()).token(),user.id());}
        var owner=actor();UUID book=diary(owner);
        mvc.perform(post("/api/v1/diaries/"+book+"/invites/email").header("Authorization","Bearer "+owner.token())
            .contentType("application/json").content("{\"email\":\""+users.findById(user.id()).orElseThrow().getEmail()+"\"}")).andExpect(status().isAccepted());
        var invitation=invites.pendingEmail(book,user.id()).orElseThrow();
        quota(()->links.accept(tokenSigner.token(invitation),user.id()));
        assertThat(invites.findById(invitation.getInviteId()).orElseThrow().pendingEmail()).isTrue();
    }
    @Test void fourMembersIncludesOwnerWhenTwoPeopleAcceptLastSeat()throws Exception{
        var owner=actor();UUID book=diary(owner);String token=links.create(book,owner.id()).token();
        links.accept(token,actor().id());links.accept(token,actor().id());var a=actor();var b=actor();
        java.util.function.LongPredicate join=id->{try{links.accept(token,id);return true;}catch(com.f106.DIO.sharing.exception.SharingException full){assertThat(full.code).isEqualTo("DIARY_MEMBER_LIMIT_REACHED");return false;}};
        assertThat(race(()->join.test(a.id()),()->join.test(b.id()))).containsExactlyInAnyOrder(true,false);
        assertThat(members.countByDiaryIdAndLeftAtIsNull(book)).isEqualTo(4);
    }
    @Test void concurrentAcceptsDifferentDiariesRespectTwoSharedSlots()throws Exception{
        var user=actor();var first=actor();links.accept(links.create(diary(first),first.id()).token(),user.id());
        var a=actor();var b=actor();String ta=links.create(diary(a),a.id()).token(),tb=links.create(diary(b),b.id()).token();
        assertThat(race(()->attempt(()->links.accept(ta,user.id())),()->attempt(()->links.accept(tb,user.id())))).containsExactlyInAnyOrder(true,false);
        assertThat(count(user,true)).isEqualTo(2);
    }
    @Test void ownerCannotConvertThirdPrivateBookToShared(){
        var user=actor();for(int i=0;i<2;i++)links.create(create(user),user.id());
        UUID third=create(user);quota(()->links.create(third,user.id()));
        assertThat(diaries.findById(third).orElseThrow().getVisibility()).isEqualTo("PRIVATE");
    }
    @Test void ownerLeavingTransfersAndSoloBookStaysShared()throws Exception{
        var owner=actor();var remaining=actor();UUID book=diary(owner);links.accept(links.create(book,owner.id()).token(),remaining.id());
        membership.remove(book,owner.id(),owner.id());
        assertThat(diaries.findById(book).orElseThrow().getOwnerUserId()).isEqualTo(remaining.id());
        assertThat(count(remaining,true)).isEqualTo(1);assertThat(count(remaining,false)).isZero();
        mvc.perform(get("/api/v1/member/diaries").param("filter","shared").header("Authorization","Bearer "+remaining.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].shared").value(true));
        mvc.perform(delete("/api/v1/member/diaries/"+book).header("Authorization","Bearer "+remaining.token())).andExpect(status().isNoContent());
        assertThat(count(remaining,true)).isZero();
    }
    @Test void sharedRestoreChecksEveryParticipant()throws Exception{
        var owner=actor();var participant=actor();UUID book=diary(owner);links.accept(links.create(book,owner.id()).token(),participant.id());
        mvc.perform(delete("/api/v1/member/diaries/"+book).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
        for(int i=0;i<2;i++){var other=actor();links.accept(links.create(diary(other),other.id()).token(),participant.id());}
        mvc.perform(post("/api/v1/member/diaries/"+book+"/restore").header("Authorization","Bearer "+owner.token()))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.limitType").value("SHARED_DIARY"));
        assertThat(count(owner,true)).isZero();assertThat(count(participant,true)).isEqualTo(2);
    }
    @Test void pages150IncludesCopiesDeletionAndConcurrentAdds()throws Exception{
        var user=actor();UUID book=create(user);
        for(int i=0;i<149;i++)jdbc.update("insert into pages(page_id,diary_id,sort_key,canvas_width,canvas_height,grid_visible,version,created_at,updated_at) values(?,?,?,1280,800,false,1,current_timestamp,current_timestamp)",UUID.randomUUID(),book,i+1);
        assertThat(race(()->attempt(()->pages.create(book,new PageCreateRequest(),user.id())),()->attempt(()->pages.create(book,new PageCreateRequest(),user.id())))).containsExactlyInAnyOrder(true,false);
        UUID source=jdbc.queryForList("select page_id from pages where diary_id=?",UUID.class,book).get(0);
        quota(()->pages.copy(source,user.id()));pages.delete(source,user.id());pages.create(book,new PageCreateRequest(),user.id());
        assertThat(jdbc.queryForObject("select count(*) from pages where diary_id=? and deleted_at is null",Long.class,book)).isEqualTo(150);
    }
    @Test void photoReservationsSerializeLastSlotAndReleaseOnFailure()throws Exception{
        var user=actor();seed(user,"PHOTO",199);var reservations=new ConcurrentLinkedQueue<UUID>();
        Callable<Boolean> upload=()->attempt(()->reservations.add(limits.reserveMedia(user.id(),"PHOTO")));
        assertThat(race(upload,upload)).containsExactlyInAnyOrder(true,false);
        quota(()->limits.reserveMedia(user.id(),"PHOTO"));limits.releaseMedia(reservations.remove());
        UUID retry=limits.reserveMedia(user.id(),"PHOTO");limits.releaseMedia(retry);
    }
    @Test void expiredReservationsDoNotConsumeCapacity(){
        var user=actor();seed(user,"PHOTO",199);UUID id=limits.reserveMedia(user.id(),"PHOTO");
        jdbc.update("update inventory_media_reservations set expires_at=current_timestamp-interval '1' hour where reservation_id=?",id);
        UUID next=limits.reserveMedia(user.id(),"PHOTO");limits.releaseMedia(next);
    }
    @Test void photosDeleteReleasesOneSlot()throws Exception{
        var user=actor();seed(user,"PHOTO",199);UUID last=media(user,"PHOTO");quota(()->limits.reserveMedia(user.id(),"PHOTO"));
        mvc.perform(delete("/api/v1/media/"+last).header("Authorization","Bearer "+user.token())).andExpect(status().isNoContent());
        UUID next=limits.reserveMedia(user.id(),"PHOTO");limits.releaseMedia(next);
    }
    @Test void actualPhotoUploadAt200ReturnsStructured409AndLeavesNoReservation()throws Exception{
        var user=actor();seed(user,"PHOTO",199);
        byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");
        var upload=new org.springframework.mock.web.MockMultipartFile("file","photo.png","image/png",png);
        mvc.perform(multipart("/api/v1/media").file(upload).header("Authorization","Bearer "+user.token())).andExpect(status().isCreated());
        mvc.perform(multipart("/api/v1/media").file(upload).header("Authorization","Bearer "+user.token())).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("INVENTORY_LIMIT_REACHED")).andExpect(jsonPath("$.limitType").value("PHOTO")).andExpect(jsonPath("$.maxCount").value(200));
        assertThat(jdbc.queryForObject("select count(*) from inventory_media_reservations where user_id=?",Long.class,user.id())).isZero();
    }
    @Test void initialPages150AndIdempotentReplayDoNotConsumeExtraCapacity()throws Exception{
        var user=actor();String code="inventory-"+UUID.randomUUID();
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,is_active) values(?,'1','inventory','BASIC','LANDSCAPE',1024,768,true)",code);
        var json=new tools.jackson.databind.json.JsonMapper();
        var selection=Map.of("templateCode",code,"templateVersion","1","templateConfig",Map.of("width",1024,"height",768));
        String excessive=json.writeValueAsString(Map.of("diaryTitle","initial","initialPages",Collections.nCopies(151,selection)));
        String body=json.writeValueAsString(Map.of("diaryTitle","initial","initialPages",Collections.nCopies(150,selection)));
        String key="inventory-"+UUID.randomUUID();
        mvc.perform(post("/api/v1/member/diaries").header("Authorization","Bearer "+user.token()).header("Idempotency-Key",key)
            .contentType("application/json").content(excessive)).andExpect(status().isConflict()).andExpect(jsonPath("$.limitType").value("PAGE"));
        mvc.perform(post("/api/v1/member/diaries").header("Authorization","Bearer "+user.token()).header("Idempotency-Key",key)
            .contentType("application/json").content(body)).andExpect(status().isCreated()).andExpect(jsonPath("$.pageIds.length()").value(150));
        for(int i=0;i<4;i++)create(user);
        mvc.perform(post("/api/v1/member/diaries").header("Authorization","Bearer "+user.token()).header("Idempotency-Key",key)
            .contentType("application/json").content(body)).andExpect(status().isCreated()).andExpect(header().string("Idempotency-Replayed","true"));
        assertThat(count(user,false)).isEqualTo(5);
    }
    TapeLibraryService.TapeItem tape(String id){return new TapeLibraryService.TapeItem(id,null,"dots","mint",id,null,null,null,null,null);}
    List<TapeLibraryService.TapeFolder> tapeFolder(int n){return List.of(new TapeLibraryService.TapeFolder("f","custom",java.util.stream.IntStream.range(0,n).mapToObj(i->tape("t"+i)).toList()));}
    @Test void fiveTapesRemovalReleasesSlotAndDuplicatesAcrossFoldersCountOnce(){
        var user=actor();tapes.replace(user.id(),0L,tapeFolder(5));quota(()->tapes.replace(user.id(),1L,tapeFolder(6)));
        var duplicate=new ArrayList<>(tapeFolder(5));duplicate.add(new TapeLibraryService.TapeFolder("copy","copy",List.of(tape("t0"))));
        tapes.replace(user.id(),1L,duplicate);tapes.replace(user.id(),2L,tapeFolder(4));tapes.replace(user.id(),3L,tapeFolder(5));
    }
    @Test void stickers200ExcludeBuiltinsAndRemovingBindingReleasesSlot(){
        var user=actor();seed(user,"STICKER",199);UUID last=media(user,"STICKER");
        var item=new StickerLibraryService.StickerItem(last,null,null,null,null,null,"custom",1.0);
        var builtin=new StickerLibraryService.StickerItem(null,"heart",null,null,null,null,"builtin",1.0);
        stickers.replace(user.id(),0L,List.of(new StickerLibraryService.StickerFolder("f","stickers",List.of(item,item,builtin))));
        quota(()->limits.reserveMedia(user.id(),"STICKER"));
        stickers.replace(user.id(),1L,List.of());UUID next=limits.reserveMedia(user.id(),"STICKER");limits.releaseMedia(next);
    }
    @Test void legacyOverLimitDataCanBeCleanedUpButNotExpanded(){
        var user=actor();jdbc.update("insert into user_tape_libraries(user_id,version,document_json,updated_at) values(?,1,?,current_timestamp)",user.id(),new tools.jackson.databind.json.JsonMapper().writeValueAsString(tapeFolder(7)));
        tapes.replace(user.id(),1L,tapeFolder(6));quota(()->tapes.replace(user.id(),2L,tapeFolder(7)));
        tapes.replace(user.id(),2L,tapeFolder(5));
    }
    @Test void swaggerDocumentsInventory409OnExistingWriteEndpoints()throws Exception{
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.components.schemas.InventoryLimitProblem.properties.limitType").exists())
            .andExpect(jsonPath("$.paths['/api/v1/media'].post.responses['409'].content['application/problem+json'].schema").exists())
            .andExpect(jsonPath("$.paths['/api/v1/member/diaries/{diaryId}/restore'].post.responses['409'].description").value(org.hamcrest.Matchers.containsString("INVENTORY_LIMIT_REACHED")));
    }
}
