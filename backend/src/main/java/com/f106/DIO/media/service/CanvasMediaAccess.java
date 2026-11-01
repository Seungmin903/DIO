package com.f106.DIO.media.service;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.f106.DIO.media.support.MediaFileNotFoundException;

/** Access to images referenced by the existing canvas APIs, including photo-strip cells. */
@Service
public class CanvasMediaAccess {
    public static final int MAX_REFERENCES_PER_ELEMENT=64;
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final com.f106.DIO.media.config.MediaSqlDialect sql;
    public CanvasMediaAccess(JdbcTemplate jdbc,com.f106.DIO.media.config.MediaSqlDialect sql){this.jdbc=jdbc;this.sql=sql;}
    /** Every mediaFileId recognized by the recursive retention index must be authorized on write. */
    public static Set<UUID> references(UUID primary,JsonNode properties){
        validatePdfSourceLocation(properties);
        var ids=new TreeSet<UUID>();if(primary!=null)ids.add(primary);
        var pending=new ArrayDeque<JsonNode>();if(properties!=null)pending.add(properties);
        while(!pending.isEmpty()){
            var node=pending.removeFirst();
            if(node.isObject())node.properties().forEach(field->{
                if("mediaFileId".equals(field.getKey())){
                    add(ids,field.getValue());
                    if(ids.size()>MAX_REFERENCES_PER_ELEMENT)throw new IllegalArgumentException("요소당 이미지 참조는 64개까지 사용할 수 있어요.");
                }
                pending.add(field.getValue());
            });
            else if(node.isArray())node.forEach(pending::add);
        }
        return ids;
    }
    // Do not widen reads for old/hidden metadata: only references rendered by the app grant access.
    private static Set<UUID> visibleReferences(UUID primary,JsonNode properties){
        var ids=new TreeSet<UUID>();if(primary!=null)ids.add(primary);
        if(properties!=null){
            add(ids,properties.get("mediaFileId"));
            var cells=properties.get("cells");if(cells!=null&&cells.isArray())for(var cell:cells)add(ids,cell.get("mediaFileId"));
            var pdfSource=properties.get("pdfSource");if(pdfSource!=null&&pdfSource.isObject())add(ids,pdfSource.get("mediaFileId"));
        }
        return ids;
    }
    private static void add(Set<UUID> ids,JsonNode value){
        if(value!=null&&!value.isNull())try{var id=UUID.fromString(value.asText());if(!id.toString().equalsIgnoreCase(value.asText()))throw new IllegalArgumentException();ids.add(id);}catch(IllegalArgumentException error){throw new IllegalArgumentException("이미지 참조 ID를 확인해 주세요.");}
    }
    private boolean referenced(UUID media,String scope,Object... args){
        var parameters=new ArrayList<Object>();parameters.add(media);parameters.add(sql.parameter(media));Collections.addAll(parameters,args);
        return jdbc.query("select e.media_file_id,e.properties_json from canvas_elements e join pages p on p.page_id=e.page_id join diaries d on d.diary_id=p.diary_id where e.deleted_at is null and p.deleted_at is null and d.deleted_at is null and (e.media_file_id=? or "+sql.matches("e.properties_json")+") and "+scope,
            (rs,n)->visibleReferences(rs.getObject(1,UUID.class),rs.getString(2)==null?null:JSON.readTree(rs.getString(2))).contains(media),parameters.toArray()).stream().anyMatch(Boolean.TRUE::equals);
    }
    public boolean readable(UUID media,long actor){
        return referenced(media,"(d.owner_user_id=? or exists(select 1 from diary_members m where m.diary_id=d.diary_id and m.user_id=? and m.left_at is null and m.role in ('OWNER','EDITOR')))",actor,actor);
    }
    public void requireAttach(UUID page,UUID primary,JsonNode properties,long actor){
        for(var reference:attachmentReferences(primary,properties).entrySet()){
            var owners=jdbc.queryForList("select owner_user_id from media_files where media_file_id=? and deleted_at is null and status='READY' and media_type=? for update",Long.class,reference.getKey(),reference.getValue());
            if(owners.isEmpty())throw new MediaFileNotFoundException();
            if(Objects.equals(owners.get(0),actor))continue;
            boolean library=Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from diary_media_library l join pages p on p.diary_id=l.diary_id where p.page_id=? and l.media_file_id=?)",Boolean.class,page,reference.getKey()));
            if(!library&&!referenced(reference.getKey(),"d.diary_id=(select diary_id from pages where page_id=?)",page))throw new MediaFileNotFoundException();
        }
    }

    /** PDF source is the one document reference slot; every other mediaFileId remains an image slot. */
    private static Map<UUID,String> attachmentReferences(UUID primary,JsonNode properties){
        validatePdfSourceLocation(properties);
        var references=new TreeMap<UUID,String>();
        if(primary!=null)putReference(references,primary,"IMAGE");
        if(properties!=null&&properties.isObject())properties.properties().forEach(field->{
            if("pdfSource".equals(field.getKey()))collectPdfSourceReferences(references,field.getValue());
            else if("mediaFileId".equals(field.getKey()))putReference(references,field.getValue(),"IMAGE");
            else collectAttachmentReferences(references,field.getValue(),"IMAGE");
        });
        else collectAttachmentReferences(references,properties,"IMAGE");
        return references;
    }
    private static void collectAttachmentReferences(Map<UUID,String> references,JsonNode node,String type){
        if(node==null||node.isNull())return;
        if(node.isObject())node.properties().forEach(field->{
            if("mediaFileId".equals(field.getKey()))putReference(references,field.getValue(),type);
            else collectAttachmentReferences(references,field.getValue(),type);
        });
        else if(node.isArray())node.forEach(value->collectAttachmentReferences(references,value,type));
    }
    /** The direct PDF source is a document; nested media IDs remain regular image references and must be authorized. */
    private static void collectPdfSourceReferences(Map<UUID,String> references,JsonNode pdfSource){
        if(pdfSource==null||pdfSource.isNull())return;
        putReference(references,pdfSource.get("mediaFileId"),"DOCUMENT");
        pdfSource.properties().forEach(field->{if(!"mediaFileId".equals(field.getKey()))collectAttachmentReferences(references,field.getValue(),"IMAGE");});
    }
    private static void putReference(Map<UUID,String> references,JsonNode value,String type){
        if(value==null||value.isNull())return;
        try{var id=UUID.fromString(value.asText());if(!id.toString().equalsIgnoreCase(value.asText()))throw new IllegalArgumentException();putReference(references,id,type);
        }catch(IllegalArgumentException error){throw new IllegalArgumentException("미디어 참조 ID를 확인해 주세요.");}
    }
    private static void putReference(Map<UUID,String> references,UUID id,String type){
        String previous=references.get(id);
        if(previous!=null){if(!previous.equals(type))throw new IllegalArgumentException("같은 미디어 ID를 이미지와 PDF 원본에 함께 사용할 수 없어요.");return;}
        if(references.size()>=MAX_REFERENCES_PER_ELEMENT)throw new IllegalArgumentException("요소당 이미지 참조는 64개까지 사용할 수 있어요.");
        references.put(id,type);
    }
    /** The PDF source contract has one top-level object slot; nested or array slots are rejected before persistence. */
    private static void validatePdfSourceLocation(JsonNode properties){
        if(properties==null||properties.isNull())return;
        if(!properties.isObject()){rejectNestedPdfSource(properties);return;}
        var pdfSource=properties.get("pdfSource");
        if(pdfSource!=null&&!pdfSource.isNull()&&!pdfSource.isObject())throw new IllegalArgumentException("pdfSource는 최상위 객체여야 해요.");
        rejectNestedPdfSource(pdfSource);
        properties.properties().forEach(field->{if(!"pdfSource".equals(field.getKey()))rejectNestedPdfSource(field.getValue());});
    }
    private static void rejectNestedPdfSource(JsonNode node){
        if(node==null||node.isNull())return;
        if(node.isObject())node.properties().forEach(field->{
            if("pdfSource".equals(field.getKey()))throw new IllegalArgumentException("pdfSource는 최상위 객체여야 해요.");
            rejectNestedPdfSource(field.getValue());
        });
        else if(node.isArray())node.forEach(CanvasMediaAccess::rejectNestedPdfSource);
    }
    /** Include soft-deleted elements, which can still be restored or undone. */
    public boolean retained(UUID media){
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from canvas_elements e where e.media_file_id=? or "+sql.matches("e.properties_json")+") or exists(select 1 from canvas_history_operations h where "+sql.matches("h.before_state_json")+" or "+sql.matches("h.after_state_json")+")",Boolean.class,media,sql.parameter(media),sql.parameter(media),sql.parameter(media)));
    }
}
