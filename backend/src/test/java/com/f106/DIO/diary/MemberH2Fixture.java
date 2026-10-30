package com.f106.DIO.diary;

import org.springframework.jdbc.core.JdbcTemplate;

/** Complete JDBC-only catalog columns and SQL defaults omitted by the minimal page JPA mappings. */
public final class MemberH2Fixture {
    private MemberH2Fixture() {}
    public static void align(JdbcTemplate jdbc) {
        boolean h2=Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>) c->"H2".equals(c.getMetaData().getDatabaseProductName())));
        if(!h2)return;
        for(String column:new String[]{"template_version varchar(30)","name varchar(100)","category varchar(30)","orientation varchar(20)"})jdbc.execute("alter table page_templates add column if not exists "+column);
        jdbc.execute("alter table page_templates alter column is_active set default true");
        jdbc.execute("alter table diary_members add column if not exists is_favorite boolean default false");
        jdbc.execute("alter table diary_members alter column is_favorite set default false");
        jdbc.execute("alter table diary_members alter column joined_at set default current_timestamp");
        jdbc.execute("alter table pages add column if not exists grid_visible boolean default false");
        jdbc.execute("alter table pages add column if not exists version bigint default 1");
        jdbc.execute("alter table pages alter column grid_visible set default false");
        jdbc.execute("alter table pages alter column version set default 1");
    }
}
