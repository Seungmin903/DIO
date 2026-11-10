package com.f106.DIO.tape;

import java.time.Instant;
import jakarta.persistence.*;

/** 계정의 꾸미기 공방 테이프 보관함(폴더 구성 문서 한 벌). version 으로 여러 기기의 동시 저장을 막는다. */
@Entity @Table(name = "user_tape_libraries")
public class TapeLibrary {
    @Id @Column(name = "user_id") private Long userId;
    @Column(nullable = false) private long version;
    @Column(name = "document_json", nullable = false, columnDefinition = "text") private String documentJson;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected TapeLibrary() {}
    public TapeLibrary(Long userId, long version, String documentJson, Instant updatedAt) {
        this.userId = userId; this.version = version; this.documentJson = documentJson; this.updatedAt = updatedAt;
    }
}
