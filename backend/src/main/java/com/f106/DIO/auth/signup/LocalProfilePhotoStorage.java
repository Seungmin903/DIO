package com.f106.DIO.auth.signup;

import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class LocalProfilePhotoStorage implements ProfilePhotoStorage {
    private final Path root;
    LocalProfilePhotoStorage(@Value("${dio.signup.photos.local-directory:.local-data/profile-photos}") String directory) {
        root = Path.of(directory).toAbsolutePath().normalize();
    }
    public String provider() { return "LOCAL"; }
    public Location location(UUID id) { return new Location(provider(), ProfilePhotoStorage.key(id), null); }
    private Path path(Location location) {
        ProfilePhotoStorage.validateKey(location.key());
        Path path = root.resolve(location.key()).normalize();
        if (!path.startsWith(root)) throw new IllegalArgumentException("Invalid photo path");
        return path;
    }
    public void put(Location location, byte[] png) {
        Path temporary = null;
        try {
            Path target = path(location);
            Files.createDirectories(target.getParent());
            temporary = Files.createTempFile(target.getParent(), "upload-", ".tmp");
            Files.write(temporary, png);
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException error) { throw ProfilePhotoStorage.unavailable(); }
        finally {
            if (temporary != null) try { Files.deleteIfExists(temporary); }
            catch (IOException error) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("Profile photo temporary file cleanup failed"); }
        }
    }
    public byte[] read(Location location) {
        try (var input = Files.newInputStream(path(location))) {
            byte[] data = input.readNBytes(1024 * 1024 + 1);
            if (data.length == 0 || data.length > 1024 * 1024) throw ProfilePhotoStorage.unavailable();
            return data;
        } catch (NoSuchFileException error) { throw ProfilePhotoStorage.missing(); }
        catch (IOException error) { throw ProfilePhotoStorage.unavailable(); }
    }
    public void delete(Location location) {
        try { Files.deleteIfExists(path(location)); }
        catch (IOException error) { throw ProfilePhotoStorage.unavailable(); }
    }
}
