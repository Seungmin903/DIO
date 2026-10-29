package com.f106.DIO.media.library.domain;

import java.io.Serializable;
import java.util.UUID;

public class DiaryMediaLibraryId implements Serializable {
	private UUID diaryId;
	private UUID mediaFileId;

	public DiaryMediaLibraryId() {}
	public DiaryMediaLibraryId(UUID diaryId, UUID mediaFileId) {
		this.diaryId = diaryId;
		this.mediaFileId = mediaFileId;
	}

	@Override public boolean equals(Object other) {
		if (this == other) return true;
		if (!(other instanceof DiaryMediaLibraryId that)) return false;
		return java.util.Objects.equals(diaryId, that.diaryId) && java.util.Objects.equals(mediaFileId, that.mediaFileId);
	}
	@Override public int hashCode() { return java.util.Objects.hash(diaryId, mediaFileId); }
}
