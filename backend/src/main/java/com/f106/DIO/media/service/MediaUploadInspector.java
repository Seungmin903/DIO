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
		if (isAudioWebm(content)) return new FileKind(MediaType.AUDIO, "audio/webm", "webm");
		if (startsText(content, "OggS")) return new FileKind(MediaType.AUDIO, "audio/ogg", "ogg");
		if (startsText(content, "ID3") || isMp3Frame(content)) {
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
	private static boolean isMp3Frame(byte[] content) {
		if (content.length < 4 || (content[0] & 0xFF) != 0xFF || ((content[1] & 0xE0) != 0xE0)) return false;
		int version = (content[1] >> 3) & 0x03;
		int layer = (content[1] >> 1) & 0x03;
		int bitrate = (content[2] >> 4) & 0x0F;
		int sampleRate = (content[2] >> 2) & 0x03;
		return version != 0x01 && layer != 0 && bitrate != 0 && bitrate != 0x0F && sampleRate != 0x03;
	}
	private static boolean isAudioWebm(byte[] content) {
		if (!starts(content, 0x1A, 0x45, 0xDF, 0xA3) || !contains(content, "webm") || contains(content, new byte[] {(byte)0x83, (byte)0x81, 0x01})) return false;
		return contains(content, new byte[] {(byte)0x83, (byte)0x81, 0x02});
	}
	private static boolean contains(byte[] content, String text) { return contains(content, text.getBytes(java.nio.charset.StandardCharsets.US_ASCII)); }
	private static boolean contains(byte[] content, byte[] needle) {
		for (int index = 0; index <= content.length - needle.length; index++) {
			if (Arrays.equals(Arrays.copyOfRange(content, index, index + needle.length), needle)) return true;
		}
		return false;
	}
	private static boolean hasText(byte[] content, int offset, String text) {
		byte[] bytes = text.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
		return content.length >= offset + bytes.length && Arrays.equals(Arrays.copyOfRange(content, offset, offset + bytes.length), bytes);
	}

	record FileKind(MediaType mediaType, String mimeType, String extension) {}
}
