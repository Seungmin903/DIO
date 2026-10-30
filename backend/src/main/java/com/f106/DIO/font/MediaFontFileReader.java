package com.f106.DIO.font;

import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.storage.MediaStorageException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import com.f106.DIO.diary.detail.DiaryDetailException;

/**
 * Reads shared font files through the configured media storage bean.
 * Returns a storage error when the bean or its read operation is unavailable.
 */
@Component
public class MediaFontFileReader implements FontFileReader {
    private static final Logger log = LoggerFactory.getLogger(MediaFontFileReader.class);
    private final MediaFiles files;
    public MediaFontFileReader(MediaFiles files) { this.files=files; }
    @Override public byte[] read(String storageKey) {
        try {
            return files.read(storageKey);
        } catch (MediaStorageException error) {
            if (error.status() == HttpStatus.NOT_FOUND)
                throw new DiaryDetailException(HttpStatus.NOT_FOUND,"FONT_NOT_FOUND","폰트를 찾을 수 없습니다.");
            log.warn("Font storage read failed: {}", error.code());
            throw unavailable();
        } catch (RuntimeException error) {
            log.warn("Font storage read failed: {}", error.getClass().getSimpleName());
            throw unavailable();
        }
    }
    private static DiaryDetailException unavailable() {
        return new DiaryDetailException(HttpStatus.SERVICE_UNAVAILABLE,"FONT_STORAGE_UNAVAILABLE","글꼴 저장소를 사용할 수 없어요.");
    }
}
