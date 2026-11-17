package com.f106.DIO.font;

import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "handwriting_font_generation_slots")
class FontGenerationSlot {
    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "generation_id", nullable = false, updatable = false)
    private UUID generationId;

    @Column(nullable = false)
    private boolean completed;

    protected FontGenerationSlot() {}

    FontGenerationSlot(long userId, UUID generationId) {
        this.userId = userId;
        this.generationId = generationId;
    }

    UUID generationId() { return generationId; }
    boolean completed() { return completed; }
    void complete() { completed = true; }
}
