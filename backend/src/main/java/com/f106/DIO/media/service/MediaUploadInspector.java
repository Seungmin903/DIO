package com.f106.DIO.media.service;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.support.MediaRequestException;

final class MediaUploadInspector {
	private MediaUploadInspector() {}

	static FileKind inspect(byte[] content) {
		if (isTtf(content)) { validateFontDirectory(content, false); return new FileKind(MediaType.FONT, "font/ttf", "ttf"); }
		if (isOtf(content)) { validateFontDirectory(content, true); return new FileKind(MediaType.FONT, "font/otf", "otf"); }
		if (starts(content, 0xFF, 0xD8, 0xFF)) return new FileKind(MediaType.IMAGE, "image/jpeg", "jpg");
		if (starts(content, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return new FileKind(MediaType.IMAGE, "image/png", "png");
		if (startsText(content, "GIF87a") || startsText(content, "GIF89a")) return new FileKind(MediaType.IMAGE, "image/gif", "gif");
		if (startsText(content, "RIFF") && hasText(content, 8, "WEBP")) return new FileKind(MediaType.IMAGE, "image/webp", "webp");
		if (startsText(content, "RIFF") && hasText(content, 8, "WAVE")) return new FileKind(MediaType.AUDIO, "audio/wav", "wav");
		if (startsText(content, "OggS")) return new FileKind(MediaType.AUDIO, "audio/ogg", "ogg");
		if (startsText(content, "ID3") || isMp3Frame(content)) {
			return new FileKind(MediaType.AUDIO, "audio/mpeg", "mp3");
		}
		if (isM4a(content)) return new FileKind(MediaType.AUDIO, "audio/mp4", "m4a");
		throw MediaRequestException.invalidFile();
	}

	static boolean isFontHeader(byte[] bytes) { return isTtf(bytes) || isOtf(bytes); }
	private static boolean isTtf(byte[] bytes) { return starts(bytes, 0x00, 0x01, 0x00, 0x00) || startsText(bytes, "true"); }
	private static boolean isOtf(byte[] bytes) { return startsText(bytes, "OTTO"); }

	// Bounded sfnt directory checks; these do not replace a full font parser.
	private static void validateFontDirectory(byte[] bytes, boolean otf) {
		if (bytes.length < 12) throw MediaRequestException.invalidFile();
		int tables = ((bytes[4] & 0xff) << 8) | (bytes[5] & 0xff);
		long directoryEnd = 12L + 16L * tables;
		if (tables < 1 || tables > 4096 || directoryEnd > bytes.length) throw MediaRequestException.invalidFile();
		Set<String> names = new HashSet<>(), nonempty = new HashSet<>();
		for (int i = 0; i < tables; i++) {
			int at = 12 + 16 * i;
			String name = new String(bytes, at, 4, java.nio.charset.StandardCharsets.ISO_8859_1);
			long offset = uint32(bytes, at + 8), length = uint32(bytes, at + 12);
			if (!names.add(name) || offset > bytes.length || length > bytes.length - offset || (length > 0 && offset < directoryEnd)) throw MediaRequestException.invalidFile();
			if (length > 0) nonempty.add(name);
		}
		if (!nonempty.containsAll(Set.of("head", "maxp", "cmap", "name", "hhea", "hmtx"))) throw MediaRequestException.invalidFile();
		if (otf ? !(nonempty.contains("CFF ") || nonempty.contains("CFF2")) : !(nonempty.contains("glyf") && nonempty.contains("loca"))) throw MediaRequestException.invalidFile();
	}
	private static long uint32(byte[] bytes, int at) {
		return ((long)(bytes[at] & 0xff) << 24) | ((long)(bytes[at + 1] & 0xff) << 16) | ((long)(bytes[at + 2] & 0xff) << 8) | (bytes[at + 3] & 0xffL);
	}
	private static boolean starts(byte[] content, int... values) {
		if (content.length < values.length) return false;
		for (int i = 0; i < values.length; i++) if ((content[i] & 0xFF) != values[i]) return false;
		return true;
	}
	private static boolean startsText(byte[] content, String text) { return hasText(content, 0, text); }
	/** ISO BMFF의 ftyp만으로는 HEIC·AVIF·MP4 영상과 M4A를 구분할 수 없다. */
	private static boolean isM4a(byte[] content) {
		return content.length >= 12 && hasText(content, 4, "ftyp")
			&& (hasText(content, 8, "M4A ") || hasText(content, 8, "M4B "));
	}
	private static boolean isMp3Frame(byte[] content) {
		if (content.length < 4 || (content[0] & 0xFF) != 0xFF || ((content[1] & 0xE0) != 0xE0)) return false;
		int version = (content[1] >> 3) & 0x03;
		int layer = (content[1] >> 1) & 0x03;
		int bitrate = (content[2] >> 4) & 0x0F;
		int sampleRate = (content[2] >> 2) & 0x03;
		return version != 0x01 && layer != 0 && bitrate != 0 && bitrate != 0x0F && sampleRate != 0x03;
	}
	private static boolean hasText(byte[] content, int offset, String text) {
		byte[] bytes = text.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
		return content.length >= offset + bytes.length && Arrays.equals(Arrays.copyOfRange(content, offset, offset + bytes.length), bytes);
	}

	record FileKind(MediaType mediaType, String mimeType, String extension) {}
}
