package com.f106.DIO.page.service;

import com.f106.DIO.collaboration.exception.CollaborationException;
import com.f106.DIO.page.domain.CanvasElement;
import com.f106.DIO.page.dto.CanvasElementCreateRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Called under the diary lock: two devices cannot reserve the same album slot. */
@Component
public class PhotoAlbumPlacement {
    public record PlacementSnapshot(String elementType, int albumSlot, BigDecimal x, BigDecimal y,
                                    BigDecimal width, BigDecimal height, BigDecimal rotation) {}

    private final ObjectMapper json;
    public PhotoAlbumPlacement(ObjectMapper json) { this.json = json; }
    public boolean candidate(CanvasElementCreateRequest request) { return "PHOTO".equals(request.getElementType()) && slot(request.getPropertiesJson()) >= 0; }
    public PlacementSnapshot snapshot(CanvasElement element) {
        return new PlacementSnapshot(element.getElementType(), slot(element.getPropertiesJson() == null ? null : read(element.getPropertiesJson())),
            element.getX(), element.getY(), element.getWidth(), element.getHeight(), element.getRotation());
    }

    /** Return true only when this update changes whether, or which, album slot the photo occupies. */
    public boolean changesAlbumPlacement(CanvasElement element, PlacementSnapshot before) {
        if (before == null || !"PHOTO".equals(element.getElementType()) || !"PHOTO".equals(before.elementType())) return false;
        return effectiveSlot(before) != effectiveSlot(snapshot(element));
    }

    public boolean[] occupied(String config, BigDecimal width, BigDecimal height, Supplier<List<CanvasElement>> existing) {
        if (!supports(config, width, height)) return null;
        boolean portrait = width.compareTo(new BigDecimal("768")) == 0 && height.compareTo(new BigDecimal("1024")) == 0;
        boolean[] taken = new boolean[6];
        for (var e : existing.get()) {
            if (!"PHOTO".equals(e.getElementType()) || e.getPropertiesJson() == null) continue;
            JsonNode props = read(e.getPropertiesJson());
            int index = slot(props);
            if (index >= 0 && matches(index, portrait, e.getX(), e.getY(), e.getWidth(), e.getHeight(), e.getRotation())) taken[index] = true;
        }
        return taken;
    }

    private boolean supports(String config, BigDecimal width, BigDecimal height) {
        if (!isAlbum(config) || width == null || height == null) return false;
        return width.compareTo(new BigDecimal("768")) == 0 && height.compareTo(new BigDecimal("1024")) == 0
            || width.compareTo(new BigDecimal("1024")) == 0 && height.compareTo(new BigDecimal("768")) == 0;
    }

    public void place(CanvasElementCreateRequest create, boolean portrait, boolean[] taken) {
        if (taken == null || !"PHOTO".equals(create.getElementType())) return;
        int requested = slot(create.getPropertiesJson());
        if (requested < 0 || !matches(requested, portrait, create.getX(), create.getY(), create.getWidth(), create.getHeight(), create.getRotation())) return;
        int selected = requested;
        if (taken[selected]) {
            selected = -1;
            for (int i = 0; i < taken.length; i++) if (!taken[i]) { selected = i; break; }
            if (selected < 0) throw new CollaborationException(HttpStatus.UNPROCESSABLE_ENTITY, "PHOTO_ALBUM_FULL", "사진 앨범 칸이 모두 채워졌어요. 사진을 기기에 보관했어요.");
            var props = (ObjectNode) create.getPropertiesJson().deepCopy();
            props.put("albumSlot", selected);
            create.setPropertiesJson(props);
            create.setX(x(selected, portrait));
            create.setY(y(selected, portrait));
        }
        taken[selected] = true;
    }

    public void ensureHistorySlots(String config, BigDecimal width, BigDecimal height, Supplier<List<CanvasElement>> existing,
                                   Map<String, com.f106.DIO.collaboration.domain.CanvasElementSnapshot> desired) {
        if (desired.values().stream().noneMatch(s -> s != null && s.deletedAt() == null && "PHOTO".equals(s.elementType()) && slot(s.propertiesJson()) >= 0)) return;
        boolean[] taken = occupied(config, width, height, () -> existing.get().stream().filter(e -> !desired.containsKey(e.getElementId().toString())).toList());
        if (taken == null) return;
        boolean portrait = width.compareTo(height) < 0;
        for (var s : desired.values()) {
            if (s == null || s.deletedAt() != null || !"PHOTO".equals(s.elementType())) continue;
            int index = slot(s.propertiesJson());
            if (index < 0 || !matches(index, portrait, s.x(), s.y(), s.width(), s.height(), s.rotation())) continue;
            if (taken[index]) throw CollaborationException.conflict();
            taken[index] = true;
        }
    }

