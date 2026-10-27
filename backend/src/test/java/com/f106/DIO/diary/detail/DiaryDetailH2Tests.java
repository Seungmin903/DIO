package com.f106.DIO.diary.detail;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class DiaryDetailH2Tests extends DiaryDetailContract {
	@Override
	DriverManagerDataSource database() {
		var dataSource = new DriverManagerDataSource("jdbc:h2:mem:detail_"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa","");
		var db = new JdbcTemplate(dataSource);
		db.execute("create table users(user_id bigint primary key,nickname varchar(30),nickname_key varchar(30),status varchar(20),deleted_at timestamp(6) with time zone)");
		db.execute("create table diaries(diary_id uuid primary key,owner_user_id bigint references users(user_id),title varchar(100) not null,cover_color char(7) not null,cover_style varchar(30) not null,visibility varchar(30) not null,created_at timestamp(6) with time zone not null,updated_at timestamp(6) with time zone not null,deleted_at timestamp(6) with time zone)");
		db.execute("create table diary_members(diary_id uuid references diaries(diary_id),user_id bigint references users(user_id),role varchar(20),member_color char(7),left_at timestamp(6) with time zone,primary key(diary_id,user_id))");
		return dataSource;
	}
	@Override
	void cleanupDatabase() { if (jdbc != null) jdbc.execute("shutdown"); }
}
