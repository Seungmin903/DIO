package com.f106.DIO.cover;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.*;

/** 내 표지 보관함 문서에 든 미디어 id(표지 사진 · 표지 스티커). 미디어 정리(MediaReferenceSql)가 이 표를 참조로 보아 보관함 표지 그림을 지우지 않는다. */
@Entity @Table(name = "user_cover_library_media") @IdClass(CoverLibraryMedia.Key.class)
public class CoverLibraryMedia {
    @Id @Column(name = "user_id") private Long userId;
    @Id @Column(name = "media_file_id") private UUID mediaFileId;
    protected CoverLibraryMedia() {}
    public static class Key implements Serializable {
        public Long userId;
        public UUID mediaFileId;
        public Key() {}
        @Override public boolean equals(Object value) { return value instanceof Key key && Objects.equals(userId, key.userId) && Objects.equals(mediaFileId, key.mediaFileId); }
        @Override public int hashCode() { return Objects.hash(userId, mediaFileId); }
    }
}
