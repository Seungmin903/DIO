package com.f106.DIO.notification.invitation;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class SharedInvitationLookupTests {
    JdbcTemplate db;
    SharedInvitationLookup lookup;
    UUID diary = UUID.randomUUID();
    @BeforeEach void setup() {
        db = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        db.execute("create table notifications(notification_id bigint,user_id bigint,diary_id uuid,notification_type varchar,payload_json varchar,deleted_at timestamp)");
        db.execute("create table users(user_id bigint,status varchar,deleted_at timestamp)");
        db.execute("create table diaries(diary_id uuid,deleted_at timestamp)");
        db.execute("create table diary_members(diary_id uuid,user_id bigint,left_at timestamp)");
        db.execute("create table diary_invites(invite_id bigint,diary_id uuid,invitee_user_id bigint,invite_type varchar,revoked_at timestamp,use_count int,expires_at timestamp)");
        db.update("insert into users values(7,'ACTIVE',null)");
        db.update("insert into diaries values(?,null)", diary);
        db.update("insert into diary_invites values(10,?,7,'EMAIL',null,0,?)", diary, java.sql.Timestamp.valueOf("9999-12-31 23:59:59"));
        db.update("insert into notifications values(1,7,?,'DIARY_INVITE','{\"inviteId\":\"10\"}',null)",diary);
        lookup = new SharedInvitationLookup(new NamedParameterJdbcTemplate(db), new ObjectMapper());
    }
    @Test void mapsEveryTerminalStatus() {
        for (var pair : Map.of("EMAIL_ACCEPTED","ACCEPTED","EMAIL_DECLINED","DECLINED","EMAIL_CANCELLED","CANCELLED","EMAIL_FAILED","DELIVERY_FAILED").entrySet()) {
            db.update("update diary_invites set invite_type=?",pair.getKey());
            var target=lookup.findForRecipient(7,List.of(1L)).get(1L);
            assertThat(target.status()).isEqualTo(pair.getValue()); assertThat(target.canOpen()).isFalse();
        }
    }
    @Test void supportsNoExpiryAndRevokedAndJoined() {
        assertThat(lookup.findForRecipient(7,List.of(1L)).get(1L).canOpen()).isTrue();
        db.update("insert into diary_members values(?,7,null)",diary);
        assertThat(lookup.findForRecipient(7,List.of(1L)).get(1L).canOpen()).isFalse();
        db.update("update diary_invites set revoked_at=current_timestamp");
        assertThat(lookup.findForRecipient(7,List.of(1L)).get(1L).status()).isEqualTo("CANCELLED");
    }
    @Test void isolatesRecipientAndRejectsMalformedReferences() {
        assertThat(lookup.findForRecipient(8,List.of(1L))).isEmpty();
        for(String payload : List.of("broken","{}","{\"inviteId\":10}","{\"inviteId\":\"9223372036854775808\"}")) {
            db.update("update notifications set payload_json=?",payload);
            assertThat(lookup.findForRecipient(7,List.of(1L))).isEmpty();
        }
    }
    @Test void rejectsDeletedInactiveLinkAndMismatchedDiary() {
        db.update("update notifications set diary_id=?",UUID.randomUUID());
        assertThat(lookup.findForRecipient(7,List.of(1L))).isEmpty();
        db.update("update notifications set diary_id=?",diary);
        db.update("update diary_invites set invite_type='LINK'");
        assertThat(lookup.findForRecipient(7,List.of(1L))).isEmpty();
        db.update("update diary_invites set invite_type='EMAIL'");
        db.update("update users set status='SUSPENDED'");
        assertThat(lookup.findForRecipient(7,List.of(1L))).isEmpty();
        db.update("update users set status='ACTIVE'");
        db.update("update diaries set deleted_at=current_timestamp");
        assertThat(lookup.findForRecipient(7,List.of(1L))).isEmpty();
    }
    @Test void handlesMaximumPageAndEmptyInput() {
        for(int i=2;i<=100;i++) db.update("insert into notifications values(?,7,?,'DIARY_INVITE','{\"inviteId\":\"10\"}',null)",i,diary);
        assertThat(lookup.findForRecipient(7,java.util.stream.LongStream.rangeClosed(1,100).boxed().toList())).hasSize(100);
        assertThat(lookup.findForRecipient(7,List.of())).isEmpty();
    }
}
