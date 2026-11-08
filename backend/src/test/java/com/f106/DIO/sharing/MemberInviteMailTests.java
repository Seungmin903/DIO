package com.f106.DIO.sharing;

import com.f106.DIO.moderation.service.BlockService;
import com.f106.DIO.sharing.dto.EmailInviteRequest;
import com.f106.DIO.sharing.infrastructure.MemberInviteMailer;
import com.f106.DIO.sharing.service.EmailInviteService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:member-invite-mail-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.signup.mail-from=dio@example.com",
    "SHARING_INVITE_BASE_URL=/invite/"
})
class MemberInviteMailTests extends SharingTestSupport {
    @Autowired EmailInviteService emails;
    @Autowired BlockService blocks;
    @Autowired MemberInviteMailer mailer;

    @Test
    void mailsOnlyNewRegisteredMemberInvitesAndKeepsTheInvitationWhenSmtpFails() throws Exception {
        var owner = actor();
        var recipient = actor();
        var inactive = actor();
        var member = actor();
        var blocked = actor();
        var diaryId = diary(owner);
        links.accept(links.create(diaryId, owner.id()).token(), member.id());
        var otherDiaryId = diary(owner);
        links.accept(links.create(otherDiaryId, owner.id()).token(), blocked.id());
        blocks.block(owner.id(), blocked.id(), otherDiaryId);
        jdbc.update("update users set status='WITHDRAWN' where user_id=?", inactive.id());
        doThrow(new MailSendException("SMTP unavailable")).when(smtp).send(any(SimpleMailMessage.class));

        emails.send(diaryId, owner.id(), new EmailInviteRequest("unregistered@example.com"));
        emails.send(diaryId, owner.id(), new EmailInviteRequest(address(owner)));
        emails.send(diaryId, owner.id(), new EmailInviteRequest(address(inactive)));
        emails.send(diaryId, owner.id(), new EmailInviteRequest(address(member)));
        emails.send(diaryId, owner.id(), new EmailInviteRequest(address(blocked)));

        var request = new EmailInviteRequest(address(recipient));
        emails.send(diaryId, owner.id(), request);
        emails.send(diaryId, owner.id(), request);
        // The single-worker FIFO queue runs this marker after all submitted delivery tasks.
        var executor = (ThreadPoolExecutor) ReflectionTestUtils.getField(mailer, "executor");
        executor.submit(() -> {}).get(5, TimeUnit.SECONDS);
        var sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(smtp).send(sent.capture());
        verifyNoMoreInteractions(smtp);
        assertThat(sent.getValue().getTo()).containsExactly(address(recipient));
        assertThat(sent.getValue().getText()).contains("받은 초대");
        assertThat(invites.pendingEmail(diaryId, recipient.id())).isPresent();
        assertThat(jdbc.queryForObject(
            "select count(*) from notifications where diary_id=? and user_id=? and notification_type='DIARY_INVITE'",
            Long.class, diaryId, recipient.id())).isEqualTo(1L);
    }

    private String address(Actor actor) {
        return users.findById(actor.id()).orElseThrow().getEmail();
    }
}
