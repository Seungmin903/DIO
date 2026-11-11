package com.f106.DIO.collaboration;

import com.f106.DIO.page.service.PhotoAlbumPlacement;
import com.f106.DIO.page.domain.CanvasElement;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PhotoAlbumGeometryTests {
    @Test void nonAlbumPagesDoNotLoadElementsForSlotChecks() {
        var placement = new PhotoAlbumPlacement(tools.jackson.databind.json.JsonMapper.builder().build());
        var id = UUID.randomUUID();
        var changed = Map.of(id, new PhotoAlbumPlacement.PlacementSnapshot("PHOTO", 0,
            new BigDecimal("40"), new BigDecimal("120"), new BigDecimal("335"), new BigDecimal("232.7"), BigDecimal.ZERO));
        var loaded = new AtomicBoolean();
        java.util.function.Supplier<List<CanvasElement>> rows = () -> { loaded.set(true); return List.of(); };
        placement.ensureUpdatedSlots("{}", new BigDecimal("768"), new BigDecimal("1024"), rows, changed);
        placement.ensureRestoredSlots("{}", new BigDecimal("768"), new BigDecimal("1024"), rows, Set.of(id));
        assertThat(loaded).isFalse();
    }

    @Test void serverSlotGeometryMatchesBothAlbumSvgAssets() throws Exception {
        var x = PhotoAlbumPlacement.class.getDeclaredMethod("x", int.class, boolean.class);
        var y = PhotoAlbumPlacement.class.getDeclaredMethod("y", int.class, boolean.class);
        var matches = PhotoAlbumPlacement.class.getDeclaredMethod("matches", int.class, boolean.class,
            BigDecimal.class, BigDecimal.class, BigDecimal.class, BigDecimal.class, BigDecimal.class);
        x.setAccessible(true); y.setAccessible(true); matches.setAccessible(true);
        var rect = Pattern.compile("<rect x=\"([\\d.]+)\" y=\"([\\d.]+)\" width=\"([\\d.]+)\" height=\"([\\d.]+)\" fill=\"none\" stroke=\"#aeb3b8\"");
        for (boolean portrait : new boolean[]{true, false}) {
            var path = Path.of("..", "frontend", "remote-content", "templates", "photo-album", "photo-album-" + (portrait ? "portrait" : "landscape") + ".svg");
            var found = rect.matcher(Files.readString(path));
            int index = 0;
            while (found.find()) {
                var sx = new BigDecimal(found.group(1)); var sy = new BigDecimal(found.group(2));
                var width = new BigDecimal(found.group(3)); var height = new BigDecimal(found.group(4));
                assertThat((BigDecimal)x.invoke(null, index, portrait)).isEqualByComparingTo(sx);
                assertThat((BigDecimal)y.invoke(null, index, portrait)).isEqualByComparingTo(sy);
                assertThat((Boolean)matches.invoke(null, index, portrait, sx, sy, width, height, BigDecimal.ZERO)).isTrue();
                index++;
            }
            assertThat(index).isEqualTo(6);
        }
    }
}
