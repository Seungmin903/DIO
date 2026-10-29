package com.f106.DIO.collaboration.repository;
import com.f106.DIO.collaboration.domain.CanvasElementSnapshot;
import com.f106.DIO.collaboration.exception.CollaborationException;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.*;
@Repository
public class CanvasSnapshotRepository {
    private final JdbcTemplate jdbc;private final ObjectMapper json;
    public CanvasSnapshotRepository(JdbcTemplate jdbc,ObjectMapper json){this.jdbc=jdbc;this.json=json;}
    public Map<String,CanvasElementSnapshot> capture(UUID page,Collection<UUID> ids){
        var result=new LinkedHashMap<String,CanvasElementSnapshot>();
        for(UUID id:ids)result.put(id.toString(),null);
        if(result.isEmpty())return result;
        var unique=new ArrayList<>(result.keySet());
        for(int offset=0;offset<unique.size();offset+=500){
            var batch=unique.subList(offset,Math.min(offset+500,unique.size()));
            var args=new ArrayList<Object>();args.add(page);batch.forEach(id->args.add(UUID.fromString(id)));
            var rows=jdbc.query("select * from canvas_elements where page_id=? and element_id in ("+String.join(",",Collections.nCopies(batch.size(),"?"))+")",(r,n)->snapshot(r),args.toArray());
            for(var row:rows)result.put(row.elementId().toString(),row);
        }
        return result;
    }
    private Instant instant(ResultSet r,String column)throws SQLException{var time=r.getTimestamp(column);return time==null?null:time.toInstant();}
    private CanvasElementSnapshot snapshot(ResultSet r)throws SQLException{
        String raw=r.getString("properties_json");JsonNode properties=raw==null?null:json.readTree(raw);
        if(properties!=null&&properties.isTextual())properties=json.readTree(properties.asText());
        return new CanvasElementSnapshot(r.getObject("element_id",UUID.class),r.getObject("page_id",UUID.class),r.getString("element_type"),r.getObject("group_id",UUID.class),r.getString("name"),
            r.getBigDecimal("sort_key"),r.getBigDecimal("x"),r.getBigDecimal("y"),r.getBigDecimal("width"),r.getBigDecimal("height"),r.getBigDecimal("rotation"),r.getBigDecimal("opacity"),
            r.getBoolean("is_locked"),r.getBoolean("is_hidden"),r.getObject("media_file_id",UUID.class),properties,r.getObject("created_by",Long.class),r.getLong("version"),instant(r,"created_at"),instant(r,"updated_at"),instant(r,"deleted_at"));
    }
    public void restore(UUID page,Map<String,CanvasElementSnapshot> desired,Map<String,CanvasElementSnapshot> current){
        boolean h2=Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>) c->"H2".equals(c.getMetaData().getDatabaseProductName())));
        for(var entry:desired.entrySet()){
            var old=current.get(entry.getKey());var next=entry.getValue();
            if(old==null)throw CollaborationException.conflict();
            int updated;
            if(next==null)updated=jdbc.update("update canvas_elements set deleted_at=current_timestamp,updated_at=current_timestamp,version=version+1 where element_id=? and page_id=? and version=?",old.elementId(),page,old.version());
            else updated=jdbc.update("update canvas_elements set group_id=?,name=?,sort_key=?,x=?,y=?,width=?,height=?,rotation=?,opacity=?,is_locked=?,is_hidden=?,media_file_id=?,properties_json="+(h2?"? format json":"cast(? as jsonb)")+",deleted_at=?,updated_at=current_timestamp,version=version+1 where element_id=? and page_id=? and version=?",
                next.groupId(),next.name(),next.sortKey(),next.x(),next.y(),next.width(),next.height(),next.rotation(),next.opacity(),next.isLocked(),next.isHidden(),next.mediaFileId(),next.propertiesJson()==null?null:next.propertiesJson().toString(),next.deletedAt()==null?null:Timestamp.from(next.deletedAt()),old.elementId(),page,old.version());
            if(updated!=1)throw CollaborationException.conflict();
        }
    }
}
