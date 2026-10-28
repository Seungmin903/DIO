package com.f106.DIO.diary.http;

import java.util.*;
import java.nio.charset.StandardCharsets;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@EnabledIfSystemProperty(named="dio.diary-creation-postgres",matches="true")
class MemberDiaryListPostgresTests {
    JdbcTemplate admin,jdbc;
    String schema;
    MemberDiaryListQuery query;
    @BeforeEach void setup() {
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        if(url==null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) throw new IllegalStateException("Explicit isolated local PostgreSQL URL required");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));
        schema="member_list_qa_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);
        var ds=new DriverManagerDataSource(url,user,password);var props=new Properties();props.setProperty("currentSchema",schema);ds.setConnectionProperties(props);
        Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).load().migrate();jdbc=new JdbcTemplate(ds);
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(101,'list-owner','list-owner'),(202,'other','other')");
        var identity=mock(DiaryRequestIdentity.class);when(identity.requireUserId(any())).thenReturn(101L);query=new MemberDiaryListQuery(jdbc,identity);
    }
    @AfterEach void cleanup() { if(schema!=null && schema.matches("member_list_qa_[a-f0-9]{32}")) admin.execute("drop schema if exists "+schema+" cascade"); }
    UUID add(int number,String title) {
        UUID id=new UUID(0,number);
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,101,?,'#123456','PLAIN','PRIVATE')",id,title);
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,101,'OWNER','#123456')",id);return id;
    }
    @Test void unicodeSearchUsesTheSameFoldForQueryAndTitleInACLocaleDatabase() {
        add(1,"ÉÄ");add(2,"Σ");add(3,"İ");add(4,"unrelated");
        for(String q:List.of("ÉÄ","éä","  ÉÄ  ","Σ","σ","İ","i\u0307")) assertThat(query.list(q,"title",20,null).items()).hasSize(1);
        assertThat(query.list("ea","title",20,null).items()).isEmpty();
    }
    @Test void unicodeTitlePaginationHasNoDuplicatesAndCaseEquivalentSearchCanContinue() {
        for(int i=0;i<10;i++) add(i+1,List.of("Ä","ä","É","é","A","a","Σ","σ","İ","i\u0307").get(i));
        List<String> expected=jdbc.queryForList("select diary_id::text from diaries order by lower(title collate \"und-x-icu\") collate \"C\",diary_id",String.class);
        var actual=new ArrayList<String>();String cursor=null;
        do {var page=query.list(null,"title",1,cursor);actual.add(page.items().get(0).diary().diaryId());cursor=page.nextCursor();} while(cursor!=null);
        assertThat(actual).containsExactlyElementsOf(expected).doesNotHaveDuplicates();
        var first=query.list("É","title",1,null);assertThat(first.hasNext()).isTrue();
        var next=query.list("é","title",1,first.nextCursor());assertThat(next.items()).hasSize(1);assertThat(next.items().get(0).diary().diaryId()).isNotEqualTo(first.items().get(0).diary().diaryId());
    }
    @Test void cursorsFromThePreviousFoldVersionAreRejected() {
        add(1,"Ä");add(2,"É");String cursor=query.list(null,"title",1,null).nextCursor();
        var json=(tools.jackson.databind.node.ObjectNode)new tools.jackson.databind.ObjectMapper().readTree(Base64.getUrlDecoder().decode(cursor));
        for(int version:List.of(1,2,3)) {
            json.put("v",version);
            String old=Base64.getUrlEncoder().withoutPadding().encodeToString(json.toString().getBytes(StandardCharsets.UTF_8));
            assertThatThrownBy(() -> query.list(null,"title",1,old)).isInstanceOf(MemberDiaryRequestException.class);
        }
    }
    @Test void explainActualListQueryBoundsPageCountsWhenNotSortingByPages() throws Exception {
        // Synthetic account: 200 diaries x 25 pages. Inspect execution, never assert wall-clock speed.
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility)"
            + " select md5('plan-diary-'||g)::uuid,101,'Plan '||g,'#123456','PLAIN','PRIVATE' from generate_series(1,200) g");
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) select diary_id,101,'OWNER','#123456' from diaries");
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) select diary_id,202,'EDITOR','#654321' from diaries");
        jdbc.update("insert into pages(page_id,diary_id,sort_key) select md5(d.diary_id::text||'-'||g)::uuid,d.diary_id,g from diaries d cross join generate_series(1,25) g");
        for(String table:List.of("diaries","diary_members","pages")) jdbc.execute("analyze "+table);
        class RecordingJdbc extends JdbcTemplate {
            String sql;Object[] args;
            RecordingJdbc() {super(jdbc.getDataSource());}
            @Override public <T> List<T> query(String statement,org.springframework.jdbc.core.RowMapper<T> mapper,Object... parameters) {
                if(statement.startsWith("SELECT * FROM (")) {sql=statement;args=parameters.clone();}
                return super.query(statement,mapper,parameters);
            }
        }
        var recording=new RecordingJdbc();var identity=mock(DiaryRequestIdentity.class);when(identity.requireUserId(any())).thenReturn(101L);
        var measured=new MemberDiaryListQuery(recording,identity);
        var output=java.nio.file.Path.of("build","reports","member-list-plans");java.nio.file.Files.createDirectories(output);
        for(String sort:List.of("updated","pages")) for(String filter:List.of("all","shared")) {
            var page=measured.list(null,sort,20,null,filter,false);
            assertThat(page.items()).hasSize(20);assertThat(page.hasNext()).isTrue();
            assertThat(page.items()).allSatisfy(item->{assertThat(item.pageCount()).isEqualTo(25);assertThat(item.shared()).isTrue();});
            assertThat(recording.sql).isNotNull();
            String plan=jdbc.queryForObject("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+recording.sql,String.class,recording.args);
            java.nio.file.Files.writeString(output.resolve(sort+"-"+filter+".json"),plan,StandardCharsets.UTF_8);
            var tree=new tools.jackson.databind.ObjectMapper().readTree(plan);var loops=new ArrayList<Integer>();
            pageScanLoops(tree,loops);
            assertThat(loops).isNotEmpty();
            if(!sort.equals("pages")) assertThat(loops).allSatisfy(n->assertThat(n).isLessThanOrEqualTo(21));
        }
    }
    private void pageScanLoops(tools.jackson.databind.JsonNode node,List<Integer> loops) {
        if(node.isArray()) {for(var child:node) pageScanLoops(child,loops);return;}
        if(!node.isObject()) return;
        if(node.has("Relation Name") && "pages".equals(node.get("Relation Name").asString())) loops.add(node.get("Actual Loops").asInt());
        if(node.has("Plan")) pageScanLoops(node.get("Plan"),loops);
        if(node.has("Plans")) pageScanLoops(node.get("Plans"),loops);
    }

    @Test void activeCountsAndCursorOrderingStayExactWithDeletedPagesAndFormerMembers() {
        for(int i=1;i<=8;i++) {
            UUID id=add(i,"Title "+i);
            jdbc.update("update diaries set created_at=timestamp '2026-01-01',updated_at=timestamp '2026-01-01' where diary_id=?",id);
            jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,left_at) values(?,202,'VIEWER','#123456',?)",
                id,i%2==0?java.sql.Timestamp.valueOf("2026-01-02 00:00:00"):null);
            for(int j=0;j<i%3+1;j++) {
                jdbc.update("insert into pages(page_id,diary_id,sort_key,deleted_at) values(?,?,?,?)",
                    UUID.randomUUID(),id,j,j==i%3?java.sql.Timestamp.valueOf("2026-01-02 00:00:00"):null);
            }
        }
        UUID foreign=new UUID(0,999);
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,202,'Other','#123456','PLAIN','PRIVATE')",foreign);
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'OWNER','#123456')",foreign);
        for(String sort:List.of("created","updated","title","pages")) {
            var expected=new ArrayList<Integer>();for(int i=1;i<=8;i++) expected.add(i);
            expected.sort(sort.equals("title")?Comparator.naturalOrder():sort.equals("pages")
                ?Comparator.<Integer>comparingInt(i->i%3).reversed().thenComparing(Comparator.reverseOrder()):Comparator.reverseOrder());
            var actual=new ArrayList<Integer>();String cursor=null;
            do {
                var page=query.list(null,sort,2,cursor);
                for(var item:page.items()) {
                    int number=(int)UUID.fromString(item.diary().diaryId()).getLeastSignificantBits();
                    actual.add(number);assertThat(item.pageCount()).isEqualTo(number%3);
                    assertThat(item.shared()).isEqualTo(number%2!=0);
                    assertThat(item.diary().canEdit()).isTrue();
                }
                cursor=page.nextCursor();
            } while(cursor!=null);
            assertThat(actual).as(sort).containsExactlyElementsOf(expected).doesNotHaveDuplicates();
        }
    }
}
