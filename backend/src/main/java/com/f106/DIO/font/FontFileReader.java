package com.f106.DIO.font;

/** Storage only. The caller must authorize the diary and lock the media row first. */
public interface FontFileReader {
    byte[] read(String storageKey);
}
