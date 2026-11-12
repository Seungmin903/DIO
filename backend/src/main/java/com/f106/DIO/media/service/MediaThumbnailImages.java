package com.f106.DIO.media.service;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import com.f106.DIO.media.support.MediaRequestException;
import com.f106.DIO.user.support.JpegOrientation;

/** A bounded, static PNG derivative; never replaces the editable original. */
final class MediaThumbnailImages {
	static final int EDGE = 320;
	private MediaThumbnailImages() {}
	static byte[] create(byte[] original) {
		try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(original))) {
			var readers = ImageIO.getImageReaders(input);
			if (!readers.hasNext()) throw MediaRequestException.invalidFile();
			var reader = readers.next();
			try {
				reader.setInput(input, true, true);
				int width = reader.getWidth(0), height = reader.getHeight(0);
				if (width < 1 || height < 1 || width > 12000 || height > 12000 || (long)width * height > 64_000_000)
					throw MediaRequestException.invalidFile();
				var param = reader.getDefaultReadParam();
				int sample = Math.max(1, Math.max(width, height) / (EDGE * 2));
				param.setSourceSubsampling(sample, sample, 0, 0);
				BufferedImage source = reader.read(0, param); // GIF/WebP: first frame only.
				if (source == null) throw MediaRequestException.invalidFile();
				int orientation = JpegOrientation.read(original);
				int displayWidth = orientation >= 5 ? source.getHeight() : source.getWidth();
				int displayHeight = orientation >= 5 ? source.getWidth() : source.getHeight();
				double scale = Math.min(1.0, (double)EDGE / Math.max(displayWidth, displayHeight));
				var thumbnail = new BufferedImage(Math.max(1, (int)Math.round(displayWidth * scale)),
					Math.max(1, (int)Math.round(displayHeight * scale)), BufferedImage.TYPE_INT_ARGB);
				Graphics2D graphics = thumbnail.createGraphics();
				try {
					graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
					graphics.scale((double)thumbnail.getWidth() / displayWidth, (double)thumbnail.getHeight() / displayHeight);
					graphics.drawImage(source, JpegOrientation.transform(orientation, source.getWidth(), source.getHeight()), null);
				} finally { graphics.dispose(); source.flush(); }
				var output = new ByteArrayOutputStream();
				if (!ImageIO.write(thumbnail, "png", output)) throw MediaRequestException.invalidFile();
				return output.toByteArray();
			} finally { reader.dispose(); }
		} catch (IOException | RuntimeException error) { throw MediaRequestException.invalidFile(); }
	}
}
