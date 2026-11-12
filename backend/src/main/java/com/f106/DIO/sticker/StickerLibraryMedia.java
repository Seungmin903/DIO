package com.f106.DIO.sticker;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.*;

/** 보관함 문서에 든 미디어 id. 미디어 정리(MediaReferenceSql)가 이 표를 참조로 보아 보관함 스티커 파일을 지우지 않는다. */
@Entity @Table(name = "user_sticker_library_media") @IdClass(StickerLibraryMedia.Key.class)
public class StickerLibraryMedia {
    @Id @Column(name = "user_id") private Long userId;
    @Id @Column(name = "media_file_id") private UUID mediaFileId;
    protected StickerLibraryMedia() {}
    public static class Key implements Serializable {
        public Long userId;
        public UUID mediaFileId;
        public Key() {}
        @Override public boolean equals(Object value) { return value instanceof Key key && Objects.equals(userId, key.userId) && Objects.equals(mediaFileId, key.mediaFileId); }
        @Override public int hashCode() { return Objects.hash(userId, mediaFileId); }
    }
}
