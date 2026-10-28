package com.f106.DIO.media.storage;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class MediaFiles {
	private final MediaStorage active;
	public MediaFiles(List<MediaStorage> stores, @Value("${dio.media.storage:local}") String provider) {
		Map<String, MediaStorage> byProvider = stores.stream().collect(Collectors.toMap(
			store -> store.provider().toUpperCase(Locale.ROOT), Function.identity()));
		active = byProvider.get(provider.toUpperCase(Locale.ROOT));
		if (active == null) throw new IllegalStateException("Unknown or unconfigured media storage");
	}
	public void put(String key, byte[] content, String contentType) { active.put(key, content, contentType); }
	public byte[] read(String key) { return active.read(key); }
	public void delete(String key) { active.delete(key); }
}
