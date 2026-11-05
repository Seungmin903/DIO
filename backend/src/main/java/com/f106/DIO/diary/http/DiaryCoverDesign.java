package com.f106.DIO.diary.http;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import com.f106.DIO.diary.detail.DiaryDetailException;
import org.springframework.http.HttpStatus;

/** Portable cover metadata. Device paths and arbitrary remote URLs never leave the device. */
public final class DiaryCoverDesign {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private DiaryCoverDesign() {}
    public static JsonNode read(String value) { return value==null?null:JSON.readTree(value); }
    public static String referencePattern(UUID id) { return "%\"mediaFileId\":\""+id+"\"%"; }
    public static Set<UUID> references(JsonNode cover) {
        var ids=new TreeSet<UUID>();
        if(cover==null || cover.isNull())return ids;
        reference(cover.get("photo"),ids,false);
        var stickers=cover.get("stickers");
        if(stickers!=null&&!stickers.isArray())throw new IllegalArgumentException("표지 스티커를 확인해 주세요.");
        if(stickers!=null)for(var sticker:stickers)reference(sticker,ids,true);
        return ids;
    }
    private static void reference(JsonNode node,Set<UUID> ids,boolean sticker) {
        if(node==null||node.isNull())return;
        if(!node.isObject())throw new IllegalArgumentException("표지 사진을 확인해 주세요.");
        if(sticker&&(node.hasNonNull("asset")||node.hasNonNull("builtin")))return;
        var value=node.get("mediaFileId");
        if(value==null||!value.isString())throw new IllegalArgumentException("표지 사진 업로드가 필요해요.");
        UUID id=UUID.fromString(value.asText());
        if(!id.toString().equals(value.asText())||!node.path("src").asText().equals("media:"+id))throw new IllegalArgumentException("표지 사진 참조를 확인해 주세요.");
        ids.add(id);
    }
    public static String prepare(JsonNode cover,JsonNode previous,long actor,JdbcTemplate jdbc) {
        if(cover==null||!cover.isObject()||cover.toString().length()>65536)throw new IllegalArgumentException("표지 자료를 확인해 주세요.");
        var references=references(cover);
        validate(cover,0,references);
        if(cover.has("kind")&&!Set.of("plain","photo").contains(cover.path("kind").asText()))throw new IllegalArgumentException("표지 종류를 확인해 주세요.");
        var old=references(previous);
        for(var id:references) {
            var owners=jdbc.queryForList("select owner_user_id from media_files where media_file_id=? and deleted_at is null and status='READY' and media_type='IMAGE' for update",Long.class,id);
            if(owners.isEmpty()||(!Objects.equals(owners.get(0),actor)&&!old.contains(id)))throw new DiaryDetailException(HttpStatus.BAD_REQUEST,"COVER_MEDIA_UNAVAILABLE","표지에 사용할 사진을 확인해 주세요.");
        }
        return cover.toString();
    }
    private static void validate(JsonNode node,int depth,Set<UUID> references) {
        if(depth>12)throw new IllegalArgumentException("표지 자료가 너무 복잡해요.");
        if(node.isString()&&node.asText().length()>1024)throw new IllegalArgumentException("표지 내용이 너무 길어요.");
        if(node.isObject())node.properties().forEach(field->{
            if(Set.of("src","uri","url").contains(field.getKey())&&!field.getValue().isNull()
                &&(!field.getKey().equals("src")||!field.getValue().asText().matches("media:[0-9a-f-]{36}")))throw new IllegalArgumentException("기기 사진 주소는 표지에 저장할 수 없어요.");
            if(field.getKey().equals("mediaFileId")&&!field.getValue().isNull()
                &&references.stream().noneMatch(id->id.toString().equals(field.getValue().asText())))throw new IllegalArgumentException("표지 사진 참조를 확인해 주세요.");
            validate(field.getValue(),depth+1,references);
        });
        else if(node.isArray()) { if(node.size()>100)throw new IllegalArgumentException("표지 요소가 너무 많아요."); node.forEach(item->validate(item,depth+1,references)); }
    }
}
