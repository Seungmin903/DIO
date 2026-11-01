package com.f106.DIO.sharing;
import com.f106.DIO.sharing.domain.DiaryInvite;
import com.f106.DIO.sharing.service.EmailInviteService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class SharingReviewTests extends SharingTestSupport {
    @Autowired EmailInviteService emails;
    @Test void readsRepresentALegacyOwnerWithoutWritingMembershipOrDiaryState() throws Exception {
        var owner=actor();var id=diary(owner);
        var row=invites.saveAndFlush(new DiaryInvite(id,owner.id(),Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS)));
        String token=tokenSigner.token(row);row.initializeHash(tokenSigner.hash(token));invites.saveAndFlush(row);
        var before=diaries.findById(id).orElseThrow();
        assertThat(membership.list(id,owner.id()).currentMembers()).isEqualTo(1);
        String color=membership.list(id,owner.id()).members().get(0).memberColor();
        assertThat(links.current(id,owner.id()).available()).isTrue();
        assertThat(links.preview(token).currentMembers()).isEqualTo(1);
        assertThat(emails.sent(id,owner.id(),0,20).available()).isTrue();
        assertThat(members.countByDiaryIdAndLeftAtIsNull(id)).isZero();
        var after=diaries.findById(id).orElseThrow();
        assertThat(after.getVersion()).isEqualTo(before.getVersion());assertThat(after.getUpdatedAt()).isEqualTo(before.getUpdatedAt());
        links.create(id,owner.id());assertThat(members.countByDiaryIdAndLeftAtIsNull(id)).isEqualTo(1);
        assertThat(membership.list(id,owner.id()).members().get(0).memberColor()).isEqualTo(color);
    }
    @Test void encodedProtectedPathsStillRequireAuthentication() throws Exception {
        UUID id=UUID.randomUUID();
        mvc.perform(patch(java.net.URI.create("/api/v1/diaries/"+id+"/%6dembership")).contentType("application/json").content("{\"favorite\":true}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get(java.net.URI.create("/api/v1/me/%69nvites"))).andExpect(status().isUnauthorized());
        mvc.perform(post(java.net.URI.create("/api/v1/invites/invalid/%61ccept"))).andExpect(status().isUnauthorized());
    }
}
