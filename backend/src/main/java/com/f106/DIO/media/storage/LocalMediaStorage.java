package com.f106.DIO.media.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class LocalMediaStorage implements MediaStorage {
	private final Path directory;
	public LocalMediaStorage(@Value("${dio.media.local-directory:.local-data/media}") String directory) {
		this.directory = Path.of(directory).toAbsolutePath().normalize();
	}
	@Override public String provider() { return "LOCAL"; }
	@Override public void put(String key, byte[] content, String contentType) {
		MediaStorageKeys.validate(key);
		try { Path target = path(key); Files.createDirectories(target.getParent()); Files.write(target, content); }
		catch (IOException error) { throw MediaStorageException.unavailable(); }
	}
	@Override public byte[] read(String key) {
		MediaStorageKeys.validate(key);
		try { return Files.readAllBytes(path(key)); }
		catch (NoSuchFileException error) { throw MediaStorageException.missing(); }
		catch (IOException error) { throw MediaStorageException.unavailable(); }
	}
	@Override public void delete(String key) {
		MediaStorageKeys.validate(key);
		try { Files.deleteIfExists(path(key)); }
		catch (IOException error) { throw MediaStorageException.unavailable(); }
	}
	private Path path(String key) {
		Path target = directory.resolve(key).normalize();
		if (!target.startsWith(directory)) throw new IllegalArgumentException("Invalid media storage key");
		return target;
	}
}
