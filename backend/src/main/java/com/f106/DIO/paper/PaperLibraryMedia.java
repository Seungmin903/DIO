package com.f106.DIO.paper;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.*;

/** 내 속지 보관함 문서에 든 미디어 id(PDF 쪽 그림). 미디어 정리(MediaReferenceSql)가 이 표를 참조로 보아 보관함 속지 그림을 지우지 않는다. */
@Entity @Table(name = "user_paper_library_media") @IdClass(PaperLibraryMedia.Key.class)
public class PaperLibraryMedia {
    @Id @Column(name = "user_id") private Long userId;
    @Id @Column(name = "media_file_id") private UUID mediaFileId;
    protected PaperLibraryMedia() {}
    public static class Key implements Serializable {
        public Long userId;
        public UUID mediaFileId;
        public Key() {}
        @Override public boolean equals(Object value) { return value instanceof Key key && Objects.equals(userId, key.userId) && Objects.equals(mediaFileId, key.mediaFileId); }
        @Override public int hashCode() { return Objects.hash(userId, mediaFileId); }
    }
}
