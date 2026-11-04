package com.f106.DIO.auth.integration;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.FileSystemResource;
import static org.assertj.core.api.Assertions.*;

class DeploymentAuthContractTests {
    @Test void releaseDeploymentWaitsForBackendTestsAndRejectsReleaseOnlyMigrations() throws Exception {
        var loader = new YamlPropertySourceLoader();
        var ci = loader.load("ci", new FileSystemResource(Path.of("../.gitlab-ci.yml"))).get(0);
        assertThat(ci.getProperty("deploy-development.needs[0].job")).isNull();
        assertThat(ci.getProperty("deploy-development.variables.GIT_DEPTH")).isEqualTo("0");
        String text = Files.readString(Path.of("../.gitlab-ci.yml"));
        String deploy = block(text, "deploy-development:\n", "\ndeploy-production:");
        assertThat(deploy).contains("git fetch --no-tags origin +refs/heads/develop:refs/remotes/origin/develop",
            "Cannot fetch the current origin/develop", "bash infra/scripts/assert-shared-db-migrations.sh origin/develop HEAD",
            "logs --tail=200 backend");
        String guard = Files.readString(Path.of("../infra/scripts/assert-shared-db-migrations.sh"));
        assertThat(guard).contains("git diff --quiet \"$develop_ref\" \"$release_ref\"", "exit 1", "exit 2");
        String guardTest = Files.readString(Path.of("../infra/scripts/test-assert-shared-db-migrations.sh"));
        assertThat(guardTest).contains("expect_status 1 \"$guard\" develop HEAD", "expect_status 2 \"$guard\" missing-ref HEAD");
    }
    @Test void deploymentOriginsAndWebSocketProxyPreserveExternalPort() throws Exception {
        var loader = new YamlPropertySourceLoader();
        for (String environment : new String[]{"dev", "prod"}) {
            String origin = "https://k15f106.p.ssafy.io" + (environment.equals("dev") ? ":8443" : "");
            var compose = loader.load(environment, new FileSystemResource(Path.of("../infra/compose/compose." + environment + ".yml"))).get(0);
            String allowed = environment.equals("dev") ? origin + ",http://localhost:8081,http://127.0.0.1:8081" : origin;
            assertThat(compose.getProperty("services.backend.environment.AUTH_ALLOWED_ORIGINS").toString())
                .isEqualTo("${AUTH_ALLOWED_ORIGINS:-" + allowed + "}");
            assertThat(Files.readAllLines(Path.of("../infra/compose/" + environment + ".env.example")).stream()
                .filter(line -> line.startsWith("AUTH_ALLOWED_ORIGINS=")).toList())
                .containsExactly("AUTH_ALLOWED_ORIGINS=" + allowed);
            var profile = loader.load(environment, new FileSystemResource(Path.of("src/main/resources/application-" + environment + ".yml"))).get(0);
            assertThat(profile.getProperty("server.tomcat.remoteip.port-header")).isEqualTo("X-Forwarded-Port");
            String nginx = Files.readString(Path.of("../infra/nginx/" + environment + "/default.conf"));
            // Tomcat이 신뢰하는 포트 헤더는 모든 프록시 경로에서 덮어써 외부 입력을 통과시키지 않는다.
            assertThat(nginx.lines().filter(line -> line.contains("proxy_set_header X-Forwarded-Port ")).count())
                .isEqualTo(nginx.lines().filter(line -> line.contains("proxy_set_header X-Forwarded-Proto ")).count());
            String websocket = nginx.substring(nginx.indexOf("location /ws/ {"));
            websocket = websocket.substring(0, websocket.indexOf("\n    }"));
            assertThat(websocket).contains("proxy_set_header X-Forwarded-Port " + (environment.equals("dev") ? "8443" : "443") + ";", "proxy_set_header Host $http_host;", "proxy_set_header Upgrade $http_upgrade;", "proxy_set_header Connection \"upgrade\";");
        }
    }
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
            // develop 파이프라인은 변경 경로와 무관하게 배포 전에 반드시 실행한다(앞선 파이프라인 취소 대비).
            assertThat(ci.getProperty(job + ".rules[0].if")).isEqualTo("$CI_COMMIT_BRANCH == \"develop\"");
            assertThat(ci.getProperty(job + ".rules[0].changes[0]")).isNull();
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
        assertThat(sharingJob).contains("backend/src/test/java/**/sharing/**/*",
            "backend/build/test-results/sharingPostgresTest/*.xml", "backend/build/test-results/collaborationPostgresTest/*.xml");
        assertThat(diaryJob).contains("backend/src/test/java/**/diary/creation/**/*",
            "backend/build/test-results/postgresMemberDiaryCreationTest/*.xml",
            "backend/build/test-results/postgresDiaryDetailTest/*.xml",
            "backend/build/test-results/postgresMemberDiaryHttpTest/*.xml");
        assertThat(lifecycleJob).contains("backend/src/test/java/**/diary/purge/**/*",
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
        assertThat(diarySuite).containsSubsequence(
            "CREATE DATABASE dio_member_ci",
            "-v \"$CI_PROJECT_DIR/backend:/workspace/backend\"",
            "-v \"$CI_PROJECT_DIR/docs:/workspace/docs:ro\"",
            "postgresMemberDiaryCreationTest postgresDiaryDetailTest --no-daemon");
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
    /** MR 자동 실행 경로가 각 묶음이 실제로 돌리는 Gradle 필터 대상과 그 부모 테스트 클래스를 모두 덮는지 확인한다. */
    @Test void postgresMergeRequestPathsCoverEveryTestTheSuiteRuns() throws Exception {
        var ci = new YamlPropertySourceLoader().load("ci", new FileSystemResource(Path.of("../.gitlab-ci.yml"))).get(0);
        String gradle = Files.readString(Path.of("build.gradle")).replace("\r\n", "\n");
        String script = Files.readString(Path.of("../infra/scripts/test-auth-postgres.sh")).replace("\r\n", "\n");
        java.util.List<Path> testFiles;
        try (var files = Files.walk(Path.of("src/test/java"))) { testFiles = files.filter(f -> f.toString().endsWith(".java")).toList(); }
        for (String suite : new String[]{"auth", "sharing", "diary", "lifecycle"}) {
            var globs = new java.util.ArrayList<java.util.regex.Pattern>();
            for (int i = 0; ci.getProperty("backend-postgres-" + suite + "-test.rules[1].changes[" + i + "]") != null; i++) {
                globs.add(glob(ci.getProperty("backend-postgres-" + suite + "-test.rules[1].changes[" + i + "]").toString()));
            }
            String suiteScript = suite.equals("lifecycle") ? script.substring(script.indexOf("if [ \"$suite\" = lifecycle ]"))
                : block(script, "if [ \"$suite\" = " + suite + " ]", "\nfi\n");
            var tasks = new java.util.ArrayList<String>();
            var taskCalls = java.util.regex.Pattern.compile("gradlew ([\\w ]+?) --no-daemon").matcher(suiteScript);
            while (taskCalls.find()) tasks.addAll(java.util.List.of(taskCalls.group(1).trim().split(" +")));
            assertThat(tasks).as(suite + " gradle tasks").isNotEmpty();
            for (String task : tasks) {
                int start = gradle.indexOf("tasks.register('" + task + "'");
                assertThat(start).as(task + " task").isGreaterThanOrEqualTo(0);
                int end = gradle.indexOf("tasks.register(", start + 1);
                var includes = java.util.regex.Pattern.compile("includeTestsMatching '([^']+)'")
                    .matcher(gradle.substring(start, end < 0 ? gradle.length() : end));
                int matched = 0;
                while (includes.find()) {
                    var classPattern = java.util.regex.Pattern.compile(includes.group(1).replace(".", "/").replace("*", "[^/]*") + "\\.java");
                    for (Path file : testFiles) {
                        String relative = Path.of("src/test/java").relativize(file).toString().replace('\\', '/');
                        if (!classPattern.matcher(relative).matches()) continue;
                        matched++;
                        assertCovered(suite, globs, file);
                        // 같은 패키지의 부모 테스트 클래스가 바뀌어도 이 묶음의 결과가 달라진다.
                        var parent = java.util.regex.Pattern.compile("class \\w+ extends (\\w+)").matcher(Files.readString(file));
                        while (parent.find()) {
                            Path parentFile = file.resolveSibling(parent.group(1) + ".java");
                            if (Files.exists(parentFile)) assertCovered(suite, globs, parentFile);
                        }
                    }
                }
                assertThat(matched).as(task + " must include at least one test class").isPositive();
            }
        }
    }
    private static void assertCovered(String suite, java.util.List<java.util.regex.Pattern> globs, Path file) {
        String path = "backend/" + file.toString().replace('\\', '/');
        assertThat(globs.stream().anyMatch(glob -> glob.matcher(path).matches()))
            .as(suite + " MR auto-run paths must cover " + path).isTrue();
    }
    /** GitLab changes 글롭(**, *)을 정규식으로 바꾼다. */
    private static java.util.regex.Pattern glob(String glob) {
        var regex = new StringBuilder();
        for (int i = 0; i < glob.length(); i++) {
            char c = glob.charAt(i);
            if (glob.startsWith("**/", i)) { regex.append("(?:.*/)?"); i += 2; }
            else if (glob.startsWith("**", i)) { regex.append(".*"); i += 1; }
            else if (c == '*') regex.append("[^/]*");
            else regex.append(java.util.regex.Pattern.quote(String.valueOf(c)));
        }
        return java.util.regex.Pattern.compile(regex.toString());
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
