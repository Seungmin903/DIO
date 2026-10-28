package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.storage.LocalMediaStorage;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.storage.MediaStorage;
import com.f106.DIO.media.storage.MediaStorageKeys;

class MediaStorageTests {
	@TempDir Path directory;

	@Test
	void rejectsPathTraversalBeforeTouchingTheLocalDirectory() {
		LocalMediaStorage storage = new LocalMediaStorage(directory.toString());

		assertThatIllegalArgumentException().isThrownBy(() -> storage.put("../../outside.png", new byte[] {1}, "image/png"));
	}

	@Test
	void storesAndReadsAValidServerGeneratedKey() {
		LocalMediaStorage storage = new LocalMediaStorage(directory.toString());
		String key = MediaStorageKeys.create(MediaType.IMAGE, "png", UUID.randomUUID());

		storage.put(key, new byte[] {1, 2, 3}, "image/png");

		assertThat(storage.read(key)).containsExactly(1, 2, 3);
	}

	@Test
	void rejectsLocalStorageInTheProductionProfile() {
		MediaStorage local = new LocalMediaStorage(directory.toString());
		MockEnvironment environment = new MockEnvironment();
		environment.setActiveProfiles("prod");

		assertThatThrownBy(() -> new MediaFiles(java.util.List.of(local), "local", environment)).isInstanceOf(IllegalStateException.class);
	}
}
