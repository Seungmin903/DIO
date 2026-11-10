package com.f106.DIO.diary.http;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.DiaryDetailException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** 232의 검색·복합 커서 방식을 회원 활성 멤버십 범위에 연결한다. */
@Service
public class MemberDiaryListQuery {
    private final JdbcTemplate jdbc;
    private final DiaryRequestIdentity identity;
    private final ObjectMapper json = new ObjectMapper();
    private final boolean postgres;
    private final String titleKeySql;
    public MemberDiaryListQuery(JdbcTemplate jdbc, DiaryRequestIdentity identity) {
        this.jdbc=jdbc; this.identity=identity;
        postgres=Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)
            connection -> "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())));
        // Fold both operands with the same database Unicode rules. Keep the
        // resulting title key in byte order, independent of the DB's default locale.
        titleKeySql=postgres ? "LOWER(d.title COLLATE pg_catalog.\"und-x-icu\") COLLATE pg_catalog.\"C\"" : "LOWER(d.title)";
    }
    @io.swagger.v3.oas.annotations.media.Schema(name="MemberDiaryListItem")
    public record Item(MemberDiaryResponses.Diary diary, long pageCount, boolean shared) {}
    public record Page(List<Item> items, String nextCursor, boolean hasNext) {}
    public record Cursor(int v, long user, String q, String sort, String value, String id,String filter,boolean favorite) {}
    private record Row(Item item, String value) {}
    private MemberDiaryRequestException invalid() { return new MemberDiaryRequestException("INVALID_DIARY_LIST_QUERY"); }

    @Transactional(readOnly=true)
    public Page list(String query,String order,Integer requestedLimit,String encoded) { return list(query,order,requestedLimit,encoded,"all",false); }
    @Transactional(readOnly=true)
    public Page list(String query, String order, Integer requestedLimit, String encoded,String filter,boolean favorite) {
        long user=identity.requireUserId(DiaryDetailException::unauthorized);
        String q=query==null?"":query.strip(), sort=order==null?"updated":order;
        int limit=requestedLimit==null?20:requestedLimit;
        if(!Set.of("all","personal","shared").contains(filter) || q.length()>100 || limit<1 || limit>100 || !Set.of("created","updated","title","pages").contains(sort)) throw invalid();
        boolean needsUnicode=!q.isEmpty() || sort.equals("title");
        // This capability belongs to the member list, not application startup.
        // Recheck on retry so installing ICU support does not require a restart.
        if(postgres && needsUnicode && !Boolean.TRUE.equals(jdbc.queryForObject(
            "select exists(select 1 from pg_catalog.pg_collation where collname='und-x-icu' "+
            "and collnamespace='pg_catalog'::regnamespace and collprovider='i' and collisdeterministic)",Boolean.class))) {
            throw new DiaryDetailException(HttpStatus.SERVICE_UNAVAILABLE,"DIARY_LIST_UNAVAILABLE",
                "회원 목록을 사용할 수 없어요. 잠시 후 다시 확인해 주세요.");
        }
        if(!q.isEmpty()) {
            q=jdbc.queryForObject(postgres ? "SELECT LOWER(CAST(? AS text) COLLATE pg_catalog.\"und-x-icu\")" : "SELECT LOWER(CAST(? AS VARCHAR))",String.class,q);
            if(q.length()>100) throw invalid();
        }
        String column=switch(sort) {case "updated"->"updated_at";case "title"->"title_key";case "pages"->"page_count";default->"created_at";};
        boolean asc=sort.equals("title");
        var args=new ArrayList<Object>();args.add(user);
        String base="SELECT d.*,m.role,m.is_favorite,"+(needsUnicode?titleKeySql:"d.title")+" AS title_key,"+
            "(SELECT COUNT(*) FROM pages p WHERE p.diary_id=d.diary_id AND p.deleted_at IS NULL) AS page_count,"+
            "(SELECT COUNT(*) FROM diary_members a WHERE a.diary_id=d.diary_id AND a.left_at IS NULL) AS member_count "+
            "FROM diaries d JOIN diary_members m ON m.diary_id=d.diary_id AND m.user_id=? "+
            "WHERE d.deleted_at IS NULL AND m.left_at IS NULL AND d.owner_user_id IS NOT NULL "+
            "AND ((m.role='OWNER' AND d.owner_user_id=m.user_id) OR (m.role='EDITOR' AND d.owner_user_id<>m.user_id))";
        if(favorite) base+=" AND m.is_favorite=true";
        if(!q.isEmpty()) {base+=" AND "+titleKeySql+" LIKE ? ESCAPE '!'";args.add("%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%");}
        String sql="SELECT * FROM ("+base+") x";
        // Filters and badge use the same active-membership count, independent of visibility.
        sql+=" WHERE "+switch(filter) {case "personal"->"member_count<=1";case "shared"->"member_count>1";default->"1=1";};
        if(encoded!=null) {
            try {
                if(encoded.length()>4096) throw invalid();
                var c=json.readValue(Base64.getUrlDecoder().decode(encoded),Cursor.class);
                if(c.v()!=4 || !filter.equals(c.filter()) || favorite!=c.favorite() || c.user()!=user || !q.equals(c.q()) || !sort.equals(c.sort()) || c.value()==null || c.value().length()>300) throw invalid();
                Object value=switch(sort) {case "title"->c.value();case "pages"->Long.parseLong(c.value());default->Timestamp.from(Instant.parse(c.value()));};
                UUID id=UUID.fromString(c.id());String cmp=asc?">":"<";
                sql+=" AND ("+column+cmp+"? OR ("+column+"=? AND diary_id"+cmp+"?))";
                args.add(value);args.add(value);args.add(id);
            } catch(Exception error) {throw invalid();}
        }
        sql+=" ORDER BY "+column+(asc?" ASC":" DESC")+",diary_id"+(asc?" ASC":" DESC")+" LIMIT ?";args.add(limit+1);
        var rows=jdbc.query(sql,(rs,n)->{
            var diary=new MemberDiaryResponses.Diary(rs.getString("diary_id"),rs.getString("title"),rs.getString("cover_color"),rs.getString("cover_style"),rs.getString("visibility"),rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("updated_at").toInstant(),"OWNER".equals(rs.getString("role")),Long.toString(rs.getLong("version")),rs.getString("role"),new MemberDiaryResponses.Membership(rs.getBoolean("is_favorite")),new MemberDiaryResponses.Permissions("OWNER".equals(rs.getString("role")),true,"OWNER".equals(rs.getString("role")),false,false));
            String value=switch(sort){case "title"->rs.getString("title_key");case "pages"->Long.toString(rs.getLong("page_count"));default->rs.getTimestamp(column).toInstant().toString();};
            var enriched=diary.withCover(DiaryCoverDesign.read(rs.getString("cover_json")))
                .withPaperAppearance(com.f106.DIO.page.domain.PaperAppearance.read(rs.getString("paper_appearance_json")))
                .withTemplateConfig(com.f106.DIO.diary.support.DiaryTemplateConfig.read(rs.getString("template_config_json")));
            return new Row(new Item(enriched,rs.getLong("page_count"),rs.getLong("member_count")>1),value);
        },args.toArray());
        boolean more=rows.size()>limit;var selected=rows.subList(0,Math.min(limit,rows.size()));String next=null;
        if(more) {var last=selected.get(selected.size()-1);next=Base64.getUrlEncoder().withoutPadding().encodeToString(json.writeValueAsString(new Cursor(4,user,q,sort,last.value(),last.item().diary().diaryId(),filter,favorite)).getBytes(StandardCharsets.UTF_8));}
        return new Page(selected.stream().map(Row::item).toList(),next,more);
    }
}
