package com.f106.DIO.sharing;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="DIO_SHARING_POSTGRES_QA",matches="true")
class DiaryProfilePostgresTests extends DiaryProfileTests {
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){SharingPostgresTests.database(registry);}
    @Test void approvedNullableColumnsAndForeignKeyRestoreFallbackWhenMediaIsDeleted() throws Exception {
        var owner=actor();var id=diary(owner);var photo=upload(id,owner);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema='public' and table_name='diary_members' and column_name in ('member_nickname','member_profile_photo_id') and is_nullable='YES'",Integer.class)).isEqualTo(2);
        jdbc.update("delete from media_files where media_file_id=?",photo.memberProfilePhotoId());
        assertThat(members.findById(new com.f106.DIO.diary.domain.DiaryMemberId(id,owner.id())).orElseThrow().getMemberProfilePhotoId()).isNull();
    }
}
