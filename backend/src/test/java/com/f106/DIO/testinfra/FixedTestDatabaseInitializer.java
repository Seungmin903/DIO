package com.f106.DIO.testinfra;

import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;

/** Test-classpath only. Each default Boot test context owns one immutable H2 URL. */
public final class FixedTestDatabaseInitializer implements ApplicationContextInitializer<ConfigurableApplicationContext> {
    static final String DEFAULT_URL = "jdbc:h2:mem:dio-test-context;MODE=PostgreSQL";

    @Override public void initialize(ConfigurableApplicationContext context) {
        var environment = context.getEnvironment();
        // Explicit H2 fixtures and disposable PostgreSQL profiles keep their configured database.
        if (!DEFAULT_URL.equals(environment.getProperty("spring.datasource.url"))) return;
        String url = "jdbc:h2:mem:dio-test-" + UUID.randomUUID() + ";MODE=PostgreSQL";
        environment.getPropertySources().addFirst(new MapPropertySource("fixedDefaultTestDatabase",
            Map.of("spring.datasource.url", url)));
    }
}
