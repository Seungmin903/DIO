package com.f106.DIO.font;

import com.f106.DIO.diary.detail.DiaryDetailException;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.storage.MediaStorageException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MediaFontFileReaderTests {
    private final MediaFiles files = mock(MediaFiles.class);
    private final MediaFontFileReader reader = new MediaFontFileReader(files);

    @Test void delegatesToMediaStorage() {
        when(files.read("key")).thenReturn(new byte[]{1,2,3});
        assertThat(reader.read("key")).containsExactly(1,2,3);
    }
    @Test void missingObjectReturnsFontNotFound() {
        when(files.read("key")).thenThrow(MediaStorageException.missing());
        assertThatThrownBy(() -> reader.read("key")).isInstanceOfSatisfying(DiaryDetailException.class,
            e -> { assertThat(e.status().value()).isEqualTo(404); assertThat(e.code()).isEqualTo("FONT_NOT_FOUND"); });
    }
    @Test void storageFailuresDoNotExposeInternalDetails() {
        when(files.read("key")).thenThrow(new IllegalStateException("private key"));
        assertThatThrownBy(() -> reader.read("key")).isInstanceOfSatisfying(DiaryDetailException.class,
            e -> { assertThat(e.status().value()).isEqualTo(503); assertThat(e.code()).isEqualTo("FONT_STORAGE_UNAVAILABLE"); assertThat(e.getMessage()).doesNotContain("private"); });
        doThrow(MediaStorageException.unavailable()).when(files).read("key");
        assertThatThrownBy(() -> reader.read("key")).isInstanceOfSatisfying(DiaryDetailException.class,
            e -> assertThat(e.status().value()).isEqualTo(503));
    }
}
