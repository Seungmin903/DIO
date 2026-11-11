package com.f106.DIO.auth.config;

import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.io.FileSystemResource;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

class AuthPasswordConfigTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(AuthPasswordConfig.class);

    @Test
    void defaultsToStrength12WhenNotConfigured() {
        // 운영·로컬 설정에는 강도 값을 두지 않으므로 코드 기본값 12가 그대로 쓰여야 한다.
        runner.run(context -> {
            PasswordEncoder encoder = context.getBean("authPasswordEncoder", PasswordEncoder.class);
            String hash = encoder.encode("DioMember123!");
            assertThat(hash).startsWith("$2a$12$");
            assertThat(encoder.matches("DioMember123!", hash)).isTrue();
        });
    }

    @Test
    void weakStrengthIsUsedOnlyWhenTestsAllowIt() {
        runner.withPropertyValues("dio.auth.bcrypt-strength=4", "dio.auth.bcrypt-allow-weak-for-tests=true").run(context -> {
            PasswordEncoder encoder = context.getBean("authPasswordEncoder", PasswordEncoder.class);
            assertThat(encoder.encode("DioMember123!")).startsWith("$2a$04$");
        });
    }

    @Test
    void weakStrengthWithoutTestAllowanceFailsStartup() {
        // 설정 실수(환경변수 등)로 약한 강도가 들어와도 운영에서 조용히 해시가 약해지지 않게 기동을 멈춘다
        for (String strength : new String[] {"4", "9"}) {
            runner.withPropertyValues("dio.auth.bcrypt-strength=" + strength).run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("allowed only in tests");
            });
        }
        runner.withPropertyValues("dio.auth.bcrypt-strength=10").run(context ->
                assertThat(context.getBean("authPasswordEncoder", PasswordEncoder.class).encode("x")).startsWith("$2a$10$"));
    }

    @Test
    void outOfRangeStrengthFailsStartupEvenInTests() {
        runner.withPropertyValues("dio.auth.bcrypt-strength=3", "dio.auth.bcrypt-allow-weak-for-tests=true")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void shippedConfigurationKeepsTheDefaultStrength() {
        // 테스트용 application.yml 이 운영 설정을 가리므로 배포되는 설정 파일(기본 · dev · local · prod)을 직접 읽는다.
        // 어느 프로필에서도 강도를 낮추거나 테스트 허용값을 켜면 안 된다
        for (String file : new String[] {"application.yml", "application-dev.yml", "application-local.yml", "application-prod.yml"}) {
            var yaml = new YamlPropertiesFactoryBean();
            yaml.setResources(new FileSystemResource("src/main/resources/" + file));
            Properties shipped = yaml.getObject();
            // YAML 의 숫자 · true/false 는 문자열이 아닌 값으로 담겨 getProperty 가 null 을 돌려주므로 get 으로 읽는다
            Object strength = shipped.get("dio.auth.bcrypt-strength");
            assertThat(strength == null || Integer.parseInt(String.valueOf(strength)) >= AuthPasswordConfig.DEFAULT_BCRYPT_STRENGTH).as(file).isTrue();
            assertThat(shipped.get("dio.auth.bcrypt-allow-weak-for-tests")).as(file).isNull();
        }
    }
}
