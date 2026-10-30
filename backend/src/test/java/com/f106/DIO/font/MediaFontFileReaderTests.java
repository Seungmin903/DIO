package com.f106.DIO.font;

import com.f106.DIO.diary.detail.DiaryDetailException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class MediaFontFileReaderTests {
    @TempDir Path directory;
    public static class Store {
        public byte[] read(String key) { if(key.equals("fail"))throw new IllegalStateException("private key");return new byte[]{1,2,3}; }
    }
    @Test void absentOrIncompatibleMediaModuleFailsClosed() {
        var beans=new DefaultListableBeanFactory();var reader=new MediaFontFileReader(beans);
        assertThatThrownBy(()->reader.read("private-key")).isInstanceOfSatisfying(DiaryDetailException.class,e->assertThat(e.status().value()).isEqualTo(503));
        beans.registerSingleton("mediaFiles",new Object());
        assertThatThrownBy(()->reader.read("private-key")).isInstanceOfSatisfying(DiaryDetailException.class,e->assertThat(e.code()).isEqualTo("FONT_STORAGE_UNAVAILABLE"));
    }
    @Test void delegatesOnlyToStorageAndDoesNotExposeStorageExceptions() {
        var beans=new DefaultListableBeanFactory();beans.registerSingleton("mediaFiles",new Store());var reader=new MediaFontFileReader(beans);
        assertThat(reader.read("safe")).containsExactly(1,2,3);
        assertThatThrownBy(()->reader.read("fail")).isInstanceOfSatisfying(DiaryDetailException.class,e->{assertThat(e.status().value()).isEqualTo(503);assertThat(e.getMessage()).doesNotContain("private");});
    }
    @Test void integratesWithExactMr191StorageSourcesWhenProvided() throws Exception {
        Class<?> store;
        try { store=Class.forName("com.f106.DIO.media.storage.LocalMediaStorage"); }
        catch(ClassNotFoundException absent) { org.junit.jupiter.api.Assumptions.abort("MR !191 sources absent; run build/font-media191.init.gradle integration check");return; }
        var local=store.getConstructor(String.class).newInstance(directory.toString());
        String key="media/font/2026/10/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.ttf";
        store.getMethod("put",String.class,byte[].class,String.class).invoke(local,key,new byte[]{0,1,0,0},"font/ttf");
        var mediaFiles=Class.forName("com.f106.DIO.media.storage.MediaFiles").getConstructor(List.class,String.class,org.springframework.core.env.Environment.class).newInstance(List.of(local),"local",new MockEnvironment());
        var beans=new DefaultListableBeanFactory();beans.registerSingleton("mediaFiles",mediaFiles);var reader=new MediaFontFileReader(beans);
        assertThat(reader.read(key)).containsExactly(0,1,0,0);
        store.getMethod("delete",String.class).invoke(local,key);
        assertThatThrownBy(()->reader.read(key)).isInstanceOfSatisfying(DiaryDetailException.class,e->assertThat(e.status().value()).isEqualTo(404));
    }
}
