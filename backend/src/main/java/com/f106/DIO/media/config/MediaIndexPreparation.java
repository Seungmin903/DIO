package com.f106.DIO.media.config;

import com.f106.DIO.media.repository.MediaReferenceSql;
import java.sql.*;
import javax.sql.DataSource;

/** Prebuild canvas indexes outside Flyway's transaction without changing index SQL. */
public final class MediaIndexPreparation {
    private MediaIndexPreparation() {}
    private record Index(String name,String table,String column){}
    private static final Index[] INDEXES={
        new Index("idx_canvas_elements_json_media_refs","canvas_elements","properties_json"),
        new Index("idx_canvas_history_before_media_refs","canvas_history_operations","before_state_json"),
        new Index("idx_canvas_history_after_media_refs","canvas_history_operations","after_state_json")};
    public static int prepare(DataSource source,String configuredSchema){
        try(var connection=source.getConnection()){
            if(!"PostgreSQL".equals(connection.getMetaData().getDatabaseProductName()))return 0;
            // This is a dedicated connection; no application transaction or data write is committed here.
            connection.setAutoCommit(true);
            String schema=configuredSchema==null?connection.getSchema():configuredSchema;
            if(schema==null)throw new IllegalStateException("Media index schema is unavailable");
            try(var statement=connection.createStatement()){statement.execute("select pg_advisory_lock(106,21021)");}
            try{
                int created=0;
                for(var index:INDEXES){
                    String table=quoted(schema)+"."+quoted(index.table()),name=quoted(schema)+"."+quoted(index.name());
                    // Fresh databases have no live canvas writers yet. V22 builds their empty indexes normally.
                    if(!exists(connection,table))continue;
                    if(exists(connection,name)){
                        try(var query=connection.prepareStatement("select indisvalid from pg_index where indexrelid=to_regclass(?) and indrelid=to_regclass(?)")){
                            query.setString(1,name);query.setString(2,table);
                            try(var rows=query.executeQuery()){
                                if(!rows.next())throw new IllegalStateException("Unexpected object for reserved media index "+index.name());
                                if(rows.getBoolean(1))continue;
                            }
                        }
                        // An interrupted concurrent build leaves an invalid index; retry only our own named index.
                        try(var statement=connection.createStatement()){statement.execute("drop index concurrently "+name);}
                    }
                    String sql="create index concurrently if not exists "+quoted(index.name())+" on "+table+" using gin (("+MediaReferenceSql.jsonIds(index.column())+") jsonb_path_ops)";
                    try(var statement=connection.createStatement()){statement.execute(sql);}
                    created++;
                }
                return created;
            }finally{try(var statement=connection.createStatement()){statement.execute("select pg_advisory_unlock(106,21021)");}}
        }catch(SQLException error){throw new IllegalStateException("Concurrent media index preparation failed; index SQL was not modified",error);}
    }
    private static boolean exists(Connection connection,String relation)throws SQLException{
        try(var query=connection.prepareStatement("select to_regclass(?) is not null")){
            query.setString(1,relation);try(var rows=query.executeQuery()){rows.next();return rows.getBoolean(1);}
        }
    }
    private static String quoted(String name){return "\""+name.replace("\"","\"\"")+"\"";}
}
