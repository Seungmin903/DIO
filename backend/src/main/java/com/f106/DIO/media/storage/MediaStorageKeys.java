package com.f106.DIO.media.storage;

import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.UUID;
import com.f106.DIO.media.domain.MediaType;

public final class MediaStorageKeys {
	private MediaStorageKeys() {}
	public static String create(MediaType mediaType, String extension, UUID id) {
		YearMonth month = YearMonth.now(ZoneOffset.UTC);
		return "media/" + mediaType.name().toLowerCase(Locale.ROOT) + "/" + month.getYear() + "/"
			+ String.format(Locale.ROOT, "%02d", month.getMonthValue()) + "/" + id + "." + extension;
	}
	public static void validate(String key) {
		if (key == null || !key.matches("media/(image|audio|font)/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp|gif|mp3|m4a|wav|webm|ogg|ttf|otf|woff|woff2)")) {
			throw new IllegalArgumentException("Invalid media storage key");
		}
	}
}
