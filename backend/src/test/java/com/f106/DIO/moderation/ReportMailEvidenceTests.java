package com.f106.DIO.moderation;

import com.f106.DIO.media.storage.MediaStorage;
import com.f106.DIO.moderation.domain.*;
import com.f106.DIO.moderation.infrastructure.mail.*;
import java.io.*;
import java.awt.image.BufferedImage;
import java.util.*;
import javax.imageio.ImageIO;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReportMailEvidenceTests {
 private final MediaStorage local=mock(MediaStorage.class),s3=mock(MediaStorage.class);
 private final ObjectMapper json=new ObjectMapper();
 private final String key="media/image/2026/11/00000000-0000-0000-0000-000000000001.png";
 private byte[] image() throws Exception {var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(10,10,BufferedImage.TYPE_INT_RGB),"png",out);return out.toByteArray();}
 private UserReport report(String rows){return new UserReport(1,2,UUID.randomUUID(),UUID.randomUUID(),"hash",ReportReason.HARASSMENT,"private description",rows);}
 private ReportMailEvidence evidence(){when(local.provider()).thenReturn("LOCAL");when(s3.provider()).thenReturn("S3");return new ReportMailEvidence(List.of(local,s3),json);}
 private String row(int size){return "[{\"provider\":\"S3\",\"storageKey\":\""+key+"\",\"mimeType\":\"image/png\",\"size\":"+size+"}]";}
 @SuppressWarnings("unchecked") private SmtpReportMailSender sender(JavaMailSender smtp,ReportMailEvidence evidence,boolean enabled){var provider=mock(ObjectProvider.class);when(provider.getIfAvailable()).thenReturn(smtp);return new SmtpReportMailSender(provider,"ops@example.com","reports@example.com",evidence,enabled);}
 @Test void sendsPrivateBytesAsActualMimeAttachmentWithoutStorageUrl() throws Exception {
  byte[] bytes=image();var assets=evidence();when(s3.read(key)).thenReturn(bytes);
  var smtp=mock(JavaMailSender.class);var message=new MimeMessage(Session.getInstance(new Properties()));when(smtp.createMimeMessage()).thenReturn(message);
  sender(smtp,assets,true).send(report(row(bytes.length)));message.saveChanges();
  verify(smtp).send(message);verify(local,never()).read(any());
  var multipart=(jakarta.mail.Multipart)message.getContent();var body=(jakarta.mail.Multipart)multipart.getBodyPart(0).getContent();
  assertThat(body.getBodyPart(0).getContent().toString()).contains("증빙 사진 1장").doesNotContain(key,"private description");
  var attachment=multipart.getBodyPart(1);assertThat(attachment.getFileName()).isEqualTo("evidence-1.png");assertThat(attachment.getInputStream().readAllBytes()).isEqualTo(bytes);
 }
 @Test void disabledFeatureNeverReadsEvidence(){var smtp=mock(JavaMailSender.class);var assets=mock(ReportMailEvidence.class);sender(smtp,assets,false).send(report("[]"));verify(smtp).send(any(SimpleMailMessage.class));verifyNoInteractions(assets);}
 @Test void missingEvidenceStillSendsBaseNotification(){var assets=evidence();when(s3.read(key)).thenThrow(new IllegalStateException("missing"));var smtp=mock(JavaMailSender.class);sender(smtp,assets,true).send(report(row(10)));var message=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(smtp).send(message.capture());assertThat(message.getValue().getText()).contains("증빙 첨부를 준비하지 못했습니다").doesNotContain("private description",key);verify(smtp,never()).send(any(MimeMessage.class));}
 @Test void rejectsWrongSizeAndNonImageKey() throws Exception {var assets=evidence();when(s3.read(key)).thenReturn(image());assertThatThrownBy(()->assets.read(report(row(1)))).isInstanceOf(IllegalStateException.class);assertThatThrownBy(()->assets.read(report(row(1).replace("media/image/","media/audio/")))).isInstanceOf(IllegalArgumentException.class);}
 @Test void rejectsMoreThanThreeAttachmentsBeforeStorageRead(){var assets=evidence();var one=row(1);var item=one.substring(1,one.length()-1);assertThatThrownBy(()->assets.read(report("["+String.join(",",Collections.nCopies(4,item))+"]"))).isInstanceOf(IllegalArgumentException.class);verify(s3,never()).read(any());}
 @Test void largeImageGetsBoundedPreviewWithoutChangingStoredOriginal() throws Exception {
  var picture=new BufferedImage(1600,1600,BufferedImage.TYPE_INT_RGB);var random=new Random(123);for(int y=0;y<1600;y++)for(int x=0;x<1600;x++)picture.setRGB(x,y,random.nextInt());var output=new ByteArrayOutputStream();ImageIO.write(picture,"png",output);byte[] original=output.toByteArray(),copy=original.clone();assertThat(original.length).isGreaterThan(4*1024*1024);
  var assets=evidence();when(s3.read(key)).thenReturn(original);var result=assets.read(report(row(original.length)));assertThat(result.get(0).name()).contains("-preview");assertThat(result.get(0).bytes().length).isLessThanOrEqualTo(4*1024*1024);assertThat(original).isEqualTo(copy);verify(s3,never()).put(any(),any(),any());
 }
}
