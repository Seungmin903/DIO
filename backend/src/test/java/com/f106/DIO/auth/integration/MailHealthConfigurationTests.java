package com.f106.DIO.auth.integration;

import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.mail.autoconfigure.MailHealthContributorAutoConfiguration;
import org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration;
import org.springframework.boot.mail.health.MailHealthIndicator;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.io.FileSystemResource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 메일 서버(SMTP)가 죽어 있어도 /actuator/health 가 DOWN 이 되지 않는지 확인한다(예전 MailHealthIsolationTests 를 대신한다).
 * 테스트용 application.yml 이 운영 설정을 가리므로, 배포되는 설정(기본 + 프로필 파일)의 management 값을 직접 읽어
 * 메일 자동 설정만 띄운 가벼운 컨텍스트에 닫힌 SMTP(127.0.0.1:1)와 함께 넣는다. 전체 앱을 띄우는 스프링 테스트 컨텍스트는 늘리지 않는다.
 * health 응답 자체가 공개 · UP 인지는 SwaggerDocumentationTests.healthEndpointIsPublicAndUp 이 확인한다.
 */
class MailHealthConfigurationTests {

	private static final String[] CLOSED_SMTP = {"spring.mail.host=127.0.0.1", "spring.mail.port=1"};

	private final ApplicationContextRunner mail = new ApplicationContextRunner()
		.withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration.class, MailHealthContributorAutoConfiguration.class));

	/** 기본 application.yml 위에 프로필 파일을 덮은 값(스프링이 프로필을 켤 때와 같은 순서) */
	private static Properties shipped(String profile) {
		var yaml = new YamlPropertiesFactoryBean();
		var files = new ArrayList<FileSystemResource>(List.of(new FileSystemResource("src/main/resources/application.yml")));
		if (profile != null) files.add(new FileSystemResource("src/main/resources/application-" + profile + ".yml"));
		yaml.setResources(files.toArray(FileSystemResource[]::new));
		return yaml.getObject();
	}

	// YAML 의 true · false · 숫자는 문자열이 아닌 값으로 담기므로 getProperty · stringPropertyNames 로 읽으면 빠진다. 문자열로 바꿔 읽는다
	private static String value(Properties config, String key) {
		Object raw = config.get(key);
		return raw == null ? null : String.valueOf(raw);
	}

	private static List<String> keys(Properties config) {
		return config.keySet().stream().map(String::valueOf).toList();
	}

	private static String[] managementValues(Properties config) {
		return keys(config).stream().filter(key -> key.startsWith("management."))
			.map(key -> key + "=" + value(config, key)).toArray(String[]::new);
	}

	@ParameterizedTest(name = "{0}")
	@ValueSource(strings = {"default", "dev", "local", "prod"})
	void closedSmtpNeverReachesHealthWithShippedConfiguration(String profile) {
		Properties config = shipped("default".equals(profile) ? null : profile);
		mail.withPropertyValues(CLOSED_SMTP).withPropertyValues(managementValues(config)).run(context -> {
			// 메일 발송 빈은 그대로 뜨지만(가입 · 비밀번호 재설정 메일), 그 연결 상태를 health 에 넣는 검사는 없어야 한다
			assertThat(context).hasNotFailed();
			assertThat(context).doesNotHaveBean(MailHealthIndicator.class);
		});
		// health 가 공개돼 있어야 배포 대기가 상태를 본다(YAML 목록 · 쉼표 문자열 둘 다 읽는다)
		assertThat(value(config, "management.health.mail.enabled")).as(profile).isEqualTo("false");
		String exposed = String.join(",", keys(config).stream()
			.filter(key -> key.equals("management.endpoints.web.exposure.include") || key.startsWith("management.endpoints.web.exposure.include["))
			.map(key -> value(config, key)).toList());
		assertThat(List.of(exposed.split("\\s*,\\s*"))).as(profile).contains("health");
	}

	@Test
	void mailHealthWouldReportClosedSmtpAsDown() {
		// 위 검사가 헛돌지 않는지 확인: 메일 헬스를 켜면 같은 닫힌 SMTP 가 DOWN 으로 잡힌다
		mail.withPropertyValues(CLOSED_SMTP).withPropertyValues("management.health.mail.enabled=true").run(context -> {
			assertThat(context).hasSingleBean(MailHealthIndicator.class);
			assertThat(context.getBean(MailHealthIndicator.class).health().getStatus().getCode()).isEqualTo("DOWN");
		});
	}
}
