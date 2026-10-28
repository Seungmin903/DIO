package com.f106.DIO.auth.integration;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.FileSystemResource;
import static org.assertj.core.api.Assertions.*;

class DeploymentAuthContractTests {
    @Test void mailHealthIsDisabledAndPostgresValidationRunsAsRequiredCiJob() throws Exception {
        var loader = new YamlPropertySourceLoader();
        var application = loader.load("application", new FileSystemResource(Path.of("src/main/resources/application.yml"))).get(0);
        assertThat(application.getProperty("management.health.mail.enabled")).isEqualTo(false);
        var ci = loader.load("ci", new FileSystemResource(Path.of("../.gitlab-ci.yml"))).get(0);
        assertThat(ci.getProperty("backend-postgres-test.stage")).isEqualTo("quality");
        assertThat(ci.getProperty("backend-postgres-test.needs[0].job")).isEqualTo("backend-test");
        assertThat(ci.getProperty("backend-postgres-test.script[0]")).isEqualTo("bash infra/scripts/test-auth-postgres.sh");
        assertThat(ci.getProperty("backend-postgres-test.allow_failure")).isNull();
        String script = Files.readString(Path.of("../infra/scripts/test-auth-postgres.sh"));
        assertThat(script).contains("-e DIO_AUTH_SCHEMA_TEST=true", "--network \"container:$pg_name\"", "trap cleanup EXIT", "authPostgresTest postgresMemberDiaryCreationTest postgresDiaryDetailTest --no-daemon", "CREATE DATABASE dio_trash_qa", "-e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_trash_qa", "-e POSTGRES_USER=postgres", "-e DIO_LIST_QUERY_PG=true");
        assertThat(script.split("-e DB_URL=",-1)).hasSize(2);
    }
    @Test void ciContainerIncludesReadOnlyDeploymentInputsBesideBackend() throws Exception {
        var properties = new YamlPropertySourceLoader().load("ci",
            new FileSystemResource(Path.of("../.gitlab-ci.yml"))).get(0);
        assertThat(properties.getProperty("backend-test.script[0]").toString())
            .contains("-v \"$CI_PROJECT_DIR/backend:/workspace/backend\"",
                "-v \"$CI_PROJECT_DIR/infra:/workspace/infra:ro\"",
                "-v \"$CI_PROJECT_DIR/.gitlab-ci.yml:/workspace/.gitlab-ci.yml:ro\"",
                "-w /workspace/backend");
    }
    @Test void bothDeploymentManifestsInjectRequiredAuthSettingsAndProxiesOverwriteHeaders() throws Exception {
        for (String profile : new String[]{"dev", "prod"}) {
            var path = Path.of("../infra/compose/compose." + profile + ".yml");
            var properties = new YamlPropertySourceLoader().load(profile, new FileSystemResource(path)).get(0);
            for (String key : new String[]{"AUTH_JWT_SECRET", "SIGNUP_VERIFICATION_SECRET", "SIGNUP_MAIL_FROM",
                    "SPRING_MAIL_HOST", "SPRING_MAIL_USERNAME", "SPRING_MAIL_PASSWORD", "AUTH_TRUSTED_PROXY_REGEX"}) {
                assertThat(properties.getProperty("services.backend.environment." + key).toString())
                    .startsWith("${" + key + ":?").endsWith("}");
            }
            assertThat(properties.getProperty("services.backend.environment.SIGNUP_PHOTO_S3_BUCKET")).isNotNull();
            assertThat(properties.getProperty("services.backend.environment.SIGNUP_PHOTO_S3_REGION")).isNotNull();
            assertThat(properties.getProperty("services.backend.environment.SIGNUP_PHOTO_MIGRATE_LEGACY"))
                .isEqualTo("${SIGNUP_PHOTO_MIGRATE_LEGACY:-false}");
            String nginx = Files.readString(Path.of("../infra/nginx/" + profile + "/default.conf"));
            assertThat(nginx).contains("proxy_set_header X-Forwarded-For $remote_addr;")
                .doesNotContain("$proxy_add_x_forwarded_for");
        }
        var ci = Files.readString(Path.of("../.gitlab-ci.yml"));
        for (String profile : new String[]{"dev", "prod"}) {
            int validation = ci.indexOf("-f infra/compose/compose." + profile + ".yml config --quiet");
            int build = ci.indexOf("docker build --tag \"dio-backend:" + profile + "-");
            assertThat(validation).isGreaterThanOrEqualTo(0).isLessThan(build);
        }
    }
}
