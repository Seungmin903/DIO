package com.f106.DIO.diary.creation;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Properties;
import java.util.UUID;

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

/** V6→V9 실제 데이터 보존 및 프런트가 생성한 Selection 계약을 제품 페이지 모듈에 적용한다. */
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

    @Test void freshUpgradeRegistersEveryReferenceAndCreatesAll288PagesWithTheProductModule() {
        flyway("latest").migrate();
        var templates=contract.get("templates");
        var stored=jdbc.queryForList("select code,template_version,orientation,canvas_width,canvas_height from page_templates");
        assertThat(stored).hasSize(288);
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

    @Test void upgradePreservesExistingIdsCustomDefaultsInactiveStateOldVersionsAndHistoricalPages() throws Exception {
        var row=contract.get("templates").get(0);
        insertExisting(row,row.get("canvasWidth").asInt(),row.get("templateVersion").asString());
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height) values(?,'old-version','older','OLD','LANDSCAPE',100,100)",row.get("templateCode").asString());
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'old','old')");
        UUID diary=UUID.randomUUID(), page=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,1,'historical','#123456','PLAIN','PRIVATE')",diary);
        jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height) values(?,?,987,'{\"legacy\":true}'::jsonb,1,1280,800)",page,diary);
        flyway("latest").migrate();
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(289);
        assertThat(jdbc.queryForObject("select template_id from page_templates where code=? and template_version=?",Long.class,row.get("templateCode").asString(),row.get("templateVersion").asString())).isEqualTo(987);
        assertThat(jdbc.queryForObject("select is_active from page_templates where template_id=987",Boolean.class)).isFalse();
        assertThat(jdbc.queryForObject("select name from page_templates where template_id=987",String.class)).isEqualTo("custom name");
        assertThat(jdbc.queryForObject("select default_config->'paperAppearance'->>'backgroundColor' from page_templates where template_id=987",String.class)).isEqualTo("#123456");
        assertThat(jdbc.queryForObject("select display_order from page_templates where template_id=987",Integer.class)).isEqualTo(999);
        assertThat(jdbc.queryForObject("select canvas_width from pages where page_id=?",Integer.class,page)).isEqualTo(1280);
        assertThat(jdbc.queryForObject("select template_config->>'legacy' from pages where page_id=?",String.class,page)).isEqualTo("true");
        try(var stream=getClass().getResourceAsStream("/db/migration/V9__seed_page_template_catalog.sql")) {
            jdbc.execute(new String(stream.readAllBytes(),StandardCharsets.UTF_8));
        }
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(289);
        assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isEqualTo(1);
    }

    @Test void conflictingExistingGeometryStopsUpgradeAndRollsBackAllEarlierSeedInserts() {
        var templates=contract.get("templates"); var last=templates.get(templates.size()-1);
        insertExisting(last,42,last.get("templateVersion").asString());
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class);
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select canvas_width from page_templates where template_id=987",Integer.class)).isEqualTo(42);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='9'",Long.class)).isZero();
    }

    @Test void duplicateExistingCodeVersionStopsUpgradeWithoutDeletingEitherRecord() {
        var templates=contract.get("templates"); var last=templates.get(templates.size()-1);
        insertExisting(last,last.get("canvasWidth").asInt(),last.get("templateVersion").asString());
        jdbc.update("insert into page_templates(code,template_version,name,category,orientation,canvas_width,canvas_height) values(?,?,'duplicate','OLD',?,?,?)",
            last.get("templateCode").asString(),last.get("templateVersion").asString(),last.get("orientation").asString(),last.get("canvasWidth").asInt(),last.get("canvasHeight").asInt());
        assertThatThrownBy(() -> flyway("latest").migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class);
        assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='9'",Long.class)).isZero();
    }
}
