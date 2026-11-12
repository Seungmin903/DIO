package com.f106.DIO.diary.creation;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.regex.Pattern;

import com.f106.DIO.diary.dto.DiaryCreateRequest;
import jakarta.validation.Validation;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.*;

/** V6→최신 카탈로그 실제 데이터 보존 및 프런트가 생성한 Selection 계약을 제품 페이지 모듈에 적용한다. */
@EnabledIfSystemProperty(named="dio.diary-creation-postgres",matches="true")
class PageCatalogPostgresTests {
    String schema;
    JdbcTemplate admin;
    JdbcTemplate jdbc;
    DriverManagerDataSource dataSource;
    JsonNode contract;

    @BeforeEach void setup() throws Exception {
        String url=System.getenv("DB_URL"), user=System.getenv("POSTGRES_USER"), password=System.getenv("POSTGRES_PASSWORD");
        if(url==null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) throw new IllegalStateException("Explicit isolated local PostgreSQL required");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));
        schema="creation_qa_"+UUID.randomUUID().toString().replace("-","");
        admin.execute("create schema "+schema);
        dataSource=new DriverManagerDataSource(url,user,password);
        var properties=new Properties(); properties.setProperty("currentSchema",schema); dataSource.setConnectionProperties(properties);
        jdbc=new JdbcTemplate(dataSource);
        flyway("6").migrate();
        try(var input=getClass().getResourceAsStream("/catalog/page-templates-v1.json")) {
            contract=new ObjectMapper().readTree(input);
        }
    }
    Flyway flyway(String target) { return Flyway.configure().dataSource(dataSource).defaultSchema(schema).target(target).load(); }
    @AfterEach void cleanup() {
        if(schema!=null && schema.matches("creation_qa_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade");
    }
    void insertExisting(JsonNode row,int width,String version) {
        jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values(987,?,?, 'custom name','CUSTOM',?,?,?,cast(? as jsonb),false,999)",
            row.get("templateCode").asString(),version,row.get("orientation").asString(),width,row.get("canvasHeight").asInt(),
            "{\"paperAppearance\":{\"backgroundColor\":\"#123456\"}}");
    }

    @Test void freshUpgradeRegistersEveryReferenceAndCreatesAll288InitialPagesWithTheProductModule() {
        flyway("latest").migrate();
        var templates=contract.get("templates");
        var stored=jdbc.queryForList("select code,template_version,orientation,canvas_width,canvas_height from page_templates");
        // V9 288 + V27 플래너 4 + V34 원격 속지 2 + V36 여행 노선 2 + V45 발색 기록 4
        assertThat(stored).hasSize(300);
        for(int i=0;i<templates.size();i++) {
            var row=templates.get(i);
            var actual=stored.stream().filter(s -> s.get("code").equals(row.get("templateCode").asString())
                && s.get("template_version").equals(row.get("templateVersion").asString())).findFirst().orElseThrow();
            assertThat(actual.get("orientation")).isEqualTo(row.get("orientation").asString());
            assertThat(((Number)actual.get("canvas_width")).intValue()).isEqualTo(row.get("canvasWidth").asInt());
            assertThat(((Number)actual.get("canvas_height")).intValue()).isEqualTo(row.get("canvasHeight").asInt());
        }
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'owner','owner')");
        var selections=new ArrayList<DiaryInitialPages.Selection>();
        var input=contract.get("initialPages");
        for(int i=0;i<input.size();i++) {
            var row=input.get(i);
            selections.add(new DiaryInitialPages.Selection(row.get("templateCode").asString(),row.get("templateVersion").asString(),row.get("configurationJson").asString()));
        }
        var repo=new MemberDiaryCreationRepository(jdbc);
        var pages=new JdbcDiaryInitialPages(jdbc);
        try(var validation=Validation.buildDefaultValidatorFactory()) {
            var service=new MemberDiaryCreationService(repo,() -> 1,repo::insertOwner,pages,validation.getValidator(),Clock.systemUTC(),512);
            var tx=new TransactionTemplate(new DataSourceTransactionManager(dataSource));
            var result=tx.execute(s -> service.create(new DiaryCreateRequest("all references",null,null,null),selections));
            assertThat(result.pageIds()).hasSize(288).doesNotHaveDuplicates();
            assertThat(jdbc.queryForList("select t.code from pages p join page_templates t on p.template_id=t.template_id order by p.sort_key",String.class))
                .isEqualTo(selections.stream().map(DiaryInitialPages.Selection::templateCode).toList());
            assertThat(jdbc.queryForObject("select count(*) from pages where jsonb_typeof(template_config)='object' and version=1 and grid_visible=false",Long.class)).isEqualTo(288);
            assertThat(jdbc.queryForObject("select count(*) from pages where (template_config->>'blank')::boolean=true",Long.class)).isEqualTo(2);
        }
    }

    @Test void V27RegistersPlannerTemplatesAndMigratesReusableDailyPages() throws Exception {
        flyway("26").migrate();
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'owner','owner')");
        UUID diary=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,1,'planner','#123456','PLAIN','PRIVATE')",diary);

        UUID landscapeWithCode=UUID.randomUUID(), portraitWithCode=UUID.randomUUID(), landscapeWithoutCode=UUID.randomUUID();
        insertPage(diary,landscapeWithCode,"2026-reusable-daily-landscape","{\"templateCode\":\"2026-reusable-daily-landscape\",\"templateVersion\":\"1.0.0\",\"keep\":true}",7,1);
        insertPage(diary,portraitWithCode,"2026-reusable-daily-portrait","{\"templateCode\":\"2026-reusable-daily-portrait\",\"keep\":true}",11,2);
        insertPage(diary,landscapeWithoutCode,"2026-reusable-daily-landscape","{\"keep\":true}",3,3);
        jdbc.update("update pages set updated_at=timestamp '2000-01-01 00:00:00+00' where diary_id=?",diary);
        assertThat(runV27Preflight()).isEmpty();

        flyway("latest").migrate();

        // V9 288 + V27 플래너 4 + V34 원격 속지 2 + V36 여행 노선 2 + V45 발색 기록 4
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(300);
        assertThat(jdbc.queryForList("select code from page_templates where code in ('study-planner-landscape','study-planner-portrait','day-planner-landscape','day-planner-portrait') order by code",String.class))
            .containsExactly("day-planner-landscape","day-planner-portrait","study-planner-landscape","study-planner-portrait");
        assertPlannerTemplate("study-planner-landscape","STUDY","LANDSCAPE",1024,768,288);
        assertPlannerTemplate("study-planner-portrait","STUDY","PORTRAIT",768,1024,289);
        assertPlannerTemplate("day-planner-landscape","DAY","LANDSCAPE",1024,768,290);
        assertPlannerTemplate("day-planner-portrait","DAY","PORTRAIT",768,1024,291);
        // V34 원격 속지 2행(292 · 293) 다음에 V36 여행 노선 2행
        assertPlannerTemplate("route-planner-landscape","ROUTE","LANDSCAPE",1024,768,294);
        assertPlannerTemplate("route-planner-portrait","ROUTE","PORTRAIT",768,1024,295);
        // V36 뒤에 V45 발색 기록 4행(296~299) — 세로 둥근 · 세로 각진 · 가로 둥근 · 가로 각진 차례
        assertPlannerTemplate("2026-reusable-ink-record-round-portrait","INKRECORD","PORTRAIT",768,1024,296);
        assertPlannerTemplate("2026-reusable-ink-record-square-portrait","INKRECORD","PORTRAIT",768,1024,297);
        assertPlannerTemplate("2026-reusable-ink-record-round-landscape","INKRECORD","LANDSCAPE",1024,768,298);
        assertPlannerTemplate("2026-reusable-ink-record-square-landscape","INKRECORD","LANDSCAPE",1024,768,299);
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code in ('2026-reusable-daily-landscape','2026-reusable-daily-portrait')",Long.class)).isEqualTo(2);
        assertPageMigration(landscapeWithCode,"day-planner-landscape",8,"day-planner-landscape","1.0.0");
        assertPageMigration(portraitWithCode,"day-planner-portrait",12,"day-planner-portrait","1.0.0");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,landscapeWithoutCode)).isEqualTo(4L);
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,landscapeWithoutCode)).isEqualTo("day-planner-landscape");
        assertThat(jdbc.queryForObject("select template_config::text from pages where page_id=?",String.class,landscapeWithoutCode)).isEqualTo("{\"keep\": true}");
        assertThat(jdbc.queryForObject("select updated_at > timestamp '2000-01-01 00:00:00+00' from pages where page_id=?",Boolean.class,landscapeWithoutCode)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from page_template_v27_backups",Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select previous_template_config->>'templateCode' from page_template_v27_backups where page_id=?",String.class,landscapeWithCode)).isEqualTo("2026-reusable-daily-landscape");
        assertThat(jdbc.queryForObject("select jsonb_exists(previous_template_config, 'templateCode') from page_template_v27_backups where page_id=?",Boolean.class,landscapeWithoutCode)).isFalse();
        assertThat(jdbc.queryForObject("select previous_version from page_template_v27_backups where page_id=?",Long.class,portraitWithCode)).isEqualTo(11L);
        assertThat(jdbc.queryForObject("select previous_updated_at = timestamp '2000-01-01 00:00:00+00' from page_template_v27_backups where page_id=?",Boolean.class,portraitWithCode)).isTrue();
        jdbc.update("update pages set version=version+1 where page_id=?",landscapeWithoutCode);
        assertThat(runV27RollbackScript()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,landscapeWithCode)).isEqualTo("2026-reusable-daily-landscape");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,landscapeWithCode)).isEqualTo(7L);
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,landscapeWithoutCode)).isEqualTo("day-planner-landscape");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,landscapeWithoutCode)).isEqualTo(5L);
    }

    @Test void V34RegistersOneRemoteTemplatePerOrientationAndIsRepeatable() {
        flyway("latest").migrate();
        assertThat(jdbc.queryForList("select code||':'||category||':'||orientation||':'||canvas_width::int||'x'||canvas_height::int from page_templates where code like 'dio-remote-%' order by code",String.class))
            .containsExactly("dio-remote-landscape:REMOTE:LANDSCAPE:1024x768","dio-remote-portrait:REMOTE:PORTRAIT:768x1024");
        assertThat(jdbc.queryForObject("select default_config->>'blank' from page_templates where code='dio-remote-landscape'",String.class)).isEqualTo("false");
    }

    @Test void V35LinksPagesThatOnlyNamedTheirTemplateByCode() throws Exception {
        flyway("34").migrate();
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'owner','owner')");
        UUID diary=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,1,'added','#123456','PLAIN','PRIVATE')",diary);
        UUID byCode=UUID.randomUUID(), remote=UUID.randomUUID(), typo=UUID.randomUUID(), noVersion=UUID.randomUUID(), blank=UUID.randomUUID(), linked=UUID.randomUUID();
        // 편집기 "페이지 추가"로 만든 페이지: template_id 없이 설정의 코드 · 버전만 있다
        insertUnlinkedPage(diary,byCode,"{\"templateCode\":\"2026-cover-portrait\",\"templateVersion\":\"1.0.0\",\"keep\":true}",5,1);
        insertUnlinkedPage(diary,remote,"{\"templateCode\":\"dio-remote-portrait\",\"templateVersion\":\"1.0.0\",\"remoteTemplate\":\"spring-note\"}",2,2);
        // 맞는 행이 없거나 코드 · 버전이 다 없으면 건드리지 않는다
        insertUnlinkedPage(diary,typo,"{\"templateCode\":\"2026-cvoer-portrait\",\"templateVersion\":\"1.0.0\"}",3,3);
        insertUnlinkedPage(diary,noVersion,"{\"templateCode\":\"2026-cover-portrait\"}",4,4);
        insertUnlinkedPage(diary,blank,"{\"blank\":true}",6,5);
        // 캔버스 크기가 속지 행과 다르면 연결하지 않는다(세로 속지 코드인데 가로 크기)
        UUID wrongSize=UUID.randomUUID(), retired=UUID.randomUUID(), mixed=UUID.randomUUID();
        jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height,version) values(?,?,null,cast(? as jsonb),7,1024,768,1)",
            wrongSize,diary,"{\"templateCode\":\"2026-cover-portrait\",\"templateVersion\":\"1.0.0\"}");
        // 내려간(비활성) 속지만 있으면 그 행에 연결한다(만들 때는 쓰던 속지)
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values('retired-portrait','1.0.0','retired','CUSTOM','PORTRAIT',768,1024,'{}'::jsonb,false,998)");
        insertUnlinkedPage(diary,retired,"{\"templateCode\":\"retired-portrait\",\"templateVersion\":\"1.0.0\"}",1,8);
        // 이미 행에 연결된 페이지(다이어리 만들 때 생긴 페이지)도 그대로다
        insertPage(diary,linked,"2026-cover-landscape","{\"blank\":false}",9,6);
        // 같은 코드 · 버전에 활성 행과 비활성 행이 섞여 있으면 활성 행에 연결한다(서비스와 같은 기준)
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values('2026-cover-landscape','1.0.0','old copy','CUSTOM','LANDSCAPE',1024,768,'{}'::jsonb,false,997)");
        jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height,version) values(?,?,null,cast(? as jsonb),9,1024,768,1)",
            mixed,diary,"{\"templateCode\":\"2026-cover-landscape\",\"templateVersion\":\"1.0.0\"}");
        jdbc.update("update pages set updated_at=timestamp '2000-01-01 00:00:00+00' where diary_id=?",diary);

        flyway("latest").migrate();

        assertThat(jdbc.queryForObject("select t.code||'/'||t.template_version from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,byCode)).isEqualTo("2026-cover-portrait/1.0.0");
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,remote)).isEqualTo("dio-remote-portrait");
        // 설정은 옛 앱을 위해 그대로 두고, 구성원 앱이 다시 받도록 version · updated_at 만 올린다
        assertThat(jdbc.queryForObject("select template_config::text from pages where page_id=?",String.class,byCode)).isEqualTo("{\"keep\": true, \"templateCode\": \"2026-cover-portrait\", \"templateVersion\": \"1.0.0\"}");
        assertThat(jdbc.queryForObject("select template_config->>'remoteTemplate' from pages where page_id=?",String.class,remote)).isEqualTo("spring-note");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,byCode)).isEqualTo(6L);
        assertThat(jdbc.queryForObject("select updated_at > timestamp '2000-01-01 00:00:00+00' from pages where page_id=?",Boolean.class,byCode)).isTrue();
        assertThat(jdbc.queryForObject("select t.is_active from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",Boolean.class,retired)).isFalse();
        assertThat(jdbc.queryForObject("select t.is_active from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",Boolean.class,mixed)).isTrue();
        for(UUID untouched:List.of(typo,noVersion,blank,wrongSize)) {
            assertThat(jdbc.queryForObject("select template_id is null from pages where page_id=?",Boolean.class,untouched)).isTrue();
            assertThat(jdbc.queryForObject("select updated_at = timestamp '2000-01-01 00:00:00+00' from pages where page_id=?",Boolean.class,untouched)).isTrue();
        }
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,linked)).isEqualTo(9L);
        // 되돌리기용 기록: 연결한 두 페이지만, 이전 version · updated_at 과 함께
        assertThat(jdbc.queryForList("select previous_version from page_template_v35_links order by previous_version",Long.class)).containsExactly(1L,1L,2L,5L);
        assertThat(jdbc.queryForObject("select count(*) from page_template_v35_links where previous_updated_at = timestamp '2000-01-01 00:00:00+00'",Long.class)).isEqualTo(4L);

        // 되돌리기 스크립트: V35 뒤에 수정된 페이지(remote)는 건드리지 않고, 그대로인 페이지만 이전 상태로 돌린다
        jdbc.update("update pages set version=version+1 where page_id=?",remote);
        String rollback=Files.readString(docsFile("page-template-v35-rollback.sql")).replace("\r\n","\n");
        var transaction=Pattern.compile("(?ms)^\\s*BEGIN;\\s*$(.*?)^\\s*COMMIT;\\s*$").matcher(rollback);
        assertThat(transaction.find()).isTrue();
        assertThat(jdbc.update(transaction.group(1).strip())).isEqualTo(3);
        assertThat(jdbc.queryForObject("select template_id is null from pages where page_id=?",Boolean.class,byCode)).isTrue();
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,byCode)).isEqualTo(5L);
        assertThat(jdbc.queryForObject("select updated_at = timestamp '2000-01-01 00:00:00+00' from pages where page_id=?",Boolean.class,byCode)).isTrue();
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,remote)).isEqualTo("dio-remote-portrait");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,remote)).isEqualTo(4L);
    }

    @Test void deployCheckQueriesReturnNothingOnAFreshDatabase() throws Exception {
        flyway("latest").migrate();
        // 운영 배포 전에 실행할 확인 SQL(docs). 앱이 보내는 코드를 빠짐없이 담고, 마이그레이션만 한 DB 에서는 두 조회 모두 0행이어야 한다
        String sql=Files.readString(docsFile("다이어리 저장","속지 코드 배포 전 확인.sql")).replace("\r\n","\n");
        for(var row:contract.get("templates")) assertThat(sql).contains("('"+row.get("templateCode").asString()+"', '"+row.get("templateVersion").asString()+"')");
        for(var code:List.of("study-planner-landscape","study-planner-portrait","day-planner-landscape","day-planner-portrait","dio-remote-landscape","dio-remote-portrait","route-planner-landscape","route-planner-portrait")) assertThat(sql).contains("('"+code+"', '1.0.0')");
        var queries=java.util.Arrays.stream(sql.replaceAll("(?m)^--.*$","").split(";")).map(String::trim).filter(q->!q.isEmpty()).toList();
        assertThat(queries).hasSize(2);
        for(var query:queries) assertThat(jdbc.queryForList(query)).isEmpty();
        // 빈 속지 행이 내려가 있으면 1번 조회가 잡는다(중복만 보던 예전 조회는 놓쳤다)
        jdbc.update("update page_templates set is_active=false where code='dio-blank-portrait'");
        assertThat(jdbc.queryForList(queries.get(0))).singleElement().satisfies(row -> assertThat(row.get("code")).isEqualTo("dio-blank-portrait"));
    }

    @Test void everyTemplateCodeTheAppSendsHasExactlyOneActiveRow() {
        flyway("latest").migrate();
        // 페이지 추가는 설정의 코드 · 버전으로 활성 행을 정확히 하나 찾아야 저장된다(PageService.create). 앱이 보내는 코드가 빠지거나 겹치면 페이지 추가가 400이 된다
        var codes=new ArrayList<String>();
        for(var row:contract.get("templates")) codes.add(row.get("templateCode").asString()+"/"+row.get("templateVersion").asString());
        // V9 계약에는 앱이 빈 종이 페이지에 보내는 빈 속지 코드도 들어 있다(앱 목록과 계약은 프런트 server-template-catalog 테스트가 맞춘다)
        assertThat(codes).contains("dio-blank-landscape/1.0.0","dio-blank-portrait/1.0.0");
        for(var code:List.of("study-planner-landscape","study-planner-portrait","day-planner-landscape","day-planner-portrait","dio-remote-landscape","dio-remote-portrait","route-planner-landscape","route-planner-portrait",
            "2026-reusable-ink-record-round-portrait","2026-reusable-ink-record-square-portrait",
            "2026-reusable-ink-record-round-landscape","2026-reusable-ink-record-square-landscape")) codes.add(code+"/1.0.0");
        var active=jdbc.queryForList("select code||'/'||template_version from page_templates where is_active",String.class);
        for(var code:codes) assertThat(active.stream().filter(code::equals).count()).as(code).isEqualTo(1L);
        // 활성 행끼리 같은 코드 · 버전이 겹치지 않는다
        assertThat(jdbc.queryForObject("select count(*) from (select code,template_version from page_templates where is_active group by code,template_version having count(*)>1) duplicates",Long.class)).isZero();
    }

    private void insertUnlinkedPage(UUID diary,UUID page,String config,long version,int sortKey) {
        jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height,version) values(?,?,null,cast(? as jsonb),?,768,1024,?)",
            page,diary,config,sortKey,version);
    }

    @Test void V36SkipsARowThatAlreadyExistsWithTheSameGeometry() {
        flyway("35").migrate();
        // 운영자가 미리 넣어 둔(또는 앞선 배포가 남긴) 같은 코드 · 버전 · 규격의 행은 그대로 두고 그 방향만 건너뛴다
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values('route-planner-landscape','1.0.0','미리 넣은 여행 노선','ROUTE','LANDSCAPE',1024,768,'{}'::jsonb,true,999)");
        flyway("latest").migrate();
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code='route-planner-landscape'",Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select name from page_templates where code='route-planner-landscape'",String.class)).isEqualTo("미리 넣은 여행 노선");
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code='route-planner-portrait'",Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(300);
    }

    @Test void V36RejectsAnExistingRowWithConflictingGeometryAndLeavesNothingBehind() {
        flyway("35").migrate();
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values('route-planner-landscape','1.0.0','wrong size','ROUTE','LANDSCAPE',999,768,'{}'::jsonb,true,999)");
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class).hasMessageContaining("Conflicting page template geometry");
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='36' and success",Long.class)).isZero();
        // DO 블록은 한 트랜잭션이라 세로 행도 들어가지 않는다
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code='route-planner-portrait'",Long.class)).isZero();
    }

    @Test void V36RegistersOneTravelRouteTemplatePerOrientationAndIsRepeatable() {
        flyway("latest").migrate();
        assertThat(jdbc.queryForList("select code||':'||category||':'||orientation||':'||canvas_width::int||'x'||canvas_height::int from page_templates where code like 'route-planner-%' order by code",String.class))
            .containsExactly("route-planner-landscape:ROUTE:LANDSCAPE:1024x768","route-planner-portrait:ROUTE:PORTRAIT:768x1024");
        assertThat(jdbc.queryForObject("select default_config->>'blank' from page_templates where code='route-planner-portrait'",String.class)).isEqualTo("false");
        assertThat(jdbc.queryForObject("select name from page_templates where code='route-planner-landscape'",String.class)).isEqualTo("여행 노선");
    }

    @Test void V45RegistersOneInkRecordTemplatePerBottleAndOrientation() {
        flyway("latest").migrate();
        assertThat(jdbc.queryForList("select code||':'||category||':'||orientation||':'||canvas_width::int||'x'||canvas_height::int from page_templates where code like '2026-reusable-ink-record-%' order by code",String.class))
            .containsExactly("2026-reusable-ink-record-round-landscape:INKRECORD:LANDSCAPE:1024x768","2026-reusable-ink-record-round-portrait:INKRECORD:PORTRAIT:768x1024",
                "2026-reusable-ink-record-square-landscape:INKRECORD:LANDSCAPE:1024x768","2026-reusable-ink-record-square-portrait:INKRECORD:PORTRAIT:768x1024");
        assertThat(jdbc.queryForObject("select default_config->>'blank' from page_templates where code='2026-reusable-ink-record-round-portrait'",String.class)).isEqualTo("false");
        assertThat(jdbc.queryForObject("select name from page_templates where code='2026-reusable-ink-record-square-landscape'",String.class)).isEqualTo("발색 기록 · 각진 병");
    }

    @Test void V45SkipsARowThatAlreadyExistsWithTheSameGeometry() {
        flyway("44").migrate();
        // 운영자가 미리 넣어 둔(또는 앞선 배포가 남긴) 같은 코드 · 버전 · 규격의 행은 그대로 두고 그 병만 건너뛴다
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values('2026-reusable-ink-record-round-portrait','1.0.0','미리 넣은 발색 기록','INKRECORD','PORTRAIT',768,1024,'{}'::jsonb,true,999)");
        flyway("latest").migrate();
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code='2026-reusable-ink-record-round-portrait'",Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select name from page_templates where code='2026-reusable-ink-record-round-portrait'",String.class)).isEqualTo("미리 넣은 발색 기록");
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code like '2026-reusable-ink-record-%'",Long.class)).isEqualTo(4L);
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(300);
    }

    @Test void V45StopsWhenAMatchingRowIsInactiveSoPageAddCannotSilentlyBreak() {
        flyway("44").migrate();
        // 비활성 행만 있으면 건너뛰어도 활성 행이 0개가 되어 페이지 추가가 400 이 된다. 조용히 넘어가지 않는다.
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values('2026-reusable-ink-record-round-portrait','1.0.0','내려 둔 발색 기록','INKRECORD','PORTRAIT',768,1024,'{}'::jsonb,false,999)");
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class).hasMessageContaining("Inactive page template");
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='45' and success",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code like '2026-reusable-ink-record-%'",Long.class)).isEqualTo(1L);
    }

    @Test void V45RejectsAnExistingRowWithConflictingGeometryAndLeavesNothingBehind() {
        flyway("44").migrate();
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height,default_config,is_active,display_order)"
            + " values('2026-reusable-ink-record-round-portrait','1.0.0','wrong size','INKRECORD','PORTRAIT',999,1024,'{}'::jsonb,true,999)");
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class).hasMessageContaining("Conflicting page template geometry");
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='45' and success",Long.class)).isZero();
        // DO 블록은 한 트랜잭션이라 나머지 세 병도 들어가지 않는다
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code like '2026-reusable-ink-record-%'",Long.class)).isEqualTo(1L);
    }

    @Test void V27RejectsPageTemplateGeometryThatDoesNotMatchTheReplacement() throws Exception {
        flyway("26").migrate();
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'owner','owner')");
        UUID diary=UUID.randomUUID(), page=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,1,'planner','#123456','PLAIN','PRIVATE')",diary);
        insertPage(diary,page,"2026-reusable-daily-landscape","{}",1,1);
        jdbc.update("update page_templates set canvas_width=999 where code='2026-reusable-daily-landscape' and template_version='1.0.0'");
        assertThat(runV27Preflight()).singleElement().satisfies(row -> {
            assertThat(row.get("source_code")).isEqualTo("2026-reusable-daily-landscape");
            assertThat(row.get("expected_width")).isEqualTo(1024);
            assertThat(row.get("expected_height")).isEqualTo(768);
        });
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='27' and success",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code='day-planner-landscape'",Long.class)).isZero();
    }

    private void insertPage(UUID diary,UUID page,String templateCode,String config,long version,int sortKey) {
        jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height,version) "
                + "select ?,?,template_id,cast(? as jsonb),?,canvas_width,canvas_height,? from page_templates where code=? and template_version='1.0.0'",
            page,diary,config,sortKey,version,templateCode);
    }

    private void assertPageMigration(UUID page,String expectedCode,long expectedVersion,String configCode,String configVersion) {
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,page)).isEqualTo(expectedCode);
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,page)).isEqualTo(expectedVersion);
        assertThat(jdbc.queryForObject("select template_config->>'templateCode' from pages where page_id=?",String.class,page)).isEqualTo(configCode);
        assertThat(jdbc.queryForObject("select template_config->>'templateVersion' from pages where page_id=?",String.class,page)).isEqualTo(configVersion);
        assertThat(jdbc.queryForObject("select template_config->>'keep' from pages where page_id=?",String.class,page)).isEqualTo("true");
        assertThat(jdbc.queryForObject("select updated_at > timestamp '2000-01-01 00:00:00+00' from pages where page_id=?",Boolean.class,page)).isTrue();
    }

    private void assertPlannerTemplate(String code,String category,String orientation,int width,int height,int displayOrder) {
        var template=jdbc.queryForMap("select category,orientation,canvas_width,canvas_height,display_order,default_config->>'width' as config_width,default_config->>'height' as config_height,default_config->>'blank' as blank from page_templates where code=? and template_version='1.0.0'",code);
        assertThat(template.get("category")).isEqualTo(category);
        assertThat(template.get("orientation")).isEqualTo(orientation);
        assertThat(((Number)template.get("canvas_width")).intValue()).isEqualTo(width);
        assertThat(((Number)template.get("canvas_height")).intValue()).isEqualTo(height);
        assertThat(template.get("display_order")).isEqualTo(displayOrder);
        assertThat(template.get("config_width")).isEqualTo(String.valueOf(width));
        assertThat(template.get("config_height")).isEqualTo(String.valueOf(height));
        assertThat(template.get("blank")).isEqualTo("false");
    }

    /** V9 seed의 마지막 행이다. V27에서 덧붙인 계약 항목을 충돌 대상으로 쓰지 않는다. */
    private JsonNode lastV9Template() {
        var templates=contract.get("templates");
        assertThat(templates.size()).isEqualTo(288);
        return templates.get(templates.size()-1);
    }

    /** 문서의 BEGIN; … COMMIT; 사이 문장을 그대로 실행한다. 공백·줄바꿈(CRLF) 차이는 무시한다. */
    private int runV27RollbackScript() throws Exception {
        var transaction=Pattern.compile("(?ms)^\\s*BEGIN;\\s*$(.*?)^\\s*COMMIT;\\s*$").matcher(v27RollbackScript());
        assertThat(transaction.find()).as("rollback transaction block").isTrue();
        String body=transaction.group(1).strip();
        assertThat(body).startsWith("UPDATE pages page").doesNotContain("BEGIN;","COMMIT;");
        return jdbc.update(body);
    }

    private List<Map<String,Object>> runV27Preflight() throws Exception {
        String script=v27RollbackScript();
        int end=script.indexOf("-- Manual rollback for V27 page reassignment.");
        assertThat(end).isGreaterThan(0);
        return jdbc.queryForList(script.substring(0,end));
    }

    private String v27RollbackScript() throws Exception {
        return Files.readString(v27RollbackDocument()).replace("\r\n","\n");
    }

    /** CI mounts docs at /workspace/docs while local Gradle runs from backend/. */
    private Path v27RollbackDocument() {
        return docsFile("page-template-v27-rollback.sql");
    }

    /** docs 아래 파일. CI 는 docs 를 /workspace/docs 에 두고, 로컬 Gradle 은 backend/ 에서 돈다. 둘 다 아니면 위로 올라가며 저장소의 docs 를 찾는다 */
    private static Path docsFile(String... parts) {
        var candidates=new ArrayList<Path>(List.of(Path.of("docs",parts),Path.of("..").resolve(Path.of("docs",parts))));
        for(Path dir=Path.of("").toAbsolutePath();dir!=null;dir=dir.getParent()) candidates.add(dir.resolve(Path.of("docs",parts)));
        return candidates.stream().filter(Files::isRegularFile).findFirst()
            .orElseThrow(() -> new AssertionError("docs file is missing: "+String.join("/",parts)));
    }

    @Test void upgradePreservesExistingIdsCustomDefaultsInactiveStateOldVersionsAndHistoricalPages() throws Exception {
        var row=contract.get("templates").get(0);
        insertExisting(row,row.get("canvasWidth").asInt(),row.get("templateVersion").asString());
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height) values(?,'old-version','older','OLD','LANDSCAPE',100,100)",row.get("templateCode").asString());
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'old','old')");
        UUID diary=UUID.randomUUID(), page=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,1,'historical','#123456','PLAIN','PRIVATE')",diary);
        jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height) values(?,?,987,'{\"legacy\":true}'::jsonb,1,1280,800)",page,diary);
        flyway("latest").migrate();
        // 기존 1 + 예전 버전 1 + 나머지 V9 287 + V27 4 + V34 2 + V36 여행 노선 2 + V45 발색 기록 4
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(301);
        assertThat(jdbc.queryForObject("select template_id from page_templates where code=? and template_version=?",Long.class,row.get("templateCode").asString(),row.get("templateVersion").asString())).isEqualTo(987);
        assertThat(jdbc.queryForObject("select is_active from page_templates where template_id=987",Boolean.class)).isFalse();
        assertThat(jdbc.queryForObject("select name from page_templates where template_id=987",String.class)).isEqualTo("custom name");
        assertThat(jdbc.queryForObject("select default_config->'paperAppearance'->>'backgroundColor' from page_templates where template_id=987",String.class)).isEqualTo("#123456");
        assertThat(jdbc.queryForObject("select display_order from page_templates where template_id=987",Integer.class)).isEqualTo(999);
        assertThat(jdbc.queryForObject("select display_order from page_templates where code='study-planner-landscape'",Integer.class)).isEqualTo(1000);
        assertThat(jdbc.queryForObject("select canvas_width from pages where page_id=?",Integer.class,page)).isEqualTo(1280);
        assertThat(jdbc.queryForObject("select template_config->>'legacy' from pages where page_id=?",String.class,page)).isEqualTo("true");
        try(var stream=getClass().getResourceAsStream("/db/migration/V9__seed_page_template_catalog.sql")) {
            jdbc.execute(new String(stream.readAllBytes(),StandardCharsets.UTF_8));
        }
        // 기존 1 + 예전 버전 1 + 나머지 V9 287 + V27 4 + V34 2 + V36 여행 노선 2 + V45 발색 기록 4
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(301);
        assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isEqualTo(1);
    }

    @Test void conflictingExistingGeometryStopsUpgradeAndRollsBackAllEarlierSeedInserts() {
        var last=lastV9Template();
        insertExisting(last,42,last.get("templateVersion").asString());
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class);
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select canvas_width from page_templates where template_id=987",Integer.class)).isEqualTo(42);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='9'",Long.class)).isZero();
    }

    @Test void duplicateExistingCodeVersionStopsUpgradeWithoutDeletingEitherRecord() {
        var last=lastV9Template();
        insertExisting(last,last.get("canvasWidth").asInt(),last.get("templateVersion").asString());
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height) values(?,?,'duplicate','OLD',?,?,?)",
            last.get("templateCode").asString(),last.get("templateVersion").asString(),last.get("orientation").asString(),last.get("canvasWidth").asInt(),last.get("canvasHeight").asInt());
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class);
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='9'",Long.class)).isZero();
    }
}
