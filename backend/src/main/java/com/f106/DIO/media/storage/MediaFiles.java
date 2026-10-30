package com.f106.DIO.media.storage;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class MediaFiles {
	private static final Logger log = LoggerFactory.getLogger(MediaFiles.class);
	private final MediaStorage active;
	public MediaFiles(List<MediaStorage> stores, @Value("${dio.media.storage:local}") String provider, Environment environment) {
		Map<String, MediaStorage> byProvider = stores.stream().collect(Collectors.toMap(
			store -> store.provider().toUpperCase(Locale.ROOT), Function.identity()));
		String configured = provider.toUpperCase(Locale.ROOT);
		// 배포 서버의 컨테이너 디스크는 재배포·증설 시 사라지므로 로컬 저장소는 로컬 개발·테스트에서만 쓴다.
		if (configured.equals("LOCAL") && environment.acceptsProfiles(Profiles.of("prod | dev"))) {
			throw new IllegalStateException("Local media storage is not allowed in the dev or prod profile; set MEDIA_STORAGE=s3");
		}
		active = byProvider.get(configured);
		if (active == null) throw new IllegalStateException("Unknown or unconfigured media storage");
		if (configured.equals("LOCAL")) log.warn("Media files are using local storage; set MEDIA_STORAGE=s3 outside local development");
	}
	public void put(String key, byte[] content, String contentType) { active.put(key, content, contentType); }
	public byte[] read(String key) { return active.read(key); }
	public void delete(String key) { active.delete(key); }
}
