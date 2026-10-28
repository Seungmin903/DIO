package com.f106.DIO.sharing;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="DIO_SHARING_POSTGRES_QA",matches="true")
class SharingPostgresTests extends SharingTests {
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
        String url=System.getenv("DIO_SHARING_POSTGRES_URL");
        if(url==null||!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/dio_sharing_qa"))throw new IllegalStateException("Dedicated loopback dio_sharing_qa database required; no fallback");
        registry.add("spring.datasource.url",()->url);
        registry.add("spring.datasource.username",()->"postgres");
        registry.add("spring.datasource.password",()->System.getenv("DIO_SHARING_POSTGRES_PASSWORD"));
        registry.add("spring.jpa.hibernate.ddl-auto",()->"validate");registry.add("spring.flyway.enabled",()->"true");
    }
    @Test void lastOwnerPermanentlyDeletesOnlyThatDiaryAndItsChildren(){
        var owner=actor();var id=diary(owner);var other=diary(owner);UUID page=UUID.randomUUID();
        jdbc.update("insert into pages(page_id,diary_id,title,sort_key,canvas_width,canvas_height,grid_visible,grid_color,version,created_at,updated_at) values(?,?,'page',1,100,100,false,'#FFFFFF',0,now(),now())",page,id);
        UUID media=UUID.randomUUID(),element=UUID.randomUUID();
        jdbc.update("insert into media_files(media_file_id,owner_user_id,storage_key,mime_type,file_size) values(?,?,'qa-shared-source','image/png',10)",media,owner.id());
        jdbc.update("insert into diary_media_library(diary_id,media_file_id,added_by_user_id,library_category) values(?,?,?,'PHOTO')",id,media,owner.id());
        jdbc.update("insert into diary_media_library(diary_id,media_file_id,added_by_user_id,library_category) values(?,?,?,'PHOTO')",other,media,owner.id());
        jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id) values(?,?,?)",id,media,owner.id());
        jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,media_file_id,created_by) values(?,?,'IMAGE',1,0,0,10,10,?,?)",element,page,media,owner.id());
        jdbc.update("insert into element_strokes(element_id,tool,color,stroke_width,base_width,base_height,points) values(?,'PEN','#000000',1,100,100,'[]')",element);
        jdbc.update("insert into canvas_history_operations(page_id,actor_user_id,client_operation_id,operation_type,before_state_json,after_state_json) values(?,?,?,'CREATE','[]','[]')",page,owner.id(),UUID.randomUUID());
        jdbc.update("insert into notifications(user_id,diary_id,page_id,notification_type) values(?,?,?,'INVITE')",owner.id(),id,page);
        profiles.update(id,owner.id(),new com.f106.DIO.sharing.dto.DiaryProfileUpdateRequest(true,page),null);
        links.create(id,owner.id());membership.remove(id,owner.id(),owner.id());
        assertThat(diaries.findById(id)).isEmpty();assertThat(diaries.findById(other)).isPresent();
        assertThat(jdbc.queryForObject("select count(*) from pages where diary_id=?",Integer.class,id)).isZero();
        assertThat(members.countByDiaryIdAndLeftAtIsNull(id)).isZero();assertThat(users.findById(owner.id())).isPresent();
        assertThat(jdbc.queryForObject("select count(*) from media_files where media_file_id=?",Integer.class,media)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from diary_media_library where diary_id=? and media_file_id=?",Integer.class,other,media)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where element_id=?",Integer.class,element)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notifications where diary_id=?",Integer.class,id)).isZero();
    }
    @Test void lastPageMustBelongToSameDiary(){
        var owner=actor();var id=diary(owner);
        assertThatThrownBy(()->profiles.update(id,owner.id(),new com.f106.DIO.sharing.dto.DiaryProfileUpdateRequest(null,UUID.randomUUID()),null))
            .isInstanceOf(com.f106.DIO.sharing.exception.SharingException.class);
    }
}
