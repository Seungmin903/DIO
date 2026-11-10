package com.f106.DIO.palette;

import java.time.Instant;
import jakarta.persistence.*;

/** 계정의 꾸미기 공방 팔레트(도구별 고정 칸 문서 한 벌). version 으로 여러 기기의 동시 저장을 막는다. 읽기 · 쓰기는 PaletteService(JDBC)가 한다. */
@Entity @Table(name = "user_palettes")
public class UserPalette {
    @Id @Column(name = "user_id") private Long userId;
    @Column(nullable = false) private long version;
    @Column(name = "document_json", nullable = false, columnDefinition = "text") private String documentJson;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected UserPalette() {}
}
