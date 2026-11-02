package com.f106.DIO.notification;

import com.f106.DIO.notification.invitation.InvitationLookup;
import com.f106.DIO.notification.invitation.SharedInvitationLookup;
import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.service.NotificationService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class NotificationActionableH2Tests {
 @Test void emailInvitationDotFollowsReadCancelJoinAndRecipient() {
  var ds=new DriverManagerDataSource("jdbc:h2:mem:notification_dot;MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa","");
  var jdbc=new JdbcTemplate(ds);
  jdbc.execute("create table users(user_id bigint primary key,status varchar(20),deleted_at timestamp with time zone)");
  jdbc.execute("create table diaries(diary_id uuid primary key,deleted_at timestamp with time zone)");
  jdbc.execute("create table diary_members(diary_id uuid,user_id bigint,left_at timestamp with time zone)");
  jdbc.execute("create table diary_invites(invite_id bigint primary key,diary_id uuid,invitee_user_id bigint,invite_type varchar(30),revoked_at timestamp with time zone,use_count integer)");
  jdbc.execute("create table notifications(notification_id bigint primary key,user_id bigint,diary_id uuid,notification_type varchar(50),payload_json varchar(1000),read_at timestamp with time zone,deleted_at timestamp with time zone)");
  UUID diary=UUID.randomUUID();
  jdbc.update("insert into users values(1,'ACTIVE',null),(2,'ACTIVE',null)");
  jdbc.update("insert into diaries values(?,null)",diary);
  jdbc.update("insert into diary_invites values(10,?,1,'EMAIL',null,0)",diary);
  jdbc.update("insert into notifications values(50,1,?,'DIARY_INVITE',?,null,null)",diary,"{\"inviteId\":\"10\"}");
  jdbc.update("insert into notifications values(51,1,?,'NOTICE','{}',null,null)",diary);
  var named=spy(new NamedParameterJdbcTemplate(ds));
  InvitationLookup lookup=new SharedInvitationLookup(named,new ObjectMapper());
  @SuppressWarnings("unchecked") ObjectProvider<InvitationLookup> provider=mock(ObjectProvider.class);when(provider.getIfAvailable()).thenReturn(lookup);
  var service=new NotificationService(new NotificationRepository(jdbc),provider);
  assertThat(service.unreadCount(1)).isEqualTo(2);
  assertThat(service.actionableUnreadCount(1)).isEqualTo(1);
  verify(named,times(1)).query(anyString(),anyMap(),any(org.springframework.jdbc.core.RowCallbackHandler.class));
  assertThat(service.actionableUnreadCount(2)).isZero();
  assertThat(lookup.findForRecipient(1, java.util.List.of(50L)).get(50L).canOpen()).isTrue();
  jdbc.update("update diary_invites set revoked_at=current_timestamp where invite_id=10");
  assertThat(service.actionableUnreadCount(1)).isZero();
  assertThat(lookup.findForRecipient(1, java.util.List.of(50L)).get(50L).canOpen()).isFalse();
  jdbc.update("update diary_invites set revoked_at=null, use_count=1 where invite_id=10");
  assertThat(service.actionableUnreadCount(1)).isZero();
  assertThat(lookup.findForRecipient(1, java.util.List.of(50L)).get(50L).canOpen()).isFalse();
  jdbc.update("update diary_invites set use_count=0 where invite_id=10");
  jdbc.update("update diary_invites set invite_type='EMAIL_CANCELLED' where invite_id=10");
  assertThat(service.actionableUnreadCount(1)).isZero();
  jdbc.update("update diary_invites set invite_type='EMAIL_ACCEPTED' where invite_id=10");
  assertThat(service.actionableUnreadCount(1)).isZero();
  jdbc.update("update diary_invites set invite_type='EMAIL' where invite_id=10");
  jdbc.update("insert into diary_members values(?,1,null)",diary);
  assertThat(service.actionableUnreadCount(1)).isZero();
  jdbc.update("delete from diary_members where diary_id=?",diary);
  jdbc.update("update notifications set payload_json=? where notification_id=50","{\"inviteId\":10}");
  assertThat(service.actionableUnreadCount(1)).isZero();
  jdbc.update("update notifications set payload_json=? where notification_id=50","{\"inviteId\":\"010\"}");
  assertThat(service.actionableUnreadCount(1)).isZero();
  jdbc.update("update notifications set payload_json=? where notification_id=50","{\"inviteId\":\"10\"}");
  jdbc.update("update notifications set read_at=current_timestamp where notification_id=50");
  assertThat(service.actionableUnreadCount(1)).isZero();
 }
}
