package com.f106.DIO.sharing;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
@EnabledIfEnvironmentVariable(named="DIO_SHARING_POSTGRES_QA",matches="true")
class UserWithdrawalPostgresTests extends UserWithdrawalTests {
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){SharingPostgresTests.database(registry);}
    @org.junit.jupiter.api.Test void everyMediaForeignKeyIsPreservedDuringWithdrawal()throws Exception{
        var actor=actor();var friend=actor();var book=diary(friend);links.accept(links.create(book,friend.id()).token(),actor.id());
        var page=java.util.UUID.randomUUID();jdbc.update("insert into pages(page_id,diary_id,sort_key) values(?,?,1)",page,book);
        var ids=new java.util.ArrayList<java.util.UUID>();
        for(int n=0;n<10;n++){
            var id=java.util.UUID.randomUUID();ids.add(id);
            jdbc.update("insert into media_files(media_file_id,owner_user_id,storage_key,mime_type,file_size) values(?,?,'withdrawal-qa','image/png',10)",id,actor.id());
        }
        jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,media_file_id,created_by) values(?,?,'PHOTO',1,0,0,10,10,?,?)",java.util.UUID.randomUUID(),page,ids.get(0),actor.id());
        jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id) values(?,?,?)",book,ids.get(1),actor.id());
        jdbc.update("insert into diary_media_library(diary_id,media_file_id,added_by_user_id,library_category) values(?,?,?,'PHOTO')",book,ids.get(2),actor.id());
        jdbc.update("update diary_members set member_profile_photo_id=? where diary_id=? and user_id=?",ids.get(3),book,friend.id());
        jdbc.update("insert into ai_jobs(source_media_file_id,result_media_file_id,status) values(?,?,'PROCESSING')",ids.get(4),ids.get(5));
        jdbc.update("insert into media_files(media_file_id,owner_user_id,storage_key,mime_type,file_size,source_media_file_id) values(?,?,'withdrawal-derived','image/png',10,?)",java.util.UUID.randomUUID(),friend.id(),ids.get(6));
        // 꾸미기 공방 스티커 보관함은 탈퇴 때 지우므로, 그 스티커 파일도 참조 없는 파일과 함께 정리 대상이 된다.
        jdbc.update("insert into user_sticker_library_media(user_id,media_file_id) values(?,?)",actor.id(),ids.get(8));
        jdbc.update("insert into user_cover_library_media(user_id,media_file_id) values(?,?)",actor.id(),ids.get(9));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/me").header("Authorization","Bearer "+actor.token()))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNoContent());
        // 탈퇴 회원이 공유한 개인 폰트는 참조를 지우므로, 그 폰트 파일은 참조 없는 파일과 함께 정리 대상이 된다.
        for(int n:java.util.List.of(0,2,3,4,5,6))org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select deleted_at is null from media_files where media_file_id=?",Boolean.class,ids.get(n))).isTrue();
        for(int n:java.util.List.of(1,7,8,9))org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select deleted_at is not null from media_files where media_file_id=?",Boolean.class,ids.get(n))).isTrue();
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from diary_handwriting_fonts where granted_by_user_id=?",Long.class,actor.id())).isZero();
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from user_sticker_library_media where user_id=?",Long.class,actor.id())).isZero();
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from user_cover_library_media where user_id=?",Long.class,actor.id())).isZero();
        var references=jdbc.queryForList("select r.relname||'.'||a.attname from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='f' and c.confrelid='media_files'::regclass",String.class);
        org.assertj.core.api.Assertions.assertThat(references).containsExactlyInAnyOrder("canvas_elements.media_file_id","diary_handwriting_fonts.font_media_file_id","diary_media_library.media_file_id","diary_members.member_profile_photo_id","ai_jobs.source_media_file_id","ai_jobs.result_media_file_id","media_files.source_media_file_id","user_sticker_library_media.media_file_id","user_cover_library_media.media_file_id");
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from pg_constraint where conrelid='users'::regclass and conname='users_nickname_key_unique'",Long.class)).isZero();
    }
}
