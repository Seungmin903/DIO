package com.f106.DIO.user.support;

import java.awt.geom.AffineTransform;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** JPEG APP1의 EXIF 방향만 읽는다. 모든 오프셋은 해당 세그먼트 범위 안으로 제한한다. */
public final class JpegOrientation {
    private JpegOrientation() {}
    public static int read(byte[] data) {
        if (data.length < 4 || u(data[0]) != 255 || u(data[1]) != 216) return 1;
        int offset = 2;
        while (offset + 4 <= data.length) {
            if (u(data[offset++]) != 255) return 1;
            while (offset < data.length && u(data[offset]) == 255) offset++;
            if (offset >= data.length) return 1;
            int marker = u(data[offset++]);
            if (marker == 218 || marker == 217) return 1; // 압축 픽셀 데이터는 탐색하지 않는다.
            if (marker == 1 || marker >= 208 && marker <= 215) continue;
            if (offset + 2 > data.length) return 1;
            int length = (u(data[offset]) << 8) | u(data[offset + 1]);
            if (length < 2 || length > data.length - offset) return 1;
            int start = offset + 2;
            if (marker == 225 && length >= 16 && data[start] == 'E' && data[start + 1] == 'x'
                    && data[start + 2] == 'i' && data[start + 3] == 'f' && data[start + 4] == 0 && data[start + 5] == 0) {
                int result = tiff(data, start + 6, length - 8);
                if (result != 0) return result;
            }
            offset += length;
        }
        return 1;
    }
    private static int tiff(byte[] data, int start, int length) {
        if (length < 8) return 0;
        var buffer = ByteBuffer.wrap(data, start, length).slice();
        int signature = Short.toUnsignedInt(buffer.getShort(0));
        if (signature == 0x4949) buffer.order(ByteOrder.LITTLE_ENDIAN);
        else if (signature != 0x4d4d) return 0;
        if (Short.toUnsignedInt(buffer.getShort(2)) != 42) return 0;
        long directory = Integer.toUnsignedLong(buffer.getInt(4));
        if (directory < 8 || directory > length - 2) return 0;
        int offset = (int)directory;
        int count = Short.toUnsignedInt(buffer.getShort(offset));
        if (count > (length - offset - 2) / 12) return 0;
        for (int i = 0; i < count; i++) {
            int entry = offset + 2 + i * 12;
            if (Short.toUnsignedInt(buffer.getShort(entry)) == 0x112
                    && Short.toUnsignedInt(buffer.getShort(entry + 2)) == 3 && buffer.getInt(entry + 4) == 1) {
                int orientation = Short.toUnsignedInt(buffer.getShort(entry + 8));
                return orientation >= 1 && orientation <= 8 ? orientation : 0;
            }
        }
        return 0;
    }
    public static AffineTransform transform(int orientation, int width, int height) {
        return switch (orientation) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, width, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, width, height);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, height);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, height, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, height, width);
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, width);
            default -> new AffineTransform();
        };
    }
    private static int u(byte value) { return Byte.toUnsignedInt(value); }
}
