package com.f106.DIO.user.integration;

import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.support.ProfilePhotoImages;

import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import javax.imageio.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class ProfilePhotoDecodeFailureTests {
    @Test void decoderRuntimeFailuresAreInvalidPhotosAndReaderIsDisposed() throws Exception {
        for (RuntimeException failure : new RuntimeException[]{new ArrayIndexOutOfBoundsException(), new NullPointerException()}) {
            var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(new byte[]{1, 2, 3}));
            var reader = mock(ImageReader.class);
            when(reader.getFormatName()).thenReturn("png");
            when(reader.getWidth(0)).thenReturn(2); when(reader.getHeight(0)).thenReturn(2);
            when(reader.read(0)).thenThrow(failure);
            try (var imageIO = mockStatic(ImageIO.class)) {
                imageIO.when(() -> ImageIO.createImageInputStream(any())).thenReturn(stream);
                imageIO.when(() -> ImageIO.getImageReaders(stream)).thenReturn(List.of(reader).iterator());
                assertThatThrownBy(() -> ProfilePhotoImages.prepare(new MockMultipartFile("photo", new byte[]{1,2,3})))
                    .isInstanceOfSatisfying(UserException.class, error -> {
                        assertThat(error.status.value()).isEqualTo(400);
                        assertThat(error.code).isEqualTo("INVALID_PROFILE_PHOTO");
                    });
                verify(reader).read(0); verify(reader).dispose();
            }
        }
    }
    @Test void actualTruncatedJpegAndPngAreRejected() throws Exception {
        for (String format : List.of("jpeg", "png")) {
            var output = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB), format, output);
            byte[] truncated = Arrays.copyOf(output.toByteArray(), 20);
            assertThatThrownBy(() -> ProfilePhotoImages.prepare(new MockMultipartFile("photo", "bad." + format, "image/" + format, truncated)))
                .isInstanceOfSatisfying(UserException.class, error -> assertThat(error.code).isEqualTo("INVALID_PROFILE_PHOTO"));
        }
    }
}
