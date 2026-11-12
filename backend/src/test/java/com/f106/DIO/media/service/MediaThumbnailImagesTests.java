package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.*;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Base64;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import com.f106.DIO.media.support.MediaRequestException;

class MediaThumbnailImagesTests {
 @Test void uncheckedDecoderFailureBecomesInvalidMediaButErrorsAreNotSwallowed() {
  try(var decoder=new BrokenThumbnailDecoder(false)){
   assertThatThrownBy(()->MediaThumbnailImages.create(BrokenThumbnailDecoder.INPUT)).isInstanceOf(MediaRequestException.class);
  }
  try(var decoder=new BrokenThumbnailDecoder(true)){
   assertThatThrownBy(()->MediaThumbnailImages.create(BrokenThumbnailDecoder.INPUT)).isInstanceOf(AssertionError.class);
  }
 }
 private byte[] image(String format,int width,int height) throws Exception {
  var source=new BufferedImage(width,height,format.equals("jpeg")?BufferedImage.TYPE_INT_RGB:BufferedImage.TYPE_INT_ARGB);
  var g=source.createGraphics();g.setColor(Color.MAGENTA);g.fillRect(0,0,width,height);g.dispose();
  var out=new ByteArrayOutputStream();ImageIO.write(source,format,out);return out.toByteArray();
 }
 @Test void handlesJpegGifAndTransparentWebp() throws Exception {
  for(String format:new String[]{"jpeg","gif"}){
   var preview=ImageIO.read(new ByteArrayInputStream(MediaThumbnailImages.create(image(format,800,400))));
   assertThat(preview.getWidth()).isEqualTo(320);assertThat(preview.getHeight()).isEqualTo(160);
  }
  byte[] webp=Base64.getDecoder().decode("UklGRh4AAABXRUJQVlA4TBEAAAAvA0AAEAdQiiIXr4CBiOh/AAA=");
  var decoded=ImageIO.read(new ByteArrayInputStream(MediaThumbnailImages.create(webp)));
  assertThat(decoded.getWidth()).isEqualTo(4);assertThat(decoded.getHeight()).isEqualTo(2);
  assertThat(decoded.getRGB(0,0)>>>24).isEqualTo(128);
 }
 @Test void respectsJpegExifRotation() throws Exception {
  byte[] source=image("jpeg",800,400);
  var tiff=ByteBuffer.allocate(26).order(ByteOrder.LITTLE_ENDIAN);
  tiff.put((byte)'I').put((byte)'I').putShort((short)42).putInt(8).putShort((short)1)
   .putShort((short)0x112).putShort((short)3).putInt(1).putShort((short)6).putShort((short)0).putInt(0);
  var withExif=new ByteArrayOutputStream();withExif.write(source,0,2);
  withExif.write(new byte[]{(byte)255,(byte)225,0,34,'E','x','i','f',0,0});withExif.write(tiff.array());withExif.write(source,2,source.length-2);
  var preview=ImageIO.read(new ByteArrayInputStream(MediaThumbnailImages.create(withExif.toByteArray())));
  assertThat(preview.getWidth()).isEqualTo(160);assertThat(preview.getHeight()).isEqualTo(320);
 }
 @Test void rejectsBrokenImagesAndHugeDeclaredDimensionsBeforeDecodingPixels() throws Exception {
  assertThatThrownBy(()->MediaThumbnailImages.create(new byte[]{1,2,3})).isInstanceOf(MediaRequestException.class);
  byte[] png=image("png",1,1);
  // PNG IHDR width/height are inspected before allocation (CRC is intentionally not trusted).
  ByteBuffer.wrap(png).putInt(16,12001).putInt(20,12001);
  assertThatThrownBy(()->MediaThumbnailImages.create(png)).isInstanceOf(MediaRequestException.class);
 }
}
