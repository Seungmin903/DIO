package com.f106.DIO.media.service;

import java.io.IOException;
import java.util.*;
import java.awt.image.BufferedImage;
import javax.imageio.*;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.spi.*;
import javax.imageio.stream.ImageInputStream;

/** A real ImageIO reader fixture for a signature-valid PNG that fails with an unchecked decoder error. */
final class BrokenThumbnailDecoder implements AutoCloseable {
 static final byte[] INPUT={(byte)137,80,78,71,13,10,26,10,'D','I','O'};
 private final IIORegistry registry=IIORegistry.getDefaultInstance();
 private final ImageReaderSpi provider;
 BrokenThumbnailDecoder(boolean fatal) {
  provider=new ImageReaderSpi("DIO-test","1",new String[]{"broken-png"},new String[]{"png"},new String[]{"image/png"},Reader.class.getName(),new Class<?>[]{ImageInputStream.class},null,false,null,null,null,null,false,null,null,null,null) {
   @Override public boolean canDecodeInput(Object source) throws IOException {
    if(!(source instanceof ImageInputStream input))return false;
    long position=input.getStreamPosition();
    try{for(byte b:INPUT)if(input.read()!=Byte.toUnsignedInt(b))return false;return true;}finally{input.seek(position);}
   }
   @Override public ImageReader createReaderInstance(Object extension){return new Reader(this,fatal);}
   @Override public String getDescription(Locale locale){return "Unchecked thumbnail decoder fixture";}
  };
  var others=new ArrayList<ImageReaderSpi>();registry.getServiceProviders(ImageReaderSpi.class,true).forEachRemaining(others::add);
  registry.registerServiceProvider(provider,ImageReaderSpi.class);
  for(var other:others)registry.setOrdering(ImageReaderSpi.class,provider,other);
 }
 @Override public void close(){registry.deregisterServiceProvider(provider,ImageReaderSpi.class);}
 private static class Reader extends ImageReader {
  private final boolean fatal;
  Reader(ImageReaderSpi provider,boolean fatal){super(provider);this.fatal=fatal;}
  public int getNumImages(boolean search){return 1;}
  public int getWidth(int index){return 2;}
  public int getHeight(int index){return 2;}
  public Iterator<ImageTypeSpecifier> getImageTypes(int index){return List.of(ImageTypeSpecifier.createFromBufferedImageType(BufferedImage.TYPE_INT_ARGB)).iterator();}
  public IIOMetadata getStreamMetadata(){return null;}
  public IIOMetadata getImageMetadata(int index){return null;}
  public BufferedImage read(int index,ImageReadParam param){if(fatal)throw new AssertionError("fatal fixture");throw new ArrayIndexOutOfBoundsException("corrupt pixel data");}
 }
}
