package com.f106.DIO.notification.invitation;

import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** 알림 페이지를 두 번의 일괄 조회로 연결한다. 비밀 토큰은 조회하지 않는다. */
@Component
@Transactional(readOnly = true)
public class SharedInvitationLookup implements InvitationLookup {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;
    public SharedInvitationLookup(NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc; this.json = json;
    }
    @Override
    public Map<Long, InvitationTarget> findForRecipient(long userId, Collection<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        if (ids.size() > 100) throw new IllegalArgumentException("알림 페이지는 최대 100개입니다.");
        Map<Long, Long> references = new HashMap<>();
        Map<Long, UUID> diaries = new HashMap<>();
        jdbc.query("select notification_id,payload_json,diary_id from notifications where user_id=:user and deleted_at is null and notification_type='DIARY_INVITE' and notification_id in (:ids)",
            Map.of("user", userId, "ids", ids), rs -> {
                Long invite = reference(rs.getString("payload_json"));
                if (invite != null) { references.put(rs.getLong("notification_id"), invite); diaries.put(rs.getLong("notification_id"), rs.getObject("diary_id", UUID.class)); }
            });
        if (references.isEmpty()) return Map.of();
        Map<Long, InvitationTarget> targets = new HashMap<>();
        jdbc.query("""
            select i.invite_id,i.diary_id,i.invite_type,i.revoked_at,i.use_count,
              exists(select 1 from diary_members m where m.diary_id=i.diary_id and m.user_id=:user and m.left_at is null) as joined
            from diary_invites i join diaries d on d.diary_id=i.diary_id and d.deleted_at is null
            join users u on u.user_id=i.invitee_user_id and u.status='ACTIVE' and u.deleted_at is null
            where i.invitee_user_id=:user and i.invite_id in (:ids)
            """, Map.of("user", userId, "ids", new HashSet<>(references.values())), rs -> {
                String status = EmailInvitationStatus.map(rs.getString("invite_type"), rs.getTimestamp("revoked_at") != null, rs.getInt("use_count"));
                if (status != null) targets.put(rs.getLong("invite_id"), new InvitationTarget(rs.getString("invite_id"), status,
                    rs.getObject("diary_id", UUID.class), status.equals("PENDING") && !rs.getBoolean("joined")));
            });
        Map<Long, InvitationTarget> result = new HashMap<>();
        references.forEach((notification, invite) -> { if (targets.containsKey(invite) && Objects.equals(diaries.get(notification), targets.get(invite).diaryId())) result.put(notification, targets.get(invite)); });
        return Map.copyOf(result);
    }
    @Override
    public long countActionableUnread(long userId) {
        // Use the same JSON validation as findForRecipient; compare only after candidate rows
        // are filtered by owner, diary, active user, pending invite and membership.
        final long[] count = {0};
        jdbc.query("""
            select n.payload_json, i.invite_id
            from notifications n
            join diaries d on d.diary_id=n.diary_id and d.deleted_at is null
            join users u on u.user_id=n.user_id and u.status='ACTIVE' and u.deleted_at is null
            join diary_invites i on i.diary_id=n.diary_id and i.invitee_user_id=n.user_id
            where n.user_id=:user and n.notification_type='DIARY_INVITE'
              and n.deleted_at is null and n.read_at is null
              and i.invite_type='EMAIL' and i.revoked_at is null and i.use_count=0
              and not exists(select 1 from diary_members m where m.diary_id=i.diary_id and m.user_id=:user and m.left_at is null)
            """, Map.of("user", userId), rs -> {
                Long invite = reference(rs.getString("payload_json"));
                if (invite != null && invite.longValue() == rs.getLong("invite_id")) count[0]++;
            });
        return count[0];
    }

    private Long reference(String payload) {
        try {
            var value = json.readTree(payload).get("inviteId");
            if (value == null || !value.isTextual() || !value.asText().matches("[1-9][0-9]*")) return null;
            return Long.valueOf(value.asText());
        } catch (RuntimeException malformed) { return null; }
    }
}
