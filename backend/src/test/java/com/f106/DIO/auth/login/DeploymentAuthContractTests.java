package com.f106.DIO.auth.login;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.FileSystemResource;
import static org.assertj.core.api.Assertions.*;

class DeploymentAuthContractTests {
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
