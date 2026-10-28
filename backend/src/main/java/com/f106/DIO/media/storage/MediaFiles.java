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
		if (configured.equals("LOCAL") && environment.acceptsProfiles(Profiles.of("prod"))) {
			throw new IllegalStateException("Local media storage is not allowed in the production profile");
		}
		active = byProvider.get(configured);
		if (active == null) throw new IllegalStateException("Unknown or unconfigured media storage");
		if (configured.equals("LOCAL")) log.warn("Media files are using local storage; set MEDIA_STORAGE=s3 outside local development");
	}
	public void put(String key, byte[] content, String contentType) { active.put(key, content, contentType); }
	public byte[] read(String key) { return active.read(key); }
	public void delete(String key) { active.delete(key); }
}
