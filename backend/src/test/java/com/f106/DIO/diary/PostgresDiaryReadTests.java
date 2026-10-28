package com.f106.DIO.diary;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.diary.read.DiaryReadService;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import static org.assertj.core.api.Assertions.assertThat;

/** Real Flyway schema, UUID comparison, numeric page order and timestamptz keysets; rows roll back. */
@SpringBootTest
@ActiveProfiles("local")
@EnabledIfSystemProperty(named="dio.postgres-test",matches="true")
@Transactional
class PostgresDiaryReadTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired DiaryReadService reads;
    @Autowired UserRepository users;
    @Test void readsPostgresMembershipAndEveryKeysetSortAgainstFlywaySchema() {
        assertThat(jdbc.queryForObject("select version()",String.class)).contains("PostgreSQL");
        long owner=users.saveAndFlush(new User(UUID.randomUUID()+"@dio.test","owner",Instant.now())).getUserId();
        long editor=users.saveAndFlush(new User(UUID.randomUUID()+"@dio.test","editor",Instant.now())).getUserId();
        UUID first=UUID.randomUUID(),second=UUID.randomUUID(),page=UUID.randomUUID();
        for(UUID id:List.of(first,second))jdbc.update("insert into diaries(diary_id,owner_user_id,title,visibility,created_at,updated_at) values(?,?,?,'MEMBERS',?,?)",
            id,owner,"100%_literal\n한글",java.sql.Timestamp.from(Instant.parse("2026-01-01T00:00:00.123456Z")),java.sql.Timestamp.from(Instant.parse("2026-01-01T00:00:00.123456Z")));
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,is_favorite) values(?,?,'EDITOR','#CED9EE',true)",first,editor);
        jdbc.update("insert into pages(page_id,diary_id,sort_key) values(?,?,2)",page,first);
        jdbc.update("insert into pages(page_id,diary_id,sort_key) values(?,?,10)",UUID.randomUUID(),first);
        for(String sort:List.of("updatedAtDesc","createdAtDesc","titleAsc","pageCountDesc")){
            var a=reads.list(owner,"active","all","",sort,false,1,null);
            var b=reads.list(owner,"active","all","",sort,false,1,a.nextCursor());
            assertThat(a.hasNext()).isTrue();assertThat(b.hasNext()).isFalse();
            assertThat(a.items().get(0).diaryId()).isNotEqualTo(b.items().get(0).diaryId());
        }
        var detail=reads.detail(editor,first.toString()).diary();
        assertThat(detail.pageCount()).isEqualTo(2);assertThat(detail.firstPageId()).isEqualTo(page.toString());
        assertThat(detail.myRole()).isEqualTo("EDITOR");assertThat(detail.permissions().canTrash()).isFalse();
        assertThat(reads.list(editor,"active","shared","%_","titleAsc",true,20,null).items()).hasSize(1);
        jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=?",first,editor);
        assertThat(reads.list(editor,"active","all","","updatedAtDesc",false,20,null).items()).isEmpty();
        jdbc.update("update diaries set deleted_at=current_timestamp where diary_id=?",first);
        assertThat(reads.list(owner,"trashed","all","","updatedAtDesc",false,20,null).items()).hasSize(1);
    }
}
