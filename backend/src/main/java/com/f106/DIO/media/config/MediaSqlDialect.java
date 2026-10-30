package com.f106.DIO.media.config;

import com.f106.DIO.media.repository.MediaReferenceSql;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.stereotype.Component;

/** Resolve the test dialect once, never inside each file lookup. */
@Component
public class MediaSqlDialect {
    private final boolean h2;
    public MediaSqlDialect(JdbcTemplate jdbc){h2=Boolean.TRUE.equals(jdbc.execute((ConnectionCallback<Boolean>)c->"H2".equals(c.getMetaData().getDatabaseProductName())));}
    public String matches(String column){return h2?"lower(cast("+column+" as varchar)) like ?":MediaReferenceSql.jsonIds(column)+" @> jsonb_build_array(cast(? as text))";}
    public Object parameter(java.util.UUID id){return h2?"%"+id+"%":id.toString();}
    public String unreferenced(){return h2?MediaReferenceSql.H2_UNREFERENCED:MediaReferenceSql.UNREFERENCED;}
}
