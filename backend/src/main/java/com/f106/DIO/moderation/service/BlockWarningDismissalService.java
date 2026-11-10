package com.f106.DIO.moderation.service;

import com.f106.DIO.moderation.exception.ModerationException;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.service.SharingAccessService;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BlockWarningDismissalService {
    private final JdbcTemplate jdbc;
    private final SharingAccessService access;
    private final BlockService blocks;

    public BlockWarningDismissalService(JdbcTemplate jdbc, SharingAccessService access, BlockService blocks) {
        this.jdbc = jdbc;
        this.access = access;
        this.blocks = blocks;
    }

    @Transactional(readOnly = true)
    public List<String> list(long actor, UUID diaryId) {
        access.readMember(access.read(diaryId), actor);
        return savedTargets(actor, diaryId).stream().map(String::valueOf).toList();
    }

    @Transactional
    public void dismiss(long actor, UUID diaryId, List<Long> targets) {
        if (targets == null || targets.isEmpty() || targets.size() > 100
                || targets.stream().anyMatch(id -> id == null || id <= 0)) {
            throw ModerationException.invalid("차단 안내에 표시된 참여자를 확인해 주세요.");
        }
        var diary = access.lock(diaryId);
        if (diary.getDeletedAt() != null) throw SharingException.missing();
        access.readMember(diary, actor);
        // Serialize with block and unblock, which lock the actor after the diary.
        jdbc.queryForList("select user_id from users where user_id = ? for update", actor);
        Set<Long> blocked = blocks.targets(actor);
        Set<Long> members = access.visibleMembers(diary).stream()
                .map(member -> member.getUserId()).collect(Collectors.toSet());
        List<Long> saved = savedTargets(actor, diaryId);
        for (Long target : targets.stream().distinct().toList()) {
            if (blocked.contains(target) && members.contains(target) && !saved.contains(target)) {
                jdbc.update("""
                        insert into block_warning_dismissals (diary_id, blocker_user_id, blocked_user_id)
                        values (?, ?, ?)
                        """, diaryId, actor, target);
            }
        }
    }

    private List<Long> savedTargets(long actor, UUID diaryId) {
        return jdbc.queryForList("""
                select blocked_user_id from block_warning_dismissals
                where diary_id = ? and blocker_user_id = ?
                """, Long.class, diaryId, actor);
    }
}
