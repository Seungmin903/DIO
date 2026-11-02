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
        assertThat(stored).hasSize(292);
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

    @Test void V25RegistersPlannerTemplatesAndMigratesReusableDailyPages() throws Exception {
        flyway("24").migrate();
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'owner','owner')");
        UUID diary=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,1,'planner','#123456','PLAIN','PRIVATE')",diary);

        UUID landscapeWithCode=UUID.randomUUID(), portraitWithCode=UUID.randomUUID(), landscapeWithoutCode=UUID.randomUUID();
        insertPage(diary,landscapeWithCode,"2026-reusable-daily-landscape","{\"templateCode\":\"2026-reusable-daily-landscape\",\"templateVersion\":\"1.0.0\",\"keep\":true}",7,1);
        insertPage(diary,portraitWithCode,"2026-reusable-daily-portrait","{\"templateCode\":\"2026-reusable-daily-portrait\",\"keep\":true}",11,2);
        insertPage(diary,landscapeWithoutCode,"2026-reusable-daily-landscape","{\"keep\":true}",3,3);
        jdbc.update("update pages set updated_at=timestamp '2000-01-01 00:00:00+00' where diary_id=?",diary);
        assertThat(runV25Preflight()).isEmpty();

        flyway("latest").migrate();

        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(292);
        assertThat(jdbc.queryForList("select code from page_templates where code in ('study-planner-landscape','study-planner-portrait','day-planner-landscape','day-planner-portrait') order by code",String.class))
            .containsExactly("day-planner-landscape","day-planner-portrait","study-planner-landscape","study-planner-portrait");
        assertPlannerTemplate("study-planner-landscape","STUDY","LANDSCAPE",1024,768,288);
        assertPlannerTemplate("study-planner-portrait","STUDY","PORTRAIT",768,1024,289);
        assertPlannerTemplate("day-planner-landscape","DAY","LANDSCAPE",1024,768,290);
        assertPlannerTemplate("day-planner-portrait","DAY","PORTRAIT",768,1024,291);
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code in ('2026-reusable-daily-landscape','2026-reusable-daily-portrait')",Long.class)).isEqualTo(2);
        assertPageMigration(landscapeWithCode,"day-planner-landscape",8,"day-planner-landscape","1.0.0");
        assertPageMigration(portraitWithCode,"day-planner-portrait",12,"day-planner-portrait","1.0.0");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,landscapeWithoutCode)).isEqualTo(4L);
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,landscapeWithoutCode)).isEqualTo("day-planner-landscape");
        assertThat(jdbc.queryForObject("select template_config::text from pages where page_id=?",String.class,landscapeWithoutCode)).isEqualTo("{\"keep\": true}");
        assertThat(jdbc.queryForObject("select updated_at > timestamp '2000-01-01 00:00:00+00' from pages where page_id=?",Boolean.class,landscapeWithoutCode)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from page_template_v25_backups",Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select previous_template_config->>'templateCode' from page_template_v25_backups where page_id=?",String.class,landscapeWithCode)).isEqualTo("2026-reusable-daily-landscape");
        assertThat(jdbc.queryForObject("select jsonb_exists(previous_template_config, 'templateCode') from page_template_v25_backups where page_id=?",Boolean.class,landscapeWithoutCode)).isFalse();
        assertThat(jdbc.queryForObject("select previous_version from page_template_v25_backups where page_id=?",Long.class,portraitWithCode)).isEqualTo(11L);
        assertThat(jdbc.queryForObject("select previous_updated_at = timestamp '2000-01-01 00:00:00+00' from page_template_v25_backups where page_id=?",Boolean.class,portraitWithCode)).isTrue();
        jdbc.update("update pages set version=version+1 where page_id=?",landscapeWithoutCode);
        assertThat(runV25RollbackScript()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,landscapeWithCode)).isEqualTo("2026-reusable-daily-landscape");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,landscapeWithCode)).isEqualTo(7L);
        assertThat(jdbc.queryForObject("select t.code from pages p join page_templates t on t.template_id=p.template_id where p.page_id=?",String.class,landscapeWithoutCode)).isEqualTo("day-planner-landscape");
        assertThat(jdbc.queryForObject("select version from pages where page_id=?",Long.class,landscapeWithoutCode)).isEqualTo(5L);
    }

    @Test void V25RejectsPageTemplateGeometryThatDoesNotMatchTheReplacement() throws Exception {
        flyway("24").migrate();
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'owner','owner')");
        UUID diary=UUID.randomUUID(), page=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,1,'planner','#123456','PLAIN','PRIVATE')",diary);
        insertPage(diary,page,"2026-reusable-daily-landscape","{}",1,1);
        jdbc.update("update page_templates set canvas_width=999 where code='2026-reusable-daily-landscape' and template_version='1.0.0'");
        assertThat(runV25Preflight()).singleElement().satisfies(row -> {
            assertThat(row.get("source_code")).isEqualTo("2026-reusable-daily-landscape");
            assertThat(row.get("expected_width")).isEqualTo(1024);
            assertThat(row.get("expected_height")).isEqualTo(768);
        });
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='25' and success",Long.class)).isZero();
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

    /** V9 seed의 마지막 행이다. V25에서 덧붙인 계약 항목을 충돌 대상으로 쓰지 않는다. */
    private JsonNode lastV9Template() {
        var templates=contract.get("templates");
        assertThat(templates.size()).isEqualTo(288);
        return templates.get(templates.size()-1);
    }

    /** 문서의 BEGIN; … COMMIT; 사이 문장을 그대로 실행한다. 공백·줄바꿈(CRLF) 차이는 무시한다. */
    private int runV25RollbackScript() throws Exception {
        var transaction=Pattern.compile("(?ms)^\\s*BEGIN;\\s*$(.*?)^\\s*COMMIT;\\s*$").matcher(v25RollbackScript());
        assertThat(transaction.find()).as("rollback transaction block").isTrue();
        String body=transaction.group(1).strip();
        assertThat(body).startsWith("UPDATE pages page").doesNotContain("BEGIN;","COMMIT;");
        return jdbc.update(body);
    }

    private List<Map<String,Object>> runV25Preflight() throws Exception {
        String script=v25RollbackScript();
        int end=script.indexOf("-- Manual rollback for V25 page reassignment.");
        assertThat(end).isGreaterThan(0);
        return jdbc.queryForList(script.substring(0,end));
    }

    private String v25RollbackScript() throws Exception {
        return Files.readString(v25RollbackDocument()).replace("\r\n","\n");
    }

    /** CI mounts docs at /workspace/docs while local Gradle runs from backend/. */
    private Path v25RollbackDocument() {
        return List.of(
                Path.of("docs","page-template-v25-rollback.sql"),
                Path.of("..","docs","page-template-v25-rollback.sql"))
            .stream().filter(Files::isRegularFile).findFirst()
            .orElseThrow(() -> new AssertionError("V25 rollback document is missing"));
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
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(293);
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
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(293);
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
