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
        for (String job : new String[]{"backend-postgres-auth-test", "backend-postgres-sharing-test", "backend-postgres-diary-test", "backend-postgres-lifecycle-test"}) {
            assertThat(ci.getProperty(job + ".stage")).isEqualTo("quality");
            assertThat(ci.getProperty(job + ".needs[0].job")).isEqualTo("backend-test");
            assertThat(ci.getProperty(job + ".allow_failure")).isNull();
        }
        assertThat(ci.getProperty("backend-postgres-auth-test.script[0]")).isEqualTo("bash infra/scripts/test-auth-postgres.sh auth");
        assertThat(ci.getProperty("backend-postgres-sharing-test.script[0]")).isEqualTo("bash infra/scripts/test-auth-postgres.sh sharing");
        assertThat(ci.getProperty("backend-postgres-diary-test.script[0]")).isEqualTo("bash infra/scripts/test-auth-postgres.sh diary");
        assertThat(ci.getProperty("backend-postgres-lifecycle-test.script[0]")).isEqualTo("bash infra/scripts/test-auth-postgres.sh lifecycle");

        String ciText = Files.readString(Path.of("../.gitlab-ci.yml")).replace("\r\n", "\n");
        String authJob = block(ciText, "backend-postgres-auth-test:\n", "\nbackend-postgres-sharing-test:");
        String sharingJob = block(ciText, "backend-postgres-sharing-test:\n", "\nbackend-postgres-diary-test:");
        String diaryJob = block(ciText, "backend-postgres-diary-test:\n", "\nbackend-postgres-lifecycle-test:");
        String lifecycleJob = block(ciText, "backend-postgres-lifecycle-test:\n", "\nsecret-scan:");
        for (String job : new String[]{authJob, sharingJob, diaryJob, lifecycleJob}) {
            assertThat(job).contains("backend/src/test/resources/**/*", "backend/src/test/java/**/*Fixture.java",
                "backend/src/test/java/**/*Contract.java");
            // CI 설정만 바뀐 MR에서는 PostgreSQL 검사를 다시 돌리지 않는다.
            assertThat(job).doesNotContain("- .gitlab-ci.yml").contains("infra/scripts/test-auth-postgres.sh");
        }
        assertThat(authJob).contains("backend/build/test-results/authPostgresTest/*.xml");
        assertThat(sharingJob).contains("backend/src/main/java/**/sharing/**/*",
            "backend/build/test-results/sharingPostgresTest/*.xml");
        assertThat(diaryJob).contains("backend/src/main/java/**/diary/**/*",
            "backend/build/test-results/postgresMemberDiaryCreationTest/*.xml",
            "backend/build/test-results/postgresDiaryDetailTest/*.xml",
            "backend/build/test-results/postgresMemberDiaryHttpTest/*.xml");
        assertThat(lifecycleJob).contains("backend/src/main/java/**/page/**/*",
            "backend/build/test-results/postgresDiaryTrashTest/*.xml",
            "backend/build/test-results/postgresDiaryPurgeTest/*.xml");

        String script = Files.readString(Path.of("../infra/scripts/test-auth-postgres.sh")).replace("\r\n", "\n");
        assertThat(script).contains("auth|sharing|diary|lifecycle|all", "trap cleanup EXIT", "--network \"container:$pg_name\"",
            "CREATE DATABASE dio_reset_qa", "authPostgresTest --no-daemon", "CREATE DATABASE dio_sharing_qa",
            "sharingPostgresTest --no-daemon", "CREATE DATABASE dio_member_ci",
            "postgresMemberDiaryCreationTest postgresDiaryDetailTest --no-daemon", "CREATE DATABASE dio_member_contract_qa",
            "postgresMemberDiaryHttpTest --no-daemon", "CREATE DATABASE dio_trash_qa",
            "postgresDiaryTrashTest postgresDiaryPurgeTest --no-daemon", "-e DIO_AUTH_SCHEMA_TEST=true",
            "-e DIO_LIST_QUERY_PG=true", "-e POSTGRES_USER=postgres");

        String authSuite = block(script, "if [ \"$suite\" = auth ]", "if [ \"$suite\" = sharing ]");
        String sharingSuite = block(script, "if [ \"$suite\" = sharing ]", "if [ \"$suite\" = diary ]");
        String diarySuite = block(script, "if [ \"$suite\" = diary ]", "if [ \"$suite\" = lifecycle ]");
        String lifecycleSuite = script.substring(script.indexOf("if [ \"$suite\" = lifecycle ]"));
        assertThat(occurrences(authSuite, "docker run --rm")).isEqualTo(1);
        assertThat(authSuite).doesNotContain("-e DB_URL=");
        assertThat(occurrences(sharingSuite, "docker run --rm")).isEqualTo(1);
        assertThat(sharingSuite).doesNotContain("-e DB_URL=");
        assertThat(sharingSuite).contains("-e DIO_SHARING_POSTGRES_URL=jdbc:postgresql://127.0.0.1:5432/dio_sharing_qa");
        assertThat(occurrences(diarySuite, "docker run --rm")).isEqualTo(2);
        assertThat(occurrences(diarySuite, "-e DB_URL=")).isEqualTo(2);
        assertThat(diarySuite).contains("-e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_member_ci",
            "-e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_member_contract_qa");
        assertThat(occurrences(lifecycleSuite, "docker run --rm")).isEqualTo(1);
        assertThat(occurrences(lifecycleSuite, "-e DB_URL=")).isEqualTo(1);
        assertThat(lifecycleSuite).contains("-e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_trash_qa");
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
            // 프로필 사진은 미디어와 같은 MEDIA_* 저장소 설정만 본다.
            assertThat(properties.getProperty("services.backend.environment.MEDIA_S3_BUCKET"))
                .isEqualTo("${MEDIA_S3_BUCKET:?MEDIA_S3_BUCKET is required}");
            for (String removed : new String[]{"SIGNUP_PHOTO_STORAGE", "SIGNUP_PHOTO_S3_BUCKET", "SIGNUP_PHOTO_S3_REGION"}) {
                assertThat(properties.getProperty("services.backend.environment." + removed)).isNull();
            }
            assertThat(properties.getProperty("services.backend.environment.SIGNUP_PHOTO_MIGRATE_LEGACY"))
                .isEqualTo("${SIGNUP_PHOTO_MIGRATE_LEGACY:-false}");
            assertThat(properties.getProperty("services.backend.environment.SHARING_INVITE_SECRET"))
                .isEqualTo("${SHARING_INVITE_SECRET:-}");
            assertThat(properties.getProperty("services.backend.environment.SHARING_INVITE_BASE_URL"))
                .isEqualTo("${SHARING_INVITE_BASE_URL:-/invite/}");
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

    private static String block(String source, String start, String end) {
        int startIndex = source.indexOf(start);
        int endIndex = source.indexOf(end, startIndex);
        if (startIndex < 0 || endIndex < 0) throw new AssertionError("Expected CI block was not found: " + start);
        return source.substring(startIndex, endIndex);
    }

    private static int occurrences(String source, String value) {
        int count = 0;
        for (int index = 0; (index = source.indexOf(value, index)) >= 0; index += value.length()) count++;
        return count;
    }
}
