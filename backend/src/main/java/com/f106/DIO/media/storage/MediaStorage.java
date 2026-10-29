package com.f106.DIO.media.storage;

public interface MediaStorage {
	String provider();
	void put(String key, byte[] content, String contentType);
	byte[] read(String key);
	void delete(String key);
}
