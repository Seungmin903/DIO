package com.f106.DIO.user.integration;

import com.f106.DIO.user.support.JpegOrientation;
import com.f106.DIO.user.support.ProfilePhotoImages;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class ProfilePhotoOrientationTests {
    private static final Color[] COLORS = {Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW};
    private byte[] jpeg(int width, int height) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
            image.setRGB(x, y, COLORS[(y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0)].getRGB());
        var output = new ByteArrayOutputStream();
        ImageIO.write(image, "jpeg", output);
        return output.toByteArray();
    }
    private byte[] withExif(byte[] jpeg, int orientation, ByteOrder order) throws Exception {
        var tiff = ByteBuffer.allocate(26).order(order);
        tiff.putShort((short)(order == ByteOrder.LITTLE_ENDIAN ? 0x4949 : 0x4d4d));
        tiff.putShort((short)42).putInt(8).putShort((short)1);
        tiff.putShort((short)0x112).putShort((short)3).putInt(1).putShort((short)orientation).putShort((short)0).putInt(0);
        var output = new ByteArrayOutputStream();
        output.write(jpeg, 0, 2);
        var data = new DataOutputStream(output);
        data.writeShort(0xffe1); data.writeShort(34);
        data.write(new byte[]{'E', 'x', 'i', 'f', 0, 0}); data.write(tiff.array());
        output.write(jpeg, 2, jpeg.length - 2);
        return output.toByteArray();
    }
    private BufferedImage prepare(byte[] bytes) throws Exception {
        byte[] png = ProfilePhotoImages.prepare(new MockMultipartFile("photo", "phone.jpg", "image/jpeg", bytes));
        assertThat(new String(png, java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain("Exif");
        return ImageIO.read(new ByteArrayInputStream(png));
    }
    @Test void allEightExifDirectionsAndBothByteOrdersPreserveDisplayedCorners() throws Exception {
        int[][] expected = {{0,1,2,3}, {1,0,3,2}, {3,2,1,0}, {2,3,0,1},
            {0,2,1,3}, {2,0,3,1}, {3,1,2,0}, {1,3,0,2}};
        for (var order : new ByteOrder[]{ByteOrder.LITTLE_ENDIAN, ByteOrder.BIG_ENDIAN}) {
            for (int orientation = 1; orientation <= 8; orientation++) {
                var image = prepare(withExif(jpeg(60, 40), orientation, order));
                assertThat(image.getWidth()).isEqualTo(orientation >= 5 ? 40 : 60);
                assertThat(image.getHeight()).isEqualTo(orientation >= 5 ? 60 : 40);
                for (int corner = 0; corner < 4; corner++) {
                    int x = (corner % 2 == 0) ? 5 : image.getWidth() - 6;
                    int y = corner < 2 ? 5 : image.getHeight() - 6;
                    var actual = new Color(image.getRGB(x, y));
                    var target = COLORS[expected[orientation - 1][corner]];
                    assertThat(Math.abs(actual.getRed() - target.getRed())).isLessThan(20);
                    assertThat(Math.abs(actual.getGreen() - target.getGreen())).isLessThan(20);
                    assertThat(Math.abs(actual.getBlue() - target.getBlue())).isLessThan(20);
                }
            }
        }
    }
    @Test void rotatesAndResizesLargePortraitWithinExistingLimit() throws Exception {
        var image = prepare(withExif(jpeg(600, 400), 6, ByteOrder.LITTLE_ENDIAN));
        assertThat(image.getWidth()).isEqualTo(341);
        assertThat(image.getHeight()).isEqualTo(512);
    }
    @Test void missingInvalidOrOutOfBoundsExifFallsBackWithoutUnsafeReads() throws Exception {
        var plain = jpeg(60, 40);
        assertThat(prepare(plain).getWidth()).isEqualTo(60);
        assertThat(prepare(withExif(plain, 99, ByteOrder.BIG_ENDIAN)).getWidth()).isEqualTo(60);
        byte[] corrupt = withExif(plain, 6, ByteOrder.BIG_ENDIAN);
        // TIFF IFD 포인터를 세그먼트 밖으로 보내도 픽셀 디코딩은 안전하게 유지한다.
        java.util.Arrays.fill(corrupt, 16, 20, (byte)0xff);
        assertThat(prepare(corrupt).getWidth()).isEqualTo(60);
        for (int size = 0; size < corrupt.length; size++)
            assertThat(JpegOrientation.read(java.util.Arrays.copyOf(corrupt, size))).isBetween(1, 8);
    }
}
