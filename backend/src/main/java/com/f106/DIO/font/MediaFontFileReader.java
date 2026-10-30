package com.f106.DIO.font;

import java.lang.reflect.InvocationTargetException;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import com.f106.DIO.diary.detail.DiaryDetailException;

/**
 * Reads shared font files through the configured media storage bean.
 * Returns a storage error when the bean or its read operation is unavailable.
 */
@Component
public class MediaFontFileReader implements FontFileReader {
    private final ListableBeanFactory beans;
    public MediaFontFileReader(ListableBeanFactory beans) { this.beans=beans; }
    @Override public byte[] read(String storageKey) {
        if (!beans.containsBean("mediaFiles")) throw unavailable();
        Object files=beans.getBean("mediaFiles");
        try {
            return (byte[])files.getClass().getMethod("read",String.class).invoke(files,storageKey);
        } catch (InvocationTargetException error) {
            Throwable cause=error.getCause();
            // Map a missing media storage object to the font API's not-found response.
            if (cause.getClass().getName().equals("com.f106.DIO.media.storage.MediaStorageException")) {
                try {
                    if (HttpStatus.NOT_FOUND.equals(cause.getClass().getMethod("status").invoke(cause)))
                        throw new DiaryDetailException(HttpStatus.NOT_FOUND,"FONT_NOT_FOUND","폰트를 찾을 수 없습니다.");
                } catch (ReflectiveOperationException ignored) { /* unavailable below */ }
            }
            throw unavailable();
        } catch (ReflectiveOperationException | ClassCastException error) { throw unavailable(); }
    }
    private static DiaryDetailException unavailable() {
        return new DiaryDetailException(HttpStatus.SERVICE_UNAVAILABLE,"FONT_STORAGE_UNAVAILABLE","글꼴 저장소를 사용할 수 없어요.");
    }
}
