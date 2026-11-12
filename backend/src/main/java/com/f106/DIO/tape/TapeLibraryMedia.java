package com.f106.DIO.tape;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.*;

/** 테이프 보관함 문서에 든 미디어 id. 미디어 정리(MediaReferenceSql)가 이 표를 참조로 보아 보관함 테이프 사진을 지우지 않는다. */
@Entity @Table(name = "user_tape_library_media") @IdClass(TapeLibraryMedia.Key.class)
public class TapeLibraryMedia {
    @Id @Column(name = "user_id") private Long userId;
    @Id @Column(name = "media_file_id") private UUID mediaFileId;
    protected TapeLibraryMedia() {}
    public static class Key implements Serializable {
        public Long userId;
        public UUID mediaFileId;
        public Key() {}
        @Override public boolean equals(Object value) { return value instanceof Key key && Objects.equals(userId, key.userId) && Objects.equals(mediaFileId, key.mediaFileId); }
        @Override public int hashCode() { return Objects.hash(userId, mediaFileId); }
    }
}
