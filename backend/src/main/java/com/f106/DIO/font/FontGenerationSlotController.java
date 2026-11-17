package com.f106.DIO.font;

import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/handwriting-fonts/generation-slot")
public class FontGenerationSlotController {
    public record Update(@NotNull UUID generationId, @NotNull FontGenerationSlotService.Action action) {}

    private final FontGenerationSlotService service;

    public FontGenerationSlotController(FontGenerationSlotService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<FontGenerationSlotService.Slot> get(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.get(Long.parseLong(jwt.getSubject())));
    }

    @PutMapping
    public ResponseEntity<Void> put(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Update request) {
        service.update(Long.parseLong(jwt.getSubject()), request.generationId(), request.action());
        return ResponseEntity.noContent().build();
    }
}
