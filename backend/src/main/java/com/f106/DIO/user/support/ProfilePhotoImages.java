package com.f106.DIO.user.support;

import com.f106.DIO.user.exception.UserException;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Locale;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;

public final class ProfilePhotoImages {
    private static final int MAX_INPUT_BYTES = 5 * 1024 * 1024;
    private ProfilePhotoImages() {}
    public static byte[] prepare(MultipartFile file) {
        if (file == null) return null;
        if (file.isEmpty()) throw invalid();
        if (file.getSize() > MAX_INPUT_BYTES) {
            throw new UserException(HttpStatus.PAYLOAD_TOO_LARGE, "PROFILE_PHOTO_TOO_LARGE", "프로필 사진은 5MB 이하로 선택해 주세요.");
        }
        // 확장자·클라이언트 MIME을 신뢰하지 않고 실제 디코더로 확인한다.
        try (var input = file.getInputStream()) {
            byte[] original = input.readNBytes(MAX_INPUT_BYTES + 1);
            if (original.length > MAX_INPUT_BYTES) {
                throw new UserException(HttpStatus.PAYLOAD_TOO_LARGE, "PROFILE_PHOTO_TOO_LARGE", "프로필 사진은 5MB 이하로 선택해 주세요.");
            }
            return prepare(original);
        } catch (IOException | IllegalArgumentException error) { throw invalid(); }
    }
    /** 신뢰할 수 없는 바이트 배열도 업로드와 같은 방식으로 디코딩·PNG 재인코딩한다. */
    public static byte[] prepare(byte[] original) {
        if (original == null || original.length == 0) throw invalid();
        if (original.length > MAX_INPUT_BYTES) {
            throw new UserException(HttpStatus.PAYLOAD_TOO_LARGE, "PROFILE_PHOTO_TOO_LARGE", "프로필 사진은 5MB 이하로 선택해 주세요.");
        }
        try (var images = ImageIO.createImageInputStream(new ByteArrayInputStream(original))) {
            var readers = ImageIO.getImageReaders(images);
            if (!readers.hasNext()) throw invalid();
            ImageReader reader = readers.next();
            try {
                BufferedImage resized = decodeAndResize(reader, images, original);
                // 메타데이터·원본 파일명은 저장하지 않고 축소된 PNG만 저장한다.
                var output = new ByteArrayOutputStream();
                if (!ImageIO.write(resized, "png", output) || output.size() > 1024 * 1024) throw invalid();
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (IOException | IllegalArgumentException error) { throw invalid(); }
    }
    private static BufferedImage decodeAndResize(ImageReader reader, javax.imageio.stream.ImageInputStream images,
            byte[] original) throws IOException {
        try {
            String format = reader.getFormatName().toLowerCase(Locale.ROOT);
            if (!format.equals("png") && !format.equals("jpeg") && !format.equals("jpg")) throw invalid();
            reader.setInput(images, true, true);
            int width = reader.getWidth(0), height = reader.getHeight(0);
            if (width < 1 || height < 1 || width > 8192 || height > 8192 || (long) width * height > 16_000_000) throw invalid();
            BufferedImage source = reader.read(0);
            if (source == null) throw invalid();
            int orientation = format.equals("png") ? 1 : JpegOrientation.read(original);
            int displayWidth = orientation >= 5 ? height : width;
            int displayHeight = orientation >= 5 ? width : height;
            double ratio = Math.min(1.0, 512.0 / Math.max(width, height));
            BufferedImage resized = new BufferedImage(Math.max(1, (int)(displayWidth * ratio)),
                Math.max(1, (int)(displayHeight * ratio)), BufferedImage.TYPE_INT_ARGB);
            Graphics2D graphics = resized.createGraphics();
            try {
                graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                graphics.scale((double)resized.getWidth() / displayWidth, (double)resized.getHeight() / displayHeight);
                graphics.drawImage(source, JpegOrientation.transform(orientation, width, height), null);
            } finally { graphics.dispose(); }
            return resized;
        } catch (UserException error) { throw error; }
        catch (RuntimeException error) { throw invalid(); }
    }
    private static UserException invalid() {
        return UserException.invalid("INVALID_PROFILE_PHOTO", "정상적인 JPEG 또는 PNG 사진을 선택해 주세요. 최대 1600만 화소까지 지원해요.");
    }
}
