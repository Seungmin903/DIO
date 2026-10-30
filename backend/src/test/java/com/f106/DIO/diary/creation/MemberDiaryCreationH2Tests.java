package com.f106.DIO.diary.creation;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class MemberDiaryCreationH2Tests extends MemberDiaryCreationContract {
	@Override DriverManagerDataSource database() {
		var dataSource=new DriverManagerDataSource("jdbc:h2:mem:create_"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa","");
		var db=new JdbcTemplate(dataSource);
		db.execute("create table users(user_id bigint primary key,nickname varchar(30),nickname_key varchar(30),status varchar(20),profile_color char(7),deleted_at timestamp(6) with time zone)");
		db.execute("create table page_templates(template_id bigint primary key,code varchar(100),template_version varchar(30),name varchar(100),category varchar(30),orientation varchar(20),canvas_width decimal(10,2),canvas_height decimal(10,2),default_config jsonb,is_active boolean default true)");
		db.execute("create table diaries(diary_id uuid primary key,owner_user_id bigint references users(user_id),title varchar(100) not null,cover_color char(7),cover_style varchar(30),visibility varchar(30),created_at timestamp(6) with time zone,updated_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone)");
		db.execute("create table pages(page_id uuid primary key,diary_id uuid references diaries(diary_id),template_id bigint references page_templates(template_id),template_config jsonb,sort_key decimal(20,10),canvas_width decimal(10,2),canvas_height decimal(10,2),created_at timestamp(6) with time zone,updated_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone)");
		db.execute("create table diary_members(diary_id uuid references diaries(diary_id),user_id bigint references users(user_id),role varchar(20),member_color char(7),joined_at timestamp(6) with time zone,left_at timestamp(6) with time zone,primary key(diary_id,user_id))");
		db.execute("create table diary_creation_receipts(user_id bigint references users(user_id) on delete cascade,key_hash char(64),request_hash char(64),diary_id uuid references diaries(diary_id) on delete set null,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
		return dataSource;
	}
	@Override void cleanupDatabase() { if(jdbc!=null) jdbc.execute("shutdown"); }
}
