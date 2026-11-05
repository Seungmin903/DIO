package com.f106.DIO.moderation.service;
import com.f106.DIO.moderation.exception.ModerationException;
import org.springframework.http.HttpStatus;import org.springframework.stereotype.Component;import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;import java.io.*;import java.util.*;
@Component
public class ReportEvidence {
 public record Image(byte[] original,byte[] stored,String mime,String extension){}
 public List<Image> prepare(List<MultipartFile> files){
  if(files==null)return List.of();
  if(files.size()>3)throw ModerationException.invalid("증빙 사진은 최대 3장이에요.");
  return files.stream().map(this::prepare).toList();
 }
 private Image prepare(MultipartFile file){
  if(file.getSize()>5*1024*1024)throw new ModerationException(HttpStatus.PAYLOAD_TOO_LARGE,"REPORT_EVIDENCE_TOO_LARGE","사진은 장당 5MiB 이하로 선택해 주세요.");
  try(var stream=file.getInputStream()){
   byte[] bytes=stream.readNBytes(5*1024*1024+1);
   if(bytes.length>5*1024*1024)throw new ModerationException(HttpStatus.PAYLOAD_TOO_LARGE,"REPORT_EVIDENCE_TOO_LARGE","사진 크기를 확인해 주세요.");
   try(var input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))){
    if(input==null)throw unsupported();var readers=ImageIO.getImageReaders(input);if(!readers.hasNext())throw unsupported();
    var reader=readers.next();try{
     String format=reader.getFormatName().toLowerCase(Locale.ROOT);
     if(!Set.of("png","jpeg","jpg").contains(format))throw unsupported();
     reader.setInput(input,true,true);int w=reader.getWidth(0),h=reader.getHeight(0);
     if(w<1||h<1||w>8192||h>8192||(long)w*h>16_000_000)throw ModerationException.invalid("증빙 사진은 최대 1600만 화소까지 지원해요.");
     var image=reader.read(0);var out=new ByteArrayOutputStream();
     String extension=format.equals("png")?"png":"jpg";
     if(image==null||!ImageIO.write(image,extension,out)||out.size()>20*1024*1024)throw unsupported();
     return new Image(bytes,out.toByteArray(),extension.equals("png")?"image/png":"image/jpeg",extension);
    }finally{reader.dispose();}
   }
  }catch(IOException|IllegalArgumentException e){throw unsupported();}
 }
 private ModerationException unsupported(){return new ModerationException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"REPORT_EVIDENCE_UNSUPPORTED","정상적인 PNG 또는 JPEG 사진을 선택해 주세요.");}
}
