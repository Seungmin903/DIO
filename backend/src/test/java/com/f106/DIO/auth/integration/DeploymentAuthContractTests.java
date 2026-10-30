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
            assertThat(ci.getProperty(job + ".needs[0].optional")).isEqualTo(true);
            assertThat(ci.getProperty(job + ".allow_failure")).isNull();
        }
        for (String job : new String[]{"backend-postgres-auth-test", "backend-postgres-sharing-test", "backend-postgres-diary-test", "backend-postgres-lifecycle-test"}) {
            // develop 병합 후에는 백엔드 변경마다 배포 전에 반드시 실행한다.
            assertThat(ci.getProperty(job + ".rules[0].if")).isEqualTo("$CI_COMMIT_BRANCH == \"develop\"");
            assertThat(ci.getProperty(job + ".rules[0].changes[0]")).isEqualTo("backend/**/*");
            assertThat(ci.getProperty(job + ".rules[0].when")).isNull();
            // MR 자동 실행은 스키마와 PostgreSQL 검사 자체의 변경으로 한정한다.
            assertThat(ci.getProperty(job + ".rules[1].changes[0]")).isEqualTo("backend/src/main/resources/db/migration/**/*");
            assertThat(ci.getProperty(job + ".rules[1].changes[1]")).isEqualTo("infra/scripts/test-auth-postgres.sh");
            for (int i = 0; ci.getProperty(job + ".rules[1].changes[" + i + "]") != null; i++) {
                assertThat(ci.getProperty(job + ".rules[1].changes[" + i + "]").toString())
                    .satisfiesAnyOf(path -> assertThat(path).startsWith("infra/scripts/"),
                        path -> assertThat(path).isEqualTo("backend/src/main/resources/db/migration/**/*"),
                        path -> assertThat(path).startsWith("backend/src/test/java/"));
            }
            // 나머지 백엔드·CI 변경은 파이프라인을 막지 않는 수동 실행만 남긴다.
            assertThat(ci.getProperty(job + ".rules[2].changes[0]")).isEqualTo("backend/**/*");
            assertThat(ci.getProperty(job + ".rules[2].changes[1]")).isEqualTo(".gitlab-ci.yml");
            assertThat(ci.getProperty(job + ".rules[2].when")).isEqualTo("manual");
            assertThat(ci.getProperty(job + ".rules[2].allow_failure")).isEqualTo(true);
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
            assertThat(job).contains("infra/scripts/test-auth-postgres.sh");
        }
        assertThat(authJob).contains("backend/src/test/java/**/auth/**/*Postgres*.java",
            "backend/build/test-results/authPostgresTest/*.xml");
        assertThat(sharingJob).contains("backend/src/test/java/**/sharing/**/*Postgres*.java",
            "backend/build/test-results/sharingPostgresTest/*.xml", "backend/build/test-results/collaborationPostgresTest/*.xml");
        assertThat(diaryJob).contains("backend/src/test/java/**/diary/creation/**/*Postgres*.java",
            "backend/build/test-results/postgresMemberDiaryCreationTest/*.xml",
            "backend/build/test-results/postgresDiaryDetailTest/*.xml",
            "backend/build/test-results/postgresMemberDiaryHttpTest/*.xml");
        assertThat(lifecycleJob).contains("backend/src/test/java/**/diary/purge/**/*Postgres*.java",
            "backend/build/test-results/postgresDiaryTrashTest/*.xml",
            "backend/build/test-results/postgresDiaryPurgeTest/*.xml");

        String script = Files.readString(Path.of("../infra/scripts/test-auth-postgres.sh")).replace("\r\n", "\n");
        assertThat(script).contains("auth|sharing|diary|lifecycle|all", "trap cleanup EXIT", "--network \"container:$pg_name\"",
            "CREATE DATABASE dio_reset_qa", "authPostgresTest --no-daemon", "CREATE DATABASE dio_sharing_qa",
            "sharingPostgresTest collaborationPostgresTest --no-daemon", "CREATE DATABASE dio_member_ci",
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
        assertThat(sharingSuite).contains("-e DIO_SHARING_POSTGRES_URL=jdbc:postgresql://127.0.0.1:5432/dio_sharing_qa", "CREATE DATABASE dio_collaboration_qa", "DIO_COLLABORATION_POSTGRES_URL=jdbc:postgresql://127.0.0.1:5432/dio_collaboration_qa");
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
            int legacyCheck = ci.indexOf("bash infra/scripts/assert-no-legacy-photo-env.sh /home/gitlab-runner/dio-env/" + profile + ".env");
            assertThat(legacyCheck).isGreaterThanOrEqualTo(0).isLessThan(validation);
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
