package com.f106.DIO.font;

import java.util.UUID;
import jakarta.persistence.EntityManager;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FontGenerationSlotService {
    public enum Action { RESERVE, COMPLETE, RELEASE }
    public record Slot(UUID generationId, boolean completed) {}

    private final EntityManager entities;
    private final UserRepository users;

    public FontGenerationSlotService(EntityManager entities, UserRepository users) {
        this.entities = entities;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Slot get(long userId) {
        users.findById(userId).filter(user -> user.isActive()).orElseThrow(FontGenerationSlotService::relogin);
        var slot = entities.find(FontGenerationSlot.class, userId);
        return slot == null ? new Slot(null, false) : new Slot(slot.generationId(), slot.completed());
    }

    @Transactional
    public void update(long userId, UUID generationId, Action action) {
        // Serialize reservations, completion and withdrawal for this account.
        users.findForUpdate(userId).filter(user -> user.isActive()).orElseThrow(FontGenerationSlotService::relogin);
        var slot = entities.find(FontGenerationSlot.class, userId);
        boolean matches = slot != null && generationId.equals(slot.generationId());
        switch (action) {
            case RESERVE -> {
                if (slot == null) {
                    entities.persist(new FontGenerationSlot(userId, generationId));
                } else if (!matches) {
                    throw new UserException(HttpStatus.CONFLICT, "FONT_GENERATION_LIMIT", "한 계정에서 손글씨 폰트는 1개까지 만들 수 있어요.");
                }
            }
            case COMPLETE -> {
                if (!matches) {
                    throw new UserException(HttpStatus.CONFLICT, "FONT_GENERATION_SLOT_LOST", "이 폰트의 생성 자리를 확인할 수 없어요.");
                }
                slot.complete();
            }
            case RELEASE -> {
                if (matches && !slot.completed()) {
                    entities.remove(slot);
                }
            }
        }
    }

    private static UserException relogin() {
        return new UserException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "다시 로그인해 주세요.");
    }
}
