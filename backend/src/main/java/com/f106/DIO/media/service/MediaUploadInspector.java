package com.f106.DIO.media.service;

import java.util.Arrays;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.support.MediaRequestException;

final class MediaUploadInspector {
	private MediaUploadInspector() {}

	static FileKind inspect(byte[] content) {
		if (starts(content, 0xFF, 0xD8, 0xFF)) return new FileKind(MediaType.IMAGE, "image/jpeg", "jpg");
		if (starts(content, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return new FileKind(MediaType.IMAGE, "image/png", "png");
		if (startsText(content, "GIF87a") || startsText(content, "GIF89a")) return new FileKind(MediaType.IMAGE, "image/gif", "gif");
		if (startsText(content, "RIFF") && hasText(content, 8, "WEBP")) return new FileKind(MediaType.IMAGE, "image/webp", "webp");
		if (startsText(content, "RIFF") && hasText(content, 8, "WAVE")) return new FileKind(MediaType.AUDIO, "audio/wav", "wav");
		if (starts(content, 0x1A, 0x45, 0xDF, 0xA3)) return new FileKind(MediaType.AUDIO, "audio/webm", "webm");
		if (startsText(content, "OggS")) return new FileKind(MediaType.AUDIO, "audio/ogg", "ogg");
		if (startsText(content, "ID3") || (content.length > 1 && (content[0] & 0xFF) == 0xFF && ((content[1] & 0xE0) == 0xE0))) {
			return new FileKind(MediaType.AUDIO, "audio/mpeg", "mp3");
		}
		if (isM4a(content)) return new FileKind(MediaType.AUDIO, "audio/mp4", "m4a");
		throw MediaRequestException.invalidFile();
	}

	private static boolean starts(byte[] content, int... values) {
		if (content.length < values.length) return false;
		for (int i = 0; i < values.length; i++) if ((content[i] & 0xFF) != values[i]) return false;
		return true;
	}
	private static boolean startsText(byte[] content, String text) { return hasText(content, 0, text); }
	/** ISO BMFF의 ftyp만으로는 HEIC·AVIF·MP4 영상과 M4A를 구분할 수 없다. */
	private static boolean isM4a(byte[] content) { return content.length >= 12 && hasText(content, 4, "ftyp") && hasText(content, 8, "M4A "); }
	private static boolean hasText(byte[] content, int offset, String text) {
		byte[] bytes = text.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
		return content.length >= offset + bytes.length && Arrays.equals(Arrays.copyOfRange(content, offset, offset + bytes.length), bytes);
	}

	record FileKind(MediaType mediaType, String mimeType, String extension) {}
}
