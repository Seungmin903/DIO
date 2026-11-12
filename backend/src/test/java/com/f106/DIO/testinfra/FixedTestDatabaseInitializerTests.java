package com.f106.DIO.testinfra;

import java.util.Map;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class FixedTestDatabaseInitializerTests {
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class DatabaseProbe {
        @Bean(destroyMethod="close") HikariDataSource datasource(Environment environment) {
            var config=new HikariConfig();
            config.setJdbcUrl(environment.getRequiredProperty("spring.datasource.url"));
            config.setUsername("sa"); config.setPassword(""); config.setMaximumPoolSize(2);
            return new HikariDataSource(config);
        }
    }
    org.springframework.context.ConfigurableApplicationContext boot() {
        var app=new SpringApplicationBuilder(DatabaseProbe.class).web(WebApplicationType.NONE).profiles("test").build();
        // These tiny contexts test property initialization, without replacing/closing the test JVM's shared logger.
        app.setListeners(app.getListeners().stream()
            .filter(listener->!(listener instanceof org.springframework.boot.context.logging.LoggingApplicationListener)).toList());
        return app.run("--spring.main.banner-mode=off");
    }
    @Test void bootDiscoveryFixesTheUrlForEveryReadAndDatasourceBinding() {
        try(var context=boot()) {
            var environment=context.getEnvironment();
            var pool=context.getBean(HikariDataSource.class);
            String url=environment.getRequiredProperty("spring.datasource.url");
            assertThat(url).startsWith("jdbc:h2:mem:dio-test-").doesNotContain("${");
            assertThat(pool.getJdbcUrl()).isEqualTo(url);
            for(int i=0;i<20;i++)assertThat(environment.getProperty("spring.datasource.url")).isEqualTo(url);
            new FixedTestDatabaseInitializer().initialize(context);
            assertThat(environment.getProperty("spring.datasource.url")).isEqualTo(url);
            assertThat(new JdbcTemplate(pool).queryForObject("select 1",Integer.class)).isEqualTo(1);
        }
    }
    @Test void closingOneBootContextDoesNotEraseAnotherContextsDatabase() {
        try(var first=boot();var second=boot()) {
            assertThat(first.getEnvironment().getProperty("spring.datasource.url"))
                .isNotEqualTo(second.getEnvironment().getProperty("spring.datasource.url"));
            var a=new JdbcTemplate(first.getBean(HikariDataSource.class));
            var b=new JdbcTemplate(second.getBean(HikariDataSource.class));
            a.execute("create table context_marker(value_int int)"); a.update("insert into context_marker values(1)");
            b.execute("create table context_marker(value_int int)"); b.update("insert into context_marker values(2)");
            a.execute("drop all objects"); first.close();
            assertThat(b.queryForObject("select value_int from context_marker",Integer.class)).isEqualTo(2);
        }
    }
    @Test void explicitH2AndPostgresUrlsAreNeverOverridden() {
        for(String url:java.util.List.of("jdbc:h2:mem:existing-fixture;MODE=PostgreSQL","jdbc:postgresql://127.0.0.1:12345/disposable")) {
            try(var context=new GenericApplicationContext()) {
                context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("explicit",Map.of("spring.datasource.url",url)));
                new FixedTestDatabaseInitializer().initialize(context);
                assertThat(context.getEnvironment().getProperty("spring.datasource.url")).isEqualTo(url);
                assertThat(context.getEnvironment().getPropertySources().contains("fixedDefaultTestDatabase")).isFalse();
            }
        }
    }
}
