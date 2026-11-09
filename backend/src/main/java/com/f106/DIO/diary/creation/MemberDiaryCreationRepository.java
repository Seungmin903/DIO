package com.f106.DIO.diary.creation;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.f106.DIO.diary.dto.DiaryCreateRequest;

@Repository
public class MemberDiaryCreationRepository {
	private final JdbcTemplate jdbc;
	private final String sharedLock;
	public MemberDiaryCreationRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
		boolean postgres = Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)
			connection -> "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())));
		sharedLock = postgres ? " for share" : " for update";
	}
	public Optional<String> lockActiveUserColor(long userId) {
		return jdbc.query("select profile_color from users where user_id=? and status='ACTIVE' and deleted_at is null"+sharedLock,
			(rs,row) -> rs.getString("profile_color"), userId).stream().findFirst();
	}
	public void insertDiary(UUID id,long userId,DiaryCreateRequest metadata,Instant at) {
		jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility,created_at,updated_at) values (?,?,?,?,?,'PRIVATE',?,?)",
			id,userId,metadata.diaryTitle(),metadata.coverColor(),metadata.coverStyle(),Timestamp.from(at),Timestamp.from(at));
	}
	public void insertOwner(UUID id,long userId,String color,Instant at) {
		jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,joined_at) values (?,?,'OWNER',?,?)",
			id,userId,color,Timestamp.from(at));
	}
	public void setInitialPaperAppearance(UUID id,String appearance) {
		jdbc.update("update diaries set paper_appearance_json=? where diary_id=?",appearance,id);
	}
	public List<UUID> activePageIds(UUID id) {
		return jdbc.queryForList("select page_id from pages where diary_id=? and deleted_at is null order by sort_key,page_id",UUID.class,id);
	}
	public boolean validOwnerState(UUID id,long userId) {
		Long matches = jdbc.queryForObject("select count(*) from diaries d join diary_members m on m.diary_id=d.diary_id"
			+ " where d.diary_id=? and d.owner_user_id=? and d.deleted_at is null and d.visibility='PRIVATE'"
			+ " and m.user_id=? and m.role='OWNER' and m.left_at is null",Long.class,id,userId,userId);
		Long owners = jdbc.queryForObject("select count(*) from diary_members where diary_id=? and role='OWNER' and left_at is null",Long.class,id);
		return matches == 1 && owners == 1;
	}
}
