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
 * 미디어 폰트 업로드와 나머지 경로에 각각 적용되는 Nginx 제한을 확인한다.
 */
class MediaUploadLimitConfigTests {
	private static final DataSize LARGE_UPLOAD_LIMIT = DataSize.ofMegabytes(25);
	private static final DataSize LARGE_UPLOAD_REQUEST_LIMIT = DataSize.ofMegabytes(26);
	private static final DataSize DEFAULT_REQUEST_LIMIT = DataSize.ofMegabytes(6);

	@Test
	void multipartAndNginxLimitsAllowTheServiceUploadLimit() throws Exception {
		YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
		yaml.setResources(new FileSystemResource("src/main/resources/application.yml"));
		Properties properties = yaml.getObject();
		DataSize maxFile = requiredSize(properties, "spring.servlet.multipart.max-file-size");
		DataSize maxRequest = requiredSize(properties, "spring.servlet.multipart.max-request-size");

		assertThat(maxFile).isEqualTo(LARGE_UPLOAD_LIMIT);
		assertThat(maxRequest).isEqualTo(LARGE_UPLOAD_REQUEST_LIMIT);
		for (String profile : new String[] {"dev", "prod"}) {
			Path conf = Path.of("..", "infra", "nginx", profile, "default.conf");
			String content = Files.readString(conf);
			Matcher location = Pattern.compile("location\\s*=\\s*/api/v1/media\\s*\\{([^{}]*)}", Pattern.DOTALL).matcher(content);
			assertThat(location.find()).as("%s media location", profile).isTrue();
			assertThat(nginxBodyLimit(location.group(1))).as("%s media request limit", profile).isGreaterThanOrEqualTo(maxRequest);
			String withoutMediaLocation = location.replaceFirst("");
			assertThat(nginxBodyLimit(withoutMediaLocation)).as("%s default request limit", profile).isEqualTo(DEFAULT_REQUEST_LIMIT);
		}
	}

	private static DataSize requiredSize(Properties properties, String key) {
		String value = properties.getProperty(key);
		assertThat(value).as("application.yml에 %s가 있어야 한다", key).isNotBlank();
		return DataSize.parse(value);
	}

	private static DataSize nginxBodyLimit(String content) {
		Matcher matcher = Pattern.compile("client_max_body_size\\s+(\\d+)([kKmM])\\s*;").matcher(content);
		assertThat(matcher.find()).as("client_max_body_size가 있어야 한다").isTrue();
		long value = Long.parseLong(matcher.group(1));
		return matcher.group(2).equalsIgnoreCase("m") ? DataSize.ofMegabytes(value) : DataSize.ofKilobytes(value);
	}
}
