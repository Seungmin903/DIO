package com.f106.DIO.moderation.infrastructure.mail;

import com.f106.DIO.media.storage.MediaStorage;
import com.f106.DIO.media.storage.MediaStorageKeys;
import com.f106.DIO.moderation.domain.UserReport;
import java.io.*;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Private storage bytes only: never exposes storage keys or public URLs in mail. */
@Component
public class ReportMailEvidence {
 private static final int MAX_ATTACHMENT_BYTES=4*1024*1024;
 private final List<MediaStorage> stores;
 private final ObjectMapper json;
 public record Attachment(String name,byte[] bytes,String mime) {}
 public ReportMailEvidence(List<MediaStorage> stores,ObjectMapper json){this.stores=List.copyOf(stores);this.json=json;}
 public List<Attachment> read(UserReport report){
  tools.jackson.databind.JsonNode rows;
  try{rows=json.readTree(report.getEvidenceJson());}
  catch(tools.jackson.core.JacksonException e){throw new InvalidReportMailEvidenceException(e);}
  if(!rows.isArray()||rows.size()>3)throw new InvalidReportMailEvidenceException();
  var attachments=new ArrayList<Attachment>();
  for(var row:rows){
   String key=row.path("storageKey").asText(),provider=row.path("provider").asText();
   String mime=row.path("mimeType").asText();
   try{MediaStorageKeys.validate(key);}catch(IllegalArgumentException e){throw new InvalidReportMailEvidenceException(e);}
   if(!key.startsWith("media/image/")||!(mime.equals("image/png")&&key.endsWith(".png")||mime.equals("image/jpeg")&&key.endsWith(".jpg")))throw new InvalidReportMailEvidenceException();
   var storage=stores.stream().filter(s->s.provider().equalsIgnoreCase(provider)).findFirst().orElseThrow(()->new IllegalStateException("Evidence storage unavailable"));
   byte[] bytes=storage.read(key);
   if(bytes.length==0||bytes.length>20*1024*1024||bytes.length!=row.path("size").asLong())throw new InvalidReportMailEvidenceException();
   try(var input=new javax.imageio.stream.MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))){
    if(input==null)throw new IOException("Invalid image");
    var readers=ImageIO.getImageReaders(input);if(!readers.hasNext())throw new IOException("Invalid image");
    var reader=readers.next();
    try{
     reader.setInput(input,true,true);int w=reader.getWidth(0),h=reader.getHeight(0);
     String format=reader.getFormatName();
     if(!(mime.equals("image/png")&&format.equalsIgnoreCase("png")||mime.equals("image/jpeg")&&(format.equalsIgnoreCase("jpeg")||format.equalsIgnoreCase("jpg")))||w<1||h<1||w>8192||h>8192||(long)w*h>16_000_000)throw new IOException("Invalid image");
     var original=reader.read(0);if(original==null)throw new IOException("Invalid image");
     boolean preview=bytes.length>MAX_ATTACHMENT_BYTES;
     if(preview){
      do{
       w=Math.max(1,w/2);h=Math.max(1,h/2);
       var resized=new BufferedImage(w,h,BufferedImage.TYPE_INT_ARGB);
       var graphics=resized.createGraphics();
       try{graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BILINEAR);graphics.drawImage(original,0,0,w,h,null);}finally{graphics.dispose();}
       var output=new ByteArrayOutputStream();if(!ImageIO.write(resized,"png",output))throw new IOException("Image encoding failed");bytes=output.toByteArray();
      }while(bytes.length>MAX_ATTACHMENT_BYTES);
      mime="image/png";
     }
     attachments.add(new Attachment("evidence-"+(attachments.size()+1)+(preview?"-preview":"")+(mime.equals("image/png")?".png":".jpg"),bytes,mime));
    }finally{reader.dispose();}
   }catch(IOException e){throw new InvalidReportMailEvidenceException(e);}
  }
  return List.copyOf(attachments);
 }
}