    public void ensureRestoredSlots(String config, BigDecimal width, BigDecimal height, Supplier<List<CanvasElement>> existing, Set<UUID> restored) {
        if (restored.isEmpty()) return;
        if (!supports(config, width, height)) return;
        var rows = existing.get();
        boolean[] taken = occupied(config, width, height, () -> rows.stream().filter(e -> !restored.contains(e.getElementId())).toList());
        if (taken == null) return;
        boolean portrait = width.compareTo(height) < 0;
        for (var e : rows) {
            if (!restored.contains(e.getElementId()) || !"PHOTO".equals(e.getElementType())) continue;
            int index = slot(e.getPropertiesJson() == null ? null : read(e.getPropertiesJson()));
            if (index < 0 || !matches(index, portrait, e.getX(), e.getY(), e.getWidth(), e.getHeight(), e.getRotation())) continue;
            if (taken[index]) throw CollaborationException.conflict();
            taken[index] = true;
        }
    }

    public void ensureUpdatedSlots(String config, BigDecimal width, BigDecimal height, Supplier<List<CanvasElement>> existing,
                                   Map<UUID, PlacementSnapshot> changed) {
        if (changed.isEmpty()) return;
        if (!supports(config, width, height)) return;
        var rows = existing.get();
        boolean[] taken = occupied(config, width, height, () -> rows.stream().filter(e -> !changed.containsKey(e.getElementId())).toList());
        if (taken == null) return;
        boolean portrait = width.compareTo(height) < 0;
        for (var e : rows) {
            if (!changed.containsKey(e.getElementId()) || !"PHOTO".equals(e.getElementType())) continue;
            int index = slot(e.getPropertiesJson() == null ? null : read(e.getPropertiesJson()));
            if (index < 0 || !matches(index, portrait, e.getX(), e.getY(), e.getWidth(), e.getHeight(), e.getRotation())) continue;
            if (taken[index]) throw CollaborationException.conflict();
            taken[index] = true;
        }
    }

    private static int effectiveSlot(PlacementSnapshot value) {
        if (!"PHOTO".equals(value.elementType()) || value.albumSlot() < 0) return -1;
        int i = value.albumSlot();
        if (matches(i, true, value.x(), value.y(), value.width(), value.height(), value.rotation())
            || matches(i, false, value.x(), value.y(), value.width(), value.height(), value.rotation())) return i;
        return -1;
    }

    private JsonNode read(String value) { try { return json.readTree(value); } catch (Exception ignored) { return null; } }
    private boolean isAlbum(String config) { var node = config == null ? null : read(config); return node != null && "photo-album".equals(node.path("remoteTemplate").asText()); }
    private int slot(JsonNode node) { if (node == null || !node.isObject() || !node.path("albumSlot").isIntegralNumber()) return -1; int n = node.path("albumSlot").asInt(); return n >= 0 && n < 6 ? n : -1; }
    private static BigDecimal x(int i, boolean p) { return BigDecimal.valueOf(p ? new double[]{40,393}[i%2] : new double[]{40,360.7,681.3}[i%3]); }
    private static BigDecimal y(int i, boolean p) { return BigDecimal.valueOf(p ? new double[]{120,412.7,705.3}[i/2] : new double[]{120,431}[i/3]); }
    private static boolean close(BigDecimal a, BigDecimal b) { return a != null && a.subtract(b).abs().compareTo(BigDecimal.ONE) < 0; }
    private static boolean matches(int i, boolean p, BigDecimal x, BigDecimal y, BigDecimal w, BigDecimal h, BigDecimal rotation) {
        return close(x,x(i,p)) && close(y,y(i,p)) && close(w,BigDecimal.valueOf(p?335:302.7)) && close(h,BigDecimal.valueOf(p?232.7:251)) && (rotation == null || rotation.abs().compareTo(new BigDecimal("0.01")) < 0);
    }
}
