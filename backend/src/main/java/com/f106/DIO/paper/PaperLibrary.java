package com.f106.DIO.paper;

import java.time.Instant;
import jakarta.persistence.*;

/** 계정의 꾸미기 공방 내 속지 보관함(속지 목록 · 기본 속지 스타일 문서 한 벌). version 으로 여러 기기의 동시 저장을 막는다. */
@Entity @Table(name = "user_paper_libraries")
public class PaperLibrary {
    @Id @Column(name = "user_id") private Long userId;
    @Column(nullable = false) private long version;
    @Column(name = "document_json", nullable = false, columnDefinition = "text") private String documentJson;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected PaperLibrary() {}
    public PaperLibrary(Long userId, long version, String documentJson, Instant updatedAt) {
        this.userId = userId; this.version = version; this.documentJson = documentJson; this.updatedAt = updatedAt;
    }
}
