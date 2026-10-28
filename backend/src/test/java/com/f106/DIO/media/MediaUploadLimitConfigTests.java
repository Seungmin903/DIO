package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.FileSystemResource;
import org.springframework.util.unit.DataSize;

/**
 * 테스트용 application.yml이 본 설정을 가리므로, 실제 배포 설정 파일을 직접 읽어 업로드 한도를 맞춘다.
 * 서비스가 허용하는 5MB 파일이 Spring multipart나 Nginx에서 먼저 거절되지 않아야 한다.
 */
class MediaUploadLimitConfigTests {
	private static final DataSize SERVICE_LIMIT = DataSize.ofMegabytes(5);

	@Test
	void multipartAndNginxLimitsAllowTheServiceUploadLimit() throws Exception {
		YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
		yaml.setResources(new FileSystemResource("src/main/resources/application.yml"));
		Properties properties = yaml.getObject();
		DataSize maxFile = DataSize.parse(properties.getProperty("spring.servlet.multipart.max-file-size"));
		DataSize maxRequest = DataSize.parse(properties.getProperty("spring.servlet.multipart.max-request-size"));

		assertThat(maxFile).isGreaterThanOrEqualTo(SERVICE_LIMIT);
		assertThat(maxRequest).isGreaterThan(maxFile);
		for (String profile : new String[] {"dev", "prod"}) {
			assertThat(nginxBodyLimit(Path.of("..", "infra", "nginx", profile, "default.conf")))
				.as("%s nginx client_max_body_size", profile).isGreaterThanOrEqualTo(maxRequest);
		}
	}

	private static DataSize nginxBodyLimit(Path conf) throws Exception {
		Matcher matcher = Pattern.compile("client_max_body_size\\s+(\\d+)([kKmM])\\s*;").matcher(Files.readString(conf));
		assertThat(matcher.find()).as("%s에 client_max_body_size가 있어야 한다", conf).isTrue();
		long value = Long.parseLong(matcher.group(1));
		return matcher.group(2).equalsIgnoreCase("m") ? DataSize.ofMegabytes(value) : DataSize.ofKilobytes(value);
	}
}
