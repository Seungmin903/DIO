package com.f106.DIO.diary.detail;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcDiaryMembershipAccess implements DiaryMembershipAccess {
	private final JdbcTemplate jdbc;
	private final DiaryDetailRepository diaries;

	public JdbcDiaryMembershipAccess(JdbcTemplate jdbc, DiaryDetailRepository diaries) {
		this.jdbc = jdbc;
		this.diaries = diaries;
	}

	@Override
	public Role requireActiveRole(long userId, UUID diaryId, Long ownerUserId) {
		if (ownerUserId == null) throw DiaryDetailException.notFound();
		var rows = jdbc.query("select role,left_at from diary_members where diary_id = ? and user_id = ?" + diaries.sharedLock(),
			(rs, row) -> new Membership(rs.getString("role"), rs.getTimestamp("left_at") == null), diaryId, userId);
		if (rows.isEmpty() || !rows.get(0).active()) throw DiaryDetailException.notFound();
		Role role;
		try { role = Role.valueOf(rows.get(0).role()); }
		catch (RuntimeException unknownRole) { throw DiaryDetailException.notFound(); }
		// OWNER 소유권과 멤버십이 어긋난 자료는 추정해서 허용하지 않는다.
		if ((role == Role.OWNER) != (ownerUserId == userId)) throw DiaryDetailException.notFound();
		if (role == Role.VIEWER) throw DiaryDetailException.notFound();
		return role;
	}

	private record Membership(String role, boolean active) {}
}
